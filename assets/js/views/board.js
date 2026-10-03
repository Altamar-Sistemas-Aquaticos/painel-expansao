/* Kanban da sprint e Ondas trimestrais, ambos com arrastar e soltar. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum, toast } = A.util;
  const ui = A.ui;

  const SEM_ORDER = { vermelho: 0, amarelo: 1, verde: 2 };
  const ONDA_ORDER = Object.fromEntries(A.meta.ONDAS.map((o, i) => [o.key, i]));

  /* ---------- Kanban ---------- */
  function card(it, S, compact) {
    const colOptions = A.meta.COLUNAS.map((c) => `<option value="${c.key}" ${c.key === it.coluna ? "selected" : ""}>${esc(c.label)}</option>`).join("");
    const pct = S.calc.progress(it);
    const ready = pct === 100 && it.coluna !== "done";
    return `
      <div class="k-card ${it.enabler ? "enabler" : ""}" draggable="true" data-drag="initiative" data-id="${esc(it.id)}"
           data-action="open-sector" tabindex="0" role="button" aria-label="${esc(it.id + " " + it.nome)} — abrir setor ${esc(it.area)}"
           title="Abrir o setor ${esc(it.area)}">
        <div class="k-card-top">
          ${ui.areaBadge(it.area)}
          <span class="row" style="gap:0.35rem">${ui.dot(it.semaforo)}<span class="small muted" style="font-weight:700">${esc(it.onda)}</span></span>
        </div>
        <div class="k-card-title"><span class="id">${esc(it.id)}</span> · ${esc(it.nome)}</div>
        <div class="k-card-progress">${ui.progressBar(pct)}</div>
        ${ready ? `<div class="k-ready">✓ 100% — pronto para “Feito”</div>` : ""}
        ${compact ? "" : `
        <div class="k-card-foot">
          <span>👤 ${esc(it.responsavel || "A definir")}</span>
          <span>📅 ${esc(it.prazo || A.meta.tempoPorEsforco(it.esforco))}</span>
        </div>`}
        <select class="status-select k-move" data-change="move-col" data-id="${esc(it.id)}" aria-label="Mover ${esc(it.id)} para coluna" style="margin-top:0.45rem; width:100%">${colOptions}</select>
      </div>`;
  }

  A.views.kanban = function (S) {
    const { ve } = S.calc;
    // Rascunhos ficam na Triagem até serem validados.
    const items = S.filtered().filter((i) => i.status !== "Cancelado" && i.situacao !== "Rascunho");
    const cols = Object.fromEntries(A.meta.COLUNAS.map((c) => [c.key, []]));
    items.forEach((it) => cols[it.coluna]?.push(it));

    cols.backlog.sort((a, b) => ONDA_ORDER[a.onda] - ONDA_ORDER[b.onda] || ve(b) - ve(a));
    ["todo", "doing", "waiting"].forEach((k) => cols[k].sort((a, b) => SEM_ORDER[a.semaforo] - SEM_ORDER[b.semaforo] || ve(b) - ve(a)));
    cols.done.sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1));

    const wip = S.calc.wipCount();
    const over = S.calc.overCapacity();

    document.getElementById("kanban").innerHTML = A.meta.COLUNAS.map((c) => {
      const list = cols[c.key];
      const isWip = c.key === "doing" || c.key === "waiting";
      return `
        <section class="k-col ${c.key}" data-drop-col="${c.key}" aria-label="${esc(c.label)}">
          <div class="k-head">
            <div>
              <div class="k-title">${esc(c.label)}</div>
              <div class="k-hint">${esc(c.hint)}</div>
            </div>
            <span class="badge ${isWip && over ? "warn" : c.key === "doing" ? "accent" : ""}">${list.length}</span>
          </div>
          <div class="k-list">
            ${list.length ? list.map((it) => card(it, S, c.key === "backlog")).join("") : `<div class="muted small" style="text-align:center; padding:1rem 0">Arraste iniciativas para cá</div>`}
          </div>
        </section>`;
    }).join("");

    const wipNote = document.getElementById("kanban-wip-note");
    wipNote.className = `wip-pill ${over ? "warn" : "ok"}`;
    wipNote.textContent = `Carga: ${S.calc.carga()} de ${S.calc.capacidade()} pontos · ${wip} de ${S.calc.maxProjetos()} projetos`;
  };

  /* ---------- Ondas ---------- */
  // Capacidade de um trimestre: a equipe "gira" a carga cerca de duas vezes por onda.
  const capOnda = (S) => S.calc.capacidade() * 2;

  A.views.waves = function (S) {
    const { ve } = S.calc;
    document.getElementById("waves").innerHTML = A.meta.ONDAS.map((o) => {
      const list = S.state.data.initiatives
        .filter((i) => i.onda === o.key && i.status !== "Cancelado" && S.matchesFilters(i))
        .sort((a, b) => (a.status === "Concluído") - (b.status === "Concluído") || ve(b) - ve(a));
      const pts = list.filter((i) => i.status !== "Concluído").reduce((s, i) => s + (i.esforco || 0), 0);
      const isFila = o.key === "Fila";
      const cap = capOnda(S);
      const pct = Math.min(100, Math.round((pts / cap) * 100));
      const over = !isFila && pts > cap;
      return `
        <section class="wave-col" style="--wave-color:${o.color}" data-drop-onda="${esc(o.key)}" aria-label="${esc(o.key)}">
          <header class="wave-col-head" title="${esc(o.titulo)}">
            <div class="wave-col-title">${esc(o.key)}</div>
            <div class="wave-col-sub">${esc(o.periodo)}</div>
            ${isFila ? `<div class="wave-col-load muted">${pts} pts aguardando</div>` : `
            <div class="wave-cap ${over ? "over" : ""}" title="Pontos de esforço planejados × capacidade do trimestre (${cap})">
              <div class="wave-cap-bar"><span style="width:${pct}%"></span></div>
              <div class="wave-col-load">${pts} de ${cap} pts</div>
            </div>`}
          </header>
          <div class="wave-col-list">
            ${list.length ? list.map((it) => `
              <div class="wchip ${it.status === "Concluído" ? "done" : ""}" draggable="true" data-drag="initiative" data-id="${esc(it.id)}"
                   data-action="edit-initiative" tabindex="0" role="button"
                   title="${esc(it.nome)} · ${esc(it.status)} · V÷E ${fmtNum(ve(it))} · esforço ${it.esforco || "?"}"
                   style="--ac:${A.area(it.area).cor}">
                <span class="wchip-id">${esc(it.id)}</span>
                <span class="wchip-name">${esc(it.nome)}</span>
              </div>`).join("")
              : `<div class="wave-empty">Arraste projetos para cá</div>`}
          </div>
        </section>`;
    }).join("");
  };

  /* ---------- Arrastar e soltar (delegado, registrado uma vez) ---------- */
  function initDragAndDrop() {
    let draggingId = null;

    document.addEventListener("dragstart", (e) => {
      const el = e.target.closest?.('[data-drag="initiative"]');
      if (!el) return;
      draggingId = el.dataset.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggingId);
      requestAnimationFrame(() => el.classList.add("dragging"));
    });
    document.addEventListener("dragend", (e) => {
      e.target.closest?.('[data-drag="initiative"]')?.classList.remove("dragging");
      document.querySelectorAll(".drag-over").forEach((z) => z.classList.remove("drag-over"));
      draggingId = null;
    });

    const zoneOf = (e) => e.target.closest?.("[data-drop-col], [data-drop-onda]");
    document.addEventListener("dragover", (e) => {
      const zone = zoneOf(e);
      if (!zone || !draggingId) return;
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
      const id = e.dataTransfer.getData("text/plain") || draggingId;
      if (!id) return;
      if (zone.dataset.dropCol) moveCard(id, zone.dataset.dropCol);
      else if (zone.dataset.dropOnda) moveWave(id, zone.dataset.dropOnda);
    });
  }

  function moveCard(id, coluna) {
    const S = A.store;
    const before = S.findInitiative(id);
    if (!before || before.coluna === coluna) return;
    const wasWip = before.status === "Em andamento";
    const r = S.moveToColumn(id, coluna);
    if (!r.ok) return toast(r.error, "error");
    const col = A.meta.COLUNAS.find((c) => c.key === coluna);
    if (!wasWip && (coluna === "doing" || coluna === "waiting") && S.calc.overCapacity()) {
      toast(`${id} movida para “${col.label}”. Atenção: carga de ${S.calc.carga()} pts para capacidade de ${S.calc.capacidade()} (${S.calc.wipCount()} projetos, trava ${S.calc.maxProjetos()}).`, "warn", 6000);
    } else {
      toast(`${id} movida para “${col.label}”.`);
    }
  }

  function moveWave(id, onda) {
    const S = A.store;
    const it = S.findInitiative(id);
    if (!it || it.onda === onda) return;
    S.setOnda(id, onda);
    toast(`${id} movida para ${onda}.`);
  }

  A.board = { initDragAndDrop, moveCard, capOnda };
})();
