/* Visão geral: anéis de conclusão por área (macro) + lista agrupada por área com início, término,
   barra de conclusão e linha do tempo; cada projeto expande para mostrar as atividades. */
(function () {
  const A = window.Altamar;
  const { esc } = A.util;
  const ui = A.ui;

  const expanded = new Set();   // projetos com atividades abertas
  const collapsed = new Set();  // áreas recolhidas

  /* ---------- Datas ---------- */
  const MESES = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
  // Período das ondas (usado quando o projeto não tem datas exatas).
  const ONDA_PERIODO = {
    "Onda 1": [new Date(2026, 9, 1), new Date(2026, 11, 31)],
    "Onda 2": [new Date(2027, 0, 1), new Date(2027, 2, 31)],
    "Onda 3": [new Date(2027, 3, 1), new Date(2027, 5, 30)],
  };
  const endOfMonth = (y, m) => new Date(y, m + 1, 0);

  // Converte textos de prazo em período: "15/11/2026", "15/Nov/2026", "Jan/2027", "2º Sem/2027", "2028".
  function period(text) {
    const s = String(text ?? "").trim();
    if (!s) return null;
    const d = A.store.calc.parseDate(s);
    if (d) return { start: d, end: d, exact: true };
    let m = s.match(/^([A-Za-z]{3})\/(\d{4})$/);
    if (m && MESES[m[1].toLowerCase()] != null) {
      const mo = MESES[m[1].toLowerCase()], y = Number(m[2]);
      return { start: new Date(y, mo, 1), end: endOfMonth(y, mo), exact: false };
    }
    m = s.match(/^([12])º?\s*Sem\/(\d{4})$/i);
    if (m) {
      const y = Number(m[2]), h = Number(m[1]);
      return { start: new Date(y, h === 1 ? 0 : 6, 1), end: h === 1 ? new Date(y, 5, 30) : new Date(y, 11, 31), exact: false };
    }
    m = s.match(/^(\d{4})$/);
    if (m) return { start: new Date(Number(m[1]), 0, 1), end: new Date(Number(m[1]), 11, 31), exact: false };
    return null;
  }

  // Início = menor início/prazo das atividades (ou começo da onda). Término = prazo do projeto (ou maior prazo das atividades, ou fim da onda).
  function projectDates(it) {
    const acts = it.atividades.filter((a) => a.status !== "Cancelado");
    const starts = acts.map((a) => period(a.inicio)?.start).filter(Boolean);
    const ends = acts.map((a) => period(a.prazo)?.end).filter(Boolean);
    const onda = ONDA_PERIODO[it.onda];
    const p = period(it.prazo);
    let start = starts.length ? { d: new Date(Math.min(...starts)), exact: true } : null;
    if (!start && ends.length) start = { d: new Date(Math.min(...acts.map((a) => period(a.prazo)?.start).filter(Boolean))), exact: false };
    if (!start && onda) start = { d: onda[0], exact: false };
    if (!start && p && !p.exact) start = { d: p.start, exact: false }; // ex.: "2º Sem/2027" começa em julho
    let end = p ? { d: p.end, exact: p.exact } : null;
    if (!end && ends.length) end = { d: new Date(Math.max(...ends)), exact: true };
    if (!end && onda) end = { d: onda[1], exact: false };
    if (!start && end) start = { d: end.d, exact: false };
    return { start, end };
  }

  const fmt = (x) => (x ? `${x.exact ? "" : "~"}${x.d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}` : "—");
  const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  const isLate = (it, dates) => dates.end && dates.end.d < today() && it.status !== "Concluído" && it.status !== "Cancelado";

  /* ---------- Anéis por área ---------- */
  function ring(pct, color, size = 86) {
    const r = 34, c = 2 * Math.PI * r;
    const val = pct == null ? 0 : pct;
    return `
      <svg viewBox="0 0 86 86" width="${size}" height="${size}" aria-hidden="true">
        <circle cx="43" cy="43" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="9"/>
        ${val > 0 ? `<circle cx="43" cy="43" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${(c * val) / 100} ${c}" transform="rotate(-90 43 43)"/>` : ""}
        <text x="43" y="48" text-anchor="middle" class="ov-ring-text">${pct == null ? "—" : pct + "%"}</text>
      </svg>`;
  }

  function avgProgress(S, list) {
    const ps = list.filter((i) => i.status !== "Cancelado").map(S.calc.progress).filter((p) => p != null);
    return ps.length ? Math.round(ps.reduce((s, p) => s + p, 0) / ps.length) : null;
  }

  /* ---------- Linha do tempo ---------- */
  function timeScale(S, list) {
    const all = list.map(projectDates).flatMap((d) => [d.start?.d, d.end?.d]).filter(Boolean);
    if (!all.length) return null;
    let min = new Date(Math.min(...all, today())), max = new Date(Math.max(...all, today()));
    min = new Date(min.getFullYear(), min.getMonth(), 1);
    max = endOfMonth(max.getFullYear(), max.getMonth());
    const span = max - min || 1;
    const pos = (d) => Math.max(0, Math.min(100, ((d - min) / span) * 100));
    const months = [];
    for (let d = new Date(min); d <= max; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(new Date(d));
    return { min, max, pos, months };
  }

  function timelineHead(scale) {
    if (!scale) return "";
    const step = scale.months.length > 18 ? 3 : scale.months.length > 9 ? 2 : 1;
    return `<div class="ov-tl ov-tl-head">${scale.months.map((m, i) => i % step ? "" :
      `<span class="ov-tick" style="left:${scale.pos(m)}%">${m.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}${m.getMonth() === 0 || i === 0 ? `<br>${m.getFullYear()}` : ""}</span>`).join("")}
      <span class="ov-today" style="left:${scale.pos(today())}%" title="Hoje"></span></div>`;
  }

  function timelineBar(scale, dates, color, pct, late) {
    if (!scale || !dates.start || !dates.end) return `<div class="ov-tl"></div>`;
    const l = scale.pos(dates.start.d), r = scale.pos(dates.end.d);
    const w = Math.max(r - l, 0.8);
    const estimated = !dates.start.exact || !dates.end.exact;
    return `<div class="ov-tl">
      <span class="ov-today" style="left:${scale.pos(today())}%"></span>
      <span class="ov-bar ${estimated ? "est" : ""} ${late ? "late" : ""}" style="left:${l}%; width:${w}%; --bc:${color}"
        title="${fmt(dates.start)} → ${fmt(dates.end)}${estimated ? " (estimado pela onda/prazo)" : ""}">
        <span class="ov-bar-fill" style="width:${pct || 0}%"></span>
      </span></div>`;
  }

  function actBar(scale, a, color) {
    if (!scale) return `<div class="ov-tl"></div>`;
    const p = period(a.prazo), s = period(a.inicio);
    if (!p) return `<div class="ov-tl"></div>`;
    const end = scale.pos(p.end);
    if (!s) return `<div class="ov-tl"><span class="ov-dot" style="left:${end}%; --bc:${color}" title="Prazo ${esc(a.prazo)}"></span></div>`;
    const l = scale.pos(s.start);
    return `<div class="ov-tl"><span class="ov-bar thin" style="left:${l}%; width:${Math.max(end - l, 0.6)}%; --bc:${color}" title="${esc(a.inicio)} → ${esc(a.prazo)}">
      <span class="ov-bar-fill" style="width:${a.pct}%"></span></span></div>`;
  }

  const SIT_CLASS = { Rascunho: "warn", Validado: "accent", "Aprovado para onda": "ok" };
  const STATUS_CLASS = { "Em andamento": "accent", "Concluído": "ok", "Cancelado": "alert" };

  /* ---------- Render ---------- */
  A.views.overview = function (S) {
    const el = document.getElementById("view-overview");
    if (!el) return;
    const all = S.state.data.initiatives;
    const visible = all.filter((i) => S.matchesFilters(i));
    const scale = timeScale(S, visible);
    const areas = S.areas().filter((a) => S.state.ui.area === "ALL" || a.key === S.state.ui.area);

    const rings = areas.map((a) => {
      const list = all.filter((i) => i.area === a.key);
      const doing = list.filter((i) => i.status === "Em andamento").length;
      const late = list.filter((i) => isLate(i, projectDates(i))).length;
      return `
        <button class="ov-ring" data-ov-jump="${esc(a.key)}" style="--ac:${a.cor}" title="Ir para ${esc(a.key)}">
          ${ring(avgProgress(S, list), a.cor)}
          <span class="ov-ring-name">${esc(a.key)}</span>
          <span class="ov-ring-meta">${list.length} projeto${list.length === 1 ? "" : "s"} · ${doing} em andamento</span>
          ${late ? `<span class="ov-ring-late">${late} atrasado${late === 1 ? "" : "s"}</span>` : `<span class="ov-ring-meta">&nbsp;</span>`}
        </button>`;
    }).join("");
    const overall = avgProgress(S, all);

    const groups = areas.map((a) => {
      const list = visible.filter((i) => i.area === a.key)
        // Ordem cronológica de início; projetos sem data vão para o fim do bloco.
        .sort((x, y) => (projectDates(x).start?.d?.getTime() ?? Infinity) - (projectDates(y).start?.d?.getTime() ?? Infinity) || S.calc.ve(y) - S.calc.ve(x));
      if (!list.length) return "";
      const isCollapsed = collapsed.has(a.key);
      const rows = isCollapsed ? "" : list.map((it) => {
        const dates = projectDates(it);
        const pct = S.calc.progress(it);
        const late = isLate(it, dates);
        const open = expanded.has(it.id);
        const acts = open ? it.atividades.map((at, n) => `
          <div class="ov-row ov-act ${at.status === "Cancelado" ? "muted" : ""}">
            <span></span>
            <span class="ov-id muted">${n + 1}</span>
            <span class="ov-name">${esc(at.nome)} <span class="muted small">${S.raciPeople(at.raci, "R")[0] ? `· R: ${esc(S.raciPeople(at.raci, "R")[0])}` : ""}</span></span>
            <span><span class="badge ${STATUS_CLASS[at.status] || ""}">${esc(at.status)}</span></span>
            <span class="ov-col-onda"></span>
            <span class="ov-date">${esc(at.inicio || "—")}</span>
            <span class="ov-date">${esc(at.prazo || "—")}</span>
            <span>${ui.progressBar(at.pct)}</span>
            ${actBar(scale, at, a.cor)}
          </div>`).join("") + (it.atividades.length ? "" : `<div class="ov-row ov-act"><span></span><span></span><span class="muted small">Sem atividades cadastradas.</span></div>`) : "";
        return `
          <div class="ov-row ov-proj ${late ? "is-late" : ""} ${it.status === "Cancelado" ? "muted" : ""}">
            <button class="ov-toggle" data-ov-toggle="${esc(it.id)}" aria-expanded="${open}" aria-label="${open ? "Recolher" : "Ver"} atividades de ${esc(it.id)}">${open ? "▾" : "▸"}</button>
            <a class="ov-id" href="${A.drill.projectHref(it.id)}" data-nav>${esc(it.id)}</a>
            <span class="ov-name"><a href="${A.drill.projectHref(it.id)}" data-nav>${esc(it.nome)}</a><span class="muted small"> · ${esc(it.responsavel || "A definir")} · ${it.atividades.length} ativ.</span></span>
            <span class="ov-badges">
              ${it.situacao === "Rascunho" ? `<span class="badge warn">Rascunho</span>` : `<span class="badge ${STATUS_CLASS[it.status] || ""}">${esc(it.status)}</span>`}
              ${late ? `<span class="badge alert">Atrasado</span>` : ""}
            </span>
            <span class="ov-col-onda muted small">${esc(it.onda)}</span>
            <span class="ov-date">${fmt(dates.start)}</span>
            <span class="ov-date ${late ? "late" : ""}">${fmt(dates.end)}</span>
            <span>${ui.progressBar(pct)}</span>
            ${timelineBar(scale, dates, a.cor, pct, late)}
          </div>${acts}`;
      }).join("");
      const avg = avgProgress(S, list);
      return `
        <section class="ov-group" id="ov-${esc(a.key)}" style="--ac:${a.cor}">
          <button class="ov-group-head" data-ov-collapse="${esc(a.key)}" aria-expanded="${!isCollapsed}">
            <span class="ov-chev">${isCollapsed ? "▸" : "▾"}</span>
            <span class="ov-group-title">${esc(a.key)}</span>
            <span class="ov-group-meta">${list.length} projeto${list.length === 1 ? "" : "s"} · conclusão média ${avg == null ? "—" : avg + "%"}</span>
          </button>
          ${rows}
        </section>`;
    }).join("");

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Visão geral do portfólio</h2>
          <div class="muted">Tudo junto, por área. Clique num anel para ir à área; na seta ▸ para ver as atividades. Datas com “~” são estimadas pela onda ou por prazos aproximados.</div>
        </div>
        <div class="row no-print">
          <button class="btn btn-xs btn-outline" data-ov-all="open">Abrir todas as atividades</button>
          <button class="btn btn-xs btn-outline" data-ov-all="close">Recolher</button>
        </div>
      </div>
      <div class="ov-rings">
        <div class="ov-ring ov-ring-total">
          ${ring(overall, "var(--accent)")}
          <span class="ov-ring-name">Portfólio</span>
          <span class="ov-ring-meta">${all.length} projetos · ${all.filter((i) => i.status === "Em andamento").length} em andamento</span>
          <span class="ov-ring-meta">${all.filter((i) => i.status === "Concluído").length} concluídos</span>
        </div>
        ${rings}
      </div>
      <div class="ov-table">
        <div class="ov-row ov-header">
          <span></span><span>ID</span><span>Projeto</span><span>Status</span><span class="ov-col-onda">Onda</span>
          <span>Início</span><span>Término</span><span>Conclusão</span>
          ${timelineHead(scale)}
        </div>
        ${groups || ui.empty("Nenhum projeto corresponde aos filtros.")}
      </div>`;
  };

  document.addEventListener("click", (e) => {
    const S = A.store;
    const t = e.target.closest("[data-ov-toggle], [data-ov-collapse], [data-ov-jump], [data-ov-all]");
    if (!t) return;
    if (t.dataset.ovToggle) {
      const id = t.dataset.ovToggle;
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    } else if (t.dataset.ovCollapse) {
      const k = t.dataset.ovCollapse;
      collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k);
    } else if (t.dataset.ovAll) {
      expanded.clear();
      if (t.dataset.ovAll === "open") S.state.data.initiatives.forEach((i) => expanded.add(i.id));
    } else if (t.dataset.ovJump) {
      collapsed.delete(t.dataset.ovJump);
      A.views.overview(S);
      const g = document.getElementById(`ov-${t.dataset.ovJump}`);
      if (g) { g.scrollIntoView({ behavior: "smooth", block: "start" }); g.classList.add("flash"); setTimeout(() => g.classList.remove("flash"), 1200); }
      return;
    }
    A.views.overview(S);
  });

  A.overview = { period, projectDates };
})();
