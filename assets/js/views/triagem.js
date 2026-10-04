/* Triagem: lista única de ideias e projetos para dar valor e esforço na reunião, com cadastro rápido. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum, toast } = A.util;
  const ui = A.ui;
  const $ = (id) => document.getElementById(id);

  const SIT_CLASS = { Rascunho: "warn", Validado: "ok" };
  const NEXT_LABEL = { Rascunho: "Validar" };
  const FILTROS = [
    ["triar", "A triar"],
    ["semnota", "Sem nota"],
    ["revisar", "Esforço a revisar"],
    ["Validado", "Validados"],
    ["ALL", "Todos"],
  ];

  const semNota = (it) => !it.valor || !it.esforco;
  const ativo = (it) => it.status !== "Cancelado" && it.status !== "Concluído";
  const filtros = {
    triar: (it) => ativo(it) && (it.situacao === "Rascunho" || semNota(it)),
    semnota: (it) => ativo(it) && semNota(it),
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
    fillSelect($("tri-area"), `<option value="">Área…</option>` + ui.areaOptions(""),
      S.state.ui.area !== "ALL" ? S.state.ui.area : "");
    fillSelect($("tri-autor"), ui.peopleOptions("", { blank: "Quem trouxe?" }), S.state.settings.user || "");
    if (!$("tri-valor").options.length) $("tri-valor").innerHTML = A.meta.valorOptions("", "Valor?");
    if (!$("tri-esforco").options.length) $("tri-esforco").innerHTML = A.meta.esforcoOptions("", "Esforço?");
  }

  function row(S, it) {
    const { ve, isAboveCut } = S.calc;
    const scored = !semNota(it);
    const above = scored && isAboveCut(it);
    const criado = it.criadoEm ? new Date(it.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
    const next = NEXT_LABEL[it.situacao];
    return `
      <tr class="${scored ? "" : "tri-pending"} ${ativo(it) ? "" : "tri-inactive"}">
        <td><strong class="tri-id" style="--ac:${A.area(it.area).cor}">${esc(it.id)}</strong></td>
        <td class="tri-name">
          <a href="${A.drill.projectHref(it.id)}" data-nav>${esc(it.nome)}</a>
          ${ativo(it) ? "" : `<span class="badge">${esc(it.status)}</span>`}
        </td>
        <td>${ui.areaBadge(it.area)}</td>
        <td><select class="tri-sel tri-autor" data-tri-field="autor" data-id="${esc(it.id)}" aria-label="Autor de ${esc(it.id)}">${ui.peopleOptions(it.autor, { blank: "—" })}</select></td>
        <td class="muted small nowrap">${criado}</td>
        <td><select class="tri-sel tri-score ${it.valor ? "" : "empty"}" data-tri-field="valor" data-id="${esc(it.id)}" aria-label="Valor de ${esc(it.id)}">${A.meta.valorOptions(it.valor || "", "Valor?")}</select></td>
        <td class="nowrap"><select class="tri-sel tri-score ${it.esforco ? "" : "empty"} ${it.esforcoRevisar ? "revisar" : ""}" data-tri-field="esforco" data-id="${esc(it.id)}" aria-label="Esforço de ${esc(it.id)}"
              title="${it.esforcoRevisar ? "Convertido da escala antiga: confirme ou ajuste" : ""}">${A.meta.esforcoOptions(it.esforco || "", "Esforço?")}</select>${it.esforcoRevisar ? `<button class="tri-ok" data-tri-confirm="${esc(it.id)}" title="O esforço está certo: confirmar">✓</button>` : ""}</td>
        <td class="num"><strong class="tri-ve ${scored ? (above ? "above" : "below") : ""}" title="${scored ? (above ? "Acima da linha de corte" : "Abaixo da linha de corte") : "Falta nota"}">${scored ? fmtNum(ve(it)) : "—"}</strong></td>
        <td class="small nowrap">${esc(it.prazo || "—")}</td>
        <td><span class="badge ${SIT_CLASS[it.situacao] || ""}">${esc(it.situacao)}</span></td>
        <td class="tri-actions no-print">
          ${next && ativo(it) ? `<button class="btn btn-xs btn-primary" data-action="advance-situacao" data-id="${esc(it.id)}" ${scored ? "" : `disabled title="Dê valor e esforço antes de validar"`}>${next}</button>` : ""}
          <button class="btn btn-xs btn-ghost" data-action="edit-initiative" data-id="${esc(it.id)}" title="Editar todos os dados">Editar</button>
          ${S.canDelete(it) ? `<button class="btn btn-xs btn-danger-ghost" data-action="delete-initiative" data-id="${esc(it.id)}" title="Excluir rascunho">✕</button>` : ""}
        </td>
      </tr>`;
  }

  A.views.triagem = function (S) {
    if (!$("triagem-tbody")) return;
    fillQuickForm(S);
    const all = S.state.data.initiatives;
    const f = filtros[S.state.ui.triagemFiltro] ? S.state.ui.triagemFiltro : "triar";
    const counts = Object.fromEntries(FILTROS.map(([k]) => [k, all.filter(filtros[k]).length]));

    $("triagem-filters").innerHTML = FILTROS.map(([k, label]) =>
      `<button class="btn btn-xs btn-outline ${f === k ? "active" : ""}" data-tri-filter="${k}">${label} <span class="muted">${counts[k]}</span></button>`).join("");

    const sitOrder = Object.fromEntries(S.SITUACOES.map((s, i) => [s, i]));
    const list = all.filter((it) => filtros[f](it) && S.matchesFilters(it)).sort((a, b) =>
      semNota(b) - semNota(a) || ativo(b) - ativo(a) || sitOrder[a.situacao] - sitOrder[b.situacao] ||
      S.calc.ve(b) - S.calc.ve(a) || a.id.localeCompare(b.id, "pt-BR", { numeric: true }));

    const cut = S.calc.cutoff();
    $("triagem-cut").innerHTML = `Linha de corte: <strong>${fmtNum(cut.value)}</strong> <span class="muted">(Σ Valor ${cut.sumValor} ÷ Σ Esforço ${cut.sumEsforco})</span>`;

    $("triagem-tbody").innerHTML = list.length ? list.map((it) => row(S, it)).join("")
      : `<tr><td colspan="11">${ui.empty(f === "triar" ? "Nada para triar. Use a linha acima para lançar uma nova ideia." : "Nenhum projeto neste filtro.")}</td></tr>`;
  };

  function submitQuick(e) {
    e.preventDefault();
    const S = A.store;
    const r = S.quickIdea({
      nome: $("tri-nome").value.trim(),
      area: $("tri-area").value,
      autor: $("tri-autor").value,
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
    document.addEventListener("change", (e) => {
      const el = e.target.closest("[data-tri-field]");
      if (!el) return;
      const field = el.dataset.triField;
      const value = field === "autor" ? el.value : Number(el.value) || 0;
      const r = A.store.saveInitiative({ [field]: value }, el.dataset.id, { source: "Triagem" });
      if (!r.ok) toast(r.error, "error");
    });
  }

  A.triagem = { init };
})();
