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
          <div class="field"><label>Depende de (Nº)</label><input class="input input-sm" value="${esc(a.dependeDe)}" placeholder="—" ${k("dependeDe")}></div>
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
      <span class="kpi-label">Próximos compromissos</span>
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

  A.views.project = function (S, id) {
    const el = document.getElementById("view-projeto");
    const it = S.findInitiative(id);
    if (!it) {
      el.innerHTML = `${breadcrumb([{ label: "Kanban", href: "#kanban" }, { label: "Projeto não encontrado" }])}${ui.empty(`O projeto ${esc(id)} não existe (pode ter sido renomeado ou excluído).`)}`;
      return;
    }
    // Preserva o foco do campo em edição quando a tela é redesenhada após salvar.
    const focusKey = document.activeElement?.dataset?.key;

    const meta = A.area(it.area);
    const { ve, progress, isAboveCut } = S.calc;
    const pct = progress(it);
    const col = A.meta.COLUNAS.find((c) => c.key === it.coluna);
    const sem = A.meta.SEMAFOROS.find((s) => s.key === it.semaforo);
    const canFinish = pct === 100 && it.coluna !== "done" && it.status !== "Cancelado";
    const acts = it.atividades;
    const counted = acts.filter((a) => a.status !== "Cancelado");

    const warns = S.warnings(it);
    const nextSit = { Rascunho: "Validar ✓", Validado: "Aprovar para onda ✓" }[it.situacao];
    // Rascunhos ainda não estão no Kanban: o caminho começa na Triagem.
    const root = it.situacao === "Rascunho" ? { label: "Triagem", href: "#triagem" } : { label: "Kanban", href: "#kanban" };
    const header = `
      ${breadcrumb([root, { label: `Setor ${esc(meta.key)}`, href: sectorHref(meta.key) }, { label: `${esc(it.id)} · ${esc(it.nome)}` }])}
      <div class="panel project-head" style="--sector-color:${meta.cor}">
        <div class="row" style="justify-content:space-between; align-items:flex-start">
          <div style="min-width:0">
            <div class="row">${ui.areaBadge(meta.key)} ${statusBadge(it.status)}
              <span class="badge ${{ Rascunho: "warn", Validado: "ok" }[it.situacao] || ""}">${esc(it.situacao)}</span>
              ${it.enabler ? '<span class="badge enabler">★ Habilitadora</span>' : ""}</div>
            <h2 class="project-title"><span style="color:var(--accent)">${esc(it.id)}</span> · ${esc(it.nome)}</h2>
          </div>
          <div class="row no-print">
            ${nextSit ? `<button class="btn btn-sm btn-primary" data-action="advance-situacao" data-id="${esc(it.id)}">${nextSit}</button>` : ""}
            <button class="btn btn-sm btn-outline" data-action="edit-initiative" data-id="${esc(it.id)}">Editar dados</button>
            <button class="btn btn-sm btn-ghost" data-action="new-decision-for" data-id="${esc(it.id)}">+ Decisão</button>
            <button class="btn btn-sm btn-ghost" data-cmp-new="${esc(it.id)}">+ Compromisso</button>
            ${S.canDelete(it) ? `<button class="btn btn-sm btn-danger-ghost" data-action="delete-initiative" data-id="${esc(it.id)}">Excluir rascunho</button>` : ""}
          </div>
        </div>
        ${warns.length ? `<ul class="pf-warn project-warn">${warns.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${projectAgenda(S, it)}
        <dl class="project-facts">
          <div><dt>Valor</dt><dd>${it.valor}</dd></div>
          <div><dt>Esforço</dt><dd>${it.esforco}</dd></div>
          <div><dt>V ÷ E</dt><dd style="color:${isAboveCut(it) ? "var(--ok)" : "inherit"}">${fmtNum(ve(it))}</dd></div>
          <div><dt>Onda</dt><dd>${esc(it.onda)}</dd></div>
          <div><dt>Kanban</dt><dd>${esc(col ? col.label : "—")}</dd></div>
          <div><dt>Responsável</dt><dd>${esc(it.responsavel || "A definir")}</dd></div>
          <div><dt>Prazo</dt><dd>${esc(it.prazo || "—")}</dd></div>
          <div><dt>Semáforo</dt><dd class="row" style="gap:0.35rem">${ui.dot(it.semaforo)} ${esc(sem.label)}</dd></div>
          ${it.investimento === "Sim" ? `<div><dt>Investimento</dt><dd>Exige investimento</dd></div>` : ""}
        </dl>
        ${it.objetivo || it.prontoQuando || it.indicador ? `
        <dl class="project-brief">
          ${it.objetivo ? `<div><dt>Objetivo</dt><dd>${esc(it.objetivo)}</dd></div>` : ""}
          ${it.prontoQuando ? `<div><dt>Pronto quando</dt><dd>${esc(it.prontoQuando)}</dd></div>` : ""}
          ${it.indicador ? `<div><dt>Indicador de sucesso</dt><dd>${esc(it.indicador)}</dd></div>` : ""}
        </dl>` : ""}
        <div class="project-progress">
          <div class="row" style="justify-content:space-between">
            <span class="kpi-label">Conclusão do projeto <span class="muted">(média de ${counted.length} atividade${counted.length === 1 ? "" : "s"}, calculada automaticamente)</span></span>
            ${canFinish ? `<button class="btn btn-sm btn-primary no-print" data-action="finish-project" data-id="${esc(it.id)}">✓ Mover para “Feito”</button>` : ""}
          </div>
          <div id="project-pbar">${ui.progressBar(pct, { size: "xl" })}</div>
        </div>
        ${it.observacoes ? `<div class="muted small" style="margin-top:0.6rem">${esc(it.observacoes)}</div>` : ""}
      </div>`;

    // A lista só é redesenhada quando muda a estrutura, o % ou o status das atividades;
    // edições de texto não a redesenham, para não tirar o foco de quem está digitando.
    const team = [...new Set([...(it.responsavel ? [it.responsavel] : []), ...S.projectTeam(it), ...(extraTeam[it.id] || [])])];
    const sig = `${it.id}|${it.situacao}|${team.join(",")}|` + acts.map((a) => `${a.id}:${a.pct}:${a.status}:${S.raciText(a.raci)}`).join(",");
    const fullSig = sig + JSON.stringify(acts.map((a) => [a.nome, a.entregavel, a.inicio, a.prazo, a.dependeDe, a.observacoes]));
    const editing = !!document.activeElement?.closest?.("#act-list");
    if (el.dataset.sig === sig && (el.dataset.fullSig === fullSig || editing) && el.querySelector("#project-header")) {
      el.querySelector("#project-header").innerHTML = header;
      el.dataset.fullSig = fullSig;
      return;
    }
    el.dataset.sig = sig;
    el.dataset.fullSig = fullSig;

    el.innerHTML = `
      <div id="project-header">${header}</div>
      <div class="page-head" style="margin-top:1.25rem">
        <div>
          <h3 class="panel-title">Atividades (<span id="act-count">${acts.length}</span>)</h3>
          <div class="muted small">Arraste o controle para registrar o avanço. Atividades não são apagadas: use “Cancelado” para tirá-las do cálculo.</div>
        </div>
      </div>
      <div class="stack" id="act-list">
        ${acts.length ? acts.map((a, i) => activityRow(it, a, i + 1)).join("") : ui.empty("Nenhuma atividade cadastrada. Adicione a primeira abaixo ou importe a aba 2_Atividades da planilha.")}
      </div>
      <form class="act-new no-print" data-ini="${esc(it.id)}" id="act-new-form">
        <input class="input" id="act-new-name" placeholder="Nova atividade…" autocomplete="off" aria-label="Nome da nova atividade">
        <button class="btn btn-primary" type="submit">+ Adicionar atividade</button>
      </form>
      ${raciMatrix(S, it, team)}`;

    if (focusKey) {
      const f = el.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
      if (f) f.focus();
    }
  };

  /* ---------- Eventos de edição das atividades (delegados, registrados uma vez) ---------- */
  function liveProjectBar(iniId, actId, value) {
    // Prévia instantânea enquanto o controle é arrastado; o salvamento acontece ao soltar.
    const it = A.store.findInitiative(iniId);
    if (!it) return;
    const acts = it.atividades.filter((a) => a.status !== "Cancelado");
    if (!acts.length) return;
    const sum = acts.reduce((s, a) => s + (a.id === actId ? Number(value) : a.pct), 0);
    document.getElementById("project-pbar").innerHTML = ui.progressBar(Math.round(sum / acts.length), { size: "xl" });
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

  function initActivityEvents() {
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
