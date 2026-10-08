-- =====================================================================
-- Painel de Expansão Altamar · Kanban pessoal ("Minhas tarefas")
-- Cada pessoa tem as suas tarefas, fora dos projetos. O dono decide em cada uma:
--   🔒 privada  → só o dono vê
--   👁 visível  → o dono e a gestão (Pedro e diretoria: perfis admin e diretoria) veem
-- Só o dono cria, muda ou apaga as próprias tarefas. A regra vale no banco, não só na tela.
-- Como usar: Supabase → SQL Editor → New query → colar tudo → Run. Pode rodar de novo.
-- =====================================================================

create table if not exists public.tarefas (
  id             uuid primary key default gen_random_uuid(),
  dono_email     text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  dono_nome      text,
  titulo         text not null check (length(trim(titulo)) > 0),
  coluna         text not null default 'todo' check (coluna in ('todo', 'doing', 'waiting', 'blocked', 'done')),
  prazo          date,
  observacao     text not null default '',
  projeto_id     text not null default '',
  visivel        boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  concluido_em   timestamptz
);
create index if not exists tarefas_dono on public.tarefas (dono_email);

-- Quem é o dono (e-mail do login) e se a pessoa é da gestão
create or replace function public.meu_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;
grant execute on function public.meu_email() to authenticated;

alter table public.tarefas enable row level security;

drop policy if exists "tarefas: dono e gestão leem" on public.tarefas;
create policy "tarefas: dono e gestão leem" on public.tarefas
  for select to authenticated
  using (dono_email = public.meu_email()
         or (visivel and public.meu_perfil() in ('admin', 'diretoria')));

drop policy if exists "tarefas: dono cria" on public.tarefas;
create policy "tarefas: dono cria" on public.tarefas
  for insert to authenticated
  with check (dono_email = public.meu_email() and public.meu_perfil() is not null);

drop policy if exists "tarefas: dono altera" on public.tarefas;
create policy "tarefas: dono altera" on public.tarefas
  for update to authenticated
  using (dono_email = public.meu_email())
  with check (dono_email = public.meu_email());

drop policy if exists "tarefas: dono apaga" on public.tarefas;
create policy "tarefas: dono apaga" on public.tarefas
  for delete to authenticated
  using (dono_email = public.meu_email());

-- Nome do dono, data de atualização e de conclusão preenchidos pelo banco
create or replace function public.tarefas_carimbo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.dono_email := lower(new.dono_email);
  new.dono_nome := coalesce((select nome from public.membros where email = new.dono_email), new.dono_nome);
  new.atualizado_em := now();
  if new.coluna = 'done' and (tg_op = 'INSERT' or old.coluna is distinct from 'done') then new.concluido_em := now(); end if;
  if new.coluna <> 'done' then new.concluido_em := null; end if;
  return new;
end $$;

drop trigger if exists tarefas_carimbo on public.tarefas;
create trigger tarefas_carimbo
  before insert or update on public.tarefas
  for each row execute function public.tarefas_carimbo();

do $$ begin
  alter publication supabase_realtime add table public.tarefas;
exception when duplicate_object then null;
end $$;
