/* Priorização: matriz Valor × Esforço compacta e ranking V÷E lado a lado, com destaque sincronizado. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum } = A.util;
  const ui = A.ui;

  const W = 520, H = 400;
  const PAD = { left: 40, right: 16, top: 16, bottom: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (e) => PAD.left + ((e - 0.5) / 8) * plotW;
  const y = (v) => H - PAD.bottom - ((v - 0.5) / 8) * plotH;

  const ativo = (it) => it.status !== "Cancelado" && it.status !== "Concluído";
  const pontuado = (it) => it.valor > 0 && it.esforco > 0;

  function matrixSvg(S, items) {
    const { ve, cutoff } = S.calc;
    const c = cutoff().value;
    const parts = [];

    // Ganhos rápidos: esforço até 3, valor a partir de 5.
    parts.push(`<rect class="qw-rect" x="${x(0.5)}" y="${y(8.5)}" width="${x(4) - x(0.5)}" height="${y(4) - y(8.5)}" rx="6"/>`);
    parts.push(`<text class="qw-text" x="${x(0.5) + 8}" y="${y(8.5) + 15}">★ GANHOS RÁPIDOS</text>`);

    A.meta.FIBONACCI.forEach((v) => {
      parts.push(`<line class="grid-line" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>`);
      parts.push(`<text class="axis-label" x="${PAD.left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
      parts.push(`<line class="grid-line" x1="${x(v)}" x2="${x(v)}" y1="${PAD.top}" y2="${H - PAD.bottom}"/>`);
      parts.push(`<text class="axis-label" x="${x(v)}" y="${H - PAD.bottom + 16}" text-anchor="middle">${v}</text>`);
    });

    if (c > 0) {
      const e1 = Math.max(0.5, 0.5 / c), e2 = Math.min(8.5, 8.5 / c);
      if (e2 > e1) parts.push(`<line class="cutoff" x1="${x(e1)}" y1="${y(c * e1)}" x2="${x(e2)}" y2="${y(c * e2)}"><title>Linha de corte V÷E = ${fmtNum(c)}</title></line>`);
    }
    parts.push(`<text class="axis-title" x="${PAD.left + plotW / 2}" y="${H - 6}" text-anchor="middle">ESFORÇO →</text>`);
    parts.push(`<text class="axis-title" x="${-(PAD.top + plotH / 2)}" y="12" transform="rotate(-90)" text-anchor="middle">VALOR →</text>`);

    // Pontos coincidentes são distribuídos em círculo para não se esconderem.
    const groups = {};
    items.forEach((it) => { (groups[`${it.esforco}-${it.valor}`] ||= []).push(it); });
    Object.values(groups).forEach((list) => {
      const n = list.length;
      list.forEach((it, i) => {
        let dx = 0, dy = 0;
        if (n > 1) {
          const ang = (i / n) * 2 * Math.PI - Math.PI / 2, r = Math.min(22, 8 + n * 2.6);
          dx = Math.cos(ang) * r; dy = Math.sin(ang) * r;
        }
        const cx = x(it.esforco) + dx, cy = y(it.valor) + dy;
        const doing = it.status === "Em andamento";
        const cls = ["bubble", doing ? "doing" : "", !S.matchesFilters(it) ? "faded" : ""].join(" ");
        parts.push(`
          <g class="${cls}" data-hl="${esc(it.id)}" data-action="edit-initiative" data-id="${esc(it.id)}" tabindex="0" role="button" aria-label="${esc(it.id + " " + it.nome)}">
            <title>${esc(`${it.id} — ${it.nome}\nValor ${it.valor} · Esforço ${it.esforco} · V÷E ${fmtNum(ve(it))}\n${it.status} · ${it.onda}`)}</title>
            <circle cx="${cx}" cy="${cy}" r="${doing ? 13 : 11}" style="fill:${A.area(it.area).cor}"/>
            <text x="${cx}" y="${cy + 3}" text-anchor="middle">${esc(it.id)}</text>
          </g>`);
      });
    });
    return parts.join("");
  }

  A.views.priorizacao = function (S) {
    const el = document.getElementById("priorizacao-root");
    if (!el) return;
    const { ve, cutoff, isAboveCut } = S.calc;
    const cut = cutoff();
    const all = S.state.data.initiatives.filter(ativo);
    const items = all.filter(pontuado);
    const pend = all.filter((i) => !pontuado(i)).length;
    const ranked = [...items].sort((a, b) => ve(b) - ve(a) || b.valor - a.valor || a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
    const rows = ranked.filter((it) => S.matchesFilters(it));
    const above = ranked.filter((it) => isAboveCut(it, cut.value)).length;

    let dividerDone = false;
    const list = rows.map((it) => {
      const isAbove = isAboveCut(it, cut.value);
      let divider = "";
      if (!isAbove && !dividerDone) {
        dividerDone = true;
        divider = `<li class="pr-cut">Linha de corte · ${fmtNum(cut.value)}</li>`;
      }
      return `${divider}
        <li class="pr-row ${isAbove ? "above" : ""}" data-hl="${esc(it.id)}" data-action="edit-initiative" data-id="${esc(it.id)}" tabindex="0" role="button">
          <span class="pr-pos">${ranked.indexOf(it) + 1}</span>
          <span class="pr-id" style="--ac:${A.area(it.area).cor}">${esc(it.id)}</span>
          <span class="pr-name">${esc(it.nome)}</span>
          <span class="pr-ve" title="Valor ${it.valor} ÷ Esforço ${it.esforco}">${fmtNum(ve(it))}</span>
          <span class="pr-onda">${esc(it.onda)}</span>
        </li>`;
    }).join("");

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Priorização</h2>
          <div class="muted">Quanto mais para cima e para a esquerda, melhor. Passe o mouse num projeto para ver onde ele está nos dois lados.</div>
        </div>
        <div class="row">
          <span class="badge ok">${above} acima do corte</span>
          <span class="badge">Linha de corte ${fmtNum(cut.value)}</span>
          ${pend ? `<button class="btn btn-xs btn-outline" data-action="go-tab" data-tab="triagem">${pend} sem nota → Triagem</button>` : ""}
        </div>
      </div>
      <div class="pr-grid">
        <section class="panel pr-matrix">
          <svg class="matrix-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Matriz valor por esforço">${matrixSvg(S, items)}</svg>
          <div class="pr-legend">${S.areas().map((a) => ui.areaBadge(a.key)).join("")}<span class="muted small"><span class="legend-ring"></span> em andamento</span></div>
        </section>
        <section class="panel pr-rank">
          <div class="pr-rank-head"><span>#</span><span>ID</span><span>Projeto</span><span>V÷E</span><span>Onda</span></div>
          <ol class="pr-list">${list || `<li>${ui.empty("Nenhum projeto com nota corresponde aos filtros.")}</li>`}</ol>
        </section>
      </div>`;
  };

  // Destaque sincronizado entre matriz e ranking.
  function highlight(id) {
    const root = document.getElementById("priorizacao-root");
    if (!root) return;
    root.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl"));
    root.classList.toggle("hl-on", !!id);
    if (!id) return;
    root.querySelectorAll(`[data-hl="${CSS.escape(id)}"]`).forEach((n) => n.classList.add("hl"));
  }
  document.addEventListener("mouseover", (e) => {
    const n = e.target.closest?.("#priorizacao-root [data-hl]");
    highlight(n ? n.dataset.hl : null);
  });
  document.addEventListener("focusin", (e) => {
    const n = e.target.closest?.("#priorizacao-root [data-hl]");
    if (n) highlight(n.dataset.hl);
  });
})();
