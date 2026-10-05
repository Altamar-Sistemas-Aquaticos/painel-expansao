/* Navegação hierárquica: Kanban → Setor → Projeto → Atividades. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum } = A.util;
  const ui = A.ui;

  // Barra de % de conclusão. `pct` null = iniciativa sem atividades cadastradas.
  ui.progressBar = (pct, { size = "", label = true } = {}) => {
    if (pct == null) return `<div class="pbar-wrap ${size}"><div class="pbar empty"></div>${label ? '<span class="pbar-label muted">sem atividades</span>' : ""}</div>`;
    const tone = pct >= 100 ? "done" : pct >= 50 ? "mid" : "";
    return `<div class="pbar-wrap ${size}" title="${pct}% concluído (média das atividades)">
      <div class="pbar ${tone}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      ${label ? `<span class="pbar-label">${pct}%</span>` : ""}
    </div>`;
  };

  const statusBadge = (s) => {
    const cls = { "Em andamento": "accent", "Concluído": "ok", "Cancelado": "alert" }[s] || "";
    return `<span class="badge ${cls}">${esc(s)}</span>`;
  };

  function breadcrumb(parts) {
    return `<nav class="breadcrumb" aria-label="Caminho">${parts.map((p, i) => {
      const last = i === parts.length - 1;
      return last
        ? `<span aria-current="page">${p.label}</span>`
        : `<a href="${p.href}" data-nav>${p.label}</a><span class="sep" aria-hidden="true">›</span>`;
    }).join("")}</nav>`;
  }
  const sectorHref = (area) => `#setor/${encodeURIComponent(area)}`;
  const projectHref = (id) => `#projeto/${encodeURIComponent(id)}`;

  /* ---------- Setor ---------- */
  A.views.sector = function (S, area) {
    const el = document.getElementById("view-setor");
    const meta = A.area(area);
    const { ve, progress } = S.calc;
    const list = S.state.data.initiatives.filter((i) => i.area === meta.key)
      .sort((a, b) => ve(b) - ve(a) || b.valor - a.valor);
    const active = list.filter((i) => i.status !== "Cancelado");
    const withActs = active.map(progress).filter((p) => p != null);
    const avg = withActs.length ? Math.round(withActs.reduce((s, p) => s + p, 0) / withActs.length) : null;
    const doing = active.filter((i) => i.status === "Em andamento").length;
    const done = active.filter((i) => i.status === "Concluído").length;

    el.innerHTML = `
      ${breadcrumb([{ label: "Kanban", href: "#kanban" }, { label: `Setor ${esc(meta.key)}` }])}
      <div class="panel sector-head" style="--sector-color:${meta.cor}">
        <div class="row" style="justify-content:space-between; align-items:flex-start">
          <div>
            <div class="row">${ui.areaBadge(meta.key)}<span class="muted small">Setor</span></div>
            <h2 class="sector-title">${esc(meta.key)}</h2>
          </div>
          <div class="row no-print">
            ${S.areas().filter((a) => a.key !== meta.key).map((a) =>
              `<a class="btn btn-xs btn-outline" href="${sectorHref(a.key)}" data-nav>${esc(a.key)}</a>`).join("")}
          </div>
        </div>
        <div class="sector-stats">
          <div><div class="kpi-label">Projetos</div><div class="kpi-value">${active.length}</div><div class="kpi-sub">${done} concluídas${list.length !== active.length ? ` · ${list.length - active.length} canceladas` : ""}</div></div>
          <div><div class="kpi-label">Conclusão média</div><div class="kpi-value">${avg == null ? "—" : avg + "%"}</div><div class="kpi-sub">${withActs.length} de ${active.length} com atividades</div></div>
          <div><div class="kpi-label">Em andamento</div><div class="kpi-value">${doing}</div><div class="kpi-sub">no fluxo agora</div></div>
        </div>
        ${ui.progressBar(avg, { size: "lg" })}
      </div>

      <div class="stack" style="margin-top:1rem">
        ${list.length ? list.map((it, i) => {
          const pct = progress(it);
          return `
            <a class="sector-row ${it.status === "Cancelado" ? "cancelled" : ""}" href="${projectHref(it.id)}" data-nav>
              <span class="sector-rank muted">${i + 1}</span>
              ${ui.dot(it.semaforo)}
              <div class="sector-main">
                <div class="li-title"><span style="color:var(--accent)">${esc(it.id)}</span> · ${esc(it.nome)}
                  ${it.enabler ? '<span class="badge enabler">Habilitadora</span>' : ""}</div>
                <div class="li-meta">
                  ${statusBadge(it.status)}
                  <span>V÷E <strong>${fmtNum(ve(it))}</strong></span>
                  <span>${esc(it.onda)}</span>
                  <span>${it.atividades.length} atividade${it.atividades.length === 1 ? "" : "s"}</span>
                  <span>Resp.: ${esc(it.responsavel || "A definir")}</span>
                </div>
              </div>
              <div class="sector-progress">${ui.progressBar(pct)}</div>
              <span class="chev" aria-hidden="true">›</span>
            </a>`;
        }).join("") : ui.empty("Nenhum projeto neste setor.")}
      </div>`;
  };

  /* ---------- Projeto ---------- */
  // Aviso quando a atividade depende de outra que ainda não foi concluída.
  function blockedBy(it, a) {
    const n = parseInt(a.dependeDe, 10);
    if (!n || a.status === "Concluído" || a.status === "Cancelado") return "";
    const dep = it.atividades[n - 1];
    if (!dep || dep.status === "Concluído" || dep.status === "Cancelado") return "";
    return `<div class="act-blocked">⏳ Depende da atividade ${n} (“${esc(dep.nome)}”), que está em ${dep.pct}%.</div>`;
  }

  // RACI no próprio cartão: R e A escolhidos aqui; C e I aparecem como resumo (editáveis na matriz).
  function raciChips(it, a) {
    const S = A.store;
    const role = (r) => S.raciPeople(a.raci, r)[0] || "";
    const sel = (r, label) => `
      <label class="raci-pick"><span class="raci-tag raci-${r}" title="${label}">${r}</span>
        <select class="input input-sm ${r === "R" && !role("R") ? "invalid" : ""}" data-raci-role="${r}" data-ini="${esc(it.id)}" data-act="${esc(a.id)}" aria-label="${label} da atividade">
          ${A.ui.peopleOptions(role(r), { blank: r === "R" ? "Escolha o responsável…" : "Sem aprovador" })}
        </select></label>`;
    const others = ["C", "I"].map((r) => {
      const names = S.raciPeople(a.raci, r);
      return names.length ? `<span class="raci-chip"><span class="raci-tag raci-${r}">${r}</span>${esc(names.join(", "))}</span>` : "";
    }).join("");
    return `${sel("R", "Responsável")}${sel("A", "Aprovador")}${others}
      <a href="#raci-${esc(it.id)}" class="small raci-more no-print" data-raci-scroll>+ Consultados / Informados na matriz ↓</a>`;
  }

  function activityRow(it, a, n) {
    const id = esc(a.id);
    const ini = esc(it.id);
    const k = (f) => `data-ini="${ini}" data-act="${id}" data-field="${f}" data-key="${id}:${f}"`;
    return `
      <div class="act ${a.status === "Cancelado" ? "cancelled" : ""} ${a.status === "Concluído" ? "done" : ""}">
        <div class="act-head">
          <span class="act-n muted">${n}</span>
          <textarea class="input act-name" rows="${Math.max(1, Math.ceil(a.nome.length / 70))}" ${k("nome")} aria-label="Nome da atividade">${esc(a.nome)}</textarea>
          <select class="input input-sm act-status" ${k("status")} aria-label="Status da atividade">
            ${A.meta.STATUS.map((s) => `<option ${s === a.status ? "selected" : ""}>${esc(s)}</option>`).join("")}
          </select>
        </div>
        <div class="act-raci">${raciChips(it, a)}
          ${A.store.canDelete(it) ? `<button type="button" class="btn btn-xs btn-danger-ghost no-print" data-del-act="${id}" data-ini="${ini}" style="margin-left:auto">Remover</button>` : ""}
        </div>
        <div class="act-pct">
          <input type="range" min="0" max="100" step="5" value="${a.pct}" ${k("pct")} aria-label="% de conclusão" ${a.status === "Cancelado" ? "disabled" : ""}>
          <output class="act-pct-label" data-pct-label="${id}">${a.pct}%</output>
        </div>
        <div class="act-grid">
          <div class="field act-wide"><label>Entregável (pronto quando)</label><input class="input input-sm" value="${esc(a.entregavel)}" placeholder="O que existe quando a atividade termina" ${k("entregavel")}></div>
          <div class="field"><label>Início</label><input class="input input-sm" value="${esc(a.inicio)}" placeholder="dd/mm/aaaa" ${k("inicio")}></div>
          <div class="field"><label>Prazo</label><input class="input input-sm" value="${esc(a.prazo)}" placeholder="dd/mm/aaaa" ${k("prazo")}></div>
          <div class="field"><label>Depende de</label><select class="input input-sm" ${k("dependeDe")} aria-label="Esta etapa depende de qual outra">
            <option value="">— Nenhuma —</option>
            ${it.atividades.map((x, j) => (x.id === a.id ? "" : `<option value="${j + 1}" ${String(a.dependeDe) === String(j + 1) ? "selected" : ""}>${j + 1}. ${esc(x.nome.length > 45 ? x.nome.slice(0, 45) + "…" : x.nome)}</option>`)).join("")}
          </select></div>
          <div class="field act-obs"><label>Observações</label><textarea class="input input-sm" rows="1" ${k("observacoes")}>${esc(a.observacoes)}</textarea></div>
        </div>
        ${blockedBy(it, a)}
        ${a.status === "Cancelado" ? '<div class="muted small">Cancelada — fora do cálculo do % do projeto (continua registrada).</div>' : ""}
      </div>`;
  }

  // Próximos compromissos (calls/reuniões) ligados ao projeto.
  function projectAgenda(S, it) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const list = S.state.data.compromissos
      .filter((c) => c.projeto === it.id && (S.calc.parseDate(c.data) || 0) >= hoje)
      .sort((a, b) => S.calc.parseDate(a.data) - S.calc.parseDate(b.data) || a.horaInicio.localeCompare(b.horaInicio));
    if (!list.length) return "";
    return `<div class="project-agenda">
      <span class="kpi-label">Próximas reuniões</span>
      ${list.slice(0, 4).map((c) => `<button class="cal-ev pro full" data-cmp-edit="${esc(c.id)}">${esc(c.data)} ${esc(c.horaInicio)} · ${esc(c.titulo)}${c.participantes.length ? ` · ${esc(c.participantes.join(", "))}` : ""}</button>`).join("")}
    </div>`;
  }

  // Pessoas adicionadas à matriz que ainda não têm papel (só na tela; somem se ficarem sem papel).
  const extraTeam = {};

  function raciMatrix(S, it, team) {
    const acts = it.atividades;
    const disponiveis = S.pessoas({ ativas: true }).map((p) => p.nome).filter((n) => !team.includes(n));
    const head = team.map((n) => `<th class="raci-person"><span>${esc(n)}</span></th>`).join("");
    const rows = acts.map((a, i) => {
      const ok = S.raciPeople(a.raci, "R").length === 1;
      const cells = team.map((n) => `
        <td><select class="raci-cell raci-${a.raci[n] || "none"}" data-raci-ini="${esc(it.id)}" data-raci-act="${esc(a.id)}" data-name="${esc(n)}" aria-label="Papel de ${esc(n)} na atividade ${i + 1}">
          <option value="">—</option>${S.RACI_ROLES.map((r) => `<option ${a.raci[n] === r ? "selected" : ""}>${r}</option>`).join("")}
        </select></td>`).join("");
      return `<tr class="${a.status === "Cancelado" ? "muted" : ""}"><th class="raci-act"><span class="raci-ok">${ok ? "✓" : "⚠"}</span> ${i + 1}. ${esc(a.nome)}</th>${cells}</tr>`;
    }).join("");
    return `
      <div class="panel raci-panel" id="raci-${esc(it.id)}" style="margin-top:1.25rem">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">Matriz RACI</h3>
            <div class="raci-legend"><span class="raci-tag raci-R">R</span> Responsável — executa ·
              <span class="raci-tag raci-A">A</span> Aprovador — aprova a entrega ·
              <span class="raci-tag raci-C">C</span> Consultado — participa/opina ·
              <span class="raci-tag raci-I">I</span> Informado — acompanha o status</div>
          </div>
          <select class="input input-sm no-print" data-raci-add="${esc(it.id)}" aria-label="Adicionar pessoa à matriz">
            <option value="">+ Adicionar pessoa…</option>${disponiveis.map((n) => `<option>${esc(n)}</option>`).join("")}
          </select>
        </div>
        ${acts.length && team.length ? `
        <div class="table-wrap">
          <table class="data raci-table">
            <thead><tr><th>Atividade</th>${head}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : ui.empty(acts.length ? "Adicione pessoas para distribuir os papéis." : "Cadastre atividades para montar a matriz.")}
        <div class="muted small" style="margin-top:0.4rem">Cada atividade tem exatamente um <strong>R</strong> e no máximo um <strong>A</strong>. Pessoas novas são cadastradas em Cadastros.</div>
      </div>`;
  }

  /* ---------- Ficha do projeto ---------- */
  const isoDeBr = (br) => { const d = A.store.calc.parseDate(br); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : ""; };
  const brDeIso = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  const RITMO = {
    adiantado: ["🟢", "adiantado", "ok"], "no-ritmo": ["🟢", "no ritmo", "ok"], atencao: ["🟡", "um pouco atrás", "warn"],
    atrasado: ["🔴", "atrasado", "bad"], "nao-comecou": ["⚪", "ainda não começou", ""], concluido: ["✅", "concluído", "ok"],
  };
  let sobreAberto = false;    // "Objetivo, pronto quando e indicador" aberto?
  let detalheAberto = false;  // editor detalhado das etapas aberto?

  // Linha do tempo: do início ao prazo, com os marcos do checklist, a marca de hoje, o feito e o esperado.
  function linhaDoTempo(S, it, r) {
    if (!r.ini || !r.fim || r.fim <= r.ini) {
      return `<div class="ficha-tl vazia muted small">📅 Defina o <strong>início</strong> e o <strong>prazo</strong> para ver a linha do tempo com os marcos.</div>`;
    }
    const total = r.fim - r.ini;
    const pos = (d) => Math.max(0, Math.min(100, ((d - r.ini) / total) * 100));
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
    // Meses no eixo (para projetos longos, enxergar os trimestres).
    const meses = [];
    for (let d = new Date(r.ini.getFullYear(), r.ini.getMonth() + 1, 1); d < r.fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) meses.push(d);
    const passo = meses.length > 8 ? 3 : 1;
    return `
      <div class="ficha-tl" aria-label="Linha do tempo do projeto">
        <div class="ficha-tl-trilho">
          <div class="ficha-tl-feito" style="width:${r.feito}%"></div>
          ${r.esperado != null ? `<div class="ficha-tl-esperado" style="left:${r.esperado}%" title="Esperado hoje: ${r.esperado}%"></div>` : ""}
          ${hoje >= r.ini && hoje <= r.fim ? `<div class="ficha-tl-hoje" style="left:${pos(hoje)}%"><span>hoje</span></div>` : ""}
          ${meses.filter((_, i) => i % passo === 0).map((d) => `<span class="ficha-tl-mes" style="left:${pos(d)}%">${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>`).join("")}
          ${(it.checklist || []).map((m) => {
            const d = S.calc.parseDate(m.data);
            if (!d) return "";
            const cls = m.feito ? "feito" : d < hoje ? "atrasado" : "pendente";
            return `<span class="ficha-tl-marco ${cls}" style="left:${pos(d)}%" title="${esc(`${m.texto} · ${m.data}${m.feito ? " · entregue" : d < hoje ? " · atrasado" : ""}`)}"></span>`;
          }).join("")}
        </div>
        <div class="ficha-tl-pontas"><span>${fmt(r.ini)}</span><span>${fmt(r.fim)}</span></div>
      </div>`;
  }

  function etapaCard(S, it, a, n) {
    const col = S.activityCol(a);
    const r = S.raciPeople(a.raci, "R")[0];
    const ck = a.checklist.length ? `${a.checklist.filter((x) => x.feito).length}/${a.checklist.length}` : "";
    const ROT = { todo: "A fazer", doing: "Fazendo", waiting: "Travado", done: "Feito" };
    return `
      <button class="ficha-etapa ${col} ${a.status === "Cancelado" ? "cancelada" : ""}" data-action="open-activity" data-id="${esc(it.id)}|${esc(a.id)}" title="Abrir a etapa">
        <span class="ficha-etapa-n">${n}</span>
        <span class="ficha-etapa-nome">${esc(a.nome)}</span>
        <span class="ficha-etapa-meta">
          <span class="minha-col ${col}">${a.status === "Cancelado" ? "Cancelada" : ROT[col]}</span>
          ${a.prazo ? `<span>📅 ${esc(a.prazo)}</span>` : ""}
          ${ck ? `<span>☑ ${ck}</span>` : ""}
        </span>
        <span class="act-ring" style="--p:${a.pct}"><b>${a.pct}</b></span>
        <span class="act-av ${r ? "" : "none"}" title="${esc(r ? `Responsável: ${r}` : "Sem responsável")}">${esc(r ? A.util.initials(r) : "?")}</span>
      </button>`;
  }

  A.views.project = function (S, id) {
    const el = document.getElementById("view-projeto");
    const it = S.findInitiative(id);
    if (!it) {
      el.innerHTML = `${breadcrumb([{ label: "Kanban", href: "#kanban" }, { label: "Projeto não encontrado" }])}${ui.empty(`O projeto ${esc(id)} não existe (pode ter sido renomeado ou excluído).`)}`;
      return;
    }
    // Preserva o foco e o que estava sendo digitado quando a tela é redesenhada após salvar.
    const focusKey = document.activeElement?.dataset?.key;
    const rascunho = {
      marco: document.getElementById("marco-novo")?.value || "", marcoData: document.getElementById("marco-data")?.value || "",
      depProj: document.getElementById("dep-proj")?.value || "", depTipo: document.getElementById("dep-tipo")?.value || "",
      focoId: document.activeElement?.id || "",
    };

    const meta = A.area(it.area);
    const { ve } = S.calc;
    const pct = S.calc.progress(it);
    const canFinish = pct === 100 && it.coluna !== "done" && it.status !== "Cancelado";
    const acts = it.atividades;
    const r = S.ritmo(it);
    const rit = RITMO[r.situacao];
    const prox = S.proximoMarco(it);
    const sp = S.sprintAtual();
    const noCiclo = sp && it.ciclo === sp.id;
    const pend = new Set(S.dependenciasPendentes(it).map((d) => d.id));
    const deps = (it.dependencias || []).map((d) => ({ ...d, proj: S.findInitiative(d.id) })).filter((d) => d.proj);
    const libera = S.liberaQuem(it.id);
    // Marcos em ordem de data (os sem data vão para o fim).
    const marcos = [...(it.checklist || [])].sort((a, b) => (S.calc.parseDate(a.data)?.getTime() ?? Infinity) - (S.calc.parseDate(b.data)?.getTime() ?? Infinity));
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dias = r.ini && r.fim ? Math.round((r.fim - r.ini) / 86400000) : null;
    const warns = S.warnings(it);
    const root = it.situacao === "Rascunho" ? { label: "Triagem", href: "#triagem" } : { label: "Kanban", href: "#kanban" };
    const opcoesDep = S.state.data.initiatives
      .filter((x) => x.id !== it.id && x.status !== "Cancelado" && !deps.some((d) => d.id === x.id))
      .sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true }));

    const header = `
      ${breadcrumb([root, { label: `Setor ${esc(meta.key)}`, href: sectorHref(meta.key) }, { label: `${esc(it.id)} · ${esc(it.nome)}` }])}
      <div class="panel ficha" style="--ac:${meta.cor}">
        <div class="ficha-top">
          <span class="ficha-id">${esc(it.id)}</span>
          <div class="ficha-tit">
            <h2>${esc(it.nome)}</h2>
            <div class="ficha-sub">
              ${ui.areaBadge(meta.key)}
              <span class="badge ${{ Rascunho: "warn", Validado: "ok" }[it.situacao] || ""}">${esc(it.situacao)}</span>
              ${noCiclo ? `<span class="badge accent">📋 No ${esc(S.nomeCiclo(sp))}</span>` : `<span class="badge">Fora do ciclo</span>`}
              ${it.estrategico && noCiclo ? `<span class="badge warn" title="${esc(it.estrategicoMotivo)}">⭐ Escolha estratégica</span>` : ""}
              ${it.valor && it.esforco ? `<span class="muted small">V${it.valor} · E${it.esforco} · V÷E ${fmtNum(ve(it))}</span>` : ""}
              ${it.valor && it.esforco ? `<span class="muted small" title="${esc(`(Valor ${it.valor} + Urgência ${it.urgencia || 0} + Destrava ${S.destrava(it)}) ÷ Esforço ${it.esforco}`)}">· Urgência ${it.urgencia ? `${it.urgencia} (${esc(A.meta.URGENCIA_ESCALA[it.urgencia]?.curto || "")})` : "a definir"} · Custo do atraso ÷ E ${fmtNum(S.wsjf(it))}</span>` : ""}
            </div>
          </div>
          <div class="ficha-acoes no-print">
            ${it.situacao === "Rascunho" ? `<button class="btn btn-sm btn-primary" data-action="advance-situacao" data-id="${esc(it.id)}">Validar ✓</button>` : ""}
            ${canFinish ? `<button class="btn btn-sm btn-primary" data-action="finish-project" data-id="${esc(it.id)}">✓ Concluir projeto</button>` : ""}
            <button class="btn btn-sm btn-ghost" data-cmp-new="${esc(it.id)}">+ Reunião</button>
            <button class="btn btn-sm btn-ghost" data-action="new-decision-for" data-id="${esc(it.id)}">+ Decisão</button>
            <button class="btn btn-sm btn-outline" data-action="edit-initiative" data-id="${esc(it.id)}">Editar</button>
          </div>
        </div>

        <div class="ficha-campos">
          <label class="ficha-campo"><span>Líder do projeto</span>
            <select class="input input-sm" data-ficha-campo="responsavel">${ui.peopleOptions(it.responsavel, { blank: "A definir" })}</select></label>
          <label class="ficha-campo"><span>Status</span>
            <select class="input input-sm" data-ficha-campo="status">${A.meta.STATUS.map((s) => `<option ${s === it.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
          <label class="ficha-campo"><span>Semáforo</span>
            <select class="input input-sm" data-ficha-campo="semaforo">${A.meta.SEMAFOROS.map((s) => `<option value="${s.key}" ${s.key === it.semaforo ? "selected" : ""}>${{ verde: "🟢", amarelo: "🟡", vermelho: "🔴" }[s.key]} ${esc(s.label)}</option>`).join("")}</select></label>
          <label class="ficha-campo"><span>Início</span><input type="date" class="input input-sm" data-ficha-campo="inicio" value="${isoDeBr(it.inicio)}"></label>
          <label class="ficha-campo"><span>Prazo</span><input type="date" class="input input-sm" data-ficha-campo="prazo" value="${isoDeBr(it.prazo)}"></label>
          <div class="ficha-campo"><span>Duração</span><strong>${dias != null ? `${dias} dias` : "—"}</strong></div>
        </div>

        <div class="ficha-ritmo ${rit ? rit[2] : ""}">
          <span class="act-ring ficha-anel" style="--p:${r.feito}"><b>${r.feito}%</b></span>
          <div>
            <div class="ficha-ritmo-tit">${r.feito}% feito${r.esperado != null ? ` · esperado hoje: ${r.esperado}%` : ""}${rit ? ` <span class="ficha-ritmo-sit">${rit[0]} ${rit[1]}</span>` : ""}</div>
            <div class="muted small">${r.esperado == null ? "Com início e prazo, o painel compara o feito com o esperado para hoje (um projeto longo não fica “atrasado” só por estar no começo)." : "Comparado com o próprio plano do projeto, do início ao prazo."}</div>
            <div class="ficha-prox">${prox ? `📍 Próximo marco: <strong>${esc(prox.texto)}</strong>${prox.data ? ` · ${esc(prox.data)}${prox.d && prox.d < hoje ? " <span class=\"badge alert\">atrasado</span>" : ""}` : ""}` : marcos.length ? "✅ Todos os marcos entregues" : "Sem marcos ainda: adicione no checklist do projeto."}</div>
          </div>
        </div>
        ${linhaDoTempo(S, it, r)}
        ${warns.length ? `<details class="ficha-avisos"><summary>⚠ ${warns.length} ponto(s) de atenção</summary><ul>${warns.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
      </div>

      <div class="ficha-grid">
        <section class="panel ficha-marcos">
          <div class="panel-head"><h3 class="panel-title">✔ Checklist do projeto</h3><span class="muted small">${marcos.filter((m) => m.feito).length} de ${marcos.length} entregues</span></div>
          <p class="muted small" style="margin-top:0">Os marcos do projeto, cada um com a data de entrega. Aparecem na linha do tempo acima.</p>
          <ul class="ficha-marcos-lista">
            ${marcos.map((m) => {
              const d = S.calc.parseDate(m.data);
              return `
                <li class="${m.feito ? "feito" : ""} ${!m.feito && d && d < hoje ? "atrasado" : ""}">
                  <input type="checkbox" data-marco-feito="${esc(m.id)}" ${m.feito ? "checked" : ""} aria-label="Entregue">
                  <input class="marco-texto" data-marco-texto="${esc(m.id)}" data-key="mt:${esc(m.id)}" value="${esc(m.texto)}" aria-label="Marco">
                  <input type="date" class="marco-data" data-marco-data="${esc(m.id)}" value="${isoDeBr(m.data)}" aria-label="Data de entrega">
                  <button class="raci-x no-print" data-marco-del="${esc(m.id)}" title="Remover">✕</button>
                </li>`;
            }).join("") || `<li class="muted small">Nenhum marco ainda.</li>`}
          </ul>
          <form class="ficha-add no-print" id="marco-form" data-ini="${esc(it.id)}" autocomplete="off">
            <input class="input input-sm" id="marco-novo" placeholder="Novo marco (ex.: escopo aprovado)" value="${esc(rascunho.marco)}">
            <input type="date" class="input input-sm" id="marco-data" value="${esc(rascunho.marcoData)}" aria-label="Data de entrega">
            <button class="btn btn-sm btn-primary" type="submit">+ Marco</button>
          </form>
        </section>

        <section class="panel ficha-deps">
          <div class="panel-head"><h3 class="panel-title">🔗 Dependências</h3></div>
          <div class="muted small">Este projeto só começa depois que…</div>
          <ul class="ficha-deps-lista">
            ${deps.map((d) => `
              <li class="${pend.has(d.id) ? "pendente" : "ok"}">
                <span class="pr-id" style="--ac:${A.area(d.proj.area).cor}">${esc(d.id)}</span>
                <button class="link-btn" data-action="open-project" data-id="${esc(d.id)}">${esc(d.proj.nome)}</button>
                <span class="ficha-dep-tipo">${d.tipo === "SS" ? "começar" : "terminar"}</span>
                <span title="${pend.has(d.id) ? "Ainda não aconteceu" : "Já aconteceu"}">${pend.has(d.id) ? "⏳" : "✓"}</span>
                <button class="raci-x no-print" data-dep-del="${esc(d.id)}" title="Remover dependência">✕</button>
              </li>`).join("") || `<li class="muted small">Não depende de nenhum projeto.</li>`}
          </ul>
          <form class="ficha-add no-print" id="dep-form" data-ini="${esc(it.id)}">
            <select class="input input-sm" id="dep-proj" aria-label="Projeto">
              <option value="">Escolha o projeto…</option>
              ${opcoesDep.map((x) => `<option value="${esc(x.id)}" ${x.id === rascunho.depProj ? "selected" : ""}>${esc(x.id)} · ${esc(x.nome.length > 40 ? x.nome.slice(0, 40) + "…" : x.nome)}</option>`).join("")}
            </select>
            <select class="input input-sm" id="dep-tipo" aria-label="Tipo">
              <option value="FS" ${rascunho.depTipo !== "SS" ? "selected" : ""}>terminar</option>
              <option value="SS" ${rascunho.depTipo === "SS" ? "selected" : ""}>começar</option>
            </select>
            <button class="btn btn-sm btn-outline" type="submit">+ Dependência</button>
          </form>
          ${libera.length ? `<div class="ficha-libera"><span class="muted small">Quando este projeto andar, ele libera:</span>
            ${libera.map((x) => `<button class="pr-id ficha-libera-chip" style="--ac:${A.area(x.area).cor}" data-action="open-project" data-id="${esc(x.id)}" title="${esc(x.nome)}">${esc(x.id)}</button>`).join("")}</div>` : ""}
        </section>
      </div>

      <details class="panel ficha-sobre" id="ficha-sobre" ${sobreAberto ? "open" : ""}>
        <summary>📄 Objetivo, pronto quando e indicador</summary>
        <dl class="project-brief">
          <div><dt>Objetivo</dt><dd>${esc(it.objetivo || "—")}</dd></div>
          <div><dt>Pronto quando</dt><dd>${esc(it.prontoQuando || "—")}</dd></div>
          <div><dt>Indicador de sucesso</dt><dd>${esc(it.indicador || "—")}</dd></div>
          ${it.observacoes ? `<div><dt>Observações</dt><dd>${esc(it.observacoes)}</dd></div>` : ""}
        </dl>
        <button class="btn btn-xs btn-outline no-print" data-action="edit-initiative" data-id="${esc(it.id)}">Editar estes textos</button>
      </details>

      <section class="ficha-etapas" style="--ac:${meta.cor}">
        <div class="panel-head"><h3 class="panel-title">Etapas (${acts.length})</h3><span class="muted small">Clique numa etapa para ver o checklist, o prazo e o responsável.</span></div>
        <div class="ficha-etapas-grid">${acts.map((a, i) => etapaCard(S, it, a, i + 1)).join("") || ui.empty("Nenhuma etapa ainda. Adicione a primeira abaixo.")}</div>
        <form class="act-new no-print" data-ini="${esc(it.id)}" id="act-new-form">
          <input class="input" id="act-new-name" placeholder="Nova etapa…" autocomplete="off" aria-label="Nome da nova etapa">
          <button class="btn btn-primary" type="submit">+ Adicionar etapa</button>
        </form>
      </section>`;

    // O editor detalhado só é redesenhado quando muda a estrutura, o % ou o status das etapas;
    // edições de texto não o redesenham, para não tirar o foco de quem está digitando.
    const team = [...new Set([...(it.responsavel ? [it.responsavel] : []), ...S.projectTeam(it), ...(extraTeam[it.id] || [])])];
    const sig = `${it.id}|${it.situacao}|${team.join(",")}|` + acts.map((a) => `${a.id}:${a.pct}:${a.status}:${S.raciText(a.raci)}`).join(",");
    const fullSig = sig + JSON.stringify(acts.map((a) => [a.nome, a.entregavel, a.inicio, a.prazo, a.dependeDe, a.observacoes]));
    const editing = !!document.activeElement?.closest?.("#act-list");
    if (el.dataset.sig === sig && (el.dataset.fullSig === fullSig || editing) && el.querySelector("#project-header")) {
      el.querySelector("#project-header").innerHTML = header;
      el.dataset.fullSig = fullSig;
    } else {
      el.dataset.sig = sig;
      el.dataset.fullSig = fullSig;
      el.innerHTML = `
        <div id="project-header">${header}</div>
        <details class="panel ficha-detalhe" id="act-detalhe" ${detalheAberto ? "open" : ""}>
          <summary>✏️ Editar as etapas em detalhe (entregável, início, dependência entre etapas e RACI)</summary>
          <div class="stack" id="act-list">
            ${acts.length ? acts.map((a, i) => activityRow(it, a, i + 1)).join("") : ui.empty("Nenhuma etapa cadastrada.")}
          </div>
          ${raciMatrix(S, it, team)}
        </details>`;
    }

    if (focusKey) el.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
    if (rascunho.focoId) document.getElementById(rascunho.focoId)?.focus();
  };
  /* ---------- Eventos de edição das atividades (delegados, registrados uma vez) ---------- */
  function liveProjectBar(iniId, actId, value) {
    // Prévia instantânea enquanto o controle é arrastado; o salvamento acontece ao soltar.
    const it = A.store.findInitiative(iniId);
    if (!it) return;
    const acts = it.atividades.filter((a) => a.status !== "Cancelado");
    if (!acts.length) return;
    const sum = acts.reduce((s, a) => s + (a.id === actId ? Number(value) : a.pct), 0);
    const bar = document.getElementById("project-pbar");
    if (bar) bar.innerHTML = ui.progressBar(Math.round(sum / acts.length), { size: "xl" });
  }

  async function saveField(el) {
    const S = A.store;
    const { ini, act, field } = el.dataset;
    const value = field === "pct" ? Number(el.value) : el.value;
    const before = S.findActivity(ini, act);
    if (!before) return;
    const r = S.saveActivity(ini, act, { [field]: value });
    if (!r.ok) {
      A.util.toast(r.error, "error");
      S.emit();
      return;
    }
    if (r.unchanged) return;
    // Atividade em 100% sugere status Concluído (o usuário confirma).
    if (field === "pct" && value === 100 && r.item.status !== "Concluído") {
      const ok = await A.util.confirmDialog(`“${r.item.nome}” chegou a 100%. Marcar a atividade como Concluída?`,
        { title: "Atividade concluída?", okLabel: "Marcar como Concluída" });
      if (ok) S.saveActivity(ini, act, { status: "Concluído" });
    }
    const it = S.findInitiative(ini);
    if (S.calc.progress(it) === 100 && it.coluna !== "done" && it.status !== "Cancelado") {
      A.util.toast(`${it.id} chegou a 100%. Use “Mover para Feito” para concluir no Kanban.`, "ok", 5000);
    }
  }

  // Projeto aberto na ficha (o formulário de marcos carrega o ID).
  const fichaId = () => document.getElementById("marco-form")?.dataset.ini;
  function salvarProjeto(patch, msg) {
    const id = fichaId();
    if (!id) return;
    const r = A.store.saveInitiative(patch, id, { source: "Ficha do projeto" });
    if (!r.ok) { A.util.toast(r.error, "error"); A.store.emit(); }
    else if (msg && !r.unchanged) A.util.toast(msg);
  }
  const marcosAtuais = () => (A.store.findInitiative(fichaId())?.checklist || []).map((m) => ({ ...m }));

  function initFichaEvents() {
    document.addEventListener("change", (e) => {
      const el = e.target;
      if (!el.closest?.("#view-projeto")) return;
      if (el.dataset.fichaCampo) {
        const campo = el.dataset.fichaCampo;
        const valor = el.type === "date" ? brDeIso(el.value) : el.value;
        return salvarProjeto({ [campo]: valor });
      }
      const marco = el.dataset.marcoFeito || el.dataset.marcoTexto || el.dataset.marcoData;
      if (marco) {
        const lista = marcosAtuais().map((m) => {
          if (m.id !== marco) return m;
          if (el.dataset.marcoFeito) return { ...m, feito: el.checked };
          if (el.dataset.marcoTexto) return { ...m, texto: el.value.trim() || m.texto };
          return { ...m, data: brDeIso(el.value) };
        });
        salvarProjeto({ checklist: lista }, el.dataset.marcoFeito && el.checked ? "Marco entregue ✓" : "");
      }
    });
    document.addEventListener("click", (e) => {
      const delM = e.target.closest?.("[data-marco-del]");
      if (delM) return salvarProjeto({ checklist: marcosAtuais().filter((m) => m.id !== delM.dataset.marcoDel) });
      const delD = e.target.closest?.("[data-dep-del]");
      if (delD) {
        const it = A.store.findInitiative(fichaId());
        return salvarProjeto({ dependencias: (it.dependencias || []).filter((d) => d.id !== delD.dataset.depDel) }, "Dependência removida.");
      }
    });
    document.addEventListener("submit", (e) => {
      const form = e.target;
      if (form.id === "marco-form") {
        e.preventDefault();
        const texto = document.getElementById("marco-novo").value.trim();
        if (!texto) return document.getElementById("marco-novo").focus();
        const data = brDeIso(document.getElementById("marco-data").value);
        document.getElementById("marco-novo").value = "";
        document.getElementById("marco-data").value = "";
        salvarProjeto({ checklist: [...marcosAtuais(), { texto, data, feito: false }] }, "Marco adicionado.");
        setTimeout(() => document.getElementById("marco-novo")?.focus(), 0);
      }
      if (form.id === "dep-form") {
        e.preventDefault();
        const dep = document.getElementById("dep-proj").value;
        if (!dep) return document.getElementById("dep-proj").focus();
        const tipo = document.getElementById("dep-tipo").value;
        const it = A.store.findInitiative(fichaId());
        // Evita o círculo "A depende de B e B depende de A".
        const outro = A.store.findInitiative(dep);
        if ((outro?.dependencias || []).some((d) => d.id === it.id)) return A.util.toast(`${dep} já depende de ${it.id}: não dá para os dois dependerem um do outro.`, "error", 6000);
        document.getElementById("dep-proj").value = "";
        salvarProjeto({ dependencias: [...(it.dependencias || []), { id: dep, tipo }] }, "Dependência adicionada.");
      }
    });
    // Lembra se as seções recolhíveis estavam abertas (a tela é redesenhada a cada alteração).
    document.addEventListener("toggle", (e) => {
      if (e.target.id === "ficha-sobre") sobreAberto = e.target.open;
      if (e.target.id === "act-detalhe") detalheAberto = e.target.open;
    }, true);
  }

  function initActivityEvents() {
    initFichaEvents();
    document.addEventListener("input", (e) => {
      const el = e.target;
      if (el.matches?.('#view-projeto input[type="range"][data-field="pct"]')) {
        document.querySelector(`[data-pct-label="${CSS.escape(el.dataset.act)}"]`).textContent = `${el.value}%`;
        liveProjectBar(el.dataset.ini, el.dataset.act, el.value);
      }
    });
    document.addEventListener("change", (e) => {
      const el = e.target;
      if (!el.closest?.("#view-projeto")) return;
      const S = A.store;
      if (el.dataset.act && el.dataset.field) return saveField(el);
      if (el.dataset.raciRole) {
        // Escolha de R/A no cartão: vazio remove quem tinha o papel; outra pessoa assume (R e A são únicos).
        const { ini, act, raciRole: roleKey } = el.dataset;
        const atual = S.raciPeople(S.findActivity(ini, act)?.raci, roleKey)[0];
        const r = el.value ? S.setRaci(ini, act, el.value, roleKey) : (atual ? S.setRaci(ini, act, atual, "") : { ok: true });
        if (!r.ok) { A.util.toast(r.error, "error"); S.emit(); }
        else if (!r.unchanged && el.value) A.util.toast(`${el.value} é ${roleKey === "R" ? "o responsável (R)" : "o aprovador (A)"} da atividade.`);
        return;
      }
      if (el.dataset.raciAct) {
        const r = S.setRaci(el.dataset.raciIni, el.dataset.raciAct, el.dataset.name, el.value);
        if (!r.ok) { A.util.toast(r.error, "error"); S.emit(); }
        return;
      }
      if (el.dataset.raciAdd && el.value) {
        (extraTeam[el.dataset.raciAdd] ||= []).push(el.value);
        document.getElementById("view-projeto").dataset.sig = ""; // força redesenhar a matriz
        A.views.project(S, el.dataset.raciAdd);
      }
    });
    document.addEventListener("click", async (e) => {
      const link = e.target.closest?.("[data-raci-scroll]");
      if (link) {
        e.preventDefault(); // só rola até a matriz, sem mudar a rota
        document.querySelector(link.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const b = e.target.closest?.("[data-del-act]");
      if (!b) return;
      const S = A.store;
      const a = S.findActivity(b.dataset.ini, b.dataset.delAct);
      if (!a) return;
      if (!(await A.util.confirmDialog(`Remover a atividade “${a.nome}” deste rascunho?`, { title: "Remover atividade", okLabel: "Remover", danger: true }))) return;
      const r = S.deleteActivity(b.dataset.ini, b.dataset.delAct);
      if (!r.ok) A.util.toast(r.error, "error");
    });
    document.addEventListener("submit", (e) => {
      const form = e.target;
      if (form.id !== "act-new-form") return;
      e.preventDefault();
      const input = document.getElementById("act-new-name");
      const nome = input.value.trim();
      if (!nome) return input.focus();
      const resp = A.store.findInitiative(form.dataset.ini)?.responsavel;
      // A nova atividade começa com o responsável do projeto como R (ajustável na matriz RACI).
      const r = A.store.saveActivity(form.dataset.ini, null, { nome, raci: resp ? { [resp]: "R" } : {} });
      if (!r.ok) return A.util.toast(r.error, "error");
      A.util.toast("Atividade adicionada.");
      document.getElementById("act-new-name")?.focus();
    });
  }

  A.drill = { initActivityEvents, sectorHref, projectHref };
})();
