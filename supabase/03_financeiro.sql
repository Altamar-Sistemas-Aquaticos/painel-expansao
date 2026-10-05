-- =====================================================================
-- Painel de Expansão Altamar · Financeiro por projeto (confidencial)
-- Como usar: Supabase → SQL Editor → New query → colar tudo → Run.
-- Pode rodar de novo sem problema (não apaga dados).
--
-- O valor fica numa tabela separada do painel: o banco só entrega estas
-- linhas a quem tem perfil admin ou diretoria (Pedro, Maíra e Shei).
-- Líderes (perfil visualização) não recebem nada, nem pelo código da página.
-- =====================================================================

-- 1. Valor estimado para concluir cada projeto
create table if not exists public.financeiro (
  projeto_id     text primary key,
  custo          numeric(14, 2) not null check (custo >= 0),
  observacao     text not null default '',
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);

-- 2. Histórico do valor (só acrescenta; ninguém edita nem apaga pelo painel)
create table if not exists public.financeiro_historico (
  id            bigint generated always as identity primary key,
  projeto_id    text not null,
  custo_antes   numeric(14, 2),
  custo_depois  numeric(14, 2),
  observacao    text not null default '',
  por           text,
  em            timestamptz not null default now()
);
create index if not exists financeiro_historico_projeto on public.financeiro_historico (projeto_id, em desc);

-- 3. Quem pode ver e mexer: só admin e diretoria
create or replace function public.ve_financeiro() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_perfil() in ('admin', 'diretoria'), false)
$$;
grant execute on function public.ve_financeiro() to authenticated;

alter table public.financeiro           enable row level security;
alter table public.financeiro_historico enable row level security;

drop policy if exists "financeiro: admin e diretoria" on public.financeiro;
create policy "financeiro: admin e diretoria" on public.financeiro
  for all to authenticated
  using (public.ve_financeiro()) with check (public.ve_financeiro());

drop policy if exists "financeiro_historico: admin e diretoria leem" on public.financeiro_historico;
create policy "financeiro_historico: admin e diretoria leem" on public.financeiro_historico
  for select to authenticated using (public.ve_financeiro());
-- Sem política de escrita no histórico: ele é preenchido só pelo gatilho abaixo.

-- 4. Toda alteração do valor entra no histórico, com o nome de quem mudou
create or replace function public.financeiro_registrar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nome text := (select nome from public.membros where email = lower(coalesce(auth.jwt() ->> 'email', '')));
begin
  if tg_op = 'DELETE' then
    insert into public.financeiro_historico (projeto_id, custo_antes, custo_depois, observacao, por)
    values (old.projeto_id, old.custo, null, 'Valor removido', v_nome);
    return old;
  end if;
  new.atualizado_em := now();
  new.atualizado_por := v_nome;
  if tg_op = 'INSERT' or new.custo is distinct from old.custo or new.observacao is distinct from old.observacao then
    insert into public.financeiro_historico (projeto_id, custo_antes, custo_depois, observacao, por)
    values (new.projeto_id, case when tg_op = 'UPDATE' then old.custo end, new.custo, new.observacao, v_nome);
  end if;
  return new;
end $$;

drop trigger if exists financeiro_registrar on public.financeiro;
create trigger financeiro_registrar
  before insert or update or delete on public.financeiro
  for each row execute function public.financeiro_registrar();

-- 5. Tempo real: quando alguém muda um valor, as telas de quem pode ver se atualizam
do $$ begin
  alter publication supabase_realtime add table public.financeiro;
exception when duplicate_object then null;
end $$;
