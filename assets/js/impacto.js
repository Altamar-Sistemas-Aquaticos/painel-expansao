/* Círculos de impacto: a nota de VALOR vista como "até onde o projeto chega".
   Do centro para fora: pontual (1) → um setor (2 e 3) → clientes e receita (5) → estratégico (8).
   Clicar num círculo escolhe a nota. */
(function () {
  const A = window.Altamar;
  const { esc, openModal, closeModal } = A.util;
  const $ = (id) => document.getElementById(id);

  // Raios dos círculos (todos encostados embaixo, como no desenho em papel).
  const CIRCULOS = [
    { v: 8, r: 170 }, { v: 5, r: 130 }, { v: 3, r: 92 }, { v: 2, r: 58 }, { v: 1, r: 28 },
  ];
  const BASE = 348;

  function svg(selecionado, { interativo = false } = {}) {
    const esc8 = A.meta.VALOR_ESCALA;
    return `
      <svg class="impacto ${interativo ? "interativo" : ""}" viewBox="0 0 360 360" role="${interativo ? "group" : "img"}" aria-label="Círculos de impacto: valor de 1 a 8">
        ${CIRCULOS.map(({ v, r }, i) => {
          const cy = BASE - r;
          const prox = CIRCULOS[i + 1];
          // Rótulo no meio da faixa entre este círculo e o de dentro.
          const yRot = prox ? (cy - r + (BASE - 2 * prox.r)) / 2 + 6 : cy + 4;
          return `
            <g class="impacto-anel ${String(selecionado) === String(v) ? "sel" : ""}" data-impacto="${v}" ${interativo ? `tabindex="0" role="button" aria-label="${v}: ${esc(esc8[v].curto)}"` : ""}>
              <circle cx="180" cy="${cy}" r="${r}" style="--n:${i}"></circle>
              <text x="180" y="${yRot}" text-anchor="middle"><tspan class="impacto-num">${v}</tspan> ${esc(esc8[v].curto)}</text>
            </g>`;
        }).join("")}
      </svg>`;
  }

  // Abre a janela com os círculos; resolve com a nota escolhida (ou null se fechar).
  function escolher(atual, titulo = "Qual o alcance do projeto?") {
    return new Promise((resolve) => {
      const corpo = $("impacto-body");
      const desenhar = (sel) => {
        corpo.innerHTML = `
          <div class="modal-head"><h3>${esc(titulo)}</h3>
            <button class="btn btn-xs btn-ghost" data-impacto-fechar aria-label="Fechar">✕</button></div>
          <p class="muted small" style="margin-top:0">Clique no círculo que mostra até onde o projeto chega. Quanto mais para fora, maior o valor.</p>
          <div class="impacto-wrap">
            ${svg(sel, { interativo: true })}
            <ul class="impacto-legenda">
              ${[1, 2, 3, 5, 8].map((v) => `<li class="${String(sel) === String(v) ? "sel" : ""}" data-impacto="${v}"><strong>${v}</strong>
                <span><b>${esc(A.meta.VALOR_ESCALA[v].curto)}</b><br><span class="muted small">${esc(A.meta.VALOR_ESCALA[v].texto)}</span></span></li>`).join("")}
            </ul>
          </div>`;
      };
      desenhar(atual);
      const modal = $("modal-impacto");
      const fim = (v) => {
        corpo.removeEventListener("click", onClick);
        corpo.removeEventListener("keydown", onKey);
        modal.removeEventListener("modal:dismiss", onDismiss);
        closeModal("modal-impacto");
        resolve(v);
      };
      const onClick = (e) => {
        if (e.target.closest("[data-impacto-fechar]")) return fim(null);
        const alvo = e.target.closest("[data-impacto]");
        if (alvo) fim(Number(alvo.dataset.impacto));
      };
      const onKey = (e) => {
        const alvo = e.target.closest?.("[data-impacto]");
        if (alvo && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fim(Number(alvo.dataset.impacto)); }
      };
      const onDismiss = () => fim(null);
      corpo.addEventListener("click", onClick);
      corpo.addEventListener("keydown", onKey);
      modal.addEventListener("modal:dismiss", onDismiss);
      openModal("modal-impacto");
    });
  }

  A.impacto = { svg, escolher };
})();
