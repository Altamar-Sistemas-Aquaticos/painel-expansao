-- =====================================================================
-- Painel de Expansão Altamar · Plano do projeto proposto pelo líder
-- O líder do setor (perfil "visualizacao") monta o plano de atividades de um projeto do SEU setor
-- e envia para aprovação. A proposta fica guardada à parte (planoProposta) e só vira o plano
-- de verdade quando o Pedro ou a diretoria aprovam no painel.
-- Como usar: Supabase → SQL Editor → New query → colar tudo → Run. Pode rodar de novo.
-- =====================================================================

create or replace function public.enviar_plano(p_ini text, p_atividades jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_perfil text := public.meu_perfil();
  v_nome   text;
  v_dados  jsonb;
  v_versao bigint;
  i        int;
  v_it     jsonb;
  v_lider  boolean;
  v_agora  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if v_perfil is null then raise exception 'sem_acesso'; end if;
  if jsonb_typeof(p_atividades) <> 'array' or jsonb_array_length(p_atividades) > 200 then raise exception 'plano_invalido'; end if;
  select nome into v_nome from public.membros where email = lower(auth.jwt() ->> 'email');

  select dados, versao into v_dados, v_versao from public.painel where id = 'altamar' for update;
  if v_dados is null then raise exception 'painel_vazio'; end if;

  select (t.ord - 1)::int into i
    from jsonb_array_elements(v_dados -> 'initiatives') with ordinality as t(e, ord)
   where t.e ->> 'id' = p_ini;
  if i is null then raise exception 'nao_encontrado'; end if;
  v_it := v_dados -> 'initiatives' -> i;

  -- Quem só visualiza envia plano apenas dos projetos do setor que lidera
  if v_perfil = 'visualizacao' then
    select exists (
      select 1 from jsonb_array_elements(coalesce(v_dados -> 'config' -> 'areas', '[]'::jsonb)) a
       where a ->> 'key' = v_it ->> 'area' and a ->> 'lider' = v_nome
    ) into v_lider;
    if not v_lider then raise exception 'nao_lider'; end if;
  end if;

  v_dados := jsonb_set(v_dados, array['initiatives', i::text, 'planoProposta'], jsonb_build_object(
    'atividades', p_atividades, 'por', v_nome, 'em', v_agora, 'status', 'enviado', 'comentario', '', 'ajustePor', ''));
  v_dados := jsonb_set(v_dados, array['initiatives', i::text, 'atualizadoEm'], to_jsonb(v_agora));
  v_dados := jsonb_set(v_dados, '{history}', jsonb_build_array(jsonb_build_object(
      'id', 'h_' || replace(gen_random_uuid()::text, '-', ''), 'ts', v_agora, 'user', v_nome,
      'entity', 'iniciativa', 'refId', p_ini, 'action', 'propôs',
      'label', p_ini || ' · plano do projeto enviado para aprovação (' || jsonb_array_length(p_atividades) || ' atividades)',
      'changes', '[]'::jsonb, 'source', 'Plano do projeto'))
    || coalesce(v_dados -> 'history', '[]'::jsonb));

  update public.painel
     set dados = v_dados, versao = v_versao + 1, atualizado_em = now(), atualizado_por = v_nome
   where id = 'altamar';
  return v_versao + 1;
end $$;

revoke all on function public.enviar_plano(text, jsonb) from public, anon;
grant execute on function public.enviar_plano(text, jsonb) to authenticated;
