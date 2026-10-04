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

  function bolha(S, it, cx, cy, emFoco) {
    const { ve } = S.calc;
    const doing = it.status === "Em andamento";
    const cls = ["bubble", doing ? "doing" : "", !S.matchesFilters(it) || !emFoco(it) ? "faded" : ""].join(" ");
    return `
      <g class="${cls}" data-hl="${esc(it.id)}" data-action="edit-initiative" data-id="${esc(it.id)}" tabindex="0" role="button" aria-label="${esc(it.id + " " + it.nome)}">
        <title>${esc(`${it.id} — ${it.nome}\n${it.area}\nValor ${it.valor} · Esforço ${it.esforco} (${A.meta.tempoPorEsforco(it.esforco)}) · V÷E ${fmtNum(ve(it))}\n${it.status} · ${it.onda}`)}</title>
        <circle cx="${cx}" cy="${cy}" r="${R}" style="fill:${A.area(it.area).cor}"/>
        <text x="${cx}" y="${cy + 3}" text-anchor="middle">${esc(it.id)}</text>
      </g>`;
  }

  function matrixSvg(S, items, c, emFoco) {
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
      mostrar.forEach((it, k) => { const p = pos(k); parts.push(bolha(S, it, p.cx, p.cy, emFoco)); });
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

  // Aba escolhida: "ALL" (programa inteiro), o nome de um setor ou "SEMNOTA" (falta valor/esforço).
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pr-setor]");
    if (!b) return;
    A.store.state.ui.prioSetor = b.dataset.prSetor;
    A.store.emit();
  });
  // ⭐ Escolha estratégica: projeto abaixo da linha entra no ciclo por decisão da diretoria, com o motivo no histórico.
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pr-estrategico]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const S = A.store;
    const it = S.findInitiative(b.dataset.prEstrategico);
    const limite = A.meta.LIMITE_PROJETOS_SETOR;
    const doSetor = S.projetosNoCiclo(it.area);
    if (doSetor.some((x) => x.estrategico)) {
      const ok = await A.util.confirmDialog(`${it.area} já tem uma escolha estratégica neste ciclo (${doSetor.find((x) => x.estrategico).id}). O combinado é uma por setor. Fazer mais uma?`,
        { title: "Escolha estratégica", okLabel: "Fazer mesmo assim" });
      if (!ok) return;
    }
    if (doSetor.length >= limite) {
      const ok = await A.util.confirmDialog(`${it.area} já tem ${limite} projetos no ciclo, o limite combinado. Colocar ${it.id} mesmo assim?`,
        { title: "Limite do setor", okLabel: "Colocar mesmo assim" });
      if (!ok) return;
    }
    const motivo = await A.util.pedirTexto(`${it.id} · ${it.nome} está abaixo da linha de corte. Por que ele entra neste ciclo? O motivo fica registrado no histórico.`,
      { title: "⭐ Escolha estratégica", okLabel: "Colocar no ciclo", placeholder: "ex.: abre o mercado de 2027; destrava outros projetos" });
    if (motivo == null) return;
    const r = S.setEstrategico(it.id, motivo);
    if (!r.ok) A.util.toast(r.error, "error");
    else A.util.toast(`⭐ ${it.id} entrou no ciclo como escolha estratégica.`);
  }, true);
  // Marcar/desmarcar o projeto no ciclo, com o limite de projetos por setor.
  document.addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-pr-ciclo]");
    if (!cb) return;
    const S = A.store;
    const it = S.findInitiative(cb.dataset.prCiclo);
    const limite = A.meta.LIMITE_PROJETOS_SETOR;
    if (cb.checked && S.projetosNoCiclo(it.area).length >= limite) {
      const ok = await A.util.confirmDialog(`${it.area} já tem ${limite} projetos no ciclo, o limite combinado. Colocar ${it.id} mesmo assim?`,
        { title: "Limite do setor", okLabel: "Colocar mesmo assim" });
      if (!ok) { cb.checked = false; return; }
    }
    const r = S.setNoCiclo(it.id, cb.checked);
    if (!r.ok) { cb.checked = !cb.checked; A.util.toast(r.error, "error"); }
    else if (!r.unchanged) A.util.toast(cb.checked ? `${it.id} entrou no ${S.nomeCiclo(S.sprintAtual())}.` : `${it.id} saiu do ciclo.`);
  });

  A.views.priorizacao = function (S) {
    const el = document.getElementById("priorizacao-root");
    if (!el) return;
    const { ve, cutoff, isAboveCut } = S.calc;
    const sp = S.sprintAtual();
    const limite = A.meta.LIMITE_PROJETOS_SETOR;
    const all = S.state.data.initiatives.filter(ativo);
    const items = all.filter(pontuado);
    const semNota = all.filter((i) => !pontuado(i));
    let aba = S.state.ui.prioSetor || "ALL";
    if (aba !== "ALL" && aba !== "SEMNOTA" && !S.findArea(aba)) aba = "ALL";
    const setor = aba === "ALL" || aba === "SEMNOTA" ? null : S.findArea(aba);
    const doSetor = (it) => !setor || it.area === setor.key;
    // A linha de corte é sempre a do conjunto que está na tela (programa inteiro ou o setor).
    const base = items.filter(doSetor);
    const cut = cutoff(base);
    const ranked = [...base].sort((a, b) => ve(b) - ve(a) || b.valor - a.valor || a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
    const rows = ranked.filter((it) => S.matchesFilters(it));
    const above = ranked.filter((it) => isAboveCut(it, cut.value)).length;

    let cutDone = false;
    const linha = (it) => {
      const isAbove = isAboveCut(it, cut.value);
      let divider = "";
      if (!isAbove && !cutDone) { cutDone = true; divider = `<li class="pr-cut">Linha de corte · ${fmtNum(cut.value)}</li>`; }
      const noCiclo = sp && it.ciclo === sp.id;
      const podeCiclo = it.situacao === "Validado";
      const deps = S.dependenciasPendentes(it);
      const fila = S.tempoNaFila(it);
      return `${divider}
        <li class="pr-row ${isAbove ? "above" : ""} ${noCiclo ? "no-ciclo" : ""}" data-hl="${esc(it.id)}" data-action="edit-initiative" data-id="${esc(it.id)}" tabindex="0" role="button">
          <span class="pr-pos">${ranked.indexOf(it) + 1}</span>
          <span class="pr-id" style="--ac:${A.area(it.area).cor}">${esc(it.id)}</span>
          <span class="pr-name" title="${esc(`${it.nome} · ${it.area}${it.estrategico && noCiclo ? `\n⭐ Escolha estratégica: ${it.estrategicoMotivo}` : ""}`)}">
            ${it.estrategico && noCiclo ? `<span class="pr-estrela" title="Escolha estratégica: ${esc(it.estrategicoMotivo)}">⭐</span>` : ""}<span class="pr-name-txt">${esc(it.nome)}</span>
            ${deps.length ? `<span class="pr-dep" title="${esc(deps.map((d) => (d.tipo === "SS" ? `Só começa depois que ${d.proj.id} começar` : `Só começa depois que ${d.proj.id} terminar`)).join("\n"))}">⚠ ${esc(deps.map((d) => d.proj.id).join(", "))}</span>` : ""}
            ${fila != null && fila >= 1 ? `<span class="pr-fila ${fila >= 3 ? "decidir" : ""}" title="${fila >= 3 ? "Uma onda inteira na fila: decidir se sobe (⭐), divide em fases ou arquiva." : "Validado e esperando para entrar num ciclo"}">${fila >= 3 ? "⏳ decidir · " : "⏳ "}na fila há ${fila} ciclo${fila === 1 ? "" : "s"}</span>` : ""}
          </span>
          <span class="pr-ve" title="Valor ${it.valor} ÷ Esforço ${it.esforco}">${fmtNum(ve(it))}</span>
          <label class="pr-ciclo" title="${podeCiclo ? (noCiclo ? "No ciclo deste mês: clique para tirar" : "Colocar no ciclo deste mês") : "Valide o projeto na Triagem antes de colocá-lo no ciclo"}">
            <input type="checkbox" data-pr-ciclo="${esc(it.id)}" ${noCiclo ? "checked" : ""} ${podeCiclo && sp ? "" : "disabled"}><span>${noCiclo ? "No ciclo" : "Ciclo"}</span>
          </label>
          ${!noCiclo && !isAbove && podeCiclo && sp ? `<button class="pr-star" data-pr-estrategico="${esc(it.id)}" title="Escolha estratégica: colocar no ciclo mesmo abaixo da linha de corte">⭐</button>` : ""}
        </li>`;
    };

    const contadores = S.areas().map((a) => {
      const n = S.projetosNoCiclo(a.key).length;
      const cls = n > limite ? "bad" : n === limite ? "cheio" : n ? "tem" : "";
      return `<button class="pr-cont ${cls} ${aba === a.key ? "ativo" : ""}" data-pr-setor="${esc(a.key)}" style="--ac:${a.cor}" title="${esc(`${a.key}: ${n} de ${limite} projetos no ciclo`)}">
          <span class="pr-cont-nome">${esc(a.key)}</span>
          <span class="pr-cont-bar">${Array.from({ length: limite }, (_, k) => `<i class="${k < n ? "on" : ""}"></i>`).join("")}</span>
          <strong>${n}/${limite}</strong>
        </button>`;
    }).join("");

    const conteudoSemNota = `
      <section class="panel">
        <p class="muted" style="margin-top:0">Estes projetos ainda não têm valor e esforço, por isso ficam fora da matriz e do ranking. Dê as notas na Triagem.</p>
        <ul class="pr-semnota">${semNota.map((it) => `<li><span class="pr-id" style="--ac:${A.area(it.area).cor}">${esc(it.id)}</span> ${esc(it.nome)} <span class="muted small">· ${esc(it.area)}</span></li>`).join("")}</ul>
        <button class="btn btn-sm btn-primary" data-action="go-tab" data-tab="triagem">Dar notas na Triagem →</button>
      </section>`;

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Priorização</h2>
          <div class="muted">${setor
            ? `Projetos de <strong>${esc(setor.key)}</strong> (líder: ${esc(setor.lider || "a definir")}), comparados entre si. Marque na coluna “Ciclo” os que entram neste mês: até ${limite} por setor.`
            : "Todos os setores juntos. Marque na coluna “Ciclo” os projetos que entram neste mês: até " + limite + " por setor."}</div>
        </div>
        <div class="row">
          <span class="badge ok">${above} acima do corte</span>
          <span class="badge" title="Σ Valor ÷ Σ Esforço ${setor ? "dos projetos deste setor" : "de todos os projetos"}">Linha de corte ${fmtNum(cut.value)}</span>
        </div>
      </div>
      <div class="pr-contadores no-print">
        <div class="pr-contadores-tit">${sp ? `No ${esc(S.nomeCiclo(sp))}` : "Sem ciclo aberto"}</div>
        ${contadores}
      </div>
      <div class="seg pr-tabs no-print">
        <button class="seg-btn ${aba === "ALL" ? "active" : ""}" data-pr-setor="ALL">Programa inteiro <span class="muted">${items.length}</span></button>
        ${S.areas().map((a) => `<button class="seg-btn ${aba === a.key ? "active" : ""}" data-pr-setor="${esc(a.key)}" style="--ac:${a.cor}"><span class="pr-tab-cor"></span>${esc(a.key)} <span class="muted">${items.filter((i) => i.area === a.key).length}</span></button>`).join("")}
        ${semNota.length ? `<button class="seg-btn alerta ${aba === "SEMNOTA" ? "active" : ""}" data-pr-setor="SEMNOTA" title="Projetos sem valor ou esforço">⚠ Sem nota <span class="muted">${semNota.length}</span></button>` : ""}
      </div>
      ${aba === "SEMNOTA" ? conteudoSemNota : `
      <div class="pr-grid">
        <section class="panel pr-matrix">
          <svg class="matrix-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Matriz valor por esforço">${matrixSvg(S, items, cut.value, doSetor)}</svg>
          <div class="pr-legend">${S.areas().map((a) => ui.areaBadge(a.key)).join("")}<span class="muted small"><span class="legend-ring"></span> em andamento</span></div>
        </section>
        <section class="panel pr-rank">
          <div class="pr-rank-head"><span>#</span><span>ID</span><span>Projeto</span><span>V÷E</span><span>Ciclo</span></div>
          <ol class="pr-list">${rows.map(linha).join("") || `<li>${ui.empty("Nenhum projeto com nota neste setor.")}</li>`}</ol>
        </section>
      </div>`}`;
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
