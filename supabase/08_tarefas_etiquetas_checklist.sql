-- =====================================================================
-- Painel de Expansão Altamar · Minhas tarefas: etiquetas e checklist
-- Cada tarefa pessoal ganha etiquetas (nome + cor, criadas pelo próprio dono) e um checklist.
-- As regras de acesso continuam as do script 07: só o dono mexe nas próprias tarefas.
-- Como usar: Supabase → SQL Editor → New query → colar tudo → Run. Pode rodar de novo.
-- =====================================================================

alter table public.tarefas add column if not exists etiquetas jsonb not null default '[]'::jsonb;
alter table public.tarefas add column if not exists checklist jsonb not null default '[]'::jsonb;
