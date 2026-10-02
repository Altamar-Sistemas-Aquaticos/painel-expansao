/* Matriz Valor × Esforço em SVG, com linha de corte dinâmica. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum } = A.util;

  const W = 860, H = 500;
  const PAD = { left: 62, right: 44, top: 44, bottom: 54 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (e) => PAD.left + ((e - 1) / 7) * plotW;
  const y = (v) => H - PAD.bottom - ((v - 1) / 7) * plotH;

  A.views.matrix = function (S) {
    const svg = document.getElementById("matrix-svg");
    const all = S.state.data.initiatives;
    const { ve, cutoff } = S.calc;
    const cut = cutoff();
    const c = cut.value;
    const filtering = S.hasActiveFilters();

    document.getElementById("matrix-cutoff-text").innerHTML =
      `Linha de corte = <strong>Σ Valor (${cut.sumValor}) ÷ Σ Esforço (${cut.sumEsforco}) = ${fmtNum(c)}</strong>. ` +
      `Iniciativas acima da linha inclinada têm retorno proporcional superior ao esforço.`;

    const parts = [];

    // Quadrante de ganhos rápidos (esforço ≤ 3,5 e valor ≥ 4,5)
    parts.push(`<rect class="qw-rect" x="${x(1)}" y="${y(8)}" width="${x(3.5) - x(1)}" height="${y(4.5) - y(8)}" rx="6"/>`);
    parts.push(`<text class="qw-text" x="${x(1) + 10}" y="${y(8) + 18}">★ GANHOS RÁPIDOS</text>`);
    parts.push(`<text class="qw-text" x="${x(1) + 10}" y="${y(8) + 32}" style="font-weight:500">alto valor · baixo esforço</text>`);

    A.meta.FIBONACCI.forEach((v) => {
      parts.push(`<line class="grid-line" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>`);
      parts.push(`<text class="axis-label" x="${PAD.left - 10}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
      parts.push(`<line class="grid-line" x1="${x(v)}" x2="${x(v)}" y1="${PAD.top}" y2="${H - PAD.bottom}"/>`);
      parts.push(`<text class="axis-label" x="${x(v)}" y="${H - PAD.bottom + 20}" text-anchor="middle">${v}</text>`);
    });

    // Linha de corte V = c·E, recortada à área do gráfico (1..8 nos dois eixos).
    if (c > 0) {
      const e1 = Math.max(1, 1 / c);
      const e2 = Math.min(8, 8 / c);
      if (e2 > e1) {
        parts.push(`<line class="cutoff" x1="${x(e1)}" y1="${y(c * e1)}" x2="${x(e2)}" y2="${y(c * e2)}"/>`);
        parts.push(`<text class="cutoff-text" x="${x(e2) - 6}" y="${y(c * e2) - 9}" text-anchor="end">Linha de corte (V÷E = ${fmtNum(c)})</text>`);
      }
    }

    parts.push(`<text class="axis-title" x="${PAD.left + plotW / 2}" y="${H - 12}" text-anchor="middle">ESFORÇO ESTIMADO → (Fibonacci 1 a 8)</text>`);
    parts.push(`<text class="axis-title" x="${-(PAD.top + plotH / 2)}" y="18" transform="rotate(-90)" text-anchor="middle">VALOR ESTRATÉGICO → (Fibonacci 1 a 8)</text>`);

    // Bolhas: pontos coincidentes são distribuídos em círculo para não se esconderem.
    const groups = {};
    all.forEach((it) => { (groups[`${it.esforco}-${it.valor}`] ||= []).push(it); });
    Object.values(groups).forEach((items) => {
      const n = items.length;
      items.forEach((it, i) => {
        let dx = 0, dy = 0;
        if (n > 1) {
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
          const radius = Math.min(26, 9 + n * 3.2);
          dx = Math.cos(angle) * radius;
          dy = Math.sin(angle) * radius;
        }
        const cx = x(it.esforco) + dx;
        const cy = y(it.valor) + dy;
        const doing = it.status === "Em andamento";
        const cls = ["bubble", doing ? "doing" : "", it.status === "Cancelado" ? "cancelled" : "", filtering && !S.matchesFilters(it) ? "faded" : ""].join(" ");
        const tip = `${it.id} — ${it.nome}\nÁrea: ${it.area}\nValor ${it.valor} · Esforço ${it.esforco} · V÷E ${fmtNum(ve(it))}\n${it.status} · ${it.onda}`;
        parts.push(`
          <g class="${cls}" data-action="edit-initiative" data-id="${esc(it.id)}" tabindex="0" role="button" aria-label="${esc(it.id + " " + it.nome)}">
            <title>${esc(tip)}</title>
            <circle cx="${cx}" cy="${cy}" r="${doing ? 17 : 14}" style="fill:${A.area(it.area).color}"/>
            <text x="${cx}" y="${cy + 3.5}" text-anchor="middle">${esc(it.id)}</text>
          </g>`);
      });
    });

    svg.innerHTML = parts.join("");
  };
})();
