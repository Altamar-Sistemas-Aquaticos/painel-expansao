/* Programa: porta de entrada visual. A Altamar no centro e os setores em órbita, ligados a ela.
   Passar o mouse (ou tocar) num setor mostra os projetos dele ao lado; clicar abre o Kanban do setor. */
(function () {
  const A = window.Altamar;
  const { esc } = A.util;
  const $ = (id) => document.getElementById(id);

  const aberto = (it) => it.status !== "Concluído" && it.status !== "Cancelado";
  let foco = null; // setor em destaque no painel lateral

  function resumoSetor(S, area) {
    const doSetor = S.state.data.initiatives.filter((it) => it.area === area.key);
    const andamento = doSetor.filter((it) => it.status === "Em andamento");
    const fila = doSetor.filter((it) => aberto(it) && it.status !== "Em andamento");
    const concluidos = doSetor.filter((it) => it.status === "Concluído").length;
    const pct = andamento.length ? Math.round(andamento.reduce((s, it) => s + (S.calc.progress(it) ?? 0), 0) / andamento.length) : 0;
    return { area, andamento, fila, concluidos, pct, total: doSetor.length };
  }

  const iniciais = (nome) => (nome ? A.util.initials(nome) : "?");

  function painelSetor(S, r) {
    const limite = A.meta.LIMITE_PROJETOS_SETOR;
    const linha = (it) => {
      const pct = S.calc.progress(it);
      return `
        <li>
          <button class="prog-proj" ${A.visao.veProjeto(it) ? `data-action="open-project" data-id="${esc(it.id)}" title="Abrir o projeto"` : "disabled"}>
            <span class="prog-proj-id" style="--ac:${r.area.cor}">${esc(it.id)}</span>
            <span class="prog-proj-nome">${esc(it.nome)}</span>
            ${A.ui.dot(it.semaforo)}
          </button>
          ${it.status === "Em andamento" ? `<div class="prog-proj-bar"><i style="width:${pct ?? 0}%;background:${r.area.cor}"></i><span>${pct ?? 0}%</span></div>` : ""}
        </li>`;
    };
    return `
      <div class="prog-det-head" style="--ac:${r.area.cor}">
        <span class="prog-det-cor"></span>
        <div>
          <h3>${esc(r.area.key)}</h3>
          <div class="muted small">Líder: <strong>${esc(r.area.lider || "a definir")}</strong></div>
        </div>
      </div>
      <div class="prog-det-nums">
        <div><strong>${r.andamento.length}<small>/${limite}</small></strong><span>em andamento</span></div>
        <div><strong>${r.fila.length}</strong><span>na fila</span></div>
        <div><strong>${r.concluidos}</strong><span>concluídos</span></div>
      </div>
      ${r.andamento.length ? `<h4>Em andamento</h4><ul class="prog-lista">${r.andamento.map(linha).join("")}</ul>` : ""}
      ${r.fila.length ? `<h4>Na fila</h4><ul class="prog-lista fila">${r.fila.slice(0, 8).map(linha).join("")}${r.fila.length > 8 ? `<li class="muted small">+ ${r.fila.length - 8} projeto(s)</li>` : ""}</ul>` : ""}
      ${!r.total ? `<p class="muted">Nenhum projeto cadastrado ainda neste setor.</p>` : ""}
      ${A.visao.atual().tipo !== "lider" || A.visao.atual().setores.includes(r.area.key)
        ? `<button class="btn btn-sm btn-primary prog-det-btn" data-prog-kanban="${esc(r.area.key)}">Abrir o Kanban do setor →</button>` : ""}`;
  }

  function painelGeral(S, resumos) {
    const andamento = resumos.reduce((s, r) => s + r.andamento.length, 0);
    const fila = resumos.reduce((s, r) => s + r.fila.length, 0);
    const sp = S.sprintAtual();
    return `
      <h3>Programa de Expansão</h3>
      <p class="muted">${resumos.length} setores trabalhando juntos para a expansão e a melhoria da Altamar.
      Passe o mouse ou toque num setor para ver os projetos dele.</p>
      <div class="prog-det-nums">
        <div><strong>${andamento}</strong><span>projetos em andamento</span></div>
        <div><strong>${fila}</strong><span>na fila</span></div>
        <div><strong>${sp ? esc(S.nomeCiclo(sp).replace("Ciclo de ", "")) : "—"}</strong><span>ciclo atual</span></div>
      </div>
      <ul class="prog-legenda">
        ${resumos.map((r) => `<li><button data-prog-setor="${esc(r.area.key)}"><span style="background:${r.area.cor}"></span>${esc(r.area.key)}<em>${r.andamento.length} em andamento</em></button></li>`).join("")}
      </ul>`;
  }

  A.views.programa = function (S) {
    const el = $("programa-root");
    if (!el) return;
    const resumos = S.areas().map((a) => resumoSetor(S, a));
    const n = resumos.length;
    const raio = 36.5;
    const pos = (i) => {
      const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
      return { x: 50 + raio * Math.cos(ang), y: 50 + raio * Math.sin(ang) };
    };
    const ativos = resumos.flatMap((r) => r.andamento);
    const pctGeral = ativos.length ? Math.round(ativos.reduce((s, it) => s + (S.calc.progress(it) ?? 0), 0) / ativos.length) : 0;
    const emFoco = resumos.find((r) => r.area.key === foco);

    el.innerHTML = `
      <div class="prog">
        <div class="prog-orbita" id="prog-orbita">
          <svg class="prog-linhas" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            ${resumos.map((r, i) => {
              const p = pos(i);
              return `<line x1="50" y1="50" x2="${p.x}" y2="${p.y}" style="stroke:${r.area.cor}" class="${r.total ? "" : "vazia"} ${foco === r.area.key ? "foco" : ""}"
                stroke-width="${0.35 + Math.min(r.andamento.length, 4) * 0.18}" />`;
            }).join("")}
          </svg>
          <div class="prog-centro" style="--p:${pctGeral}">
            <img src="assets/img/logo-altamar.png" alt="Altamar" onerror="this.replaceWith(Object.assign(document.createElement('strong'),{textContent:'ALTAMAR'}))">
            <span class="prog-centro-tit">Programa de Expansão</span>
            <span class="prog-centro-pct">${pctGeral}% <small>dos projetos em andamento</small></span>
          </div>
          ${resumos.map((r, i) => {
            const p = pos(i);
            return `
              <button class="prog-setor ${r.total ? "" : "vazio"} ${foco === r.area.key ? "foco" : ""}" data-prog-setor="${esc(r.area.key)}"
                style="left:${p.x}%;top:${p.y}%;--ac:${r.area.cor};--p:${r.pct};animation-delay:${(i * 0.37).toFixed(2)}s"
                aria-label="${esc(`${r.area.key}: ${r.andamento.length} projetos em andamento, líder ${r.area.lider || "a definir"}`)}">
                <span class="prog-setor-anel"><span class="prog-setor-miolo">
                  <span class="prog-setor-num">${r.andamento.length}</span>
                  <span class="prog-setor-sub">${r.andamento.length === 1 ? "projeto" : "projetos"}</span>
                </span></span>
                <span class="prog-setor-nome">${esc(r.area.key)}</span>
                <span class="prog-setor-lider"><span class="act-av">${esc(iniciais(r.area.lider))}</span>${esc(r.area.lider || "sem líder")}</span>
              </button>`;
          }).join("")}
        </div>
        <aside class="prog-detalhe panel" aria-live="polite">${emFoco ? painelSetor(S, emFoco) : painelGeral(S, resumos)}</aside>
      </div>
      <div class="prog-acoes no-print">
        <button class="btn btn-sm btn-outline" data-prog-tela-cheia>⛶ Tela cheia para apresentar</button>
        <button class="btn btn-sm btn-ghost ${foco ? "" : "hidden"}" data-prog-setor="">Ver o programa inteiro</button>
      </div>`;
  };

  // Troca só o destaque e o painel lateral (redesenhar a órbita reiniciaria as animações).
  function focar(chave) {
    chave = chave || null;
    if (foco === chave) return;
    foco = chave;
    const S = A.store;
    const root = $("programa-root");
    root.querySelectorAll(".prog-setor").forEach((b) => b.classList.toggle("foco", b.dataset.progSetor === foco));
    root.querySelectorAll(".prog-linhas line").forEach((l, i) => l.classList.toggle("foco", S.areas()[i]?.key === foco));
    const area = S.areas().find((a) => a.key === foco);
    const aside = root.querySelector(".prog-detalhe");
    if (aside) aside.innerHTML = area ? painelSetor(S, resumoSetor(S, area)) : painelGeral(S, S.areas().map((a) => resumoSetor(S, a)));
    const voltar = root.querySelector(".prog-acoes [data-prog-setor]");
    if (voltar) voltar.classList.toggle("hidden", !foco);
  }

  function init() {
    const root = $("programa-root");
    if (!root) return;
    // Passar o mouse destaca; tocar/clicar fixa (no celular não existe "passar o mouse").
    root.addEventListener("mouseover", (e) => {
      const b = e.target.closest("[data-prog-setor]");
      if (b && b.classList.contains("prog-setor")) focar(b.dataset.progSetor);
    });
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-prog-setor]");
      if (b) { focar(b.dataset.progSetor); return; }
      const k = e.target.closest("[data-prog-kanban]");
      if (k) {
        A.store.state.ui.area = k.dataset.progKanban;
        A.store.emit();
        location.hash = "kanban";
        return;
      }
      if (e.target.closest("[data-prog-tela-cheia]")) {
        const alvo = root.querySelector(".prog");
        if (document.fullscreenElement) document.exitFullscreen();
        else alvo?.requestFullscreen?.();
      }
    });
    root.addEventListener("focusin", (e) => {
      const b = e.target.closest(".prog-setor");
      if (b) focar(b.dataset.progSetor);
    });
  }

  A.programa = { init };
})();
