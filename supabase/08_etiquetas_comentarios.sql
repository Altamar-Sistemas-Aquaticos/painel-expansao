-- =====================================================================
-- Painel de Expansão Altamar · etiquetas e comentários no Kanban
-- 1) O responsável (R) com perfil "visualizacao" também pode trocar as ETIQUETAS da própria atividade.
-- 2) Qualquer pessoa com acesso ao painel pode COMENTAR uma atividade.
-- Como usar: Supabase → SQL Editor → New query → colar tudo → Run. Pode rodar de novo.
-- =====================================================================

create or replace function public.atualizar_minha_atividade(p_ini text, p_act text, p_patch jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_perfil    text := public.meu_perfil();
  v_nome      text;
  v_dados     jsonb;
  v_versao    bigint;
  i           int;
  j           int;
  v_it        jsonb;
  v_a         jsonb;
  v_r         text;
  v_permitido jsonb;
  v_novo      jsonb;
  v_changes   jsonb := '[]'::jsonb;
  v_agora     text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if v_perfil is null then raise exception 'sem_acesso'; end if;
  select nome into v_nome from public.membros where email = lower(auth.jwt() ->> 'email');

  select dados, versao into v_dados, v_versao from public.painel where id = 'altamar' for update;
  if v_dados is null then raise exception 'painel_vazio'; end if;

  select (t.ord - 1)::int into i
    from jsonb_array_elements(v_dados -> 'initiatives') with ordinality as t(e, ord)
   where t.e ->> 'id' = p_ini;
  if i is null then raise exception 'nao_encontrado'; end if;
  v_it := v_dados -> 'initiatives' -> i;

  select (t.ord - 1)::int into j
    from jsonb_array_elements(v_it -> 'atividades') with ordinality as t(e, ord)
   where t.e ->> 'id' = p_act;
  if j is null then raise exception 'nao_encontrado'; end if;
  v_a := v_it -> 'atividades' -> j;

  select key into v_r from jsonb_each_text(coalesce(v_a -> 'raci', '{}'::jsonb)) where value = 'R' limit 1;
  if v_perfil = 'visualizacao' and (v_r is null or v_r <> v_nome) then raise exception 'nao_responsavel'; end if;

  -- Campos de andamento (agora também as etiquetas)
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_permitido
    from jsonb_each(p_patch)
   where key in ('status', 'esperando', 'travado', 'checklist', 'observacoes', 'pct', 'anexos', 'etiquetas');
  v_novo := v_a || v_permitido;
  if v_novo ->> 'status' = 'Concluído' then v_novo := v_novo || '{"pct": 100, "esperando": false, "travado": false}'::jsonb; end if;

  if v_permitido ? 'status' and (v_a ->> 'status') is distinct from (v_novo ->> 'status') then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'field', 'status', 'label', 'Status', 'from', coalesce(v_a ->> 'status', ''), 'to', v_novo ->> 'status'));
  end if;
  if v_permitido ? 'checklist' then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'field', 'checklist', 'label', 'Checklist',
      'from', coalesce((select string_agg(case when (x ->> 'feito')::boolean then '☑ ' else '☐ ' end || (x ->> 'texto'), '; ')
                          from jsonb_array_elements(coalesce(v_a -> 'checklist', '[]'::jsonb)) x), ''),
      'to',   coalesce((select string_agg(case when (x ->> 'feito')::boolean then '☑ ' else '☐ ' end || (x ->> 'texto'), '; ')
                          from jsonb_array_elements(coalesce(v_novo -> 'checklist', '[]'::jsonb)) x), '')));
  end if;
  if v_permitido ? 'observacoes' and (v_a ->> 'observacoes') is distinct from (v_novo ->> 'observacoes') then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'field', 'observacoes', 'label', 'Observações', 'from', coalesce(v_a ->> 'observacoes', ''), 'to', v_novo ->> 'observacoes'));
  end if;
  if v_permitido ? 'etiquetas' and (v_a -> 'etiquetas') is distinct from (v_novo -> 'etiquetas') then
    v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'etiquetas', 'label', 'Etiquetas', 'from', '', 'to', 'alteradas'));
  end if;

  v_dados := jsonb_set(v_dados, array['initiatives', i::text, 'atividades', j::text], v_novo);
  v_dados := jsonb_set(v_dados, array['initiatives', i::text, 'atualizadoEm'], to_jsonb(v_agora));
  if v_novo ->> 'status' in ('Em andamento', 'Concluído') and v_it ->> 'status' = 'A fazer' then
    v_dados := jsonb_set(v_dados, array['initiatives', i::text, 'status'], '"Em andamento"'::jsonb);
    v_dados := jsonb_set(v_dados, array['initiatives', i::text, 'coluna'], '"doing"'::jsonb);
  end if;
  v_dados := jsonb_set(v_dados, '{history}', jsonb_build_array(jsonb_build_object(
      'id', 'h_' || replace(gen_random_uuid()::text, '-', ''), 'ts', v_agora, 'user', v_nome,
      'entity', 'atividade', 'refId', p_ini, 'act', p_act, 'action', 'editou', 'label', p_ini || ' · ' || (v_a ->> 'nome'),
      'changes', v_changes, 'source', 'Minhas atividades'))
    || coalesce(v_dados -> 'history', '[]'::jsonb));

  update public.painel
     set dados = v_dados, versao = v_versao + 1, atualizado_em = now(), atualizado_por = v_nome
   where id = 'altamar';
  return v_versao + 1;
end $$;

revoke all on function public.atualizar_minha_atividade(text, text, jsonb) from public, anon;
grant execute on function public.atualizar_minha_atividade(text, text, jsonb) to authenticated;

-- Comentário numa atividade (qualquer pessoa com acesso ao painel)
create or replace function public.comentar_atividade(p_ini text, p_act text, p_texto text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_perfil text := public.meu_perfil();
  v_nome   text;
  v_dados  jsonb;
  v_versao bigint;
  i        int;
  j        int;
  v_a      jsonb;
  v_texto  text := left(btrim(coalesce(p_texto, '')), 2000);
  v_agora  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if v_perfil is null then raise exception 'sem_acesso'; end if;
  if v_texto = '' then raise exception 'vazio'; end if;
  select nome into v_nome from public.membros where email = lower(auth.jwt() ->> 'email');

  select dados, versao into v_dados, v_versao from public.painel where id = 'altamar' for update;
  if v_dados is null then raise exception 'painel_vazio'; end if;

  select (t.ord - 1)::int into i
    from jsonb_array_elements(v_dados -> 'initiatives') with ordinality as t(e, ord)
   where t.e ->> 'id' = p_ini;
  if i is null then raise exception 'nao_encontrado'; end if;
  select (t.ord - 1)::int into j
    from jsonb_array_elements(v_dados -> 'initiatives' -> i -> 'atividades') with ordinality as t(e, ord)
   where t.e ->> 'id' = p_act;
  if j is null then raise exception 'nao_encontrado'; end if;
  v_a := v_dados -> 'initiatives' -> i -> 'atividades' -> j;

  v_a := jsonb_set(v_a, '{comentarios}', coalesce(v_a -> 'comentarios', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'id', 'cm_' || replace(gen_random_uuid()::text, '-', ''), 'por', v_nome, 'em', v_agora, 'texto', v_texto)));
  v_dados := jsonb_set(v_dados, array['initiatives', i::text, 'atividades', j::text], v_a);
  v_dados := jsonb_set(v_dados, '{history}', jsonb_build_array(jsonb_build_object(
      'id', 'h_' || replace(gen_random_uuid()::text, '-', ''), 'ts', v_agora, 'user', v_nome,
      'entity', 'atividade', 'refId', p_ini, 'act', p_act, 'action', 'comentou', 'label', p_ini || ' · ' || (v_a ->> 'nome'),
      'changes', '[]'::jsonb, 'source', 'Kanban'))
    || coalesce(v_dados -> 'history', '[]'::jsonb));

  update public.painel
     set dados = v_dados, versao = v_versao + 1, atualizado_em = now(), atualizado_por = v_nome
   where id = 'altamar';
  return v_versao + 1;
end $$;

revoke all on function public.comentar_atividade(text, text, text) from public, anon;
grant execute on function public.comentar_atividade(text, text, text) to authenticated;

-- Minhas tarefas: etiquetas e checklist em cada tarefa pessoal
alter table public.tarefas add column if not exists etiquetas jsonb not null default '[]'::jsonb;
alter table public.tarefas add column if not exists checklist jsonb not null default '[]'::jsonb;
