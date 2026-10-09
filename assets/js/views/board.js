/* Kanban da sprint (cards = atividades) e Ondas trimestrais, ambos com arrastar e soltar. */
(function () {
  const A = window.Altamar;
  const { esc, toast } = A.util;
  const ui = A.ui;

  const SEM_ORDER = { vermelho: 0, amarelo: 1, verde: 2 };

  /* ---------- Kanban da sprint ---------- */
  const PROXIMA = { todo: "doing", doing: "done", waiting: "doing", blocked: "doing" };
  const PROXIMA_LABEL = { todo: "Começar: mover para Fazendo", doing: "Concluir: mover para Feito", waiting: "Voltou: mover para Fazendo", blocked: "Destravou: mover para Fazendo" };

  // Prazo vencido e a atividade ainda não terminou.
  function atrasada(S, a) {
    const d = S.calc.parseDate(a.prazo);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return !!d && d < hoje && a.status !== "Concluído" && a.status !== "Cancelado";
  }

  // Etiquetas do cartão: projeto (cor do setor), marco e as etiquetas livres.
  function etiquetasHtml(S, it, a) {
    const livres = (a.etiquetas || []).map((id) => S.findEtiqueta(id)).filter(Boolean);
    return `
      <span class="lbl lbl-proj" style="--ac:${A.area(it.area).cor}" title="${esc(`${it.id} · ${it.nome}`)}">${esc(it.id)}</span>
      ${a.marco ? `<span class="lbl lbl-marco" title="Marco: entrega importante do projeto">◆ Marco</span>` : ""}
      ${livres.map((e) => { const c = A.meta.corEtiqueta(e.cor); return `<span class="lbl" style="--lb:${c.bg};--lbt:${c.fg}">${esc(e.nome)}</span>`; }).join("")}`;
  }
  // Prazo curto para o cartão ("14 out") e o estado: atrasado, chegando (até 2 dias) ou feito.
  function prazoBadge(S, a, col) {
    const d = S.calc.parseDate(a.prazo);
    if (!d) return "";
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dias = Math.round((d - hoje) / 86400000);
    const cls = col === "done" ? "feito" : dias < 0 ? "late" : dias <= 2 ? "soon" : "";
    const txt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "").replace(" de ", " ");
    const dica = col === "done" ? "Entregue" : dias < 0 ? `Atrasada há ${-dias} dia(s)` : dias === 0 ? "Vence hoje" : `Vence em ${dias} dia(s)`;
    return `<span class="tbadge prazo ${cls}" title="Prazo: ${esc(a.prazo)} · ${dica}">🕑 ${esc(txt)}</span>`;
  }

  function actCard(S, it, a, { compacto = false } = {}) {
    const r = S.raciPeople(a.raci, "R")[0];
    const col = S.activityCol(a);
    const total = a.checklist.length, feitos = a.checklist.filter((x) => x.feito).length;
    const key = `${it.id}|${a.id}`;
    // Quem só visualiza mexe apenas nas atividades em que é o responsável (R).
    const pode = !viaBanco() || r === A.store.state.settings.user;
    const outros = Object.entries(a.raci).filter(([, role]) => role !== "R").map(([n]) => n).slice(0, 2);
    const dica = [`${it.id} · ${it.nome}`, a.entregavel ? `Entregável: ${a.entregavel}` : "", "Clique para abrir"].filter(Boolean).join("\n");
    return `
      <div class="k-card act-card tcard ${col} ${compacto ? "compacto" : ""}" draggable="true" data-drag="activity" data-ini="${esc(it.id)}" data-act="${esc(a.id)}"
           data-action="open-activity" data-id="${esc(key)}" tabindex="0" role="button" title="${esc(dica)}"
           aria-label="${esc(a.nome)}, do projeto ${esc(it.nome)}" style="--ac:${A.area(it.area).cor}">
        <div class="tcard-lbls">${etiquetasHtml(S, it, a)}${it.semaforo !== "verde" ? `<span class="tcard-sem" title="Semáforo do projeto">${ui.dot(it.semaforo)}</span>` : ""}</div>
        <div class="tcard-title">${esc(a.nome)}</div>
        ${a.levadaDe && col !== "done" ? `<div class="act-levada" title="Não terminou no ciclo anterior e passou para este${a.vezesLevada > 1 ? ` (${a.vezesLevada}ª vez)` : ""}">↻ veio de ${esc(S.findSprint(a.levadaDe) ? S.nomeCiclo(S.findSprint(a.levadaDe)).replace("Ciclo de ", "") : "outro ciclo")}${a.vezesLevada > 1 ? ` · ${a.vezesLevada}ª vez` : ""}</div>` : ""}
        <div class="tcard-foot">
          ${prazoBadge(S, a, col)}
          ${total ? `<span class="tbadge ${feitos === total ? "feito" : ""}" title="${feitos} de ${total} passos feitos">☑ ${feitos}/${total}</span>` : ""}
          ${a.anexos?.length ? `<span class="tbadge" title="${a.anexos.length} anexo(s)">📎 ${a.anexos.length}</span>` : ""}
          ${a.comentarios?.length ? `<span class="tbadge" title="${a.comentarios.length} comentário(s)">💬 ${a.comentarios.length}</span>` : ""}
          ${a.observacoes ? `<span class="tbadge" title="${esc(a.observacoes)}">≡</span>` : ""}
          <span class="tcard-avs">
            ${outros.map((n) => `<span class="act-av outro" title="${esc(n)}">${esc(A.util.initials(n))}</span>`).join("")}
            <span class="act-av ${r ? "" : "none"}" title="${esc(r ? `Responsável: ${r}` : "Sem responsável (R)")}">${esc(r ? A.util.initials(r) : "?")}</span>
          </span>
        </div>
        ${pode ? `<div class="act-quick no-print">
          ${col === "todo" || col === "doing" || col === "waiting" ? `<button class="q-btn warn" data-action="act-quick" data-id="${esc(key)}" data-q="block" title="Travou: precisa de decisão ou ajuda (vai para Travado)">⚠ Travou</button>` : ""}
          ${PROXIMA[col] ? `<button class="q-btn go" data-action="act-quick" data-id="${esc(key)}" data-q="next" title="${PROXIMA_LABEL[col]}">${col === "doing" ? "✓ Concluir" : col === "todo" ? "▶ Começar" : "✓ Resolvido"}</button>` : ""}
        </div>` : ""}
      </div>`;
  }
  function sprintHead(S, si) {
    if (!si.sp) {
      return `<div class="sprint-head panel"><div><h2>Nenhum ciclo aberto</h2></div>
        <button class="btn btn-primary" data-action="new-sprint">Abrir ciclo</button></div>`;
    }
    const { inicio, fim } = S.sprintDates(si.sp);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dur = (fim - inicio) / 86400000 + 1;
    const tempo = Math.max(0, Math.min(100, Math.round(((hoje - inicio) / 86400000 + 1) / dur * 100)));
    const entrega = si.total ? Math.round(si.items.reduce((s, { a }) => s + a.pct, 0) / si.total) : 0;
    const atrasada = si.total && entrega < tempo - 15;
    const limiteCls = si.acima ? "bad" : si.abaixo ? "warnc" : "good";
    return `
      <div class="sprint-head panel">
        <div class="sprint-head-main">
          <div class="sprint-head-title">
            <h2>${esc(si.rotulo)} <span class="muted">· ${esc(si.periodo)}</span></h2>
            ${si.terminou ? `<span class="kchip bad">terminou</span>` : si.naoComecou ? `<span class="kchip warnc">começa em breve</span>` : `<span class="kchip good">faltam ${si.diasRestantes} dia(s)</span>`}
            <span class="kchip ${limiteCls}" title="Limite combinado para cada ciclo: de ${si.min} a ${si.max} atividades">${si.total} atividades · ${si.projetos} projeto(s)</span>
          </div>
          <div class="sprint-goal">${si.sp.objetivo ? `🎯 ${esc(si.sp.objetivo)}` : `<span class="muted">Sem objetivo definido. Defina no planejamento.</span>`}</div>
          <div class="sprint-meter ${atrasada ? "late" : ""}">
            <div class="sm-row"><span>Tempo</span><div class="sm-bar time"><i style="width:${tempo}%"></i></div><b>${tempo}%</b></div>
            <div class="sm-row"><span>Entrega</span><div class="sm-bar done"><i style="width:${entrega}%"></i></div><b>${entrega}%</b></div>
            <div class="sm-note">${si.feitas} de ${si.total} atividades feitas${atrasada ? " · <strong>a entrega está atrás do tempo</strong>" : ""}</div>
          </div>
        </div>
        <div class="sprint-head-actions no-print">
          ${A.visao.atual().tipo === "lider" ? "" : `
          <button class="btn btn-outline" data-kb-datas title="O ciclo dura um mês a partir do início, mas as datas podem ser ajustadas (ex.: começar no dia da reunião com a diretoria)">✏️ Datas do ciclo</button>
          <button class="btn btn-primary" data-action="plan-sprint">🗓️ Planejar ciclo</button>
          <button class="btn btn-outline" data-action="new-sprint" title="Encerra este ciclo e abre o próximo; o que não foi feito passa para ele. No primeiro acesso depois do fim, isso acontece sozinho.">Encerrar e abrir o próximo</button>`}
        </div>
        ${editandoDatas ? `
        <form class="kb-datas no-print" id="kb-datas-form">
          <label>Início <input type="date" class="input input-sm" id="kb-datas-ini" value="${esc(si.sp.inicio)}" required></label>
          <label>Fim <input type="date" class="input input-sm" id="kb-datas-fim" value="${esc(si.sp.fim)}" required></label>
          <span class="muted small" id="kb-datas-nome">O nome segue o mês do início: ${esc(S.nomeCiclo(si.sp))}</span>
          <button class="btn btn-sm btn-primary" type="submit">Salvar datas</button>
          <button class="btn btn-sm btn-ghost" type="button" data-kb-datas>Cancelar</button>
        </form>` : ""}
      </div>`;
  }
  // Edição das datas do ciclo em andamento (gestor e diretoria).
  let editandoDatas = false;
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-kb-datas]")) return;
    editandoDatas = !editandoDatas;
    A.store.emit();
  });
  document.addEventListener("input", (e) => {
    if (e.target.id !== "kb-datas-ini" || !e.target.value) return;
    const S = A.store;
    const nome = S.nomeCiclo({ inicio: e.target.value });
    document.getElementById("kb-datas-nome").textContent = `O nome segue o mês do início: ${nome}`;
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "kb-datas-form") return;
    e.preventDefault();
    const inicio = document.getElementById("kb-datas-ini").value, fim = document.getElementById("kb-datas-fim").value;
    if (!inicio || !fim || fim < inicio) return toast("O fim do ciclo precisa ser depois do início.", "warn");
    const r = A.store.saveSprint({ inicio, fim });
    if (!r.ok) return toast(r.error, "error");
    editandoDatas = false;
    toast(r.unchanged ? "As datas não mudaram." : "Datas do ciclo atualizadas.");
    A.store.emit();
  });

  // Filtros do quadro: etiqueta, responsável e prazo.
  const PRAZO_FILTROS = [["", "Qualquer prazo"], ["vencido", "Atrasadas"], ["semana", "Vencem em 7 dias"], ["sem", "Sem prazo"]];
  function passaPrazo(S, a, f) {
    if (!f) return true;
    const d = S.calc.parseDate(a.prazo);
    if (f === "sem") return !d;
    if (!d || a.status === "Concluído") return false;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dias = Math.round((d - hoje) / 86400000);
    return f === "vencido" ? dias < 0 : dias >= 0 && dias <= 7;
  }
  function toolbar(S, responsaveis) {
    const ui0 = S.state.ui;
    const sel = ui0.kanbanResp || "";
    const ets = S.etiquetas();
    const ativo = ui0.kanbanEtiqueta || ui0.kanbanPrazo || sel;
    return `
      <div class="kb-toolbar no-print">
        ${ets.length ? `<div class="kb-filtro-lbls" role="group" aria-label="Filtrar por etiqueta">
          ${ets.map((e) => { const c = A.meta.corEtiqueta(e.cor); return `<button class="lbl lbl-filtro ${ui0.kanbanEtiqueta === e.id ? "on" : ""}" data-kb-etq="${esc(e.id)}" style="--lb:${c.bg};--lbt:${c.fg}" aria-pressed="${ui0.kanbanEtiqueta === e.id}">${esc(e.nome)}</button>`; }).join("")}
        </div>` : `<span class="muted small">Sem etiquetas ainda. Crie no cartão: Etiquetas → Criar nova.</span>`}
        <span class="kb-filtros-dir">
          ${responsaveis.length >= 2 ? `<select class="input input-sm" data-kb-resp aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            ${responsaveis.map((n) => `<option ${n === sel ? "selected" : ""}>${esc(n)}</option>`).join("")}
          </select>` : ""}
          <select class="input input-sm" data-kb-prazo aria-label="Prazo">
            ${PRAZO_FILTROS.map(([k, t]) => `<option value="${k}" ${ui0.kanbanPrazo === k || (!ui0.kanbanPrazo && !k) ? "selected" : ""}>${t}</option>`).join("")}
          </select>
          ${ativo ? `<button class="link-btn small" data-kb-limpar>Limpar filtros</button>` : ""}
        </span>
      </div>`;
  }

  const agrupar = (S, list) => {
    const cols = Object.fromEntries(A.meta.SPRINT_COLUNAS.map((c) => [c.key, []]));
    list.forEach((x) => cols[S.activityCol(x.a)].push(x));
    Object.values(cols).forEach((l) => l.sort((x, y) =>
      SEM_ORDER[x.it.semaforo] - SEM_ORDER[y.it.semaforo] || x.it.id.localeCompare(y.it.id, "pt-BR", { numeric: true })));
    return cols;
  };
  const cabecalhoColuna = (c, n) => `
    <div class="kb-col-head ${c.key}" title="${esc(c.hint)}"><span>${esc(c.label)}</span><b>${n}</b></div>`;

  // Líder: o Kanban clássico do setor, com cabeçalhos fortes.
  function colunas(S, list, si) {
    const cols = agrupar(S, list);
    return A.meta.SPRINT_COLUNAS.map((c) => `
      <section class="k-col ${c.key}" data-drop-act="${c.key}" aria-label="${esc(c.label)}">
        ${cabecalhoColuna(c, cols[c.key].length)}
        <div class="k-list">
          ${cols[c.key].length ? cols[c.key].map(({ it, a }) => actCard(S, it, a)).join("")
            : `<div class="muted small k-empty">${c.key === "todo" && !si.total ? "Nada combinado ainda para este ciclo" : "Arraste atividades para cá"}</div>`}
        </div>
      </section>`).join("");
  }

  // Projetos escolhidos para o ciclo que ainda não têm nenhuma atividade no Kanban do mês
  // (sem plano, ou com atividades sem prazo / com prazo fora do ciclo).
  function semAtividadeNoMes(S, list, setor) {
    const comCard = new Set(list.map(({ it }) => it.id));
    return S.projetosNoCiclo(setor).filter((p) => p.status !== "Concluído" && !comCard.has(p.id) && A.visao.veProjeto(p));
  }
  function motivoSemAtividade(S, p) {
    const abertas = p.atividades.filter((a) => a.status !== "Concluído" && a.status !== "Cancelado");
    if (!abertas.length) return "Ainda sem plano: nenhuma atividade cadastrada";
    if (!abertas.some((a) => S.calc.parseDate(a.prazo))) return `${abertas.length} atividade(s) sem prazo`;
    return "Nenhuma atividade com prazo neste ciclo";
  }
  function chipsSemAtividade(projs) {
    if (!projs.length) return "";
    const S = A.store;
    return `<div class="kb-sem-ativ" title="Projetos escolhidos para o ciclo que ainda não têm atividade com prazo no mês">
      <span>${projs.length} projeto${projs.length === 1 ? "" : "s"} sem atividade no mês:</span>
      ${projs.map((p) => `<a class="kb-sem-chip" href="${A.drill.projectHref(p.id)}" data-nav title="${esc(`${p.id} · ${p.nome}\n${motivoSemAtividade(S, p)}\nClique para montar o plano`)}">${esc(p.id)}</a>`).join("")}
    </div>`;
  }

  // Gestor e diretoria: uma página só, com uma faixa por setor e as cinco situações lado a lado.
  function faixasPorSetor(S, list) {
    const COLS = A.meta.SPRINT_COLUNAS;
    const total = agrupar(S, list);
    const setores = S.areas().map((a) => ({ a, itens: list.filter(({ it }) => it.area === a.key), semAtividade: semAtividadeNoMes(S, list, a.key) }));
    const comAtividade = setores.filter((s) => s.itens.length || s.semAtividade.length);
    const vazios = setores.filter((s) => !s.itens.length && !s.semAtividade.length).map((s) => s.a.key);
    return `
      <div class="kb-lanes" style="--ncols:${COLS.length}">
        <div class="kb-lane kb-lane-head"><span></span>${COLS.map((c) => cabecalhoColuna(c, total[c.key].length)).join("")}</div>
        ${comAtividade.map(({ a, itens, semAtividade }) => {
          const cols = agrupar(S, itens);
          const feitas = cols.done.length;
          const pct = itens.length ? Math.round((feitas / itens.length) * 100) : 0;
          const problemas = cols.blocked.length;
          return `
            <div class="kb-lane" style="--ac:${a.cor}">
              <div class="kb-lane-nome">
                <strong>${esc(a.key)}</strong>
                <span>${esc(a.lider || "líder a definir")} · ${itens.length} ativ.</span>
                <span class="kb-lane-barra" title="${feitas} de ${itens.length} feitas"><i style="width:${pct}%"></i></span>
                ${problemas ? `<span class="kb-lane-alerta">${problemas} travada${problemas === 1 ? "" : "s"}</span>` : ""}
                ${chipsSemAtividade(semAtividade)}
              </div>
              ${COLS.map((c) => `<div class="kb-cell ${c.key}" data-drop-act="${c.key}">${cols[c.key].map(({ it, a: at }) => actCard(S, it, at, { compacto: true })).join("")}</div>`).join("")}
            </div>`;
        }).join("") || `<div class="kb-vazio">Nenhuma atividade no Kanban deste ciclo ainda. Escolha os projetos na Priorização e monte o plano de cada um.</div>`}
        ${vazios.length ? `<div class="kb-sem muted small">Sem atividades no ciclo: ${esc(vazios.join(", "))}</div>` : ""}
      </div>`;
  }

  A.views.kanban = function (S) {
    const si = A.sprintInfo(S);
    const lider = A.visao.atual().tipo === "lider";
    // O líder de setor vê só os projetos do próprio setor.
    const doSetor = si.items.filter(({ it }) => A.visao.veProjeto(it) && S.matchesFilters(it));
    const responsaveis = [...new Set(doSetor.map(({ a }) => S.raciPeople(a.raci, "R")[0]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    let resp = S.state.ui.kanbanResp || "";
    if (resp && !responsaveis.includes(resp)) resp = S.state.ui.kanbanResp = "";
    let etq = S.state.ui.kanbanEtiqueta || "";
    if (etq && !S.findEtiqueta(etq)) etq = S.state.ui.kanbanEtiqueta = "";
    const items = doSetor.filter(({ a }) => (!resp || S.raciPeople(a.raci, "R")[0] === resp)
      && (!etq || a.etiquetas.includes(etq)) && passaPrazo(S, a, S.state.ui.kanbanPrazo || ""));
    // Para o líder, os números do cabeçalho são só do setor dele.
    const siTela = !lider ? si : {
      ...si, items: doSetor, total: doSetor.length, acima: false, abaixo: false,
      feitas: doSetor.filter(({ a }) => a.status === "Concluído").length,
      projetos: new Set(doSetor.map(({ it }) => it.id)).size,
    };
    // No Kanban clássico (líder ou um setor filtrado), o aviso dos projetos sem atividade vai no topo.
    const classicoAviso = lider || S.state.ui.area !== "ALL";
    const semAtiv = classicoAviso ? S.areas().filter((a) => S.state.ui.area === "ALL" || a.key === S.state.ui.area)
      .flatMap((a) => semAtividadeNoMes(S, si.items, a.key)) : [];
    document.getElementById("sprint-head").innerHTML = sprintHead(S, siTela) + toolbar(S, responsaveis)
      + (semAtiv.length ? `<div class="kb-sem-topo">${chipsSemAtividade(semAtiv)}</div>` : "");
    const board = document.getElementById("kanban-board");
    // Com o filtro de um setor só, a visão do gestor também vira o Kanban clássico.
    const classico = lider || S.state.ui.area !== "ALL";
    board.className = classico ? "kanban sprint-board" : "kb-gestor";
    board.innerHTML = classico ? colunas(S, items, si) : faixasPorSetor(S, items);
  };  // Ações rápidas do card (sem abrir a atividade).
  function quick(key, q) {
    const S = A.store;
    const [ini, act] = key.split("|");
    const a = S.findActivity(ini, act);
    if (!a) return;
    const col = S.activityCol(a);
    if (q === "step") {
      const prox = a.checklist.find((x) => !x.feito);
      if (!prox) return;
      const patch = { checklist: a.checklist.map((x) => (x.id === prox.id ? { ...x, feito: true } : x)) };
      if (col === "todo") Object.assign(patch, { status: "Em andamento", esperando: false, travado: false });
      Promise.resolve(salvarAtividade(ini, act, patch)).then((r) => { if (r?.ok) toast(`Passo marcado: ${prox.texto}`); });
    } else if (q === "next" && (col === "blocked" || col === "waiting")) {
      // Sair de Travado/Esperando é uma decisão: registra o que resolveu (opcional) nas observações e no histórico.
      return resolver(ini, act, a, col);
    } else if (q === "next" && PROXIMA[col]) {
      moveActivity(ini, act, PROXIMA[col]);
    } else if (q === "block") {
      return travar(ini, act, a);
    }
  }

  const hojeBR = () => new Date().toLocaleDateString("pt-BR");
  // Travar exige o motivo: fica nas observações da atividade e o card vai para “Travado”.
  async function travar(ini, act, a) {
    const motivo = await A.util.pedirTexto(`“${a.nome}” travou. O que está travando e quem precisa decidir ou ajudar?`,
      { title: "⚠ Marcar como travada", okLabel: "Marcar como travada", placeholder: "ex.: falta aprovar a verba com a diretoria", obrigatorio: true });
    if (motivo == null || !motivo.trim()) return;
    const observacoes = `⚠ Travou em ${hojeBR()}: ${motivo.trim()}${a.observacoes ? `\n${a.observacoes}` : ""}`;
    const r = await salvarAtividade(ini, act, { status: "Em andamento", travado: true, esperando: false, observacoes });
    if (r?.ok !== false) toast("Atividade marcada como travada. Aparece em vermelho no Kanban e no Painel.", "warn", 5000);
  }
  async function resolver(ini, act, a, col) {
    const travada = col === "blocked";
    const txt = await A.util.pedirTexto(travada ? `O que destravou “${a.nome}”? (opcional)` : `O que chegou para “${a.nome}” seguir? (opcional)`,
      { title: travada ? "✓ Destravou" : "✓ Chegou o que esperava", okLabel: "Voltar para Fazendo", placeholder: "ex.: verba aprovada na reunião de quinta" });
    if (txt == null) return;
    const nota = `✓ ${travada ? "Destravou" : "Chegou"} em ${hojeBR()}${txt.trim() ? `: ${txt.trim()}` : ""}`;
    const r = await salvarAtividade(ini, act, { status: "Em andamento", travado: false, esperando: false, observacoes: `${nota}${a.observacoes ? `\n${a.observacoes}` : ""}` });
    if (r?.ok !== false) toast("Atividade de volta para Fazendo.");
  }

  function initKanbanControls() {
    document.addEventListener("change", (e) => {
      if (e.target.matches("[data-kb-resp]")) A.store.state.ui.kanbanResp = e.target.value;
      else if (e.target.matches("[data-kb-prazo]")) A.store.state.ui.kanbanPrazo = e.target.value;
      else return;
      A.store.emit();
    });
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-kb-etq], [data-kb-limpar]");
      if (!b) return;
      const ui0 = A.store.state.ui;
      if (b.dataset.kbLimpar !== undefined) Object.assign(ui0, { kanbanEtiqueta: "", kanbanPrazo: "", kanbanResp: "" });
      else ui0.kanbanEtiqueta = ui0.kanbanEtiqueta === b.dataset.kbEtq ? "" : b.dataset.kbEtq;
      A.store.emit();
    });
  }
  /* ---------- Ondas ---------- */
  A.views.waves = function (S) {
    const { ve } = S.calc;
    const limite = S.calc.projetosPorOnda();
    const naSprint = new Set(S.sprintItems().map(({ it }) => it.id));
    const sp = S.sprintAtual();
    document.getElementById("waves").innerHTML = A.meta.ONDAS.map((o) => {
      const list = S.state.data.initiatives
        .filter((i) => i.onda === o.key && i.status !== "Cancelado" && S.matchesFilters(i))
        .sort((a, b) => (a.status === "Concluído") - (b.status === "Concluído") || naSprint.has(b.id) - naSprint.has(a.id) || ve(b) - ve(a));
      const abertos = list.filter((i) => i.status !== "Concluído").length;
      const isFila = o.key === "Fila";
      const pct = Math.min(100, Math.round((abertos / limite) * 100));
      const over = !isFila && abertos > limite;
      return `
        <section class="wave-col" style="--wave-color:${o.color}" data-drop-onda="${esc(o.key)}" aria-label="${esc(o.key)}">
          <header class="wave-col-head" title="${esc(o.titulo)}">
            <div class="wave-col-title">${esc(o.key)}</div>
            <div class="wave-col-sub">${esc(o.periodo)}</div>
            ${isFila ? `<div class="wave-col-load muted">${abertos} projeto(s) aguardando</div>` : `
            <div class="wave-cap ${over ? "over" : ""}" title="Projetos em aberto nesta onda × limite por onda (${limite})">
              <div class="wave-cap-bar"><span style="width:${pct}%"></span></div>
              <div class="wave-col-load">${abertos} de ${limite} projetos</div>
            </div>`}
            ${abertos ? `<div class="wave-setores">${S.areas().map((a) => { const n = list.filter((i) => i.area === a.key && i.status !== "Concluído").length;
              return n ? `<span class="wave-setor" style="--ac:${a.cor}" title="${esc(`${a.key}: ${n} projeto(s) em aberto nesta onda`)}">${esc(a.key)} <b>${n}</b></span>` : ""; }).join("")}</div>` : ""}
          </header>
          <div class="wave-col-list">
            ${list.length ? list.map((it) => `
              <div class="wchip ${it.status === "Concluído" ? "done" : ""}" draggable="true" data-drag="initiative" data-id="${esc(it.id)}"
                   data-action="edit-initiative" tabindex="0" role="button"
                   title="${esc(it.nome)} · ${esc(it.status)} · V÷E ${A.util.fmtNum(ve(it))} · esforço ${esc(A.meta.tempoPorEsforco(it.esforco))}"
                   style="--ac:${A.area(it.area).cor}">
                <span class="wchip-id">${esc(it.id)}</span>
                <span class="wchip-name">${esc(it.nome)}</span>
                ${naSprint.has(it.id) ? `<span class="sprint-tag" title="Tem atividades no ciclo atual">${esc(S.nomeCiclo(sp, { curto: true }))}</span>` : ""}
              </div>`).join("")
              : `<div class="wave-empty">Arraste projetos para cá</div>`}
          </div>
        </section>`;
    }).join("");
  };

  /* ---------- Arrastar e soltar (delegado, registrado uma vez) ---------- */
  function initDragAndDrop() {
    let dragging = null; // { kind: "initiative"|"activity", id, ini, act }

    document.addEventListener("dragstart", (e) => {
      const el = e.target.closest?.("[data-drag]");
      if (!el) return;
      // Visualização: não muda onda de projeto; no Kanban, só arrasta as próprias atividades.
      if (viaBanco()) {
        const a = el.dataset.drag === "activity" ? A.store.findActivity(el.dataset.ini, el.dataset.act) : null;
        if (!a || A.store.raciPeople(a.raci, "R")[0] !== A.store.state.settings.user) { e.preventDefault(); return; }
      }
      dragging = el.dataset.drag === "activity"
        ? { kind: "activity", ini: el.dataset.ini, act: el.dataset.act }
        : { kind: "initiative", id: el.dataset.id };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragging.id || `${dragging.ini}|${dragging.act}`);
      requestAnimationFrame(() => el.classList.add("dragging"));
    });
    document.addEventListener("dragend", (e) => {
      e.target.closest?.("[data-drag]")?.classList.remove("dragging");
      document.querySelectorAll(".drag-over").forEach((z) => z.classList.remove("drag-over"));
      dragging = null;
    });

    const zoneOf = (e) => {
      if (!dragging) return null;
      return dragging.kind === "activity" ? e.target.closest?.("[data-drop-act]") : e.target.closest?.("[data-drop-onda]");
    };
    document.addEventListener("dragover", (e) => {
      const zone = zoneOf(e);
      if (!zone) return;
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
      const d = dragging;
      if (d.kind === "activity") moveActivity(d.ini, d.act, zone.dataset.dropAct);
      else moveWave(d.id, zone.dataset.dropOnda);
    });
  }

  // Ponto único para alterar atividades na tela: quem só visualiza grava pelo banco, e só nas atividades em que é R.
  const viaBanco = () => A.nuvem?.perfil() === "visualizacao";
  async function salvarAtividade(iniId, actId, patch, source = "Kanban") {
    if (viaBanco()) return A.nuvem.atualizarMinhaAtividade(iniId, actId, patch);
    const r = A.store.saveActivity(iniId, actId, patch, { source });
    if (!r.ok) { toast(r.error, "error"); return r; }
    // Começar (ou concluir) uma atividade põe o projeto em andamento, como no Kanban.
    if ((patch.status === "Em andamento" || patch.status === "Concluído") && A.store.findInitiative(iniId)?.status === "A fazer") {
      A.store.saveInitiative({ status: "Em andamento" }, iniId, { source });
    }
    return r;
  }

  async function moveActivity(iniId, actId, col) {
    const S = A.store;
    // Entrar em “Travado” (ou sair dele de volta para Fazendo) passa pelo registro do motivo, também ao arrastar.
    const a0 = S.findActivity(iniId, actId);
    const de = a0 && S.activityCol(a0);
    if (a0 && col === "blocked" && de !== "blocked") return travar(iniId, actId, a0);
    if (a0 && de === "blocked" && col === "doing") return resolver(iniId, actId, a0, de);
    if (viaBanco()) {
      const patch = { todo: { status: "A fazer", esperando: false, travado: false }, doing: { status: "Em andamento", esperando: false, travado: false },
        waiting: { status: "Em andamento", esperando: true, travado: false }, blocked: { status: "Em andamento", esperando: false, travado: true },
        done: { status: "Concluído", esperando: false, travado: false } }[col];
      const r = await A.nuvem.atualizarMinhaAtividade(iniId, actId, patch);
      if (r.ok) toast(`Atividade movida para “${A.meta.SPRINT_COLUNAS.find((c) => c.key === col)?.label}”.`);
      return;
    }
    const r = S.moveActivity(iniId, actId, col);
    if (!r.ok) return toast(r.error, "error");
    if (r.unchanged) return;
    const label = A.meta.SPRINT_COLUNAS.find((c) => c.key === col)?.label;
    toast(`Atividade movida para “${label}”.${r.iniciouProjeto ? ` O projeto ${iniId} passou a Em andamento.` : ""}`);
    if (r.projetoPronto && S.findInitiative(iniId).status !== "Concluído") {
      toast(`Todas as atividades do ${iniId} estão feitas. Conclua o projeto na tela dele.`, "ok", 6000);
    }
  }

  // Concluir um projeto inteiro (tela do projeto): mantém a regra antiga de colunas de projeto.
  function moveCard(id, coluna) {
    const S = A.store;
    const r = S.moveToColumn(id, coluna);
    if (!r.ok) return toast(r.error, "error");
    if (!r.unchanged) toast(`${id}: ${S.findInitiative(id).status}.`);
  }

  function moveWave(id, onda) {
    const S = A.store;
    const it = S.findInitiative(id);
    if (!it || it.onda === onda) return;
    S.setOnda(id, onda);
    const limite = S.calc.projetosPorOnda();
    const abertos = S.state.data.initiatives.filter((i) => i.onda === onda && i.status !== "Concluído" && i.status !== "Cancelado").length;
    if (onda !== "Fila" && abertos > limite) toast(`${id} movido para ${onda}. Atenção: ${abertos} projetos para um limite de ${limite}.`, "warn", 5000);
    else toast(`${id} movido para ${onda}.`);
  }

  A.board = { initDragAndDrop, initKanbanControls, moveCard, moveActivity, quick, salvarAtividade, etiquetasHtml };
})();
