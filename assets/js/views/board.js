/* Kanban da sprint (cards = atividades) e Ondas trimestrais, ambos com arrastar e soltar. */
(function () {
  const A = window.Altamar;
  const { esc, toast } = A.util;
  const ui = A.ui;

  const SEM_ORDER = { vermelho: 0, amarelo: 1, verde: 2 };

  /* ---------- Kanban da sprint ---------- */
  const PROXIMA = { todo: "doing", doing: "done", waiting: "doing" };
  const PROXIMA_LABEL = { todo: "Começar (Fazendo)", doing: "Concluir (Feito)", waiting: "Destravar (Fazendo)" };

  function actCard(S, it, a) {
    const r = S.raciPeople(a.raci, "R")[0];
    const col = S.activityCol(a);
    const total = a.checklist.length, feitos = a.checklist.filter((x) => x.feito).length;
    const proximo = a.checklist.find((x) => !x.feito);
    const key = `${it.id}|${a.id}`;
    // Quem só visualiza mexe apenas nas atividades em que é o responsável (R).
    const pode = !viaBanco() || r === A.store.state.settings.user;
    const dica = [`${it.id} · ${it.nome}`, a.prazo ? `Prazo: ${a.prazo}` : "", a.entregavel ? `Entregável: ${a.entregavel}` : "", a.observacoes ? `Obs.: ${a.observacoes}` : ""].filter(Boolean).join("\n");
    return `
      <div class="k-card act-card ${col}" draggable="true" data-drag="activity" data-ini="${esc(it.id)}" data-act="${esc(a.id)}"
           data-action="open-activity" data-id="${esc(key)}" tabindex="0" role="button" title="${esc(dica)}"
           aria-label="${esc(a.nome)}, do projeto ${esc(it.id)}" style="--ac:${A.area(it.area).cor}">
        <div class="act-top">
          <span class="act-card-id">${esc(it.id)}</span>
          ${it.semaforo !== "verde" ? ui.dot(it.semaforo) : ""}
          <span class="act-av ${r ? "" : "none"}" title="${esc(r ? `Responsável: ${r}` : "Sem responsável (R)")}">${esc(r ? A.util.initials(r) : "?")}</span>
        </div>
        <div class="act-card-title">${esc(a.nome)}</div>
        <div class="act-bottom">
          <span class="act-ring" style="--p:${a.pct}" title="${a.pct}% concluído"><b>${a.pct}</b></span>
          ${total ? `<span class="act-ck" title="Passos do checklist">☑ ${feitos}/${total}</span>` : ""}
          ${pode ? `<span class="act-quick no-print">
            ${proximo && col !== "done" ? `<button class="q-btn" data-action="act-quick" data-id="${esc(key)}" data-q="step" title="Marcar passo: ${esc(proximo.texto)}">☐</button>` : ""}
            ${col === "todo" || col === "doing" ? `<button class="q-btn warn" data-action="act-quick" data-id="${esc(key)}" data-q="block" title="Marcar como travado">⚠</button>` : ""}
            ${PROXIMA[col] ? `<button class="q-btn go" data-action="act-quick" data-id="${esc(key)}" data-q="next" title="${PROXIMA_LABEL[col]}">→</button>` : ""}
          </span>` : ""}
        </div>
      </div>`;
  }

  function sprintHead(S, si) {
    if (!si.sp) {
      return `<div class="sprint-head panel"><div><h2>Nenhum ciclo aberto</h2></div>
        <button class="btn btn-primary" data-action="new-sprint">Abrir ciclo</button></div>`;
    }
    const { inicio, fim } = S.sprintDates(si.sp);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dur = (fim - inicio) / 86400000 + 1;
    const tempo = Math.max(0, Math.min(100, Math.round(((hoje - inicio) / 86400000 + 1) / dur * 100)));
    const entrega = si.total ? Math.round(si.items.reduce((s, { a }) => s + a.pct, 0) / si.total) : 0;
    const atrasada = si.total && entrega < tempo - 15;
    const limiteCls = si.acima ? "bad" : si.abaixo ? "warnc" : "good";
    return `
      <div class="sprint-head panel">
        <div class="sprint-head-main">
          <div class="sprint-head-title">
            <h2>${esc(si.rotulo)} <span class="muted">· ${esc(si.periodo)}</span></h2>
            ${si.terminou ? `<span class="kchip bad">terminou</span>` : si.naoComecou ? `<span class="kchip warnc">começa em breve</span>` : `<span class="kchip good">faltam ${si.diasRestantes} dia(s)</span>`}
            <span class="kchip ${limiteCls}" title="Limite combinado para cada ciclo: de ${si.min} a ${si.max} atividades">${si.total} atividades · ${si.projetos} projeto(s)</span>
          </div>
          <div class="sprint-goal">${si.sp.objetivo ? `🎯 ${esc(si.sp.objetivo)}` : `<span class="muted">Sem objetivo definido. Defina no planejamento.</span>`}</div>
          <div class="sprint-meter ${atrasada ? "late" : ""}">
            <div class="sm-row"><span>Tempo</span><div class="sm-bar time"><i style="width:${tempo}%"></i></div><b>${tempo}%</b></div>
            <div class="sm-row"><span>Entrega</span><div class="sm-bar done"><i style="width:${entrega}%"></i></div><b>${entrega}%</b></div>
            <div class="sm-note">${si.feitas} de ${si.total} atividades feitas${atrasada ? " · <strong>a entrega está atrás do tempo</strong>" : ""}</div>
          </div>
        </div>
        <div class="sprint-head-actions no-print">
          <button class="btn btn-primary" data-action="plan-sprint">🗓️ Planejar ciclo</button>
          <button class="btn btn-outline" data-action="new-sprint" title="Encerra este ciclo e abre o próximo; o que não foi feito passa para ele">Encerrar e abrir o próximo</button>
        </div>
      </div>`;
  }

  // Filtro "Responsável": só aparece quando há duas ou mais pessoas com etapas na tela (equipe do líder).
  function toolbar(S, responsaveis) {
    const sel = S.state.ui.kanbanResp || "";
    const lider = A.visao.atual().tipo === "lider";
    if (responsaveis.length < 2 && lider) return "";
    return `
      <div class="kb-toolbar no-print">
        ${responsaveis.length >= 2 ? `
          <label class="kb-resp"><span class="muted small">Responsável:</span>
            <select class="input input-sm" data-kb-resp>
              <option value="">Todos</option>
              ${responsaveis.map((n) => `<option ${n === sel ? "selected" : ""}>${esc(n)}</option>`).join("")}
            </select>
          </label>` : ""}
        <span class="spacer"></span>
        ${lider ? "" : `<span class="muted small">Os demais projetos ficam em <a href="#ondas">Ondas</a> e <a href="#priorizacao">Priorização</a>.</span>`}
      </div>`;
  }
  function colunas(S, list, si, comCabecalho = true) {
    const cols = Object.fromEntries(A.meta.SPRINT_COLUNAS.map((c) => [c.key, []]));
    list.forEach((x) => cols[S.activityCol(x.a)].push(x));
    Object.values(cols).forEach((l) => l.sort((x, y) =>
      SEM_ORDER[x.it.semaforo] - SEM_ORDER[y.it.semaforo] || x.it.id.localeCompare(y.it.id, "pt-BR", { numeric: true })));
    return A.meta.SPRINT_COLUNAS.map((c) => `
      <section class="k-col ${c.key}" data-drop-act="${c.key}" aria-label="${esc(c.label)}">
        ${comCabecalho ? `<div class="k-head"><div><div class="k-title">${esc(c.label)}</div><div class="k-hint">${esc(c.hint)}</div></div>
          <span class="badge ${c.key === "doing" ? "accent" : c.key === "waiting" && cols[c.key].length ? "warn" : ""}">${cols[c.key].length}</span></div>` : ""}
        <div class="k-list">
          ${cols[c.key].length ? cols[c.key].map(({ it, a }) => actCard(S, it, a)).join("")
            : comCabecalho ? `<div class="muted small k-empty">${c.key === "todo" && !si.total ? "Use “Planejar ciclo” para escolher as atividades" : "Arraste atividades para cá"}</div>` : ""}
        </div>
      </section>`).join("");
  }

  A.views.kanban = function (S) {
    const si = A.sprintInfo(S);
    // O líder de setor vê só os projetos do próprio setor.
    const doSetor = si.items.filter(({ it }) => A.visao.veProjeto(it) && S.matchesFilters(it));
    const responsaveis = [...new Set(doSetor.map(({ a }) => S.raciPeople(a.raci, "R")[0]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    let resp = S.state.ui.kanbanResp || "";
    if (resp && !responsaveis.includes(resp)) resp = S.state.ui.kanbanResp = "";
    const items = resp ? doSetor.filter(({ a }) => S.raciPeople(a.raci, "R")[0] === resp) : doSetor;
    // Para o líder, os números do cabeçalho são só do setor dele.
    const siTela = A.visao.atual().tipo !== "lider" ? si : {
      ...si, items: doSetor, total: doSetor.length, acima: false, abaixo: false,
      feitas: doSetor.filter(({ a }) => a.status === "Concluído").length,
      projetos: new Set(doSetor.map(({ it }) => it.id)).size,
    };
    document.getElementById("sprint-head").innerHTML = sprintHead(S, siTela) + toolbar(S, responsaveis);
    const board = document.getElementById("kanban-board");
    board.className = "kanban sprint-board";
    board.innerHTML = colunas(S, items, si);
  };
  // Ações rápidas do card (sem abrir a atividade).
  function quick(key, q) {
    const S = A.store;
    const [ini, act] = key.split("|");
    const a = S.findActivity(ini, act);
    if (!a) return;
    const col = S.activityCol(a);
    if (q === "step") {
      const prox = a.checklist.find((x) => !x.feito);
      if (!prox) return;
      const patch = { checklist: a.checklist.map((x) => (x.id === prox.id ? { ...x, feito: true } : x)) };
      if (col === "todo") Object.assign(patch, { status: "Em andamento", esperando: false });
      Promise.resolve(salvarAtividade(ini, act, patch)).then((r) => { if (r?.ok) toast(`Passo marcado: ${prox.texto}`); });
    } else if (q === "next" && PROXIMA[col]) {
      moveActivity(ini, act, PROXIMA[col]);
    } else if (q === "block") {
      moveActivity(ini, act, "waiting");
      A.sprint.openActivity(key);
      setTimeout(() => document.getElementById("act-obs")?.focus(), 60);
      toast("Escreva o que está travando a atividade.", "warn");
    }
  }

  function initKanbanControls() {
    document.addEventListener("change", (e) => {
      if (!e.target.matches("[data-kb-resp]")) return;
      A.store.state.ui.kanbanResp = e.target.value;
      A.store.emit();
    });
  }
  /* ---------- Ondas ---------- */
  A.views.waves = function (S) {
    const { ve } = S.calc;
    const limite = S.calc.projetosPorOnda();
    const naSprint = new Set(S.sprintItems().map(({ it }) => it.id));
    const sp = S.sprintAtual();
    document.getElementById("waves").innerHTML = A.meta.ONDAS.map((o) => {
      const list = S.state.data.initiatives
        .filter((i) => i.onda === o.key && i.status !== "Cancelado" && S.matchesFilters(i))
        .sort((a, b) => (a.status === "Concluído") - (b.status === "Concluído") || naSprint.has(b.id) - naSprint.has(a.id) || ve(b) - ve(a));
      const abertos = list.filter((i) => i.status !== "Concluído").length;
      const isFila = o.key === "Fila";
      const pct = Math.min(100, Math.round((abertos / limite) * 100));
      const over = !isFila && abertos > limite;
      return `
        <section class="wave-col" style="--wave-color:${o.color}" data-drop-onda="${esc(o.key)}" aria-label="${esc(o.key)}">
          <header class="wave-col-head" title="${esc(o.titulo)}">
            <div class="wave-col-title">${esc(o.key)}</div>
            <div class="wave-col-sub">${esc(o.periodo)}</div>
            ${isFila ? `<div class="wave-col-load muted">${abertos} projeto(s) aguardando</div>` : `
            <div class="wave-cap ${over ? "over" : ""}" title="Projetos em aberto nesta onda × limite por onda (${limite})">
              <div class="wave-cap-bar"><span style="width:${pct}%"></span></div>
              <div class="wave-col-load">${abertos} de ${limite} projetos</div>
            </div>`}
          </header>
          <div class="wave-col-list">
            ${list.length ? list.map((it) => `
              <div class="wchip ${it.status === "Concluído" ? "done" : ""}" draggable="true" data-drag="initiative" data-id="${esc(it.id)}"
                   data-action="edit-initiative" tabindex="0" role="button"
                   title="${esc(it.nome)} · ${esc(it.status)} · V÷E ${A.util.fmtNum(ve(it))} · esforço ${esc(A.meta.tempoPorEsforco(it.esforco))}"
                   style="--ac:${A.area(it.area).cor}">
                <span class="wchip-id">${esc(it.id)}</span>
                <span class="wchip-name">${esc(it.nome)}</span>
                ${naSprint.has(it.id) ? `<span class="sprint-tag" title="Tem atividades no ciclo atual">${esc(S.nomeCiclo(sp, { curto: true }))}</span>` : ""}
              </div>`).join("")
              : `<div class="wave-empty">Arraste projetos para cá</div>`}
          </div>
        </section>`;
    }).join("");
  };

  /* ---------- Arrastar e soltar (delegado, registrado uma vez) ---------- */
  function initDragAndDrop() {
    let dragging = null; // { kind: "initiative"|"activity", id, ini, act }

    document.addEventListener("dragstart", (e) => {
      const el = e.target.closest?.("[data-drag]");
      if (!el) return;
      // Visualização: não muda onda de projeto; no Kanban, só arrasta as próprias atividades.
      if (viaBanco()) {
        const a = el.dataset.drag === "activity" ? A.store.findActivity(el.dataset.ini, el.dataset.act) : null;
        if (!a || A.store.raciPeople(a.raci, "R")[0] !== A.store.state.settings.user) { e.preventDefault(); return; }
      }
      dragging = el.dataset.drag === "activity"
        ? { kind: "activity", ini: el.dataset.ini, act: el.dataset.act }
        : { kind: "initiative", id: el.dataset.id };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragging.id || `${dragging.ini}|${dragging.act}`);
      requestAnimationFrame(() => el.classList.add("dragging"));
    });
    document.addEventListener("dragend", (e) => {
      e.target.closest?.("[data-drag]")?.classList.remove("dragging");
      document.querySelectorAll(".drag-over").forEach((z) => z.classList.remove("drag-over"));
      dragging = null;
    });

    const zoneOf = (e) => {
      if (!dragging) return null;
      return dragging.kind === "activity" ? e.target.closest?.("[data-drop-act]") : e.target.closest?.("[data-drop-onda]");
    };
    document.addEventListener("dragover", (e) => {
      const zone = zoneOf(e);
      if (!zone) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!zone.classList.contains("drag-over")) {
        document.querySelectorAll(".drag-over").forEach((z) => z.classList.remove("drag-over"));
        zone.classList.add("drag-over");
      }
    });
    document.addEventListener("dragleave", (e) => {
      const zone = zoneOf(e);
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
    });
    document.addEventListener("drop", (e) => {
      const zone = zoneOf(e);
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove("drag-over");
      const d = dragging;
      if (d.kind === "activity") moveActivity(d.ini, d.act, zone.dataset.dropAct);
      else moveWave(d.id, zone.dataset.dropOnda);
    });
  }

  // Ponto único para alterar atividades na tela: quem só visualiza grava pelo banco, e só nas atividades em que é R.
  const viaBanco = () => A.nuvem?.perfil() === "visualizacao";
  async function salvarAtividade(iniId, actId, patch, source = "Kanban") {
    if (viaBanco()) return A.nuvem.atualizarMinhaAtividade(iniId, actId, patch);
    const r = A.store.saveActivity(iniId, actId, patch, { source });
    if (!r.ok) { toast(r.error, "error"); return r; }
    // Começar (ou concluir) uma atividade põe o projeto em andamento, como no Kanban.
    if ((patch.status === "Em andamento" || patch.status === "Concluído") && A.store.findInitiative(iniId)?.status === "A fazer") {
      A.store.saveInitiative({ status: "Em andamento" }, iniId, { source });
    }
    return r;
  }

  async function moveActivity(iniId, actId, col) {
    const S = A.store;
    if (viaBanco()) {
      const patch = { todo: { status: "A fazer", esperando: false }, doing: { status: "Em andamento", esperando: false },
        waiting: { status: "Em andamento", esperando: true }, done: { status: "Concluído", esperando: false } }[col];
      const r = await A.nuvem.atualizarMinhaAtividade(iniId, actId, patch);
      if (r.ok) toast(`Atividade movida para “${A.meta.SPRINT_COLUNAS.find((c) => c.key === col)?.label}”.`);
      return;
    }
    const r = S.moveActivity(iniId, actId, col);
    if (!r.ok) return toast(r.error, "error");
    if (r.unchanged) return;
    const label = A.meta.SPRINT_COLUNAS.find((c) => c.key === col)?.label;
    toast(`Atividade movida para “${label}”.${r.iniciouProjeto ? ` O projeto ${iniId} passou a Em andamento.` : ""}`);
    if (r.projetoPronto && S.findInitiative(iniId).status !== "Concluído") {
      toast(`Todas as atividades do ${iniId} estão feitas. Conclua o projeto na tela dele.`, "ok", 6000);
    }
  }

  // Concluir um projeto inteiro (tela do projeto): mantém a regra antiga de colunas de projeto.
  function moveCard(id, coluna) {
    const S = A.store;
    const r = S.moveToColumn(id, coluna);
    if (!r.ok) return toast(r.error, "error");
    if (!r.unchanged) toast(`${id}: ${S.findInitiative(id).status}.`);
  }

  function moveWave(id, onda) {
    const S = A.store;
    const it = S.findInitiative(id);
    if (!it || it.onda === onda) return;
    S.setOnda(id, onda);
    const limite = S.calc.projetosPorOnda();
    const abertos = S.state.data.initiatives.filter((i) => i.onda === onda && i.status !== "Concluído" && i.status !== "Cancelado").length;
    if (onda !== "Fila" && abertos > limite) toast(`${id} movido para ${onda}. Atenção: ${abertos} projetos para um limite de ${limite}.`, "warn", 5000);
    else toast(`${id} movido para ${onda}.`);
  }

  A.board = { initDragAndDrop, initKanbanControls, moveCard, moveActivity, quick, salvarAtividade };
})();
