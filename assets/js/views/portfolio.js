/* Portfólio (raio-x): projetos em colunas por área, com situação do cadastro e avisos de consistência. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum } = A.util;
  const ui = A.ui;

  const SIT_CLASS = { Rascunho: "warn", Validado: "accent", "Aprovado para onda": "ok" };
  const NEXT_LABEL = { Rascunho: "Validar ✓", Validado: "Aprovar para onda ✓" };

  function card(S, it) {
    const { ve, isAboveCut, progress } = S.calc;
    const w = S.warnings(it);
    const pct = progress(it);
    const above = isAboveCut(it);
    const inactive = it.status === "Concluído" || it.status === "Cancelado";
    return `
      <article class="pf-card ${it.situacao === "Rascunho" ? "draft" : ""} ${inactive ? "inactive" : ""}">
        <div class="pf-top">
          <strong class="pf-id">${esc(it.id)}</strong>
          <span class="badge ${SIT_CLASS[it.situacao] || ""}">${esc(it.situacao)}</span>
          ${inactive ? `<span class="badge">${esc(it.status)}</span>` : ""}
          ${w.length ? `<span class="badge alert" title="${esc(w.join("\n"))}">⚠ ${w.length}</span>` : ""}
        </div>
        <a class="pf-title" href="${A.drill.projectHref(it.id)}" data-nav>${esc(it.nome)}</a>
        <div class="pf-meta">
          <span>${esc(it.onda)}</span>
          <span title="Valor ${it.valor} ÷ Esforço ${it.esforco}">V÷E <strong style="color:${above ? "var(--ok)" : "var(--text-muted)"}">${fmtNum(ve(it))}</strong> ${above ? "▲" : "▼"}</span>
          <span>👤 ${esc(it.responsavel || "A definir")}</span>
        </div>
        <div class="pf-meta">
          <span>${it.atividades.length} atividade${it.atividades.length === 1 ? "" : "s"}</span>
          ${it.prazo ? `<span>📅 ${esc(it.prazo)}</span>` : ""}
        </div>
        ${it.atividades.length ? `<div class="pf-progress">${ui.progressBar(pct)}</div>` : ""}
        ${w.length ? `<ul class="pf-warn">${w.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join("")}${w.length > 3 ? `<li>+ ${w.length - 3} aviso(s)</li>` : ""}</ul>` : ""}
        <div class="pf-actions no-print">
          <a class="btn btn-xs btn-outline" href="${A.drill.projectHref(it.id)}" data-nav>Abrir</a>
          <button class="btn btn-xs btn-ghost" data-action="edit-initiative" data-id="${esc(it.id)}">Editar</button>
          ${NEXT_LABEL[it.situacao] ? `<button class="btn btn-xs btn-primary" data-action="advance-situacao" data-id="${esc(it.id)}">${NEXT_LABEL[it.situacao]}</button>` : ""}
          ${S.canDelete(it) ? `<button class="btn btn-xs btn-danger-ghost" data-action="delete-initiative" data-id="${esc(it.id)}" title="Excluir rascunho">✕</button>` : ""}
        </div>
      </article>`;
  }

  A.views.portfolio = function (S) {
    const all = S.state.data.initiatives;
    const f = S.state.ui.portfolioSituacao;
    const counts = { ALL: all.length };
    S.SITUACOES.forEach((s) => { counts[s] = all.filter((i) => i.situacao === s).length; });

    const tabCount = document.getElementById("tab-count-rascunho");
    tabCount.textContent = counts.Rascunho;
    tabCount.className = `tab-count ${counts.Rascunho ? "warn-count" : ""}`;
    tabCount.title = `${counts.Rascunho} projeto(s) em Rascunho`;

    document.getElementById("portfolio-filters").innerHTML =
      [["ALL", "Todos"], ...S.SITUACOES.map((s) => [s, s])].map(([k, label]) =>
        `<button class="btn btn-xs btn-outline ${f === k ? "active" : ""}" data-pf-filter="${esc(k)}">${esc(label)} <span class="muted">${counts[k]}</span></button>`).join("") +
      `<button class="btn btn-sm btn-primary" data-action="new-initiative">+ Novo projeto</button>`;

    const sitOrder = Object.fromEntries(S.SITUACOES.map((s, i) => [s, i]));
    const cols = S.areas().filter((a) => S.state.ui.area === "ALL" || a.key === S.state.ui.area);
    document.getElementById("portfolio").innerHTML = cols.map((area) => {
      const items = all
        .filter((i) => i.area === area.key && (f === "ALL" || i.situacao === f) && S.matchesFilters(i))
        .sort((a, b) => sitOrder[a.situacao] - sitOrder[b.situacao] || S.calc.ve(b) - S.calc.ve(a));
      const inArea = all.filter((i) => i.area === area.key);
      const drafts = inArea.filter((i) => i.situacao === "Rascunho").length;
      return `
        <section class="pf-col" style="--ac:${area.cor}">
          <header class="pf-col-head">
            <div>
              <div class="pf-col-title">${esc(area.key)} <span class="muted small">(${esc(area.code)})</span></div>
              <div class="muted small">${inArea.length} projeto(s)${drafts ? ` · ${drafts} em rascunho` : ""}</div>
            </div>
            <button class="btn btn-xs btn-outline no-print" data-action="new-initiative" data-target="${esc(area.key)}" title="Novo projeto em ${esc(area.key)}">+</button>
          </header>
          <div class="pf-list">
            ${items.length ? items.map((it) => card(S, it)).join("") : `<div class="muted small" style="text-align:center; padding:1rem 0">Nenhum projeto ${f === "ALL" ? "" : `em “${esc(f)}”`}</div>`}
          </div>
        </section>`;
    }).join("") || ui.empty("Nenhuma área cadastrada. Crie uma em Cadastros.");
  };

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pf-filter]");
    if (!b) return;
    A.store.state.ui.portfolioSituacao = b.dataset.pfFilter;
    A.store.emit();
  });
})();
