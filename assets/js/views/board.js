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
      return `<div class="sprint-head panel"><div><h2>Nenhuma sprint aberta</h2></div>
        <button class="btn btn-primary" data-action="new-sprint">Abrir sprint</button></div>`;
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
            <span class="kchip ${limiteCls}" title="Limite combinado para cada sprint: de ${si.min} a ${si.max} atividades">${si.total} atividades · ${si.projetos} projeto(s)</span>
          </div>
          <div class="sprint-goal">${si.sp.objetivo ? `🎯 ${esc(si.sp.objetivo)}` : `<span class="muted">Sem objetivo definido. Defina no planejamento.</span>`}</div>
          <div class="sprint-meter ${atrasada ? "late" : ""}">
            <div class="sm-row"><span>Tempo</span><div class="sm-bar time"><i style="width:${tempo}%"></i></div><b>${tempo}%</b></div>
            <div class="sm-row"><span>Entrega</span><div class="sm-bar done"><i style="width:${entrega}%"></i></div><b>${entrega}%</b></div>
            <div class="sm-note">${si.feitas} de ${si.total} atividades feitas${atrasada ? " · <strong>a entrega está atrás do tempo</strong>" : ""}</div>
          </div>
        </div>
        <div class="sprint-head-actions no-print">
          <button class="btn btn-primary" data-action="plan-sprint">🗓️ Planejar sprint</button>
          <button class="btn btn-outline" data-action="new-sprint" title="Encerra esta sprint e abre a próxima; o que não foi feito passa para ela">Encerrar e abrir a ${si.sp.numero + 1}</button>
        </div>
      </div>`;
  }

  function toolbar(S) {
    const g = S.state.ui.kanbanGroup || "none";
    const opt = (k, l) => `<button class="seg-btn ${g === k ? "active" : ""}" data-kb-group="${k}">${l}</button>`;
    const user = S.state.settings.user;
    return `
      <div class="kb-toolbar no-print">
        <span class="muted small">Agrupar:</span>
        <div class="seg">${opt("none", "Nenhum")}${opt("projeto", "Projeto")}${opt("pessoa", "Responsável")}</div>
        ${user ? `<label class="checkbox kb-mine"><input type="checkbox" data-kb-mine ${S.state.ui.kanbanMine ? "checked" : ""}> Só as minhas (${esc(user)})</label>` : ""}
        <span class="spacer"></span>
        <span class="muted small">O backlog fica em <a href="#ondas">Ondas</a> e <a href="#priorizacao">Priorização</a>.</span>
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
            : comCabecalho ? `<div class="muted small k-empty">${c.key === "todo" && !si.total ? "Use “Planejar sprint” para escolher as atividades" : "Arraste atividades para cá"}</div>` : ""}
        </div>
      </section>`).join("");
  }

  A.views.kanban = function (S) {
    const si = A.sprintInfo(S);
    const ui_ = S.state.ui;
    document.getElementById("sprint-head").innerHTML = sprintHead(S, si) + toolbar(S);
    const user = S.state.settings.user;
    const items = si.items.filter(({ it, a }) => S.matchesFilters(it) && (!ui_.kanbanMine || S.raciPeople(a.raci, "R")[0] === user));
    const board = document.getElementById("kanban-board");
    const g = ui_.kanbanGroup || "none";
    if (g === "none") {
      board.className = "kanban sprint-board";
      board.innerHTML = colunas(S, items, si);
      return;
    }
    // Faixas: uma por projeto ou por responsável, cruzando as 4 colunas.
    const chave = g === "projeto" ? ({ it }) => it.id : ({ a }) => S.raciPeople(a.raci, "R")[0] || "Sem responsável";
    const grupos = new Map();
    items.forEach((x) => { const k = chave(x); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(x); });
    const ordenados = [...grupos.entries()].sort((p, q) => p[0].localeCompare(q[0], "pt-BR", { numeric: true }));
    board.className = "kanban-lanes";
    board.innerHTML = `
      <div class="lane-colheads">${A.meta.SPRINT_COLUNAS.map((c) => `<div class="k-title">${esc(c.label)}</div>`).join("")}</div>
      ${ordenados.map(([k, list]) => {
        const feitas = list.filter(({ a }) => a.status === "Concluído").length;
        const pct = Math.round(list.reduce((s, { a }) => s + a.pct, 0) / list.length);
        const it = g === "projeto" ? list[0].it : null;
        const titulo = it
          ? `<span class="act-card-id" style="--ac:${A.area(it.area).cor}">${esc(it.id)}</span> <a href="${A.drill.projectHref(it.id)}" data-nav>${esc(it.nome)}</a>`
          : `<span class="act-av">${esc(A.util.initials(k))}</span> <strong>${esc(k)}</strong>`;
        return `
          <div class="lane">
            <div class="lane-head">${titulo}<span class="muted small">${feitas}/${list.length} feitas · ${pct}%</span></div>
            <div class="lane-cols">${colunas(S, list, si, false)}</div>
          </div>`;
      }).join("") || `<div class="empty">Nenhuma atividade na sprint com esses filtros.</div>`}`;
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
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-kb-group]");
      if (!b) return;
      A.store.state.ui.kanbanGroup = b.dataset.kbGroup;
      A.store.emit();
    });
    document.addEventListener("change", (e) => {
      if (!e.target.matches("[data-kb-mine]")) return;
      A.store.state.ui.kanbanMine = e.target.checked;
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
            </div>
            <div class="wave-eixos">${S.eixos().map((e) => {
              const n = list.filter((i) => i.status !== "Concluído" && i.eixo === e.key).length;
              const cls = n > e.vagas ? "bad" : !n && e.vagas ? "warnc" : n === e.vagas ? "good" : "neutral";
              return `<span class="kchip ${cls}" title="${esc(e.key)}: ${n} projeto(s) para ${e.vagas} vaga(s)">${esc(e.icone)} ${n}/${e.vagas}</span>`;
            }).join("")}</div>`}
          </header>
          <div class="wave-col-list">
            ${list.length ? list.map((it) => `
              <div class="wchip ${it.status === "Concluído" ? "done" : ""}" draggable="true" data-drag="initiative" data-id="${esc(it.id)}"
                   data-action="edit-initiative" tabindex="0" role="button"
                   title="${esc(it.nome)} · ${esc(it.status)} · V÷E ${A.util.fmtNum(ve(it))} · esforço ${esc(A.meta.tempoPorEsforco(it.esforco))}"
                   style="--ac:${A.area(it.area).cor}">
                <span class="wchip-id">${esc(it.id)}</span>
                ${ui.eixoIcon(it.eixo)}
                <span class="wchip-name">${esc(it.nome)}</span>
                ${naSprint.has(it.id) ? `<span class="sprint-tag" title="Tem atividades na sprint atual">${esc(sp.id.replace("S", "Sprint "))}</span>` : ""}
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
    const eixo = S.findEixo(it.eixo);
    const doEixo = eixo ? S.state.data.initiatives.filter((i) => i.onda === onda && i.eixo === eixo.key && i.status !== "Concluído" && i.status !== "Cancelado").length : 0;
    if (onda !== "Fila" && eixo && doEixo > eixo.vagas) toast(`${id} movido para ${onda}. Atenção: o eixo ${eixo.icone} ${eixo.key} ficou com ${doEixo} projetos para ${eixo.vagas} vaga(s).`, "warn", 6000);
    else if (onda !== "Fila" && abertos > limite) toast(`${id} movido para ${onda}. Atenção: ${abertos} projetos para um limite de ${limite}.`, "warn", 5000);
    else toast(`${id} movido para ${onda}.`);
  }

  A.board = { initDragAndDrop, initKanbanControls, moveCard, moveActivity, quick, salvarAtividade };
})();
