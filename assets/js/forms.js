/* Modais de formulário: iniciativa, decisão, usuário, resumo de reunião e importação. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum, toast, openModal, closeModal, confirmDialog, todayStr } = A.util;
  const $ = (id) => document.getElementById(id);

  const optionList = (values, selected) =>
    values.map((v) => {
      const [val, label] = Array.isArray(v) ? v : [v, v];
      return `<option value="${esc(val)}" ${String(val) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
    }).join("");

  // Sugestões de nomes vêm do cadastro de pessoas (Cadastros → Pessoas).
  function fillPeopleDatalist() {
    const S = A.store;
    const names = new Set(S.pessoas({ ativas: true }).map((p) => p.nome));
    S.state.data.decisions.forEach((d) => d.quem && names.add(d.quem));
    $("people-list").innerHTML = [...names].sort().map((n) => `<option value="${esc(n)}">`).join("");
  }

  /* ---------- Iniciativa ---------- */
  let editingId = null;

  function setupInitiativeSelects() {
    const { FIBONACCI, ONDAS, STATUS, SEMAFOROS } = A.meta;
    $("ini-situacao").innerHTML = optionList(A.store.SITUACOES);
    $("ini-valor").innerHTML = A.meta.valorOptions("");
    $("ini-esforco").innerHTML = A.meta.esforcoOptions("");
    $("ini-onda").innerHTML = optionList(ONDAS.map((o) => [o.key, `${o.key} · ${o.periodo}`]));
    $("ini-status").innerHTML = optionList(STATUS);
    $("ini-semaforo").innerHTML = optionList(SEMAFOROS.map((s) => [s.key, `${s.label} — ${s.desc}`]));
  }

  function updateCalcBox() {
    const S = A.store;
    const valor = Number($("ini-valor").value);
    const esforco = Number($("ini-esforco").value);
    if (!valor || !esforco) {
      $("ini-calc").innerHTML = `<span class="muted">Defina valor e esforço para calcular o V ÷ E e comparar com a linha de corte.</span>`;
      return;
    }
    const veVal = esforco ? valor / esforco : 0;
    // A linha de corte considera os valores que estão sendo editados.
    const others = S.state.data.initiatives.filter((i) => i.id !== editingId);
    const cut = S.calc.cutoff([...others, { valor, esforco }]).value;
    const above = veVal >= cut - 1e-9;
    $("ini-calc").innerHTML = `
      <span>V ÷ E: <strong style="color:${above ? "var(--ok)" : "var(--text-muted)"}">${fmtNum(veVal)}</strong></span>
      <span>Tempo estimado: <strong>${esc(A.meta.tempoPorEsforco(esforco))}</strong></span>
      <span>Linha de corte: <strong>${fmtNum(cut)}</strong></span>
      <span class="badge ${above ? "ok" : ""}">${above ? "Acima da linha — prioritária" : "Abaixo da linha"}</span>`;
  }

  function openInitiativeForm(id = null) {
    const S = A.store;
    const it = id ? S.findInitiative(id) : null;
    if (id && !it) return toast(`Iniciativa ${id} não encontrada.`, "error");
    editingId = it ? it.id : null;
    fillPeopleDatalist();

    const area = it ? it.area : (S.state.ui.area !== "ALL" ? S.state.ui.area : S.areas()[0].key);
    const data = it || {
      id: S.nextId(area), nome: "", area, valor: 0, esforco: 0, onda: "Fila", status: "A fazer", autor: S.state.settings.user || "",
      semaforo: "verde", responsavel: S.state.settings.user || "", prazo: "", observacoes: "", enabler: false,
      situacao: "Rascunho", objetivo: "", prontoQuando: "", indicador: "", investimento: "Não",
    };
    $("ini-modal-title").textContent = it ? `Editar ${it.id} · ${it.area}` : "Nova iniciativa";
    $("ini-id").value = data.id;
    $("ini-nome").value = data.nome;
    $("ini-area").innerHTML = A.ui.areaOptions(data.area);
    $("ini-responsavel").innerHTML = A.ui.peopleOptions(data.responsavel, { blank: "A definir" });
    $("ini-autor").innerHTML = A.ui.peopleOptions(data.autor, { blank: "Não informado" });
    $("ini-situacao").value = data.situacao;
    $("ini-objetivo").value = data.objetivo || "";
    $("ini-pronto").value = data.prontoQuando || "";
    $("ini-indicador").value = data.indicador || "";
    $("ini-invest").checked = data.investimento === "Sim";
    $("ini-valor").value = data.valor || "";
    $("ini-esforco").value = data.esforco || "";
    $("ini-onda").value = data.onda;
    $("ini-status").value = data.status;
    $("ini-semaforo").value = data.semaforo;
    $("ini-prazo").value = data.prazo;
    $("ini-obs").value = data.observacoes;
    $("ini-enabler").checked = !!data.enabler;
    $("ini-error").textContent = "";
    $("ini-delete").classList.toggle("hidden", !S.canDelete(it));
    $("ini-add-decision").classList.toggle("hidden", !it);

    const decs = it ? S.state.data.decisions.filter((d) => d.grupo === it.id) : [];
    $("ini-related").innerHTML = decs.length
      ? `<div class="field"><label>Decisões vinculadas</label>${decs.map((d) =>
          `<div class="dec-snippet" data-action="edit-decision" data-id="${esc(d.id)}" role="button" tabindex="0">${A.ui.decisionBadge(d.status)} ${esc(d.pauta)}</div>`).join("")}</div>`
      : "";
    $("ini-meta").textContent = it ? `Atualizada em ${A.util.fmtDateTime(it.atualizadoEm)}` : "";

    updateCalcBox();
    openModal("modal-initiative");
    setTimeout(() => $("ini-nome").focus(), 40);
  }

  function submitInitiative(e) {
    e.preventDefault();
    const S = A.store;
    const input = {
      id: $("ini-id").value,
      nome: $("ini-nome").value,
      area: $("ini-area").value,
      autor: $("ini-autor").value,
      valor: Number($("ini-valor").value),
      esforco: Number($("ini-esforco").value),
      onda: $("ini-onda").value,
      status: $("ini-status").value,
      semaforo: $("ini-semaforo").value,
      responsavel: $("ini-responsavel").value,
      prazo: $("ini-prazo").value,
      observacoes: $("ini-obs").value,
      enabler: $("ini-enabler").checked,
      situacao: $("ini-situacao").value,
      objetivo: $("ini-objetivo").value,
      prontoQuando: $("ini-pronto").value,
      indicador: $("ini-indicador").value,
      investimento: $("ini-invest").checked ? "Sim" : "Não",
    };
    const wasWip = editingId ? S.findInitiative(editingId)?.status === "Em andamento" : false;
    const r = S.saveInitiative(input, editingId);
    if (!r.ok) {
      $("ini-error").textContent = r.error;
      return;
    }
    closeModal("modal-initiative");
    if (r.unchanged) return;
    toast(editingId ? `${r.item.id} atualizada.` : `${r.item.id} criada.`);
    if (!wasWip && r.item.status === "Em andamento" && S.calc.overCapacity()) {
      toast(`Atenção: carga de ${S.calc.carga()} pts para capacidade de ${S.calc.capacidade()} (${S.calc.wipCount()} projetos, trava ${S.calc.maxProjetos()}).`, "warn", 6000);
    }
  }

  async function deleteInitiative(id) {
    const S = A.store;
    const it = S.findInitiative(id);
    if (!it) return;
    if (!S.canDelete(it)) return toast("Só projetos em Rascunho podem ser excluídos. Para tirar do fluxo, use o status Cancelado.", "warn", 5000);
    const ok = await confirmDialog(`Excluir o rascunho “${it.id} · ${it.nome}” e suas ${it.atividades.length} atividades? A exclusão fica registrada no histórico.`,
      { title: "Excluir rascunho", okLabel: "Excluir", danger: true });
    if (!ok) return;
    const r = S.deleteInitiative(id);
    if (!r.ok) return toast(r.error, "error");
    closeModal("modal-initiative");
    if (location.hash.startsWith("#projeto/")) location.hash = "triagem";
    toast(`${id} excluído.`, "warn");
  }

  /* ---------- Decisão ---------- */
  let editingDecisionId = null;

  function openDecisionForm(id = null, presetGrupo = "") {
    const S = A.store;
    const d = id ? S.findDecision(id) : null;
    editingDecisionId = d ? d.id : null;
    fillPeopleDatalist();
    const inis = A.views.rankAll(S);
    $("dec-grupo").innerHTML = `<option value="">— Nenhuma —</option>` +
      inis.map((i) => `<option value="${esc(i.id)}">${esc(i.id)} · ${esc(i.nome.length > 70 ? i.nome.slice(0, 70) + "…" : i.nome)}</option>`).join("");

    $("dec-modal-title").textContent = d ? "Editar decisão / pendência" : "Registrar decisão / pendência";
    $("dec-data").value = d ? d.data : todayStr();
    $("dec-quem").value = d ? d.quem : "Maíra / Shei";
    $("dec-grupo").value = d ? d.grupo : presetGrupo;
    $("dec-pauta").value = d ? d.pauta : "";
    $("dec-status").value = d ? d.status : "Pendente";
    $("dec-resultado").value = d ? d.resultado : "";
    $("dec-error").textContent = "";
    $("dec-delete").classList.toggle("hidden", !d);
    openModal("modal-decision");
    setTimeout(() => $("dec-pauta").focus(), 40);
  }

  function submitDecision(e) {
    e.preventDefault();
    const S = A.store;
    const r = S.saveDecision({
      id: editingDecisionId || undefined,
      data: $("dec-data").value,
      quem: $("dec-quem").value,
      grupo: $("dec-grupo").value,
      pauta: $("dec-pauta").value,
      status: $("dec-status").value,
      resultado: $("dec-resultado").value,
    });
    if (!r.ok) {
      $("dec-error").textContent = r.error;
      return;
    }
    closeModal("modal-decision");
    if (!r.unchanged) toast(editingDecisionId ? "Decisão atualizada." : "Decisão registrada.");
  }

  async function deleteDecision(id) {
    const S = A.store;
    const d = S.findDecision(id);
    if (!d) return;
    const ok = await confirmDialog(`Excluir a pauta “${d.pauta}”?`, { title: "Excluir decisão", okLabel: "Excluir", danger: true });
    if (!ok) return;
    S.deleteDecision(id);
    closeModal("modal-decision");
    toast("Decisão excluída.", "warn");
  }

  /* ---------- Usuário ---------- */
  function openUserForm(required = false) {
    const current = A.store.state.settings.user;
    $("user-options").innerHTML = A.store.pessoas({ ativas: true }).map((x) => x.nome).slice(0, 8).map((p) =>
      `<button type="button" class="btn ${p === current ? "btn-primary" : "btn-outline"}" data-user-pick="${esc(p)}">${esc(p)}</button>`).join("");
    $("user-name").value = current || "";
    $("user-cancel").classList.toggle("hidden", required);
    $("modal-user").dataset.required = required ? "1" : "";
    openModal("modal-user");
  }
  function submitUser(e) {
    e.preventDefault();
    const name = $("user-name").value.trim();
    if (!name) return;
    A.store.saveSettings({ user: name });
    closeModal("modal-user");
    toast(`Olá, ${name}! Suas alterações ficarão registradas no histórico com seu nome.`);
  }

  /* ---------- Resumo da reunião ---------- */
  function openMeetingSummary() {
    const S = A.store;
    const all = S.state.data.initiatives;
    const active = all.filter((i) => i.status !== "Cancelado");
    const inProgress = all.filter((i) => i.status === "Em andamento");
    const done = all.filter((i) => i.status === "Concluído");
    const attention = all.filter((i) => i.status !== "Concluído" && i.status !== "Cancelado" && i.semaforo !== "verde");
    const pending = S.state.data.decisions.filter((d) => d.status === "Pendente");
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const recentDone = S.state.data.history.filter((h) => h.ts >= weekAgo && h.entity === "iniciativa" &&
      (h.changes || []).some((c) => c.field === "status" && c.to === "Concluído"));
    const recentDecided = S.state.data.history.filter((h) => h.ts >= weekAgo && h.action === "decidiu");
    const cut = S.calc.cutoff().value;
    const mark = { verde: "[OK]", amarelo: "[ATENÇÃO]", vermelho: "[TRAVADO]" };
    const line = "========================================================";

    let t = `${line}\nPAINEL DE EXPANSÃO ALTAMAR — RESUMO DA REUNIÃO\n`;
    t += `Data: ${new Date().toLocaleDateString("pt-BR")} · Gestão: Pedro | Diretoria: Maíra & Shei\n${line}\n\n`;
    t += `1. STATUS DO FLUXO (CARGA)\n`;
    t += `• Em andamento: ${inProgress.length} projeto(s) · carga de ${S.calc.carga()} de ${S.calc.capacidade()} pontos (trava de ${S.calc.maxProjetos()} projetos)\n`;
    t += `• Concluídas: ${done.length} de ${active.length} iniciativas ativas (${active.length ? Math.round((done.length / active.length) * 100) : 0}%)\n`;
    t += `• Linha de corte V÷E: ${fmtNum(cut)}\n\n`;

    t += `2. EM ANDAMENTO NESTA SPRINT\n`;
    if (!inProgress.length) t += `• Nenhuma iniciativa em andamento.\n`;
    inProgress.forEach((it) => {
      const pct = S.calc.progress(it);
      t += `• ${it.id} - ${it.nome} | ${pct == null ? "sem atividades" : pct + "% concluído"} | Resp.: ${it.responsavel || "A definir"} | Prazo: ${it.prazo || "—"} ${mark[it.semaforo]}${it.coluna === "waiting" ? " [ESPERANDO]" : ""}\n`;
      if (it.observacoes) t += `   Nota: ${it.observacoes}\n`;
    });
    t += `\n`;

    if (recentDone.length || recentDecided.length) {
      t += `3. AVANÇOS DOS ÚLTIMOS 7 DIAS\n`;
      recentDone.forEach((h) => { t += `• Concluída: ${h.label}\n`; });
      recentDecided.forEach((h) => { t += `• Decidido: ${h.label}\n`; });
      t += `\n`;
    }

    t += `${recentDone.length || recentDecided.length ? 4 : 3}. PONTOS DE ATENÇÃO / IMPEDIMENTOS\n`;
    if (!attention.length) t += `• Nenhum ponto de atenção.\n`;
    attention.forEach((it) => { t += `• ${it.id} (${it.semaforo.toUpperCase()}): ${it.observacoes || "Requer alinhamento de escopo/tempo"}\n`; });
    t += `\n`;

    t += `${recentDone.length || recentDecided.length ? 5 : 4}. DECISÕES PENDENTES COM A DIRETORIA\n`;
    if (!pending.length) t += `• Nenhuma decisão pendente.\n`;
    pending.forEach((d) => {
      t += `• [${d.quem || "—"}]${d.grupo ? ` (${d.grupo})` : ""} ${d.pauta}\n`;
      if (d.resultado) t += `   Contexto: ${d.resultado}\n`;
    });
    t += `\nFonte oficial: planilha Excel corporativa Altamar.`;

    $("summary-text").value = t;
    openModal("modal-summary");
  }

  async function copySummary() {
    const text = $("summary-text").value;
    try {
      await navigator.clipboard.writeText(text);
      toast("Resumo copiado para a área de transferência.");
    } catch {
      $("summary-text").select();
      document.execCommand("copy");
      toast("Resumo copiado.");
    }
  }

  /* ---------- Importação do Excel ---------- */
  let pendingPlan = null;

  function renderChange(c) {
    return `${esc(c.label)}: <del>${esc(c.from ?? "")}</del> → <ins>${esc(c.to ?? "")}</ins>`;
  }

  function openImportPreview(plan) {
    pendingPlan = plan;
    const newI = plan.initiatives.filter((p) => p.isNew);
    const updI = plan.initiatives.filter((p) => !p.isNew);
    const newD = plan.decisions.filter((p) => p.isNew);
    const updD = plan.decisions.filter((p) => !p.isNew);
    const newA = plan.activities.filter((p) => p.isNew);
    const updA = plan.activities.filter((p) => !p.isNew);
    const total = plan.initiatives.length + plan.decisions.length + plan.activities.length;

    $("import-file").textContent = `${plan.fileName} · abas lidas: ${plan.sheets.join(", ")}`;
    $("import-stats").innerHTML = [
      ["Iniciativas novas", newI.length], ["Iniciativas alteradas", updI.length],
      ["Decisões novas", newD.length], ["Decisões alteradas", updD.length],
      ["Atividades novas", newA.length], ["Atividades alteradas", updA.length],
    ].map(([l, n]) => `<div class="panel"><div class="kpi-label">${l}</div><div class="kpi-value" style="font-size:1.5rem">${n}</div></div>`).join("");

    const rows = [
      ...newI.map((p) => `<div class="import-row"><span class="badge ok">Nova</span> <strong>${esc(p.id)}</strong> · ${esc(p.data.nome)}</div>`),
      ...updI.map((p) => `<div class="import-row"><span class="badge accent">Alterar</span> <strong>${esc(p.id)}</strong> · ${esc(p.nome)}
          <ul class="h-changes">${p.changes.map((c) => `<li>${renderChange(c)}</li>`).join("")}</ul></div>`),
      ...newD.map((p) => `<div class="import-row"><span class="badge ok">Nova decisão</span> ${esc(p.data.pauta)}</div>`),
      ...updD.map((p) => `<div class="import-row"><span class="badge accent">Alterar decisão</span> ${esc(p.pauta)}
          <ul class="h-changes">${p.changes.map((c) => `<li>${renderChange(c)}</li>`).join("")}</ul></div>`),
      ...newA.map((p) => `<div class="import-row"><span class="badge ok">Nova atividade</span> <strong>${esc(p.iniId)}</strong> · ${esc(p.data.nome)}</div>`),
      ...updA.map((p) => `<div class="import-row"><span class="badge accent">Alterar atividade</span> <strong>${esc(p.iniId)}</strong> · ${esc(p.nome)}
          <ul class="h-changes">${p.changes.map((c) => `<li>${renderChange(c)}</li>`).join("")}</ul></div>`),
      ...(plan.newAreas?.length ? [`<div class="import-row"><span class="badge warn">Áreas novas</span> ${esc(plan.newAreas.join(", "))} — serão criadas nos Cadastros</div>`] : []),
      ...(plan.skipped.length ? [`<div class="import-row muted">Ignoradas (iniciativa não encontrada): ${esc(plan.skipped.join(" · "))}</div>`] : []),
    ];
    $("import-list").innerHTML = rows.length ? rows.join("") : `<div class="import-row muted">O painel já está igual à planilha. Nada a importar.</div>`;
    $("import-apply").disabled = total === 0;
    $("import-apply").textContent = total ? `Aplicar ${total} alterações` : "Nada a aplicar";
    openModal("modal-import");
  }

  function applyImport() {
    if (!pendingPlan) return;
    const n = A.store.applyImportPlan(pendingPlan);
    pendingPlan = null;
    closeModal("modal-import");
    toast(`Importação concluída: ${n} alterações aplicadas e registradas no histórico.`);
  }

  function init() {
    setupInitiativeSelects();
    $("initiative-form").addEventListener("submit", submitInitiative);
    $("ini-valor").addEventListener("change", updateCalcBox);
    $("ini-esforco").addEventListener("change", updateCalcBox);
    $("ini-area").addEventListener("change", () => {
      // Para iniciativas novas, sugere o próximo ID da área escolhida.
      if (!editingId && /^[A-Z]{1,3}\d+$/.test($("ini-id").value)) $("ini-id").value = A.store.nextId($("ini-area").value);
    });
    $("ini-delete").addEventListener("click", () => editingId && deleteInitiative(editingId));
    $("ini-add-decision").addEventListener("click", () => {
      const id = editingId;
      closeModal("modal-initiative");
      openDecisionForm(null, id || "");
    });

    $("decision-form").addEventListener("submit", submitDecision);
    $("dec-delete").addEventListener("click", () => editingDecisionId && deleteDecision(editingDecisionId));

    $("user-form").addEventListener("submit", submitUser);
    $("user-options").addEventListener("click", (e) => {
      const b = e.target.closest("[data-user-pick]");
      if (!b) return;
      $("user-name").value = b.dataset.userPick;
      $("user-form").requestSubmit();
    });

    $("summary-copy").addEventListener("click", copySummary);
    $("import-apply").addEventListener("click", applyImport);
  }

  A.forms = {
    init, openInitiativeForm, deleteInitiative, openDecisionForm, deleteDecision,
    openUserForm, openMeetingSummary, openImportPreview,
  };
})();
