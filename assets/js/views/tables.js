/* Ranking priorizado, livro de decisões e histórico de alterações. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum, fmtTime, fmtDay, norm } = A.util;
  const ui = A.ui;

  /* ---------- Ranking ---------- */
  function rankAll(S) {
    const { ve } = S.calc;
    return [...S.state.data.initiatives].sort(
      (a, b) => ve(b) - ve(a) || b.valor - a.valor || a.id.localeCompare(b.id, "pt-BR", { numeric: true })
    );
  }

  A.views.ranking = function (S) {
    const { ve, cutoff, isAboveCut } = S.calc;
    const cut = cutoff().value;
    const ranked = rankAll(S);
    const position = new Map(ranked.map((it, i) => [it.id, i + 1]));
    const rows = ranked.filter((it) => S.matchesFilters(it));
    const above = ranked.filter((it) => isAboveCut(it, cut)).length;

    document.getElementById("ranking-title").textContent = `Ranking dos ${ranked.length} projetos`;
    document.getElementById("ranking-cut-badge").textContent = `${above} acima do corte (V÷E ≥ ${fmtNum(cut)})`;
    document.getElementById("ranking-filter-note").textContent = S.hasActiveFilters()
      ? `Mostrando ${rows.length} de ${ranked.length} (filtros ativos)` : "";

    const tbody = document.getElementById("ranking-tbody");
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="12">${ui.empty("Nenhum projeto corresponde aos filtros.")}</td></tr>`;
      return;
    }
    let dividerDone = false;
    tbody.innerHTML = rows.map((it) => {
      const isAbove = isAboveCut(it, cut);
      let divider = "";
      if (!isAbove && !dividerDone) {
        dividerDone = true;
        divider = `<tr class="cut-divider"><td colspan="12">— Linha de corte · V÷E ${fmtNum(cut)} —</td></tr>`;
      }
      return `${divider}
        <tr class="${isAbove ? "above-cut" : ""}">
          <td class="muted" style="font-weight:700">${position.get(it.id)}</td>
          <td><strong style="color:var(--accent)">${esc(it.id)}</strong></td>
          <td style="min-width:260px">
            <div class="cell-title">${esc(it.nome)} ${it.enabler ? '<span class="badge enabler">★ Habilitadora</span>' : ""}</div>
            ${it.observacoes ? `<div class="cell-sub">${esc(it.observacoes)}</div>` : ""}
          </td>
          <td>${ui.areaBadge(it.area)}</td>
          <td class="num">${it.valor}</td>
          <td class="num">${it.esforco}</td>
          <td class="num"><strong style="color:${isAbove ? "var(--ok)" : "var(--text-muted)"}">${fmtNum(ve(it))}</strong></td>
          <td class="nowrap">${esc(A.meta.tempoPorEsforco(it.esforco))}</td>
          <td><span class="badge">${esc(it.onda)}</span></td>
          <td>
            <select class="status-select" data-change="status" data-id="${esc(it.id)}" aria-label="Status de ${esc(it.id)}">
              ${A.meta.STATUS.map((s) => `<option ${s === it.status ? "selected" : ""}>${esc(s)}</option>`).join("")}
            </select>
          </td>
          <td class="center">${ui.dot(it.semaforo)}</td>
          <td class="center no-print">
            <span class="actions">
              <button class="btn btn-xs btn-outline" data-action="edit-initiative" data-id="${esc(it.id)}">Editar</button>
              <button class="btn btn-xs btn-danger-ghost icon-btn" data-action="delete-initiative" data-id="${esc(it.id)}" title="Excluir" aria-label="Excluir ${esc(it.id)}">✕</button>
            </span>
          </td>
        </tr>`;
    }).join("");
  };

  /* ---------- Decisões ---------- */
  A.views.decisions = function (S) {
    const f = S.state.ui.decisionFilter;
    const all = S.state.data.decisions;
    const list = all.filter((d) => f === "ALL" || d.status === f);
    // Pendentes primeiro, depois pela ordem de registro (mais recente no topo).
    const sorted = [...list].map((d, i) => ({ d, i })).sort((a, b) =>
      (a.d.status === "Pendente" ? 0 : 1) - (b.d.status === "Pendente" ? 0 : 1) || b.i - a.i
    ).map((x) => x.d);

    document.querySelectorAll("[data-dec-filter]").forEach((b) => b.classList.toggle("active", b.dataset.decFilter === f));
    const counts = { ALL: all.length, Pendente: all.filter((d) => d.status === "Pendente").length };
    counts.Decidido = all.length - counts.Pendente;
    document.querySelectorAll("[data-dec-filter]").forEach((b) => {
      b.querySelector(".n").textContent = counts[b.dataset.decFilter];
    });

    const tbody = document.getElementById("decisoes-tbody");
    if (!sorted.length) {
      tbody.innerHTML = `<tr><td colspan="7">${ui.empty("Nenhuma decisão registrada neste filtro.")}</td></tr>`;
      return;
    }
    tbody.innerHTML = sorted.map((d) => {
      const it = d.grupo ? S.findInitiative(d.grupo) : null;
      return `
        <tr>
          <td class="muted nowrap">${esc(d.data)}</td>
          <td><strong>${esc(d.quem)}</strong></td>
          <td>${d.grupo ? `<button class="btn btn-xs btn-ghost" data-action="edit-initiative" data-id="${esc(d.grupo)}" title="${esc(it ? it.nome : "Projeto não encontrado")}"><strong style="color:var(--accent)">${esc(d.grupo)}</strong></button>` : '<span class="muted">—</span>'}</td>
          <td style="font-weight:600; min-width:240px">${esc(d.pauta)}</td>
          <td>${ui.decisionBadge(d.status)}</td>
          <td style="min-width:220px; color:${d.status === "Pendente" ? "var(--text-muted)" : "var(--text)"}">${d.resultado ? esc(d.resultado) : "<em>Aguardando decisão da diretoria</em>"}</td>
          <td class="center no-print">
            <span class="actions">
              <button class="btn btn-xs btn-outline" data-action="edit-decision" data-id="${esc(d.id)}">Editar</button>
              <button class="btn btn-xs btn-danger-ghost icon-btn" data-action="delete-decision" data-id="${esc(d.id)}" title="Excluir" aria-label="Excluir decisão">✕</button>
            </span>
          </td>
        </tr>`;
    }).join("");
  };

  /* ---------- Histórico ---------- */
  const ACTION_LABEL = {
    criou: "criou", editou: "editou", excluiu: "excluiu", decidiu: "registrou decisão em",
    importou: "importou", restaurou: "restaurou", migrou: "migrou", limpou: "limpou",
    planejou: "planejou", abriu: "abriu", encerrou: "encerrou", zerou: "zerou",
  };
  const ENTITY_LABEL = { iniciativa: "projeto", decisao: "decisão", atividade: "atividade", cadastro: "cadastro", compromisso: "reunião", sprint: "", sistema: "" };

  function fmtValue(field, v) {
    if (v === true) return "Sim";
    if (v === false) return "Não";
    if (field === "coluna") return A.meta.COLUNAS.find((c) => c.key === v)?.label || v;
    if (field === "pct") return `${v}%`;
    return v === "" || v == null ? "(vazio)" : v;
  }

  A.views.history = function (S) {
    const q = norm(S.state.ui.historyQuery);
    const ent = S.state.ui.historyEntity;
    const list = S.state.data.history.filter((h) => {
      if (ent !== "ALL" && h.entity !== ent) return false;
      if (!q) return true;
      return norm(`${h.user} ${h.label} ${h.refId || ""} ${h.source} ${(h.changes || []).map((c) => `${c.label} ${c.from} ${c.to}`).join(" ")}`).includes(q);
    });

    document.getElementById("history-count").textContent =
      `${list.length} ${list.length === 1 ? "registro" : "registros"}${list.length !== S.state.data.history.length ? ` de ${S.state.data.history.length}` : ""}`;

    const el = document.getElementById("history-list");
    if (!list.length) {
      el.innerHTML = ui.empty(S.state.data.history.length ? "Nenhum registro corresponde à busca." : "Nenhuma alteração registrada ainda. Toda edição feita no painel aparecerá aqui.");
      return;
    }
    const shown = list.slice(0, 300);
    let lastDay = "";
    el.innerHTML = shown.map((h) => {
      const day = h.ts.slice(0, 10);
      const head = day !== lastDay ? `<div class="history-day">${esc(fmtDay(h.ts))}</div>` : "";
      lastDay = day;
      const changes = (h.changes || []).filter((c) => c.field !== "snapshot" || h.action === "excluiu");
      return `${head}
        <div class="h-item">
          <div class="h-time">${fmtTime(h.ts)}</div>
          <div class="avatar" title="${esc(h.user)}">${esc(A.util.initials(h.user))}</div>
          <div>
            <div><strong>${esc(h.user)}</strong> ${esc(ACTION_LABEL[h.action] || h.action)} ${esc(ENTITY_LABEL[h.entity] || "")}
              <strong>${esc(h.label)}</strong>
              ${h.source && h.source !== "Painel" ? `<span class="badge h-source">${esc(h.source)}</span>` : ""}
            </div>
            ${changes.length ? `<ul class="h-changes">${changes.map((c) => c.field === "snapshot"
              ? `<li>${esc(c.from)}</li>`
              : `<li>${esc(c.label)}: <del>${esc(fmtValue(c.field, c.from))}</del> → <ins>${esc(fmtValue(c.field, c.to))}</ins></li>`).join("")}</ul>` : ""}
          </div>
        </div>`;
    }).join("") + (list.length > shown.length ? `<div class="muted small" style="margin-top:0.75rem">Mostrando os 300 registros mais recentes. Exporte para Excel para ver tudo.</div>` : "");
  };

  A.views.rankAll = rankAll;
})();
