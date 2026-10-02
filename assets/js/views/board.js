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
    return `
      <div class="k-card ${it.enabler ? "enabler" : ""}" draggable="true" data-drag="initiative" data-id="${esc(it.id)}"
           data-action="edit-initiative" tabindex="0" role="button" aria-label="${esc(it.id + " " + it.nome)}">
        <div class="k-card-top">
          ${ui.areaBadge(it.area)}
          <span class="row" style="gap:0.35rem">${ui.dot(it.semaforo)}<span class="small muted" style="font-weight:700">${esc(it.onda)}</span></span>
        </div>
        <div class="k-card-title"><span class="id">${esc(it.id)}</span> · ${esc(it.nome)}</div>
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
    const items = S.filtered().filter((i) => i.status !== "Cancelado");
    const cols = Object.fromEntries(A.meta.COLUNAS.map((c) => [c.key, []]));
    items.forEach((it) => cols[it.coluna]?.push(it));

    cols.backlog.sort((a, b) => ONDA_ORDER[a.onda] - ONDA_ORDER[b.onda] || ve(b) - ve(a));
    ["todo", "doing", "waiting"].forEach((k) => cols[k].sort((a, b) => SEM_ORDER[a.semaforo] - SEM_ORDER[b.semaforo] || ve(b) - ve(a)));
    cols.done.sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1));

    const wip = S.calc.wipCount();
    const over = wip > A.meta.WIP_MAX;

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
    wipNote.textContent = `WIP: ${wip} em andamento (limite ${A.meta.WIP_MIN}–${A.meta.WIP_MAX})`;
  };

  /* ---------- Ondas ---------- */
  A.views.waves = function (S) {
    const { ve } = S.calc;
    const filtering = S.hasActiveFilters();
    document.getElementById("waves").innerHTML = A.meta.ONDAS.map((o) => {
      const all = S.state.data.initiatives.filter((i) => i.onda === o.key);
      const list = all.filter((i) => S.matchesFilters(i)).sort((a, b) => ve(b) - ve(a));
      const active = all.filter((i) => i.status !== "Cancelado");
      const done = active.filter((i) => i.status === "Concluído").length;
      const doing = active.filter((i) => i.status === "Em andamento").length;
      const sumE = active.reduce((s, i) => s + i.esforco, 0);
      return `
        <section class="wave" style="--wave-color:${o.color}" data-drop-onda="${esc(o.key)}">
          <div class="wave-head">
            <div>
              <h3 class="wave-title">${o.key === "Fila" ? "⏳" : "🌊"} ${esc(o.key)} · ${esc(o.periodo)}: “${esc(o.titulo)}”</h3>
              <div class="muted small" style="margin-top:0.15rem">${esc(o.descricao)}</div>
            </div>
            <div class="row">
              <span class="badge">${active.length} iniciativas</span>
              ${doing ? `<span class="badge accent">${doing} em andamento</span>` : ""}
              ${done ? `<span class="badge ok">${done} concluídas</span>` : ""}
              <span class="badge" title="Soma do esforço (Fibonacci) das iniciativas ativas">Σ esforço ${sumE}</span>
            </div>
          </div>
          <div class="wave-chips">
            ${list.length ? list.map((it) => `
              <div class="chip ${it.status === "Concluído" ? "done" : ""}" draggable="true" data-drag="initiative" data-id="${esc(it.id)}"
                   data-action="edit-initiative" tabindex="0" role="button" title="${esc(it.status)} · V÷E ${fmtNum(ve(it))}"
                   style="${it.status === "Cancelado" ? "opacity:0.5" : ""}">
                ${ui.dot(it.semaforo)}
                ${ui.areaBadge(it.area, it.id)}
                <span class="chip-name">${esc(it.nome)}</span>
                <span class="muted small nowrap">V÷E ${fmtNum(ve(it))}</span>
              </div>`).join("")
              : `<div class="muted small">${filtering && all.length ? "Nenhuma iniciativa desta onda corresponde aos filtros." : "Arraste iniciativas para esta onda."}</div>`}
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
    const wip = S.calc.wipCount();
    if (!wasWip && (coluna === "doing" || coluna === "waiting") && wip > A.meta.WIP_MAX) {
      toast(`${id} movida para “${col.label}”. Atenção: ${wip} iniciativas em andamento (limite ${A.meta.WIP_MAX}).`, "warn", 5000);
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

  A.board = { initDragAndDrop, moveCard };
})();
