/* Painel Executivo: KPIs, iniciativas em andamento, riscos, pauta e progresso por onda. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum } = A.util;

  const ui = (A.ui = A.ui || {});
  ui.areaBadge = (area, label) => `<span class="area-badge ${A.area(area).cls}">${esc(label ?? area)}</span>`;
  ui.dot = (sem) => {
    const s = A.meta.SEMAFOROS.find((x) => x.key === sem) || A.meta.SEMAFOROS[0];
    return `<span class="dot ${s.key}" title="${esc(s.label + " — " + s.desc)}" aria-label="Semáforo ${esc(s.label)}"></span>`;
  };
  ui.decisionBadge = (status) =>
    `<span class="badge ${status === "Pendente" ? "alert" : "ok"}">${esc(status)}</span>`;
  ui.empty = (msg) => `<div class="empty">${msg}</div>`;

  function renderKPIs(S) {
    const all = S.state.data.initiatives;
    const inProgress = all.filter((i) => i.status === "Em andamento");
    const active = all.filter((i) => i.status !== "Cancelado");
    const done = all.filter((i) => i.status === "Concluído");
    const yellow = all.filter((i) => i.status !== "Concluído" && i.status !== "Cancelado" && i.semaforo === "amarelo");
    const red = all.filter((i) => i.status !== "Concluído" && i.status !== "Cancelado" && i.semaforo === "vermelho");
    const pending = S.state.data.decisions.filter((d) => d.status === "Pendente");
    const { WIP_MIN, WIP_MAX } = A.meta;
    const wipOver = inProgress.length > WIP_MAX;
    const pct = active.length ? Math.round((done.length / active.length) * 100) : 0;
    const flowPcts = inProgress.map(S.calc.progress).filter((p) => p != null);
    const flowAvg = flowPcts.length ? Math.round(flowPcts.reduce((s, p) => s + p, 0) / flowPcts.length) : null;

    document.getElementById("kpi-grid").innerHTML = `
      <div class="panel kpi">
        <div class="kpi-label">Iniciativas em andamento (WIP)</div>
        <div class="kpi-value">${inProgress.length}</div>
        <div class="kpi-sub ${wipOver ? "bad" : "good"}">${wipOver ? `Acima do limite ideal (${WIP_MIN} a ${WIP_MAX})` : `Dentro do limite (${WIP_MIN} a ${WIP_MAX})`}</div>
      </div>
      <div class="panel kpi">
        <div class="kpi-label">Progresso geral (${active.length} iniciativas ativas)</div>
        <div class="kpi-value">${pct}%</div>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="kpi-sub">${done.length} concluídas · ${inProgress.length} em curso${flowAvg != null ? ` · avanço médio das em curso: <strong>${flowAvg}%</strong>` : ""}</div>
      </div>
      <div class="panel kpi">
        <div class="kpi-label">Semáforo de atenção / risco</div>
        <div class="kpi-value" style="color:${red.length ? "var(--alert)" : yellow.length ? "var(--warn)" : "var(--ok)"}">${yellow.length + red.length}</div>
        <div class="kpi-sub"><strong style="color:var(--alert)">${red.length}</strong> vermelhos · <strong style="color:var(--warn)">${yellow.length}</strong> amarelos</div>
      </div>
      <div class="panel kpi">
        <div class="kpi-label">Decisões da diretoria</div>
        <div class="kpi-value" style="color:var(--accent)">${pending.length}</div>
        <div class="kpi-sub">pendentes de alinhamento</div>
      </div>`;
  }

  function renderInProgress(S) {
    const list = S.state.data.initiatives.filter((i) => i.status === "Em andamento");
    const el = document.getElementById("exec-in-progress");
    if (!list.length) {
      el.innerHTML = ui.empty("Nenhuma iniciativa em andamento. Arraste cards para “Fazendo” no Kanban.");
      return;
    }
    const order = { vermelho: 0, amarelo: 1, verde: 2 };
    list.sort((a, b) => order[a.semaforo] - order[b.semaforo]);
    el.innerHTML = list.map((it) => `
      <div class="list-item">
        <div class="li-main">
          ${ui.dot(it.semaforo)}
          <div style="min-width:0">
            <div class="li-title">${esc(it.id)} · ${esc(it.nome)}
              ${it.coluna === "waiting" ? '<span class="badge warn">Esperando</span>' : ""}
              ${it.enabler ? '<span class="badge enabler">Habilitadora</span>' : ""}
            </div>
            <div class="li-meta">
              ${ui.areaBadge(it.area)}
              <span>Resp.: <strong>${esc(it.responsavel || "A definir")}</strong></span>
              <span>Prazo: <strong>${esc(it.prazo || "—")}</strong></span>
              ${it.observacoes ? `<em>${esc(it.observacoes)}</em>` : ""}
            </div>
            <div style="margin-top:0.4rem; max-width:340px">${ui.progressBar(S.calc.progress(it))}</div>
          </div>
        </div>
        <span class="actions no-print">
          <a class="btn btn-xs btn-primary" href="${A.drill.projectHref(it.id)}" data-nav>Atividades</a>
          <button class="btn btn-xs btn-outline" data-action="edit-initiative" data-id="${esc(it.id)}">Editar</button>
        </span>
      </div>`).join("");
  }

  function renderRisks(S) {
    const atRisk = S.state.data.initiatives.filter(
      (i) => i.status !== "Concluído" && i.status !== "Cancelado" && (i.semaforo === "amarelo" || i.semaforo === "vermelho")
    );
    atRisk.sort((a, b) => (a.semaforo === "vermelho" ? -1 : 1) - (b.semaforo === "vermelho" ? -1 : 1));
    document.getElementById("exec-risks").innerHTML = atRisk.length
      ? atRisk.map((r) => `
        <div class="risk-item ${r.semaforo}" data-action="edit-initiative" data-id="${esc(r.id)}" role="button" tabindex="0">
          ${ui.dot(r.semaforo)}
          <div><strong>${esc(r.id)} · ${esc(r.nome)}</strong>
            <div class="muted small">${esc(r.observacoes || "Atenção necessária com prazo ou recursos")}</div>
          </div>
        </div>`).join("")
      : `<div style="color:var(--ok); font-size:0.88rem;">Nenhuma iniciativa travada ou em atenção no momento.</div>`;
  }

  function renderDecisionsSnippet(S) {
    const pending = S.state.data.decisions.filter((d) => d.status === "Pendente");
    const el = document.getElementById("exec-decisions");
    el.innerHTML = pending.length
      ? pending.slice(0, 4).map((d) => `
        <div class="dec-snippet" data-action="edit-decision" data-id="${esc(d.id)}" role="button" tabindex="0">
          <div class="row" style="justify-content:space-between">
            <strong>${esc(d.quem || "—")}</strong>
            <span class="row">${d.grupo ? `<span class="badge accent">${esc(d.grupo)}</span>` : ""}${ui.decisionBadge(d.status)}</span>
          </div>
          <div style="margin-top:2px">${esc(d.pauta)}</div>
        </div>`).join("") + (pending.length > 4 ? `<div class="muted small">+ ${pending.length - 4} pendências</div>` : "")
      : `<div class="muted small">Todas as decisões da diretoria estão em dia.</div>`;
  }

  function renderWaveProgress(S) {
    const all = S.state.data.initiatives;
    document.getElementById("exec-waves").innerHTML = A.meta.ONDAS.map((o) => {
      const items = all.filter((i) => i.onda === o.key && i.status !== "Cancelado");
      const done = items.filter((i) => i.status === "Concluído").length;
      const doing = items.filter((i) => i.status === "Em andamento").length;
      const pct = items.length ? Math.round((done / items.length) * 100) : 0;
      return `
        <div class="wave-progress" title="${done} concluídas · ${doing} em andamento · ${items.length} no total">
          <strong>${esc(o.key)}</strong>
          <div class="progress"><span style="width:${pct}%; background:${o.color}"></span></div>
          <span class="muted nowrap">${done}/${items.length} · ${pct}%</span>
        </div>`;
    }).join("");
  }

  function renderHeader(S) {
    const wip = S.calc.wipCount();
    const pill = document.getElementById("wip-pill");
    const over = wip > A.meta.WIP_MAX;
    pill.className = `wip-pill ${over ? "warn" : "ok"}`;
    pill.innerHTML = `Em andamento: <strong>${wip}</strong> <span class="small">${over ? `(acima de ${A.meta.WIP_MAX})` : "(no limite)"}</span>`;

    const pending = S.state.data.decisions.filter((d) => d.status === "Pendente").length;
    const decCount = document.getElementById("tab-count-decisoes");
    decCount.textContent = pending;
    decCount.className = `tab-count ${pending ? "alert" : ""}`;
    document.getElementById("tab-count-ranking").textContent = S.filtered().length;

    const cut = S.calc.cutoff();
    document.getElementById("footer-cutoff").textContent =
      `Linha de corte atual: Σ Valor ${cut.sumValor} ÷ Σ Esforço ${cut.sumEsforco} = ${fmtNum(cut.value)}`;
  }

  A.views = A.views || {};
  A.views.executive = function (S) {
    renderHeader(S);
    renderKPIs(S);
    renderInProgress(S);
    renderRisks(S);
    renderDecisionsSnippet(S);
    renderWaveProgress(S);
  };
})();
