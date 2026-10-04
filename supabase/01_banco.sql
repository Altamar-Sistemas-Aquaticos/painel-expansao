-- =====================================================================
-- Painel de Expansão Altamar · banco compartilhado (Supabase)
-- Como usar: Supabase → SQL Editor → New query → colar tudo → Run.
-- Pode rodar de novo sem problema (não apaga dados).
-- =====================================================================

-- 1. Membros: quem pode entrar no painel e com qual perfil
--    admin        = tudo, inclusive cadastros e quem tem acesso
--    diretoria    = altera projetos, ondas, sprint e decisões
--    visualizacao = só vê
create table if not exists public.membros (
  email      text primary key check (email = lower(email)),
  nome       text not null,
  perfil     text not null check (perfil in ('admin', 'diretoria', 'visualizacao')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- 2. Painel: todos os dados num documento só (mesmo formato do backup JSON do painel)
create table if not exists public.painel (
  id             text primary key default 'altamar',
  dados          jsonb not null,
  versao         bigint not null default 1,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);

-- 3. Quem está logado
create or replace function public.meu_perfil() returns text
language sql stable security definer set search_path = public as $$
  select perfil from public.membros
  where email = lower(coalesce(auth.jwt() ->> 'email', '')) and ativo
$$;

create or replace function public.eu() returns table (email text, nome text, perfil text)
language sql stable security definer set search_path = public as $$
  select m.email, m.nome, m.perfil from public.membros m
  where m.email = lower(coalesce(auth.jwt() ->> 'email', '')) and m.ativo
$$;

-- 4. Segurança: cada tabela só responde a quem é membro ativo
alter table public.membros enable row level security;
alter table public.painel  enable row level security;

drop policy if exists "membros: membros leem" on public.membros;
create policy "membros: membros leem" on public.membros
  for select to authenticated using (public.meu_perfil() is not null);

drop policy if exists "membros: admin gerencia" on public.membros;
create policy "membros: admin gerencia" on public.membros
  for all to authenticated
  using (public.meu_perfil() = 'admin') with check (public.meu_perfil() = 'admin');

drop policy if exists "painel: membros leem" on public.painel;
create policy "painel: membros leem" on public.painel
  for select to authenticated using (public.meu_perfil() is not null);
-- Não há política de escrita direta no painel: grava-se só pela função abaixo.

-- 5. Salvar o painel conferindo perfil e versão (evita que uma pessoa apague a alteração da outra)
create or replace function public.salvar_painel(p_dados jsonb, p_versao bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_perfil text := public.meu_perfil();
  v_nome   text;
  v_atual  bigint;
begin
  if v_perfil is null then raise exception 'sem_acesso'; end if;
  if v_perfil not in ('admin', 'diretoria') then raise exception 'somente_leitura'; end if;
  select nome into v_nome from public.membros where email = lower(auth.jwt() ->> 'email');

  select versao into v_atual from public.painel where id = 'altamar' for update;
  if v_atual is null then
    if v_perfil <> 'admin' then raise exception 'painel_vazio'; end if;
    insert into public.painel (id, dados, versao, atualizado_por) values ('altamar', p_dados, 1, v_nome);
    return 1;
  end if;

  if p_versao is distinct from v_atual then raise exception 'conflito:%', v_atual; end if;
  update public.painel
     set dados = p_dados, versao = v_atual + 1, atualizado_em = now(), atualizado_por = v_nome
   where id = 'altamar';
  return v_atual + 1;
end $$;

revoke all on function public.salvar_painel(jsonb, bigint) from public, anon;
grant execute on function public.salvar_painel(jsonb, bigint) to authenticated;
grant execute on function public.meu_perfil() to authenticated;
grant execute on function public.eu() to authenticated;

-- 6. Tempo real: quando alguém salva, as outras telas abertas se atualizam
do $$ begin
  alter publication supabase_realtime add table public.painel;
exception when duplicate_object then null;
end $$;

-- 7. Primeiro administrador
insert into public.membros (email, nome, perfil)
values ('pedro.l@altamar.com.br', 'Pedro', 'admin')
on conflict (email) do update set perfil = 'admin', ativo = true;
