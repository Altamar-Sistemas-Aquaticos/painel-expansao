/* Priorização: matriz Valor × Esforço compacta e ranking V÷E lado a lado, com destaque sincronizado. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum } = A.util;
  const ui = A.ui;

  const W = 560, H = 440;
  const PAD = { left: 40, right: 12, top: 30, bottom: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const EMAX = A.meta.ESFORCO_PONTOS.length; // esforço 1 a 5 (meses); valor segue 1, 2, 3, 5, 8
  const x = (e) => PAD.left + ((e - 0.5) / EMAX) * plotW;
  const y = (v) => H - PAD.bottom - ((v - 0.5) / 8) * plotH;
  const R = 10, PITCH = 23; // raio e espaçamento das bolhas

  const ativo = (it) => it.status !== "Cancelado" && it.status !== "Concluído";
  const pontuado = (it) => it.valor > 0 && it.esforco > 0;

  // Espaço livre ao redor de um ponto da grade (até a metade da distância para o vizinho mais próximo).
  function celula(e, v) {
    const vs = A.meta.FIBONACCI, i = vs.indexOf(v);
    // Nas pontas (valor 8 e 1) usa todo o espaço até a borda; no meio, metade até o vizinho.
    const up = i < vs.length - 1 ? (y(v) - y(vs[i + 1])) / 2 : y(v) - y(8.5);
    const down = i > 0 ? (y(vs[i - 1]) - y(v)) / 2 : y(0.5) - y(v);
    const largura = plotW / EMAX;
    return {
      up, down,
      cols: Math.max(1, Math.floor((largura - 6) / PITCH)),
      rows: Math.max(1, Math.floor((up + down - 4) / PITCH)),
    };
  }

  function bolha(S, it, cx, cy) {
    const { ve } = S.calc;
    const doing = it.status === "Em andamento";
    const cls = ["bubble", doing ? "doing" : "", !S.matchesFilters(it) ? "faded" : ""].join(" ");
    return `
      <g class="${cls}" data-hl="${esc(it.id)}" data-action="edit-initiative" data-id="${esc(it.id)}" tabindex="0" role="button" aria-label="${esc(it.id + " " + it.nome)}">
        <title>${esc(`${it.id} — ${it.nome}\nValor ${it.valor} · Esforço ${it.esforco} (${A.meta.tempoPorEsforco(it.esforco)}) · V÷E ${fmtNum(ve(it))}\n${it.status} · ${it.onda}`)}</title>
        <circle cx="${cx}" cy="${cy}" r="${R}" style="fill:${A.area(it.area).cor}"/>
        <text x="${cx}" y="${cy + 3}" text-anchor="middle">${esc(it.id)}</text>
      </g>`;
  }

  function matrixSvg(S, items) {
    const c = S.calc.cutoff().value;
    const parts = [];

    // Ganhos rápidos: esforço até 2 meses, valor a partir de 5. O rótulo fica acima da área, fora das bolhas.
    parts.push(`<rect class="qw-rect" x="${x(0.5)}" y="${y(8.5)}" width="${x(2.5) - x(0.5)}" height="${y(4) - y(8.5)}" rx="6"/>`);
    parts.push(`<text class="qw-text" x="${x(0.5) + 4}" y="${PAD.top - 10}">★ GANHOS RÁPIDOS · alto valor em até 2 meses</text>`);

    A.meta.FIBONACCI.forEach((v) => {
      parts.push(`<line class="grid-line" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>`);
      parts.push(`<text class="axis-label" x="${PAD.left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
    });
    A.meta.ESFORCO_PONTOS.forEach((e) => {
      parts.push(`<line class="grid-line" x1="${x(e)}" x2="${x(e)}" y1="${PAD.top}" y2="${H - PAD.bottom}"/>`);
      parts.push(`<text class="axis-label" x="${x(e)}" y="${H - PAD.bottom + 16}" text-anchor="middle">${e} · ${A.meta.tempoPorEsforco(e)}</text>`);
    });

    if (c > 0) {
      const e1 = Math.max(0.5, 0.5 / c), e2 = Math.min(EMAX + 0.5, 8.5 / c);
      if (e2 > e1) parts.push(`<line class="cutoff" x1="${x(e1)}" y1="${y(c * e1)}" x2="${x(e2)}" y2="${y(c * e2)}"><title>Linha de corte V÷E = ${fmtNum(c)}</title></line>`);
    }
    parts.push(`<text class="axis-title" x="${PAD.left + plotW / 2}" y="${H - 6}" text-anchor="middle">ESFORÇO (tempo) →</text>`);
    parts.push(`<text class="axis-title" x="${-(PAD.top + plotH / 2)}" y="12" transform="rotate(-90)" text-anchor="middle">VALOR →</text>`);

    // Projetos no mesmo ponto ficam lado a lado numa pequena grade; o que não cabe vira uma bolha "+N".
    const groups = {};
    items.forEach((it) => { (groups[`${it.esforco}-${it.valor}`] ||= []).push(it); });
    Object.values(groups).forEach((list) => {
      list.sort((a, b) => (b.status === "Em andamento") - (a.status === "Em andamento") || a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
      const { cols, rows, up, down } = celula(list[0].esforco, list[0].valor);
      const cap = cols * rows;
      const mostrar = list.length > cap ? list.slice(0, cap - 1) : list;
      const resto = list.slice(mostrar.length);
      const n = mostrar.length + (resto.length ? 1 : 0);
      const usadasCols = Math.min(cols, n), usadasRows = Math.ceil(n / cols);
      const cy0 = Math.min(Math.max(y(list[0].valor) - ((usadasRows - 1) / 2) * PITCH, y(list[0].valor) - up + R),
        y(list[0].valor) + down - R - (usadasRows - 1) * PITCH);
      const pos = (k) => ({
        cx: x(list[0].esforco) + ((k % cols) - (usadasCols - 1) / 2) * PITCH,
        cy: cy0 + Math.floor(k / cols) * PITCH,
      });
      mostrar.forEach((it, k) => { const p = pos(k); parts.push(bolha(S, it, p.cx, p.cy)); });
      if (resto.length) {
        const p = pos(mostrar.length);
        parts.push(`
          <g class="bubble more" tabindex="0">
            <title>${esc(`Mais ${resto.length} projeto(s) neste ponto:\n` + resto.map((it) => `${it.id} — ${it.nome}`).join("\n"))}</title>
            <circle cx="${p.cx}" cy="${p.cy}" r="${R}"/>
            <text x="${p.cx}" y="${p.cy + 3}" text-anchor="middle">+${resto.length}</text>
          </g>`);
      }
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

    const sp = S.sprintAtual();
    const naSprint = new Set(S.sprintItems().map(({ it }) => it.id));
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
          <span class="pr-onda">${esc(it.onda)}${naSprint.has(it.id) ? `<span class="sprint-tag" title="Tem atividades na sprint atual">${esc(sp.id.replace("S", "Sprint "))}</span>` : ""}</span>
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
