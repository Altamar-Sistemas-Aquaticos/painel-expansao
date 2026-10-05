-- =====================================================================
-- Painel de Expansão Altamar · Anexos das atividades
-- Cria a pasta privada "anexos" no armazenamento do Supabase (até 20 MB por arquivo).
-- Só membros do painel enviam e abrem arquivos; apagar: quem enviou, o administrador ou a diretoria.
-- Como usar: Supabase → SQL Editor → New query → colar tudo → Run. Pode rodar de novo.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "anexos: membros leem" on storage.objects;
create policy "anexos: membros leem" on storage.objects
  for select to authenticated
  using (bucket_id = 'anexos' and public.meu_perfil() is not null);

drop policy if exists "anexos: membros enviam" on storage.objects;
create policy "anexos: membros enviam" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'anexos' and public.meu_perfil() is not null);

drop policy if exists "anexos: quem enviou ou gestão apaga" on storage.objects;
create policy "anexos: quem enviou ou gestão apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'anexos' and (owner_id = (select auth.uid()::text) or public.meu_perfil() in ('admin', 'diretoria')));
