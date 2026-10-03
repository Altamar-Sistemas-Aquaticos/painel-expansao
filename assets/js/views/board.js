/* Kanban da sprint (cards = atividades) e Ondas trimestrais, ambos com arrastar e soltar. */
(function () {
  const A = window.Altamar;
  const { esc, toast } = A.util;
  const ui = A.ui;

  const SEM_ORDER = { vermelho: 0, amarelo: 1, verde: 2 };

  /* ---------- Kanban da sprint ---------- */
  function actCard(S, it, a) {
    const r = S.raciPeople(a.raci, "R")[0];
    const ck = a.checklist.length ? `${a.checklist.filter((x) => x.feito).length}/${a.checklist.length}` : "";
    return `
      <div class="k-card act-card" draggable="true" data-drag="activity" data-ini="${esc(it.id)}" data-act="${esc(a.id)}"
           data-action="open-activity" data-id="${esc(it.id)}|${esc(a.id)}" tabindex="0" role="button"
           aria-label="${esc(a.nome)}, do projeto ${esc(it.id)}" style="--ac:${A.area(it.area).cor}">
        <div class="act-card-proj"><span class="act-card-id">${esc(it.id)}</span><span class="act-card-pname">${esc(it.nome)}</span>${ui.dot(it.semaforo)}</div>
        <div class="act-card-title">${esc(a.nome)}</div>
        <div class="k-card-progress">${ui.progressBar(a.pct)}</div>
        <div class="k-card-foot">
          <span>👤 ${esc(r || "Sem R")}</span>
          ${ck ? `<span title="Checklist">☑ ${ck}</span>` : ""}
          ${a.prazo ? `<span>📅 ${esc(a.prazo)}</span>` : ""}
        </div>
      </div>`;
  }

  function sprintHead(S, si) {
    if (!si.sp) {
      return `<div class="sprint-head panel"><div><h2>Nenhuma sprint aberta</h2></div>
        <button class="btn btn-primary" data-action="new-sprint">Abrir sprint</button></div>`;
    }
    const pct = si.total ? Math.round((si.feitas / si.total) * 100) : 0;
    const limiteCls = si.acima ? "bad" : si.abaixo ? "warnc" : "good";
    return `
      <div class="sprint-head panel">
        <div class="sprint-head-main">
          <div class="sprint-head-title">
            <h2>${esc(si.rotulo)} <span class="muted">· ${esc(si.periodo)}</span></h2>
            ${si.terminou ? `<span class="kchip bad">terminou</span>` : si.naoComecou ? `<span class="kchip warnc">começa em breve</span>` : `<span class="kchip good">faltam ${si.diasRestantes} dia(s)</span>`}
          </div>
          <div class="sprint-goal">${si.sp.objetivo ? `🎯 ${esc(si.sp.objetivo)}` : `<span class="muted">Sem objetivo definido. Defina no planejamento.</span>`}</div>
          <div class="sprint-stats">
            <span><strong>${si.feitas}</strong> de <strong>${si.total}</strong> atividades feitas</span>
            <span>${si.projetos} projeto(s)</span>
            <span class="kchip ${limiteCls}" title="Limite combinado para cada sprint">limite ${si.min} a ${si.max}</span>
          </div>
          <div class="sprint-bar"><span style="width:${pct}%"></span></div>
        </div>
        <div class="sprint-head-actions no-print">
          <button class="btn btn-primary" data-action="plan-sprint">🗓️ Planejar sprint</button>
          <button class="btn btn-outline" data-action="new-sprint" title="Encerra esta sprint e abre a próxima; o que não foi feito passa para ela">Encerrar e abrir a ${si.sp.numero + 1}</button>
        </div>
      </div>
      <p class="muted small sprint-note">O backlog saiu do Kanban: aqui ficam só as atividades combinadas para esta sprint. Os demais projetos estão em <a href="#ondas">Ondas</a> e <a href="#priorizacao">Priorização</a>.</p>`;
  }

  A.views.kanban = function (S) {
    const si = A.sprintInfo(S);
    document.getElementById("sprint-head").innerHTML = sprintHead(S, si);
    const items = si.items.filter(({ it }) => S.matchesFilters(it));
    const cols = Object.fromEntries(A.meta.SPRINT_COLUNAS.map((c) => [c.key, []]));
    items.forEach((x) => cols[S.activityCol(x.a)].push(x));
    Object.values(cols).forEach((list) => list.sort((x, y) =>
      SEM_ORDER[x.it.semaforo] - SEM_ORDER[y.it.semaforo] || x.it.id.localeCompare(y.it.id, "pt-BR", { numeric: true })));

    document.getElementById("kanban-board").innerHTML = A.meta.SPRINT_COLUNAS.map((c) => {
      const list = cols[c.key];
      return `
        <section class="k-col ${c.key}" data-drop-act="${c.key}" aria-label="${esc(c.label)}">
          <div class="k-head">
            <div>
              <div class="k-title">${esc(c.label)}</div>
              <div class="k-hint">${esc(c.hint)}</div>
            </div>
            <span class="badge ${c.key === "doing" ? "accent" : c.key === "waiting" && list.length ? "warn" : ""}">${list.length}</span>
          </div>
          <div class="k-list">
            ${list.length ? list.map(({ it, a }) => actCard(S, it, a)).join("")
              : `<div class="muted small" style="text-align:center; padding:1rem 0">${c.key === "todo" && !si.total ? "Use “Planejar sprint” para escolher as atividades" : "Arraste atividades para cá"}</div>`}
          </div>
        </section>`;
    }).join("");
  };

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

  function moveActivity(iniId, actId, col) {
    const S = A.store;
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

  A.board = { initDragAndDrop, moveCard, moveActivity };
})();
