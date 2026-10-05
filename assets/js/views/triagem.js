/* Triagem: lista única de ideias e projetos para dar valor e esforço na reunião, com cadastro rápido. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum, toast } = A.util;
  const ui = A.ui;
  const $ = (id) => document.getElementById(id);

  const SIT_CLASS = { Rascunho: "warn", Validado: "ok" };
  const NEXT_LABEL = { Rascunho: "Validar" };
  // Três visões fixas; "Esforço a revisar" só aparece enquanto houver projeto convertido da escala antiga.
  const FILTROS = [
    ["triar", "Validar backlog"],
    ["Validado", "Backlogs validados"],
    ["ALL", "Todos"],
    ["revisar", "Esforço a revisar"],
  ];

  const semNota = (it) => !it.valor || !it.esforco;
  const ativo = (it) => it.status !== "Cancelado" && it.status !== "Concluído";
  const filtros = {
    triar: (it) => ativo(it) && (it.situacao === "Rascunho" || semNota(it)),
    revisar: (it) => ativo(it) && it.esforcoRevisar,
    Validado: (it) => ativo(it) && it.situacao === "Validado",
    ALL: () => true,
  };

  // Preenche um select preservando a escolha atual (o formulário rápido não é redesenhado).
  function fillSelect(el, html, fallback) {
    const prev = el.value;
    el.innerHTML = html;
    el.value = prev || fallback || "";
    if (el.selectedIndex < 0) el.value = fallback || "";
  }

  function fillQuickForm(S) {
    fillSelect($("tri-area"), `<option value="">Setor…</option>` + ui.areaOptions(""),
      S.state.ui.area !== "ALL" ? S.state.ui.area : "");
    if (!$("tri-valor").options.length) $("tri-valor").innerHTML = A.meta.valorOptions("", "Valor?");
    if (!$("tri-esforco").options.length) $("tri-esforco").innerHTML = A.meta.esforcoOptions("", "Esforço?");
  }

  function row(S, it) {
    const { ve, isAboveCut } = S.calc;
    const scored = !semNota(it);
    const above = scored && isAboveCut(it);
    const criado = it.criadoEm ? new Date(it.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
    const fases = S.fasesDe(it.id).length;
    const podeFase = ativo(it) && it.esforco >= 4 && !it.faseDe;
    const sub = [it.autor ? `por ${esc(it.autor)}` : "", criado, it.prazo ? `prazo ${esc(it.prazo)}` : ""].filter(Boolean).join(" · ");
    return `
      <tr class="${scored ? "" : "tri-pending"} ${ativo(it) ? "" : "tri-inactive"}">
        <td><strong class="tri-id" style="--ac:${A.area(it.area).cor}">${esc(it.id)}</strong></td>
        <td class="tri-name">
          <a href="${A.drill.projectHref(it.id)}" data-nav>${esc(it.nome)}</a>
          ${ativo(it) ? "" : `<span class="badge">${esc(it.status)}</span>`}
          ${it.faseDe ? `<span class="badge accent" title="Fase do projeto ${esc(it.faseDe)}">fase de ${esc(it.faseDe)}</span>` : ""}
          ${fases ? `<span class="badge" title="Este projeto foi dividido em fases">${fases} fase(s)</span>` : ""}
          <div class="tri-sub">${esc(it.area)}${sub ? ` · ${sub}` : ""}</div>
        </td>
        <td class="nowrap"><select class="tri-sel tri-score ${it.valor ? "" : "empty"}" data-tri-field="valor" data-id="${esc(it.id)}" aria-label="Valor de ${esc(it.id)}">${A.meta.valorOptions(it.valor || "", "Valor?")}</select><button class="tri-impacto no-print" data-tri-impacto="${esc(it.id)}" title="Escolher o valor pelos círculos de impacto">🎯</button></td>
        <td class="nowrap"><select class="tri-sel tri-score ${it.esforco ? "" : "empty"} ${it.esforcoRevisar ? "revisar" : ""}" data-tri-field="esforco" data-id="${esc(it.id)}" aria-label="Esforço de ${esc(it.id)}"
              title="${it.esforcoRevisar ? "Convertido da escala antiga: confirme ou ajuste" : ""}">${A.meta.esforcoOptions(it.esforco || "", "Esforço?")}</select>${it.esforcoRevisar ? `<button class="tri-ok" data-tri-confirm="${esc(it.id)}" title="O esforço está certo: confirmar">✓</button>` : ""}</td>
        <td><select class="tri-sel tri-score tri-urg" data-tri-field="urgencia" data-id="${esc(it.id)}" aria-label="Urgência de ${esc(it.id)}">${A.meta.urgenciaOptions(it.urgencia || "", "—")}</select></td>
        <td class="num"><strong class="tri-ve ${scored ? (above ? "above" : "below") : ""}" title="${scored ? (above ? "Acima da linha de corte" : "Abaixo da linha de corte") : "Falta nota"}">${scored ? fmtNum(ve(it)) : "—"}</strong></td>
        <td class="tri-actions no-print">
          ${it.situacao === "Rascunho" && ativo(it)
            ? `<button class="btn btn-xs btn-primary" data-action="advance-situacao" data-id="${esc(it.id)}" ${scored ? "" : `disabled title="Dê valor e esforço antes de validar"`}>Validar</button>`
            : `<span class="badge ${SIT_CLASS[it.situacao] || ""}">${esc(it.situacao)}</span>`}
          ${podeFase ? `<button class="btn btn-xs btn-ghost" data-action="criar-fase" data-id="${esc(it.id)}" title="Projeto longo: criar a Fase ${fases + 1} como rascunho, com entrega menor">✂</button>` : ""}
          <button class="btn btn-xs btn-ghost" data-action="edit-initiative" data-id="${esc(it.id)}" title="Editar todos os dados">✏️</button>
          ${S.canDelete(it) ? `<button class="btn btn-xs btn-danger-ghost" data-action="delete-initiative" data-id="${esc(it.id)}" title="Excluir rascunho">✕</button>` : ""}
        </td>
      </tr>`;
  }

  A.views.triagem = function (S) {
    if (!$("triagem-tbody")) return;
    fillQuickForm(S);
    const all = S.state.data.initiatives;
    let f = filtros[S.state.ui.triagemFiltro] ? S.state.ui.triagemFiltro : "triar";
    const counts = Object.fromEntries(FILTROS.map(([k]) => [k, all.filter(filtros[k]).length]));
    if (f === "revisar" && !counts.revisar) f = "triar";
    const setor = S.state.ui.area || "ALL";

    $("triagem-filters").innerHTML = `
      <div class="seg">${FILTROS.filter(([k]) => k !== "revisar" || counts.revisar).map(([k, label]) =>
        `<button class="seg-btn ${f === k ? "active" : ""} ${k === "revisar" ? "alerta" : ""}" data-tri-filter="${k}">${label} <span class="muted">${counts[k]}</span></button>`).join("")}</div>
      <label class="tri-setor"><span class="muted small">Setor</span>
        <select class="input input-sm" data-tri-setor>
          <option value="ALL">Todos os setores</option>
          ${S.areas().map((a) => `<option value="${esc(a.key)}" ${setor === a.key ? "selected" : ""}>${esc(a.key)}</option>`).join("")}
        </select>
      </label>
      <input type="search" class="input input-sm tri-busca" data-tri-busca placeholder="🔍 Buscar projeto" value="${esc(S.state.ui.search || "")}">`;

    // Ordem fixa (setor e número): dar nota não muda a linha de lugar; o projeto só sai de "A triar" ao ser validado.
    const list = all.filter((it) => filtros[f](it) && S.matchesFilters(it)).sort((a, b) =>
      ativo(b) - ativo(a) || a.id.localeCompare(b.id, "pt-BR", { numeric: true }));

    const cut = S.calc.cutoff();
    $("triagem-cut").innerHTML = `Linha de corte: <strong>${fmtNum(cut.value)}</strong> <span class="muted">(Σ Valor ${cut.sumValor} ÷ Σ Esforço ${cut.sumEsforco})</span>`;

    $("triagem-tbody").innerHTML = list.length ? list.map((it) => row(S, it)).join("")
      : `<tr><td colspan="7">${ui.empty(f === "triar" ? "Nada para triar. Use a linha acima para lançar uma nova ideia." : "Nenhum projeto neste filtro.")}</td></tr>`;
  };
  function submitQuick(e) {
    e.preventDefault();
    const S = A.store;
    const r = S.quickIdea({
      nome: $("tri-nome").value.trim(),
      area: $("tri-area").value,
      prazo: $("tri-prazo").value.trim(),
      valor: Number($("tri-valor").value) || 0,
      esforco: Number($("tri-esforco").value) || 0,
    });
    if (!r.ok) {
      $("tri-error").textContent = r.error;
      return;
    }
    $("tri-error").textContent = "";
    $("tri-nome").value = "";
    $("tri-prazo").value = "";
    $("tri-valor").value = "";
    $("tri-esforco").value = "";
    toast(`${r.item.id} lançada na Triagem${semNota(r.item) ? " (falta dar nota)" : ""}.`);
    $("tri-nome").focus();
  }

  function init() {
    const form = $("triagem-form");
    if (!form) return;
    form.addEventListener("submit", submitQuick);
    document.addEventListener("click", (e) => {
      const ok = e.target.closest("[data-tri-confirm]");
      if (ok) {
        const r = A.store.confirmarEsforco(ok.dataset.triConfirm);
        if (r.ok) toast(`Esforço de ${ok.dataset.triConfirm} confirmado.`);
        return;
      }
      const b = e.target.closest("[data-tri-filter]");
      if (!b) return;
      A.store.state.ui.triagemFiltro = b.dataset.triFilter;
      A.store.emit();
    });
    let tBusca;
    document.addEventListener("input", (e) => {
      if (!e.target.matches?.("[data-tri-busca]")) return;
      clearTimeout(tBusca);
      tBusca = setTimeout(() => {
        A.store.state.ui.search = e.target.value.trim();
        A.store.emit();
        const b = document.querySelector("[data-tri-busca]");
        if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
      }, 250);
    });
    // 🎯 Círculos de impacto: escolher o valor pelo alcance do projeto.
    document.addEventListener("click", async (e) => {
      const b = e.target.closest?.("[data-tri-impacto], [data-tri-impacto-novo]");
      if (!b) return;
      e.preventDefault();
      const S = A.store;
      if (b.dataset.triImpactoNovo !== undefined) {
        const v = await A.impacto.escolher(Number($("tri-valor").value) || null, "Qual o alcance da nova ideia?");
        if (v) $("tri-valor").value = String(v);
        return;
      }
      const it = S.findInitiative(b.dataset.triImpacto);
      const v = await A.impacto.escolher(it.valor, `${it.id} · qual o alcance do projeto?`);
      if (v && v !== it.valor) {
        const r = S.saveInitiative({ valor: v }, it.id, { source: "Triagem" });
        if (!r.ok) toast(r.error, "error");
      }
    });
    document.addEventListener("change", (e) => {
      if (e.target.matches?.("[data-tri-setor]")) { A.store.state.ui.area = e.target.value; A.store.emit(); return; }
      const el = e.target.closest("[data-tri-field]");
      if (!el) return;
      const field = el.dataset.triField;
      const value = field === "autor" || field === "eixo" ? el.value : Number(el.value) || 0;
      const r = A.store.saveInitiative({ [field]: value }, el.dataset.id, { source: "Triagem" });
      if (!r.ok) toast(r.error, "error");
    });
  }

  A.triagem = { init };
})();
