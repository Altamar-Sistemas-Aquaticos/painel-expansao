/* Sprint: planejamento (escolher as atividades do mês) e janela da atividade no estilo Trello
   (etiquetas, datas, checklist, membros, anexos, comentários e atividade). */
(function () {
  const A = window.Altamar;
  const { esc, toast, openModal, closeModal, confirmDialog } = A.util;
  const $ = (id) => document.getElementById(id);

  const ONDA_ORDER = Object.fromEntries(A.meta.ONDAS.map((o, i) => [o.key, i]));
  const aberta = (a) => a.status !== "Concluído" && a.status !== "Cancelado";

  /* ---------- Planejamento ---------- */
  let plano = null; // Set de "iniId|actId"

  function planCounter() {
    const { min, max } = A.store.calc.sprintLimites();
    const n = plano.size;
    const cls = n > max ? "bad" : n < min ? "warnc" : "good";
    const msg = n > max ? `acima do limite de ${max}` : n < min ? `o combinado é de ${min} a ${max}` : "dentro do limite";
    $("plan-counter").innerHTML = `<span class="kchip ${cls}"><strong>${n}</strong> atividade(s) · ${msg}</span>`;
  }

  function openPlan() {
    const S = A.store;
    const sp = S.sprintAtual();
    if (!sp) return toast("Abra um ciclo primeiro.", "warn");
    plano = new Set(S.sprintItems(sp).map(({ it, a }) => `${it.id}|${a.id}`));
    const si = A.sprintInfo(S);
    const projetos = S.state.data.initiatives
      .filter((it) => it.situacao !== "Rascunho" && it.status !== "Concluído" && it.status !== "Cancelado" && it.atividades.some(aberta))
      .map((it) => ({ it, sel: it.atividades.filter((a) => plano.has(`${it.id}|${a.id}`)).length }))
      .sort((x, y) => (y.sel > 0) - (x.sel > 0) || (y.it.ciclo === (S.sprintAtual() || {}).id) - (x.it.ciclo === (S.sprintAtual() || {}).id) || S.calc.ve(y.it) - S.calc.ve(x.it));

    $("plan-body").innerHTML = `
      <div class="modal-head">
        <h3>Planejar o ${esc(si.rotulo)} <span class="muted small">· ${esc(si.periodo)}</span></h3>
        <button class="btn btn-xs btn-ghost" data-action="close-modal" data-target="modal-sprint" aria-label="Fechar">✕</button>
      </div>
      <p class="muted small" style="margin-top:0">Escolha as atividades que vão andar nestas 4 semanas. Comece pelos projetos escolhidos para o ciclo e pelos que já estão em andamento.</p>
      <div class="field">
        <label for="plan-objetivo">Objetivo do ciclo</label>
        <input id="plan-objetivo" class="input" value="${esc(sp.objetivo)}" placeholder="ex.: primeiras entregas de Vendas e o formulário de requisitos rodando" autocomplete="off">
      </div>
      <div id="plan-counter" class="plan-counter"></div>
      <div class="plan-list">
        ${projetos.map(({ it, sel }) => `
          <details class="plan-proj" ${sel || it.ciclo === (S.sprintAtual() || {}).id ? "open" : ""} style="--ac:${A.area(it.area).cor}">
            <summary>
              <span class="act-card-id">${esc(it.id)}</span>
              <span class="plan-proj-name">${esc(it.nome)}</span>
              <span class="muted small" data-plan-count="${esc(it.id)}">${sel ? `${sel} no ciclo` : ""}</span>
            </summary>
            ${it.atividades.filter(aberta).map((a) => {
              const k = `${it.id}|${a.id}`;
              const r = A.store.raciPeople(a.raci, "R")[0];
              return `
                <label class="plan-act">
                  <input type="checkbox" data-plan="${esc(k)}" ${plano.has(k) ? "checked" : ""}>
                  <span class="plan-act-name">${esc(a.nome)}</span>
                  <span class="muted small">${esc(r || "sem R")}${a.prazo ? ` · ${esc(a.prazo)}` : ""}${a.status === "Em andamento" ? " · em andamento" : ""}</span>
                </label>`;
            }).join("")}
          </details>`).join("") || `<div class="empty">Nenhum projeto validado com atividades em aberto.</div>`}
      </div>
      <div class="modal-foot">
        <span class="muted small">Atividades fora do ciclo continuam no projeto, só não aparecem no Kanban.</span>
        <div class="right">
          <button type="button" class="btn btn-outline" data-action="close-modal" data-target="modal-sprint">Cancelar</button>
          <button type="button" class="btn btn-primary" id="plan-save">Salvar planejamento</button>
        </div>
      </div>`;
    planCounter();
    openModal("modal-sprint");
  }

  function savePlan() {
    const r = A.store.planSprint([...plano], $("plan-objetivo").value);
    if (!r.ok) return toast(r.error, "error");
    closeModal("modal-sprint");
    if (!r.unchanged) toast(`Ciclo planejado com ${r.total} atividade(s).`);
  }

  async function novaSprint() {
    const S = A.store;
    const si = A.sprintInfo(S);
    if (si.sp) {
      const pend = si.total - si.feitas;
      const ok = await confirmDialog(
        `Encerrar o ${si.rotulo} (${si.feitas} de ${si.total} feitas) e abrir o próximo ciclo?${pend ? ` As ${pend} atividade(s) não terminadas passam para o novo ciclo.` : ""}`,
        { title: "Encerrar ciclo", okLabel: "Encerrar e abrir" });
      if (!ok) return;
    }
    const r = S.novaSprint();
    toast(`${S.nomeCiclo(r.sprint)} aberto${r.levadas ? ` com ${r.levadas} atividade(s) da anterior` : ""}. Agora é planejar.`, "ok", 5000);
    openPlan();
  }

  /* ---------- Janela da atividade (estilo Trello) ---------- */
  const isoDeBr = (br) => { const d = A.store.calc.parseDate(br); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : ""; };
  const brDeIso = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  let atual = null; // { ini, act }
  let ultimoSalvo = ""; // hora da última gravação feita nesta janela
  let pop = null; // popover aberto: "etiquetas" | "datas" | "membros" | "anexo"
  let etEdit = null; // etiqueta em criação/edição: { id|null, nome, cor }
  let etBusca = "";

  const viaBanco = () => A.nuvem?.perfil?.() === "visualizacao";
  const gestao = () => !viaBanco();

  // Campos que a pessoa pode estar digitando: o redesenho da janela não pode apagar o que ainda não foi salvo.
  const RASCUNHOS = ["ck-new", "ck-new-data", "cm-new", "et-nome", "et-busca"];
  const SO_SE_FOCADO = ["act-obs", "act-nome"];
  function renderActivity() {
    const valores = Object.fromEntries([...RASCUNHOS, ...SO_SE_FOCADO].map((id) => [id, $(id)?.value]));
    const foco = document.activeElement?.id;
    const scroll = $("act-body")?.querySelector(".tmodal-side")?.scrollTop || 0;
    desenharAtividade();
    RASCUNHOS.forEach((id) => { if (valores[id] && $(id)) $(id).value = valores[id]; });
    SO_SE_FOCADO.forEach((id) => { if (foco === id && valores[id] != null && $(id)) $(id).value = valores[id]; });
    if (foco && $(foco)) {
      const el = $(foco);
      el.focus();
      if (typeof el.value === "string" && el.setSelectionRange && el.type !== "date") try { el.setSelectionRange(el.value.length, el.value.length); } catch {}
    }
    const side = $("act-body")?.querySelector(".tmodal-side");
    if (side) side.scrollTop = scroll;
  }

  const quando = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "").replace(" de ", " ")}, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  };
  const corte = (s, n = 70) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
  // Frase curta para cada mudança registrada no histórico do cartão.
  function descreverMudanca(h) {
    if (h.action === "criou") return "criou a atividade";
    if (h.action === "excluiu") return "excluiu a atividade";
    const partes = (h.changes || []).map((c) => {
      if (c.field === "travado") return c.to === "Sim" ? "marcou como travada" : "destravou";
      if (c.field === "esperando") return c.to === "Sim" ? "moveu para Esperando" : "";
      if (c.field === "status") return `mudou a situação para ${c.to}`;
      if (c.field === "checklist") return "atualizou o checklist";
      if (c.field === "observacoes") return "editou a descrição";
      if (c.field === "anexos") return "mexeu nos anexos";
      if (c.field === "etiquetas") return `mudou as etiquetas${c.to && c.to !== "alteradas" ? ` (${corte(c.to, 40)})` : ""}`;
      if (c.field === "pct") return "";
      return `alterou ${c.label}: ${corte(c.from || "—", 30)} → ${corte(c.to || "—", 30)}`;
    }).filter(Boolean);
    return partes.length ? partes.join(" · ") : "editou a atividade";
  }

  function popoverHtml(S, a, r) {
    if (!pop) return "";
    const head = (t) => `<div class="tpop-head"><strong>${t}</strong><button type="button" class="raci-x" data-tpop-fechar aria-label="Fechar">✕</button></div>`;
    if (pop === "etiquetas") {
      const termo = A.util.norm(etBusca);
      const lista = S.etiquetas().filter((e) => !termo || A.util.norm(e.nome).includes(termo));
      if (etEdit) {
        return `${head(etEdit.id ? "Editar etiqueta" : "Criar etiqueta")}
          <div class="lbl lbl-preview" style="--lb:${A.meta.corEtiqueta(etEdit.cor).bg};--lbt:${A.meta.corEtiqueta(etEdit.cor).fg}">${esc(etEdit.nome || "Nome da etiqueta")}</div>
          <form id="et-form" autocomplete="off">
            <input id="et-nome" class="input input-sm" maxlength="30" placeholder="ex.: Hidráulica, Cliente Patense" value="${esc(etEdit.nome)}">
            <div class="et-cores">${A.meta.ETIQUETA_CORES.map((c) => `<button type="button" class="et-cor ${c.key === etEdit.cor ? "on" : ""}" data-et-cor="${c.key}" style="background:${c.bg}" title="${c.nome}" aria-label="${c.nome}"></button>`).join("")}</div>
            <div class="row">
              <button type="submit" class="btn btn-sm btn-primary">${etEdit.id ? "Salvar" : "Criar"}</button>
              <button type="button" class="btn btn-sm btn-ghost" data-et-voltar>Voltar</button>
              ${etEdit.id ? `<button type="button" class="btn btn-sm btn-danger-ghost" data-et-del style="margin-left:auto">Excluir</button>` : ""}
            </div>
          </form>`;
      }
      return `${head("Etiquetas")}
        <input id="et-busca" class="input input-sm" placeholder="Buscar etiquetas…" value="${esc(etBusca)}" autocomplete="off">
        <div class="et-lista">
          ${lista.map((e) => { const c = A.meta.corEtiqueta(e.cor); return `
            <div class="et-row">
              <label><input type="checkbox" data-et-toggle="${esc(e.id)}" ${a.etiquetas.includes(e.id) ? "checked" : ""}>
                <span class="lbl lbl-grande" style="--lb:${c.bg};--lbt:${c.fg}">${esc(e.nome)}</span></label>
              ${gestao() ? `<button type="button" class="raci-x" data-et-edit="${esc(e.id)}" title="Editar etiqueta" aria-label="Editar ${esc(e.nome)}">✏️</button>` : ""}
            </div>`; }).join("") || `<p class="muted small">${S.etiquetas().length ? "Nenhuma etiqueta com esse nome." : "Nenhuma etiqueta criada ainda."}</p>`}
        </div>
        ${gestao() ? `<button type="button" class="btn btn-sm btn-outline et-nova" data-et-nova>Criar uma nova etiqueta</button>`
          : `<p class="muted small">Só a gestão cria e edita etiquetas.</p>`}`;
    }
    if (pop === "datas") {
      const trava = viaBanco() ? "disabled" : "";
      return `${head("Datas")}
        <label class="tpop-campo">Início <input type="date" id="dt-ini" class="input input-sm" value="${isoDeBr(a.inicio)}" ${trava}></label>
        <label class="tpop-campo">Entrega <input type="date" id="dt-prazo" class="input input-sm" value="${isoDeBr(a.prazo)}" ${trava}></label>
        ${viaBanco() ? `<p class="muted small">Prazos são combinados no plano do projeto e aprovados pela gestão.</p>`
          : `<button type="button" class="btn btn-sm btn-ghost" data-dt-limpar>Remover as datas</button>
             <p class="muted small">O prazo vai sozinho para o Google Agenda de quem tem a agenda conectada.</p>`}`;
    }
    if (pop === "membros") {
      const pessoas = S.pessoas({ ativas: true }).map((p) => p.nome);
      const trava = viaBanco() ? "disabled" : "";
      return `${head("Membros")}
        <label class="tpop-campo">Responsável (R)<select id="act-r" class="input input-sm" ${trava}>${A.ui.peopleOptions(r, { blank: "— Sem responsável —" })}</select></label>
        <div class="muted small" style="margin:0.4rem 0 0.2rem">Também participam</div>
        <div class="et-lista">
          ${pessoas.filter((n) => n !== r).map((n) => `
            <label class="mb-row"><input type="checkbox" data-mb="${esc(n)}" ${a.raci[n] ? "checked" : ""} ${trava}>
              <span class="act-av">${esc(A.util.initials(n))}</span> ${esc(n)}${a.raci[n] && a.raci[n] !== "C" ? ` <span class="muted small">(${a.raci[n]})</span>` : ""}</label>`).join("")}
        </div>`;
    }
    if (pop === "anexo") {
      return `${head("Anexar")}
        <button type="button" class="btn btn-sm btn-outline tpop-bloco" id="ax-arquivo" title="Até 20 MB por arquivo">📄 Arquivo do computador</button>
        <button type="button" class="btn btn-sm btn-outline tpop-bloco" id="ax-link">🔗 Link (Drive, OneDrive, site…)</button>`;
    }
    return "";
  }

  function desenharAtividade() {
    const S = A.store;
    if (!atual) return;
    const it = S.findInitiative(atual.ini);
    const a = S.findActivity(atual.ini, atual.act);
    if (!it || !a) { closeModal("modal-activity"); atual = null; return; }
    const sp = S.sprintAtual();
    const naSprint = sp && S.noKanban(it, a, sp);
    // Posição da atividade no plano (ordem por prazo), para situar quem abre o card.
    const ativas = it.atividades.filter((x) => x.status !== "Cancelado")
      .sort((x, y) => (S.calc.parseDate(x.prazo)?.getTime() ?? Infinity) - (S.calc.parseDate(y.prazo)?.getTime() ?? Infinity));
    const ordem = ativas.findIndex((x) => x.id === a.id) + 1;
    const col = S.activityCol(a);
    const r = S.raciPeople(a.raci, "R")[0] || "";
    const feitos = a.checklist.filter((x) => x.feito).length;
    const membros = [r, ...Object.keys(a.raci).filter((n) => n !== r)].filter(Boolean);
    // Perfil Visualização: só o responsável (R) atualiza o andamento; ninguém nesse perfil muda nome, R ou prazos.
    const soVe = viaBanco();
    const somenteLeitura = soVe && r !== S.state.settings.user;
    const d = S.calc.parseDate(a.prazo);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dias = d ? Math.round((d - hoje) / 86400000) : null;
    const prazoCls = !d ? "" : col === "done" ? "feito" : dias < 0 ? "late" : dias <= 2 ? "soon" : "";
    const feed = S.feedAtividade(it.id, a.id).slice(0, 40);
    const eu = S.state.settings.user || "";

    $("act-body").innerHTML = `
      <div class="tmodal-head" style="--ac:${A.area(it.area).cor}">
        <div class="tmodal-crumb">
          <span class="lbl lbl-proj">${esc(it.id)}</span>
          <a href="${A.drill.projectHref(it.id)}" data-nav data-close-act title="Abrir o plano completo do projeto">${esc(it.nome)}</a>
          <span class="muted small">· atividade ${Math.max(1, ordem)} de ${ativas.length} · projeto ${S.calc.progress(it) ?? 0}% ${{ verde: "🟢", amarelo: "🟡", vermelho: "🔴" }[it.semaforo] || ""}</span>
        </div>
        <select id="act-col" class="input input-sm tmodal-col" aria-label="Coluna do Kanban">
          ${A.meta.SPRINT_COLUNAS.map((c) => `<option value="${c.key}" ${c.key === col ? "selected" : ""}>${esc(c.label)}</option>`).join("")}
        </select>
        <button class="btn btn-xs btn-ghost" data-action="close-modal" data-target="modal-activity" aria-label="Fechar">✕</button>
      </div>
      ${soVe ? `<div class="perfil-aviso">${somenteLeitura ? "Somente leitura: só o responsável (R) atualiza esta atividade. Você pode comentar." : "Você é o responsável: atualize a situação, as etiquetas, o checklist e a descrição."}</div>` : ""}
      <div class="tmodal-grid">
        <div class="tmodal-main">
          <input id="act-nome" class="tmodal-title" value="${esc(a.nome)}" aria-label="Nome da atividade" ${soVe ? "disabled" : ""} autocomplete="off">
          ${a.entregavel ? `<p class="act-modal-deliv"><strong>Entregável:</strong> ${esc(a.entregavel)}</p>` : ""}
          <div class="tmodal-acoes no-print">
            <button type="button" class="btn btn-sm btn-outline" data-tpop="etiquetas">🏷 Etiquetas</button>
            <button type="button" class="btn btn-sm btn-outline" data-tpop="datas">🕑 Datas</button>
            <button type="button" class="btn btn-sm btn-outline" data-tfoco="ck-new">☑ Checklist</button>
            <button type="button" class="btn btn-sm btn-outline" data-tpop="membros">👤 Membros</button>
            <button type="button" class="btn btn-sm btn-outline" data-tpop="anexo">📎 Anexo</button>
          </div>
          <div class="tmodal-resumo">
            <div><small>Etiquetas</small>
              <div class="tcard-lbls">${A.board.etiquetasHtml(S, it, a)}<button type="button" class="lbl lbl-add" data-tpop="etiquetas" aria-label="Escolher etiquetas">+</button></div></div>
            <div><small>Entrega</small>
              <button type="button" class="tbadge prazo grande ${prazoCls}" data-tpop="datas">${d ? `🕑 ${esc(a.prazo)}${prazoCls === "late" ? " · atrasada" : prazoCls === "soon" ? (dias === 0 ? " · hoje" : ` · em ${dias} dia(s)`) : prazoCls === "feito" ? " · entregue" : ""}` : "Definir prazo"}</button></div>
            <div><small>Membros</small>
              <div class="tmodal-avs">${membros.map((n) => `<span class="act-av ${n === r ? "" : "outro"}" title="${esc(n === r ? `${n} · responsável (R)` : `${n} · ${a.raci[n]}`)}">${esc(A.util.initials(n))}</span>`).join("")}<button type="button" class="act-av mais" data-tpop="membros" aria-label="Escolher membros">+</button></div></div>
          </div>

          <section class="tmodal-sec">
            <h4>≡ Descrição</h4>
            <textarea id="act-obs" class="input" rows="3" placeholder="Detalhes, contexto, o que está travando…">${esc(a.observacoes)}</textarea>
          </section>

          <section class="tmodal-sec act-check">
            <div class="act-check-head">
              <h4>☑ Checklist</h4>
              <span class="muted small">${a.checklist.length ? `${feitos} de ${a.checklist.length} · ${a.pct}%` : "Quebre a atividade em passos"}</span>
            </div>
            ${a.checklist.length ? `<div class="act-check-bar ${feitos === a.checklist.length ? "completo" : ""}"><span style="width:${a.pct}%"></span></div>` : ""}
            <ul class="act-check-list">
              ${a.checklist.map((x) => {
                const dx = S.calc.parseDate(x.data);
                const vencido = dx && !x.feito && dx < hoje;
                return `
                <li class="${x.feito ? "done" : ""} ${vencido ? "vencido" : ""}">
                  <label><input type="checkbox" data-ck-toggle="${esc(x.id)}" ${x.feito ? "checked" : ""}> <span>${esc(x.texto)}</span></label>
                  <input type="date" class="ck-data" data-ck-data="${esc(x.id)}" value="${isoDeBr(x.data)}" title="Prazo do passo (opcional)" aria-label="Prazo do passo">
                  <button type="button" class="raci-x" data-ck-del="${esc(x.id)}" aria-label="Remover passo">✕</button>
                </li>`;
              }).join("")}
            </ul>
            <form id="ck-form" class="act-check-add" autocomplete="off">
              <input id="ck-new" class="input input-sm" placeholder="Adicionar um item (ex.: enviar minuta para a Maíra)">
              <input id="ck-new-data" type="date" class="input input-sm" title="Prazo do passo (opcional)" aria-label="Prazo do passo">
              <button class="btn btn-sm btn-outline" type="submit">Adicionar</button>
            </form>
          </section>

          ${a.anexos?.length ? `
          <section class="tmodal-sec act-anexos">
            <h4>📎 Anexos</h4>
            <ul class="act-anexos-lista">
              ${a.anexos.map((x) => `
                <li>
                  <button type="button" class="link-btn" data-ax-abrir="${esc(x.id)}" title="Abrir">${x.tipo === "arquivo" ? "📄" : "🔗"} ${esc(x.nome)}</button>
                  <span class="muted small">${esc(x.por || "")}${x.em ? ` · ${new Date(x.em).toLocaleDateString("pt-BR")}` : ""}${x.tamanho ? ` · ${Math.max(1, Math.round(x.tamanho / 1024))} KB` : ""}</span>
                  <button type="button" class="raci-x" data-ax-del="${esc(x.id)}" aria-label="Remover anexo" title="Remover">✕</button>
                </li>`).join("")}
            </ul>
          </section>` : ""}
          <input type="file" id="ax-input" hidden>
        </div>

        <aside class="tmodal-side">
          <h4>💬 Comentários e atividade</h4>
          <form id="cm-form" class="cm-form" autocomplete="off">
            <textarea id="cm-new" class="input" rows="2" placeholder="Escrever um comentário…"></textarea>
            <button type="submit" class="btn btn-sm btn-primary">Comentar</button>
          </form>
          <ol class="tfeed">
            ${feed.map((f) => f.tipo === "comentario" ? `
              <li class="tfeed-item com">
                <span class="act-av">${esc(A.util.initials(f.por || "?"))}</span>
                <div><b>${esc(f.por || "Alguém")}</b> <span class="muted small">${esc(quando(f.em))}</span>
                  <div class="tfeed-txt">${esc(f.c.texto)}</div>
                  ${!soVe && (f.por === eu || gestao()) ? `<button type="button" class="link-btn small" data-cm-del="${esc(f.c.id)}">Excluir</button>` : ""}
                </div>
              </li>` : `
              <li class="tfeed-item">
                <span class="act-av outro">${esc(A.util.initials(f.por || "?"))}</span>
                <div><b>${esc(f.por || "Alguém")}</b> ${esc(descreverMudanca(f.h))}<div class="muted small">${esc(quando(f.em))}</div></div>
              </li>`).join("") || `<li class="muted small">Nenhum comentário ainda.</li>`}
          </ol>
        </aside>
      </div>
      <div id="tpop" class="tpop ${pop ? "" : "hidden"}" role="dialog">${popoverHtml(S, a, r)}</div>

      <div class="modal-foot">
        <div class="row">
          ${sp && !soVe ? `<button type="button" class="btn btn-sm ${naSprint ? "btn-danger-ghost" : "btn-outline"}" id="act-sprint-toggle">${naSprint ? "Tirar do Kanban" : "Colocar no Kanban"}</button>` : ""}
        </div>
        <div class="right">
          <span class="act-salvo muted small" id="act-salvo">${ultimoSalvo ? `✓ Salvo às ${ultimoSalvo}` : ""}</span>
          <button type="button" class="btn btn-primary" id="act-salvar">Salvar e fechar</button>
        </div>
      </div>`;
    $("act-body").classList.add("act-trello");
    $("act-body").classList.toggle("somente-leitura", somenteLeitura);
    posicionarPop();
  }

  // Coloca o popover logo abaixo do botão que o abriu (o primeiro da barra de ações).
  function posicionarPop() {
    const el = $("tpop");
    if (!el || !pop) return;
    const body = $("act-body");
    const btn = body.querySelector(`.tmodal-acoes [data-tpop="${pop}"]`) || body.querySelector(`[data-tpop="${pop}"]`);
    if (!btn) return;
    const b = body.getBoundingClientRect(), r = btn.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(r.left - b.left, b.width - 300))}px`;
    el.style.top = `${r.bottom - b.top + body.scrollTop + 6}px`;
  }

  function abrirPop(nome) {
    pop = pop === nome ? null : nome;
    etEdit = null;
    etBusca = "";
    desenharAtividade();
    if (pop === "etiquetas") $("et-busca")?.focus();
  }

  function openActivity(key) {
    const [ini, act] = String(key).split("|");
    if (!A.store.findActivity(ini, act)) return toast("Atividade não encontrada.", "error");
    atual = { ini, act };
    ultimoSalvo = "";
    pop = null; etEdit = null; etBusca = "";
    if ($("ck-new")) $("ck-new").value = "";
    if ($("cm-new")) $("cm-new").value = "";
    desenharAtividade();
    openModal("modal-activity");
  }

  const cur = () => A.store.findActivity(atual.ini, atual.act);
  // Grava pela mesma via do Kanban (inclusive para quem só visualiza e é o responsável R da atividade).
  const saveAct = (patch) => Promise.resolve(A.board.salvarAtividade(atual.ini, atual.act, patch)).then((r) => {
    if (r?.ok !== false) marcarSalvo();
    return r;
  });
  function marcarSalvo() {
    ultimoSalvo = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const el = $("act-salvo");
    if (el) { el.textContent = `✓ Salvo às ${ultimoSalvo}`; el.classList.remove("pisca"); void el.offsetWidth; el.classList.add("pisca"); }
  }

  // Salvar geral: grava o que ainda está nos campos (passo digitado, descrição, nome) e fecha.
  async function salvarTudo({ fechar = true } = {}) {
    if (!atual || !cur()) return;
    const a = cur();
    const patch = {};
    const passo = $("ck-new")?.value.trim();
    if (passo) patch.checklist = [...a.checklist, { texto: passo, feito: false, data: brDeIso($("ck-new-data")?.value) }];
    const obs = $("act-obs")?.value;
    if (obs != null && obs !== a.observacoes) patch.observacoes = obs;
    const nome = $("act-nome")?.value.trim();
    if (nome && !$("act-nome").disabled && nome !== a.nome) patch.nome = nome;
    if (Object.keys(patch).length) {
      const r = await saveAct(patch);
      if (r?.ok === false) return;
      if ($("ck-new")) $("ck-new").value = "";
    }
    pop = null;
    if (fechar) {
      closeModal("modal-activity");
      toast(Object.keys(patch).length ? "Atividade salva." : "Tudo já estava salvo.");
    }
  }

  // Envia o arquivo para o banco (até 20 MB) e registra o anexo na atividade.
  async function anexarArquivo(file) {
    if (file.size > 20 * 1024 * 1024) return toast("Arquivo maior que 20 MB. Use um link do Drive ou OneDrive.", "warn", 6000);
    toast(`Enviando “${file.name}”…`, "ok", 2500);
    const r = await A.nuvem.enviarAnexo(file, atual.ini, atual.act);
    if (!r.ok) return;
    await saveAct({ anexos: [...(cur().anexos || []), { tipo: "arquivo", caminho: r.caminho, nome: file.name, tamanho: file.size, por: A.store.state.settings.user || "", em: new Date().toISOString() }] });
    toast("Arquivo anexado.");
  }

  async function comentar() {
    const texto = $("cm-new")?.value.trim();
    if (!texto) return toast("Escreva o comentário antes de enviar.", "warn");
    $("cm-new").value = "";
    const r = viaBanco() ? await A.nuvem.comentarAtividade(atual.ini, atual.act, texto) : A.store.addComentario(atual.ini, atual.act, texto);
    if (r?.ok === false) {
      if ($("cm-new")) $("cm-new").value = texto;
      if (r.error) toast(r.error, "error");
    }
  }

  function init() {
    $("plan-body").addEventListener("change", (e) => {
      const cb = e.target.closest("[data-plan]");
      if (!cb) return;
      if (cb.checked) plano.add(cb.dataset.plan); else plano.delete(cb.dataset.plan);
      const ini = cb.dataset.plan.split("|")[0];
      const n = [...plano].filter((k) => k.startsWith(`${ini}|`)).length;
      const el = $("plan-body").querySelector(`[data-plan-count="${CSS.escape(ini)}"]`);
      if (el) el.textContent = n ? `${n} no ciclo` : "";
      planCounter();
    });
    $("plan-body").addEventListener("click", (e) => { if (e.target.id === "plan-save") savePlan(); });

    const body = $("act-body");
    body.addEventListener("change", (e) => {
      const el = e.target;
      if (!atual) return;
      const S = A.store;
      if (el.id === "act-col") A.board.moveActivity(atual.ini, atual.act, el.value);
      else if (el.id === "act-nome") { if (el.value.trim() && el.value.trim() !== cur().nome) saveAct({ nome: el.value.trim() }); }
      else if (el.id === "act-r") {
        const r = S.setRaci(atual.ini, atual.act, el.value || (S.raciPeople(cur().raci, "R")[0] || ""), el.value ? "R" : "");
        if (!r.ok) toast(r.error, "error");
      } else if (el.dataset.mb) {
        const r = S.setRaci(atual.ini, atual.act, el.dataset.mb, el.checked ? "C" : "");
        if (!r.ok) toast(r.error, "error");
      } else if (el.id === "dt-ini") saveAct({ inicio: brDeIso(el.value) });
      else if (el.id === "dt-prazo") saveAct({ prazo: brDeIso(el.value) });
      else if (el.id === "act-obs") saveAct({ observacoes: el.value });
      else if (el.dataset.etToggle) {
        const id = el.dataset.etToggle;
        const atuais = cur().etiquetas;
        saveAct({ etiquetas: el.checked ? [...atuais, id] : atuais.filter((x) => x !== id) });
      } else if (el.dataset.ckData) {
        saveAct({ checklist: cur().checklist.map((x) => (x.id === el.dataset.ckData ? { ...x, data: brDeIso(el.value) } : x)) });
      } else if (el.id === "ax-input" && el.files?.[0]) anexarArquivo(el.files[0]).finally(() => { el.value = ""; });
      else if (el.dataset.ckToggle) {
        saveAct({ checklist: cur().checklist.map((x) => (x.id === el.dataset.ckToggle ? { ...x, feito: el.checked } : x)) });
      }
    });
    body.addEventListener("input", (e) => {
      if (e.target.id === "et-busca") { etBusca = e.target.value; renderActivity(); }
      else if (e.target.id === "et-nome" && etEdit) {
        etEdit.nome = e.target.value;
        const prev = body.querySelector(".lbl-preview");
        if (prev) prev.textContent = etEdit.nome || "Nome da etiqueta";
      }
    });
    body.addEventListener("keydown", (e) => {
      // Ctrl+Enter envia o comentário.
      if (e.target.id === "cm-new" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); comentar(); }
      if (e.key === "Escape" && pop) { e.stopPropagation(); pop = null; etEdit = null; desenharAtividade(); }
    });
    body.addEventListener("click", async (e) => {
      if (!atual) return;
      const S = A.store;
      const t = e.target;
      const abre = t.closest("[data-tpop]");
      if (abre) return abrirPop(abre.dataset.tpop);
      if (t.closest("[data-tpop-fechar]")) { pop = null; etEdit = null; return desenharAtividade(); }
      const foco = t.closest("[data-tfoco]");
      if (foco) { pop = null; desenharAtividade(); $(foco.dataset.tfoco)?.focus(); return $(foco.dataset.tfoco)?.scrollIntoView({ block: "center", behavior: "smooth" }); }
      // Fora do popover: fecha.
      if (pop && !t.closest("#tpop")) { pop = null; etEdit = null; desenharAtividade(); }
      if (t.closest("[data-et-nova]")) { etEdit = { id: null, nome: etBusca, cor: "azul" }; desenharAtividade(); return $("et-nome")?.focus(); }
      const ed = t.closest("[data-et-edit]");
      if (ed) { const x = S.findEtiqueta(ed.dataset.etEdit); etEdit = { id: x.id, nome: x.nome, cor: x.cor }; desenharAtividade(); return $("et-nome")?.focus(); }
      const cor = t.closest("[data-et-cor]");
      if (cor && etEdit) { etEdit.nome = $("et-nome")?.value ?? etEdit.nome; etEdit.cor = cor.dataset.etCor; return desenharAtividade(); }
      if (t.closest("[data-et-voltar]")) { etEdit = null; return desenharAtividade(); }
      if (t.closest("[data-et-del]") && etEdit?.id) {
        const x = S.findEtiqueta(etEdit.id);
        if (!(await confirmDialog(`Excluir a etiqueta “${x.nome}”? Ela sai de todos os cartões.`, { title: "Excluir etiqueta", okLabel: "Excluir", danger: true }))) return;
        S.deleteEtiqueta(etEdit.id);
        etEdit = null;
        return desenharAtividade();
      }
      if (t.closest("[data-dt-limpar]")) return saveAct({ inicio: "", prazo: "" });
      const cmDel = t.closest("[data-cm-del]");
      if (cmDel) {
        if (!(await confirmDialog("Excluir este comentário?", { title: "Excluir comentário", okLabel: "Excluir", danger: true }))) return;
        return S.deleteComentario(atual.ini, atual.act, cmDel.dataset.cmDel);
      }
      const del = t.closest("[data-ck-del]");
      if (del) return saveAct({ checklist: cur().checklist.filter((x) => x.id !== del.dataset.ckDel) });
      if (t.id === "act-sprint-toggle") {
        const sp = S.sprintAtual();
        const dentro = S.noKanban(S.findInitiative(atual.ini), cur(), sp);
        return Promise.resolve(saveAct({ sprint: dentro ? `-${sp.id}` : sp.id }))
          .then((r) => { if (r?.ok !== false) toast(dentro ? "Atividade tirada do Kanban." : "Atividade colocada no Kanban."); });
      }
      if (t.closest("[data-close-act]")) return closeModal("modal-activity");
      if (t.id === "act-salvar") return salvarTudo();
      // Anexos: arquivo (guardado no banco) ou link.
      if (t.id === "ax-arquivo") {
        pop = null;
        if (!A.nuvem?.conectado?.()) { desenharAtividade(); return toast("Anexar arquivo precisa do banco compartilhado (entre com seu login). Use “Link”.", "warn", 6000); }
        return $("ax-input").click();
      }
      if (t.id === "ax-link") {
        pop = null;
        desenharAtividade();
        const url = await A.util.pedirTexto("Cole o link do arquivo (Google Drive, OneDrive, site…). Confira se quem precisa tem acesso a ele.",
          { title: "🔗 Adicionar link", okLabel: "Continuar", placeholder: "https://…", obrigatorio: true });
        if (!url) return;
        if (!/^https?:\/\//i.test(url.trim())) return toast("O link precisa começar com http:// ou https://", "warn");
        const nome = await A.util.pedirTexto("Que nome mostrar para este link?", { title: "🔗 Nome do link", okLabel: "Adicionar", placeholder: "ex.: Orçamento do fornecedor" });
        if (nome == null) return;
        return saveAct({ anexos: [...(cur().anexos || []), { tipo: "link", url: url.trim(), nome: nome.trim() || url.trim(), por: S.state.settings.user || "", em: new Date().toISOString() }] })
          .then((r) => { if (r?.ok !== false) toast("Link adicionado."); });
      }
      const abrir = t.closest("[data-ax-abrir]");
      if (abrir) {
        const x = (cur().anexos || []).find((y) => y.id === abrir.dataset.axAbrir);
        if (!x) return;
        const url = x.tipo === "arquivo" ? await A.nuvem?.linkAnexo?.(x.caminho) : x.url;
        if (url) window.open(url, "_blank", "noopener");
        return;
      }
      const axDel = t.closest("[data-ax-del]");
      if (axDel) {
        const x = (cur().anexos || []).find((y) => y.id === axDel.dataset.axDel);
        if (!x || !(await confirmDialog(`Remover o anexo “${x.nome}”?`, { title: "Remover anexo", okLabel: "Remover", danger: true }))) return;
        const r = await saveAct({ anexos: cur().anexos.filter((y) => y.id !== x.id) });
        if (r?.ok !== false && x.tipo === "arquivo") A.nuvem?.apagarAnexo?.(x.caminho);
      }
    });
    body.addEventListener("submit", (e) => {
      e.preventDefault();
      const S = A.store;
      if (e.target.id === "ck-form") {
        const texto = $("ck-new").value.trim();
        if (!texto) return toast("Escreva o item antes de adicionar.", "warn");
        $("ck-new").value = ""; // limpa já, para o redesenho não trazer o texto de volta
        const data = brDeIso($("ck-new-data").value);
        $("ck-new-data").value = "";
        saveAct({ checklist: [...cur().checklist, { texto, feito: false, data }] })
          .then((r) => { if (r?.ok === false) $("ck-new").value = texto; setTimeout(() => $("ck-new")?.focus(), 0); });
      } else if (e.target.id === "cm-form") {
        comentar();
      } else if (e.target.id === "et-form" && etEdit) {
        const nome = $("et-nome").value.trim();
        const r = S.saveEtiqueta({ nome, cor: etEdit.cor }, etEdit.id);
        if (!r.ok) return toast(r.error, "warn");
        // Etiqueta nova já entra no cartão aberto.
        if (!etEdit.id && !cur().etiquetas.includes(r.item.id)) saveAct({ etiquetas: [...cur().etiquetas, r.item.id] });
        etEdit = null; etBusca = "";
        desenharAtividade();
      }
    });
    // Fechar no ✕ ou fora da janela também guarda o que ficou digitado (nada se perde).
    $("modal-activity").addEventListener("modal:dismiss", () => salvarTudo({ fechar: false }));
    // Mantém a janela atualizada quando os dados mudam (ex.: arrastar o card com ela aberta),
    // sem apagar o que está sendo digitado.
    A.store.subscribe(() => {
      if (!atual || !$("modal-activity").classList.contains("open")) return;
      renderActivity();
    });
  }

  A.sprint = { init, openPlan, novaSprint, openActivity };
})();
