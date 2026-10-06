-- =====================================================================
-- Painel de Expansão Altamar · Financeiro com várias linhas por projeto
-- Cada projeto pode ter vários gastos (ex.: equipamento, frete, instalação). O total é a soma.
-- Mesma regra de sigilo do script 03: só admin e diretoria (Pedro, Maíra e Shei) veem e mexem.
-- Rode DEPOIS do 03. Como usar: Supabase → SQL Editor → New query → colar tudo → Run. Pode rodar de novo.
-- =====================================================================

create table if not exists public.financeiro_itens (
  id             uuid primary key default gen_random_uuid(),
  projeto_id     text not null,
  descricao      text not null check (length(trim(descricao)) > 0),
  valor          numeric(14, 2) not null check (valor >= 0),
  observacao     text not null default '',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);
create index if not exists financeiro_itens_projeto on public.financeiro_itens (projeto_id);

alter table public.financeiro_itens enable row level security;
drop policy if exists "financeiro_itens: admin e diretoria" on public.financeiro_itens;
create policy "financeiro_itens: admin e diretoria" on public.financeiro_itens
  for all to authenticated
  using (public.ve_financeiro()) with check (public.ve_financeiro());

-- Histórico: toda inclusão, mudança ou remoção de linha entra no financeiro_historico (do script 03).
create or replace function public.financeiro_itens_registrar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nome text := (select nome from public.membros where email = lower(coalesce(auth.jwt() ->> 'email', '')));
begin
  if tg_op = 'DELETE' then
    insert into public.financeiro_historico (projeto_id, custo_antes, custo_depois, observacao, por)
    values (old.projeto_id, old.valor, null, 'Linha removida: ' || old.descricao, v_nome);
    return old;
  end if;
  new.atualizado_em := now();
  new.atualizado_por := v_nome;
  if tg_op = 'INSERT' then
    insert into public.financeiro_historico (projeto_id, custo_antes, custo_depois, observacao, por)
    values (new.projeto_id, null, new.valor, 'Nova linha: ' || new.descricao, v_nome);
  elsif new.valor is distinct from old.valor or new.descricao is distinct from old.descricao or new.projeto_id is distinct from old.projeto_id then
    insert into public.financeiro_historico (projeto_id, custo_antes, custo_depois, observacao, por)
    values (new.projeto_id, old.valor, new.valor, 'Linha alterada: ' || new.descricao, v_nome);
  end if;
  return new;
end $$;

drop trigger if exists financeiro_itens_registrar on public.financeiro_itens;
create trigger financeiro_itens_registrar
  before insert or update or delete on public.financeiro_itens
  for each row execute function public.financeiro_itens_registrar();

-- O valor único que já existia (script 03) vira a primeira linha de cada projeto, uma vez só.
insert into public.financeiro_itens (projeto_id, descricao, valor, observacao)
select f.projeto_id, 'Estimativa geral', f.custo, f.observacao
  from public.financeiro f
 where not exists (select 1 from public.financeiro_itens i where i.projeto_id = f.projeto_id);

do $$ begin
  alter publication supabase_realtime add table public.financeiro_itens;
exception when duplicate_object then null;
end $$;
