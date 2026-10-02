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
      <div class="panel sector-head" style="--sector-color:${meta.color}">
        <div class="row" style="justify-content:space-between; align-items:flex-start">
          <div>
            <div class="row">${ui.areaBadge(meta.key)}<span class="muted small">Setor</span></div>
            <h2 class="sector-title">${esc(meta.key)}</h2>
          </div>
          <div class="row no-print">
            ${A.meta.AREAS.filter((a) => a.key !== meta.key).map((a) =>
              `<a class="btn btn-xs btn-outline" href="${sectorHref(a.key)}" data-nav>${esc(a.key)}</a>`).join("")}
          </div>
        </div>
        <div class="sector-stats">
          <div><div class="kpi-label">Iniciativas</div><div class="kpi-value">${active.length}</div><div class="kpi-sub">${done} concluídas${list.length !== active.length ? ` · ${list.length - active.length} canceladas` : ""}</div></div>
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
        }).join("") : ui.empty("Nenhuma iniciativa neste setor.")}
      </div>`;
  };

  /* ---------- Projeto ---------- */
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
        <div class="act-pct">
          <input type="range" min="0" max="100" step="5" value="${a.pct}" ${k("pct")} aria-label="% de conclusão" ${a.status === "Cancelado" ? "disabled" : ""}>
          <output class="act-pct-label" data-pct-label="${id}">${a.pct}%</output>
        </div>
        <div class="act-grid">
          <div class="field"><label>Responsável</label><input class="input input-sm" list="people-list" value="${esc(a.responsavel)}" placeholder="A definir" ${k("responsavel")}></div>
          <div class="field"><label>Prazo</label><input class="input input-sm" value="${esc(a.prazo)}" placeholder="ex.: 30/Nov/2026" ${k("prazo")}></div>
          <div class="field act-obs"><label>Observações</label><textarea class="input input-sm" rows="1" ${k("observacoes")}>${esc(a.observacoes)}</textarea></div>
        </div>
        ${a.status === "Cancelado" ? '<div class="muted small">Cancelada — fora do cálculo do % do projeto (continua registrada).</div>' : ""}
      </div>`;
  }

  A.views.project = function (S, id) {
    const el = document.getElementById("view-projeto");
    const it = S.findInitiative(id);
    if (!it) {
      el.innerHTML = `${breadcrumb([{ label: "Kanban", href: "#kanban" }, { label: "Projeto não encontrado" }])}${ui.empty(`A iniciativa ${esc(id)} não existe (pode ter sido renomeada ou excluída).`)}`;
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

    const header = `
      ${breadcrumb([{ label: "Kanban", href: "#kanban" }, { label: `Setor ${esc(meta.key)}`, href: sectorHref(meta.key) }, { label: `${esc(it.id)} · ${esc(it.nome)}` }])}
      <div class="panel project-head" style="--sector-color:${meta.color}">
        <div class="row" style="justify-content:space-between; align-items:flex-start">
          <div style="min-width:0">
            <div class="row">${ui.areaBadge(meta.key)} ${statusBadge(it.status)} ${it.enabler ? '<span class="badge enabler">★ Habilitadora</span>' : ""}</div>
            <h2 class="project-title"><span style="color:var(--accent)">${esc(it.id)}</span> · ${esc(it.nome)}</h2>
          </div>
          <div class="row no-print">
            <button class="btn btn-sm btn-outline" data-action="edit-initiative" data-id="${esc(it.id)}">Editar dados</button>
            <button class="btn btn-sm btn-ghost" data-action="new-decision-for" data-id="${esc(it.id)}">+ Decisão</button>
          </div>
        </div>
        <dl class="project-facts">
          <div><dt>Valor</dt><dd>${it.valor}</dd></div>
          <div><dt>Esforço</dt><dd>${it.esforco}</dd></div>
          <div><dt>V ÷ E</dt><dd style="color:${isAboveCut(it) ? "var(--ok)" : "inherit"}">${fmtNum(ve(it))}</dd></div>
          <div><dt>Onda</dt><dd>${esc(it.onda)}</dd></div>
          <div><dt>Kanban</dt><dd>${esc(col ? col.label : "—")}</dd></div>
          <div><dt>Responsável</dt><dd>${esc(it.responsavel || "A definir")}</dd></div>
          <div><dt>Prazo</dt><dd>${esc(it.prazo || "—")}</dd></div>
          <div><dt>Semáforo</dt><dd class="row" style="gap:0.35rem">${ui.dot(it.semaforo)} ${esc(sem.label)}</dd></div>
        </dl>
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
    const sig = `${it.id}|` + acts.map((a) => `${a.id}:${a.pct}:${a.status}`).join(",");
    const fullSig = sig + JSON.stringify(acts.map((a) => [a.nome, a.responsavel, a.prazo, a.observacoes]));
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
      </form>`;

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
      if (el.closest?.("#view-projeto") && el.dataset.act && el.dataset.field) saveField(el);
    });
    document.addEventListener("submit", (e) => {
      const form = e.target;
      if (form.id !== "act-new-form") return;
      e.preventDefault();
      const input = document.getElementById("act-new-name");
      const nome = input.value.trim();
      if (!nome) return input.focus();
      const r = A.store.saveActivity(form.dataset.ini, null, { nome });
      if (!r.ok) return A.util.toast(r.error, "error");
      A.util.toast("Atividade adicionada.");
      document.getElementById("act-new-name")?.focus();
    });
  }

  A.drill = { initActivityEvents, sectorHref, projectHref };
})();
