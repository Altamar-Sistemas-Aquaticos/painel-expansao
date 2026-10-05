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
    const cls = ["bubble", doing ? "doing" : "", !emFoco(it) ? "faded" : ""].join(" ");
    return `
      <g class="${cls}" data-hl="${esc(it.id)}" data-action="edit-initiative" data-id="${esc(it.id)}" tabindex="0" role="button" aria-label="${esc(it.id + " " + it.nome)}">
        <title>${esc(`${it.id} — ${it.nome}\n${it.area}\nValor ${it.valor} · Esforço ${it.esforco} (${A.meta.tempoPorEsforco(it.esforco)}) · V÷E ${fmtNum(ve(it))}\n${it.status}`)}</title>
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
  // Qual ciclo está sendo decidido: o atual (em andamento) ou o próximo (em planejamento).
  const planejandoProximo = (S) => S.state.ui.prioPlano === "proximo";
  const cicloEmFoco = (S) => (planejandoProximo(S) ? S.proximoCicloInfo() : S.sprintAtual());
  const estaNoCiclo = (S, it) => (planejandoProximo(S) ? S.noProximoCiclo(it) : !!S.sprintAtual() && it.ciclo === S.sprintAtual().id);
  const escolhidosDo = (S, setor) => (planejandoProximo(S) ? S.projetosNoProximo(setor) : S.projetosNoCiclo(setor));

  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-pr-plano]");
    if (p) { A.store.state.ui.prioPlano = p.dataset.prPlano; A.store.emit(); return; }
    if (e.target.closest("[data-pr-matriz]")) { A.store.state.ui.prioMatriz = !A.store.state.ui.prioMatriz; A.store.emit(); }
  });

  const nomeDoCiclo = (S) => { const sp = cicloEmFoco(S); return sp ? S.rotuloCiclo(sp).split(" · ")[0] : ""; };

  // “Colocar no ciclo”: confere o limite do setor; abaixo da linha de corte vira escolha estratégica (com motivo);
  // no ciclo em andamento, depois da 1ª semana, pede o motivo da repriorização. Tudo fica no histórico.
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pr-por]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const S = A.store;
    const it = S.findInitiative(b.dataset.prPor);
    if (!it) return;
    const limite = A.meta.LIMITE_PROJETOS_SETOR;
    const proximo = planejandoProximo(S);
    const nomeC = nomeDoCiclo(S);
    const doSetor = escolhidosDo(S, it.area);
    if (doSetor.length >= limite) {
      const ok = await A.util.confirmDialog(`${it.area} já tem as ${limite} vagas de ${nomeC} ocupadas. Colocar ${it.id} mesmo assim (uma vaga a mais)?`,
        { title: "Vagas do setor", okLabel: "Colocar mesmo assim" });
      if (!ok) return;
    }
    let r;
    // Mesma linha de corte que está na tela: a do setor escolhido ou a do programa inteiro.
    const abaSetor = S.findArea(S.state.ui.prioSetor || "") ? S.state.ui.prioSetor : null;
    const baseCorte = S.state.data.initiatives.filter((x) => ativo(x) && pontuado(x) && x.situacao === "Validado" && (!abaSetor || x.area === abaSetor));
    if (!S.calc.isAboveCut(it, S.calc.cutoff(baseCorte).value)) {
      if (doSetor.some((x) => x.estrategico)) {
        const ok = await A.util.confirmDialog(`${it.area} já tem uma escolha estratégica em ${nomeC}. O combinado é uma por setor. Fazer mais uma?`,
          { title: "Escolha estratégica", okLabel: "Fazer mesmo assim" });
        if (!ok) return;
      }
      const motivo = await A.util.pedirTexto(`${it.id} · ${it.nome} está abaixo da linha de corte do setor. Por que ele entra em ${nomeC}? Fica registrado como escolha estratégica (⭐).`,
        { title: "⭐ Escolha estratégica", okLabel: "Colocar no ciclo", placeholder: "ex.: abre o mercado de 2027; destrava outros projetos", obrigatorio: true });
      if (motivo == null) return;
      r = S.setEstrategico(it.id, motivo, { proximo });
    } else {
      let motivo = "";
      if (!proximo && S.cicloJaAndando()) {
        motivo = await A.util.pedirTexto(`${nomeC} já está andando. Por que ${it.id} entra agora?`,
          { title: "Mudança no meio do ciclo", okLabel: "Colocar no ciclo", placeholder: "ex.: cliente antecipou o pedido; decisão da reunião de quinta" });
        if (motivo == null) return;
      }
      r = proximo ? S.setNoProximo(it.id, true) : S.setNoCiclo(it.id, true, motivo);
    }
    if (!r.ok) A.util.toast(r.error, "error");
    else A.util.toast(`${it.id} entrou em ${nomeC}.`);
  }, true);

  // ✕ na vaga: tira o projeto do ciclo.
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pr-tirar]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const S = A.store;
    const it = S.findInitiative(b.dataset.prTirar);
    const proximo = planejandoProximo(S);
    const nomeC = nomeDoCiclo(S);
    let motivo = "";
    if (!proximo && S.cicloJaAndando()) {
      motivo = await A.util.pedirTexto(`${nomeC} já está andando. Por que ${it.id} sai do ciclo?`,
        { title: "Mudança no meio do ciclo", okLabel: "Tirar do ciclo", placeholder: "ex.: esperando verba; decisão da diretoria" });
      if (motivo == null) return;
    } else if (!(await A.util.confirmDialog(`Tirar ${it.id} · ${it.nome} de ${nomeC}?`, { title: "Tirar do ciclo", okLabel: "Tirar" }))) return;
    const r = proximo ? S.setNoProximo(it.id, false) : S.setNoCiclo(it.id, false, motivo);
    if (!r.ok) A.util.toast(r.error, "error");
    else A.util.toast(`${it.id} saiu de ${nomeC}.`);
  }, true);

  // Etiqueta de urgência (a nota da Triagem): desempata e mostra o que não pode esperar.
  function urgTag(it) {
    if (!it.urgencia) return "";
    const u = A.meta.URGENCIA_ESCALA[it.urgencia];
    return `<span class="urg-tag u${it.urgencia}" title="Urgência: ${esc(u?.texto || "")}">⏱ ${esc(u?.curto || "")}</span>`;
  }

  A.views.priorizacao = function (S) {
    const el = document.getElementById("priorizacao-root");
    if (!el) return;
    const { ve, cutoff, isAboveCut } = S.calc;
    const proximo = planejandoProximo(S);
    const sp = cicloEmFoco(S);
    const atual = S.sprintAtual();
    const limite = A.meta.LIMITE_PROJETOS_SETOR;
    const nomeC = nomeDoCiclo(S);
    const all = S.state.data.initiatives.filter(ativo);
    const validados = all.filter((i) => i.situacao === "Validado");
    const semNota = validados.filter((i) => !pontuado(i));
    const aValidar = all.filter((i) => i.situacao !== "Validado").length;
    let aba = S.state.ui.prioSetor || "ALL";
    if (aba !== "ALL" && aba !== "SEMNOTA" && !S.findArea(aba)) aba = "ALL";
    const setor = aba === "ALL" || aba === "SEMNOTA" ? null : S.findArea(aba);
    // A linha de corte é a do conjunto na tela (programa inteiro ou o setor escolhido).
    const base = validados.filter((i) => pontuado(i) && (!setor || i.area === setor.key));
    const cut = cutoff(base);
    const ranked = [...base].sort((a, b) => ve(b) - ve(a) || (b.urgencia || 0) - (a.urgencia || 0) || a.id.localeCompare(b.id, "pt-BR", { numeric: true }));

    let cutDone = false;
    const linha = (it, i) => {
      const acima = isAboveCut(it, cut.value);
      let divisor = "";
      if (!acima && !cutDone) { cutDone = true; divisor = `<li class="pr2-corte" title="Σ Valor ÷ Σ Esforço ${setor ? "do setor" : "do programa"}">linha de corte · ${fmtNum(cut.value)}</li>`; }
      const noCiclo = estaNoCiclo(S, it);
      const deps = S.dependenciasPendentes(it);
      const fila = S.tempoNaFila(it);
      return `${divisor}
        <li class="pr2-item ${noCiclo ? "dentro" : ""} ${acima ? "" : "abaixo"}" data-hl="${esc(it.id)}">
          <span class="pr2-pos">${i + 1}</span>
          <span class="pr-id" style="--ac:${A.area(it.area).cor}">${esc(it.id)}</span>
          <span class="pr2-nome">
            <button class="link-btn" data-action="edit-initiative" data-id="${esc(it.id)}" title="${esc(`${it.nome} · ${it.area}\nValor ${it.valor} · Esforço ${it.esforco} (${A.meta.tempoPorEsforco(it.esforco)})`)}">${esc(it.nome)}</button>
            <span class="pr2-tags">${urgTag(it)}
              ${deps.length ? `<span class="pr-dep" title="${esc(deps.map((d) => (d.tipo === "SS" ? `Só começa depois que ${d.proj.id} começar` : `Só começa depois que ${d.proj.id} terminar`)).join("\n"))}">⚠ depende de ${esc(deps.map((d) => d.proj.id).join(", "))}</span>` : ""}
              ${fila != null && fila >= 1 && !noCiclo ? `<span class="pr-fila ${fila >= 3 ? "decidir" : ""}" title="${fila >= 3 ? "Três meses ou mais na fila: decidir se entra, divide em fases ou arquiva." : "Validado e esperando para entrar num ciclo"}">⏳ ${fila} ${fila === 1 ? "mês" : "meses"} na fila</span>` : ""}
            </span>
          </span>
          <span class="pr2-ve ${acima ? "acima" : ""}" title="Valor ${it.valor} ÷ Esforço ${it.esforco}">${fmtNum(ve(it))}</span>
          <span class="pr2-acao no-print">${noCiclo
            ? `<span class="pr2-dentro">✓ no ciclo</span>`
            : sp ? `<button class="btn btn-xs ${acima ? "btn-primary" : "btn-outline"}" data-pr-por="${esc(it.id)}" title="${acima ? `Ocupa uma vaga de ${esc(it.area)} em ${esc(nomeC)}` : "Abaixo da linha de corte: entra como escolha estratégica (⭐), com o motivo registrado"}">${acima ? "Colocar no ciclo" : "⭐ Colocar"}</button>` : ""}</span>
        </li>`;
    };

    // Vagas do ciclo: um bloco por setor com as 4 vagas.
    const blocos = S.areas().map((a) => {
      const escolhidos = escolhidosDo(S, a.key);
      const vagas = Math.max(limite, escolhidos.length);
      return `
        <div class="pr2-bloco ${aba === a.key ? "ativo" : ""}" style="--ac:${a.cor}">
          <button class="pr2-bloco-head" data-pr-setor="${esc(a.key)}" title="Ver o backlog de ${esc(a.key)}">
            <strong>${esc(a.key)}</strong><span>${escolhidos.length}/${limite}</span></button>
          ${Array.from({ length: vagas }, (_, k) => {
            const it = escolhidos[k];
            if (!it) return `<div class="pr2-vaga livre">vaga livre</div>`;
            const continua = proximo && atual && it.ciclo === atual.id && it.proximoCiclo !== "sim";
            return `<div class="pr2-vaga" title="${esc(`${it.id} · ${it.nome}${it.estrategico ? `\n⭐ Escolha estratégica: ${it.estrategicoMotivo}` : ""}${continua ? "\nContinua do ciclo atual" : ""}`)}">
              ${it.estrategico ? "⭐ " : ""}<span class="pr2-vaga-id">${esc(it.id)}</span><span class="pr2-vaga-nome">${esc(it.nome)}</span>
              ${continua ? `<span class="pr2-continua">continua</span>` : ""}
              <button class="pr2-x no-print" data-pr-tirar="${esc(it.id)}" aria-label="Tirar ${esc(it.id)} do ciclo" title="Tirar do ciclo">✕</button></div>`;
          }).join("")}
        </div>`;
    }).join("");
    const total = escolhidosDo(S).length;

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Priorização</h2>
          <div class="muted">Escolha, setor por setor, os projetos que andam no mês: até ${limite} por setor. A ordem é pelo <strong>V÷E</strong>
          (valor ÷ esforço); a <strong>urgência</strong> aparece como etiqueta para desempatar.</div>
        </div>
        <div class="seg no-print" role="group" aria-label="Ciclo que está sendo decidido">
          <button class="seg-btn ${!proximo ? "active" : ""}" data-pr-plano="atual">${atual ? esc(S.rotuloCiclo(atual)) : "Sem ciclo aberto"}</button>
          <button class="seg-btn ${proximo ? "active" : ""}" data-pr-plano="proximo">${esc(S.rotuloCiclo(S.proximoCicloInfo()))}</button>
        </div>
      </div>

      <div class="pr2">
        <section class="panel pr2-backlog">
          <div class="pr2-head">
            <h3 class="panel-title">Backlog validado</h3>
            <span class="muted small">${ranked.length} projeto(s) · ordem por V÷E</span>
          </div>
          <div class="pr2-setores no-print">
            <button class="chip-btn ${aba === "ALL" ? "active" : ""}" data-pr-setor="ALL">Todos</button>
            ${S.areas().map((a) => `<button class="chip-btn ${aba === a.key ? "active" : ""}" data-pr-setor="${esc(a.key)}" style="--ac:${a.cor}"><span class="pr-tab-cor"></span>${esc(a.key)}</button>`).join("")}
            ${semNota.length ? `<button class="chip-btn alerta ${aba === "SEMNOTA" ? "active" : ""}" data-pr-setor="SEMNOTA">⚠ Sem nota ${semNota.length}</button>` : ""}
          </div>
          ${aba === "SEMNOTA"
            ? `<p class="muted small">Validados sem valor ou esforço não entram na ordem. Dê as notas na Triagem.</p>
               <ul class="pr-semnota">${semNota.map((it) => `<li><span class="pr-id" style="--ac:${A.area(it.area).cor}">${esc(it.id)}</span> ${esc(it.nome)}</li>`).join("")}</ul>`
            : `<ol class="pr2-lista">${ranked.map(linha).join("") || `<li class="muted small" style="padding:1rem">Nenhum projeto validado ${setor ? "neste setor" : ""} ainda. Valide na Triagem.</li>`}</ol>`}
          ${aValidar ? `<p class="muted small pr2-nota">${aValidar} ideia(s) ainda em “Validar backlog”. <a href="#triagem" data-nav>Ir para a Triagem →</a></p>` : ""}
          <button class="btn btn-xs btn-ghost no-print" data-pr-matriz>${S.state.ui.prioMatriz ? "▾ Esconder a matriz" : "▸ Ver na matriz valor × esforço"}</button>
          ${S.state.ui.prioMatriz ? `<div class="pr2-matriz"><svg class="matrix-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Matriz valor por esforço">${matrixSvg(S, validados.filter(pontuado), cut.value, (i) => !setor || i.area === setor.key)}</svg></div>` : ""}
        </section>

        <section class="panel pr2-ciclo">
          <div class="pr2-head">
            <h3 class="panel-title">${sp ? esc(S.rotuloCiclo(sp)) : "Sem ciclo aberto"}</h3>
            <span class="pr2-total" title="Projetos escolhidos para o ciclo">${total} projeto${total === 1 ? "" : "s"}</span>
          </div>
          ${proximo ? `<p class="muted small" style="margin-top:0">Planejando ${esc(nomeC)} sem mexer no ciclo em andamento. Projetos que não terminaram aparecem como “continua”; tire o que deve sair.</p>`
            : `<p class="muted small" style="margin-top:0">Cada setor tem ${limite} vagas. As atividades dos projetos escolhidos com prazo no mês vão sozinhas para o Kanban.</p>`}
          <div class="pr2-blocos">${blocos}</div>
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
