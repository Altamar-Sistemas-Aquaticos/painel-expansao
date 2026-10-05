/* Sprint: planejamento (escolher as atividades do mês) e janela da atividade com checklist. */
(function () {
  const A = window.Altamar;
  const { esc, toast, openModal, closeModal, confirmDialog } = A.util;
  const $ = (id) => document.getElementById(id);

  const ONDA_ORDER = Object.fromEntries(A.meta.ONDAS.map((o, i) => [o.key, i]));
  const aberta = (a) => a.status !== "Concluído" && a.status !== "Cancelado";

  /* ---------- Planejamento ---------- */
  let plano = null; // Set de "iniId|actId"

  function planCounter() {
    const { min, max } = A.store.calc.sprintLimites();
    const n = plano.size;
    const cls = n > max ? "bad" : n < min ? "warnc" : "good";
    const msg = n > max ? `acima do limite de ${max}` : n < min ? `o combinado é de ${min} a ${max}` : "dentro do limite";
    $("plan-counter").innerHTML = `<span class="kchip ${cls}"><strong>${n}</strong> atividade(s) · ${msg}</span>`;
  }

  function openPlan() {
    const S = A.store;
    const sp = S.sprintAtual();
    if (!sp) return toast("Abra um ciclo primeiro.", "warn");
    plano = new Set(S.sprintItems(sp).map(({ it, a }) => `${it.id}|${a.id}`));
    const si = A.sprintInfo(S);
    const projetos = S.state.data.initiatives
      .filter((it) => it.situacao !== "Rascunho" && it.status !== "Concluído" && it.status !== "Cancelado" && it.atividades.some(aberta))
      .map((it) => ({ it, sel: it.atividades.filter((a) => plano.has(`${it.id}|${a.id}`)).length }))
      .sort((x, y) => (y.sel > 0) - (x.sel > 0) || ONDA_ORDER[x.it.onda] - ONDA_ORDER[y.it.onda] || S.calc.ve(y.it) - S.calc.ve(x.it));

    $("plan-body").innerHTML = `
      <div class="modal-head">
        <h3>Planejar o ${esc(si.rotulo)} <span class="muted small">· ${esc(si.periodo)}</span></h3>
        <button class="btn btn-xs btn-ghost" data-action="close-modal" data-target="modal-sprint" aria-label="Fechar">✕</button>
      </div>
      <p class="muted small" style="margin-top:0">Escolha as atividades que vão andar nestas 4 semanas. Comece pelos projetos da onda atual e pelos que já estão em andamento.</p>
      <div class="field">
        <label for="plan-objetivo">Objetivo do ciclo</label>
        <input id="plan-objetivo" class="input" value="${esc(sp.objetivo)}" placeholder="ex.: primeiras entregas de Vendas e o formulário de requisitos rodando" autocomplete="off">
      </div>
      <div id="plan-counter" class="plan-counter"></div>
      <div class="plan-list">
        ${projetos.map(({ it, sel }) => `
          <details class="plan-proj" ${sel || it.onda === "Onda 1" ? "open" : ""} style="--ac:${A.area(it.area).cor}">
            <summary>
              <span class="act-card-id">${esc(it.id)}</span>
              <span class="plan-proj-name">${esc(it.nome)}</span>
              <span class="badge">${esc(it.onda)}</span>
              <span class="muted small" data-plan-count="${esc(it.id)}">${sel ? `${sel} no ciclo` : ""}</span>
            </summary>
            ${it.atividades.filter(aberta).map((a) => {
              const k = `${it.id}|${a.id}`;
              const r = A.store.raciPeople(a.raci, "R")[0];
              return `
                <label class="plan-act">
                  <input type="checkbox" data-plan="${esc(k)}" ${plano.has(k) ? "checked" : ""}>
                  <span class="plan-act-name">${esc(a.nome)}</span>
                  <span class="muted small">${esc(r || "sem R")}${a.prazo ? ` · ${esc(a.prazo)}` : ""}${a.status === "Em andamento" ? " · em andamento" : ""}</span>
                </label>`;
            }).join("")}
          </details>`).join("") || `<div class="empty">Nenhum projeto validado com atividades em aberto.</div>`}
      </div>
      <div class="modal-foot">
        <span class="muted small">Atividades fora do ciclo continuam no projeto, só não aparecem no Kanban.</span>
        <div class="right">
          <button type="button" class="btn btn-outline" data-action="close-modal" data-target="modal-sprint">Cancelar</button>
          <button type="button" class="btn btn-primary" id="plan-save">Salvar planejamento</button>
        </div>
      </div>`;
    planCounter();
    openModal("modal-sprint");
  }

  function savePlan() {
    const r = A.store.planSprint([...plano], $("plan-objetivo").value);
    if (!r.ok) return toast(r.error, "error");
    closeModal("modal-sprint");
    if (!r.unchanged) toast(`Ciclo planejado com ${r.total} atividade(s).`);
  }

  async function novaSprint() {
    const S = A.store;
    const si = A.sprintInfo(S);
    if (si.sp) {
      const pend = si.total - si.feitas;
      const ok = await confirmDialog(
        `Encerrar o ${si.rotulo} (${si.feitas} de ${si.total} feitas) e abrir o próximo ciclo?${pend ? ` As ${pend} atividade(s) não terminadas passam para o novo ciclo.` : ""}`,
        { title: "Encerrar ciclo", okLabel: "Encerrar e abrir" });
      if (!ok) return;
    }
    const r = S.novaSprint();
    toast(`${S.nomeCiclo(r.sprint)} aberto${r.levadas ? ` com ${r.levadas} atividade(s) da anterior` : ""}. Agora é planejar.`, "ok", 5000);
    openPlan();
  }

  /* ---------- Janela da atividade ---------- */
  let atual = null; // { ini, act }
  let ultimoSalvo = ""; // hora da última gravação feita nesta janela

  // Campos que a pessoa pode estar digitando: o redesenho da janela não pode apagar o que ainda não foi salvo.
  const CAMPOS_DIGITANDO = ["ck-new", "act-obs", "act-prazo"];
  function renderActivity() {
    const rascunho = Object.fromEntries(CAMPOS_DIGITANDO.map((id) => [id, $(id)?.value]));
    const foco = document.activeElement?.id;
    desenharAtividade();
    if (rascunho["ck-new"]) $("ck-new").value = rascunho["ck-new"];
    // Observação e prazo: mantém o texto digitado só se ainda estiver sendo editado.
    ["act-obs", "act-prazo"].forEach((id) => { if (foco === id && rascunho[id] != null && $(id)) $(id).value = rascunho[id]; });
    if (foco && $(foco)) $(foco).focus();
  }

  function desenharAtividade() {
    const S = A.store;
    if (!atual) return;
    const it = S.findInitiative(atual.ini);
    const a = S.findActivity(atual.ini, atual.act);
    if (!it || !a) { closeModal("modal-activity"); atual = null; return; }
    const sp = S.sprintAtual();
    const naSprint = sp && S.noKanban(it, a, sp);
    const col = S.activityCol(a);
    const r = S.raciPeople(a.raci, "R")[0] || "";
    const feitos = a.checklist.filter((x) => x.feito).length;
    const outros = Object.entries(a.raci).filter(([, role]) => role !== "R").map(([n, role]) => `${role}: ${n}`).join(" · ");
    // Perfil Visualização: só o responsável (R) atualiza o andamento; ninguém nesse perfil muda R, prazo ou sprint.
    const soVe = A.nuvem?.perfil() === "visualizacao";
    const somenteLeitura = soVe && r !== S.state.settings.user;

    $("act-body").innerHTML = `
      <div class="modal-head">
        <div class="act-modal-proj" style="--ac:${A.area(it.area).cor}">
          <span class="act-card-id">${esc(it.id)}</span>
          <a href="${A.drill.projectHref(it.id)}" data-nav data-close-act>${esc(it.nome)} · ver projeto completo →</a>
        </div>
        <button class="btn btn-xs btn-ghost" data-action="close-modal" data-target="modal-activity" aria-label="Fechar">✕</button>
      </div>
      ${soVe ? `<div class="perfil-aviso">${somenteLeitura ? "Somente leitura: só o responsável (R) atualiza esta atividade." : "Você é o responsável: atualize a situação, o checklist e as observações."}</div>` : ""}
      <h3 class="act-modal-title">${esc(a.nome)}</h3>
      ${a.entregavel ? `<p class="act-modal-deliv"><strong>Entregável:</strong> ${esc(a.entregavel)}</p>` : ""}

      <div class="form-grid cols-3">
        <div class="field">
          <label for="act-col">Situação</label>
          <select id="act-col" class="input">
            ${A.meta.SPRINT_COLUNAS.map((c) => `<option value="${c.key}" ${c.key === col ? "selected" : ""}>${esc(c.label)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="act-r">Responsável (R)</label>
          <select id="act-r" class="input">${A.ui.peopleOptions(r, { blank: "— Sem R —" })}</select>
        </div>
        <div class="field">
          <label for="act-prazo">Prazo</label>
          <input id="act-prazo" class="input" value="${esc(a.prazo)}" placeholder="dd/mm/aaaa" autocomplete="off">
        </div>
      </div>
      ${outros ? `<div class="muted small" style="margin:-0.3rem 0 0.6rem">${esc(outros)}</div>` : ""}

      <section class="act-check">
        <div class="act-check-head">
          <strong>Checklist</strong>
          <span class="muted small">${a.checklist.length ? `${feitos} de ${a.checklist.length} · ${a.pct}%` : "Quebre a atividade em passos para acompanhar o andamento"}</span>
        </div>
        ${a.checklist.length ? `<div class="act-check-bar"><span style="width:${a.pct}%"></span></div>` : ""}
        <ul class="act-check-list">
          ${a.checklist.map((x) => `
            <li class="${x.feito ? "done" : ""}">
              <label><input type="checkbox" data-ck-toggle="${esc(x.id)}" ${x.feito ? "checked" : ""}> <span>${esc(x.texto)}</span></label>
              <button type="button" class="raci-x" data-ck-del="${esc(x.id)}" aria-label="Remover passo">✕</button>
            </li>`).join("")}
        </ul>
        <form id="ck-form" class="act-check-add" autocomplete="off">
          <input id="ck-new" class="input input-sm" placeholder="Novo passo (ex.: enviar minuta para a Maíra)">
          <button class="btn btn-sm btn-outline" type="submit">+ Adicionar passo</button>
        </form>
        <div class="muted small act-check-dica">Digite o passo e clique em “+ Adicionar passo” (ou Enter). Ele aparece na lista acima, já salvo.</div>
      </section>

      <div class="field">
        <label for="act-obs">Observações / o que está travando</label>
        <textarea id="act-obs" class="input" rows="2" style="min-height:0">${esc(a.observacoes)}</textarea>
      </div>

      <div class="modal-foot">
        <div class="row">
          ${sp ? `<button type="button" class="btn btn-sm ${naSprint ? "btn-danger-ghost" : "btn-outline"}" id="act-sprint-toggle">${naSprint ? "Tirar do Kanban" : "Colocar no Kanban"}</button>` : ""}
        </div>
        <div class="right">
          <span class="act-salvo muted small" id="act-salvo">${ultimoSalvo ? `✓ Salvo às ${ultimoSalvo}` : ""}</span>
          <button type="button" class="btn btn-primary" id="act-salvar">Salvar</button>
        </div>
      </div>`;
    $("act-body").classList.toggle("somente-leitura", somenteLeitura);
    if (soVe) { $("act-r").disabled = true; $("act-prazo").disabled = true; }
  }

  function openActivity(key) {
    const [ini, act] = String(key).split("|");
    if (!A.store.findActivity(ini, act)) return toast("Atividade não encontrada.", "error");
    atual = { ini, act };
    ultimoSalvo = "";
    if ($("ck-new")) $("ck-new").value = "";
    desenharAtividade();
    openModal("modal-activity");
  }

  const cur = () => A.store.findActivity(atual.ini, atual.act);
  // Grava pela mesma via do Kanban (inclusive para quem só visualiza e é o responsável R da atividade).
  const saveAct = (patch) => Promise.resolve(A.board.salvarAtividade(atual.ini, atual.act, patch)).then((r) => {
    if (r?.ok !== false) marcarSalvo();
    return r;
  });
  function marcarSalvo() {
    ultimoSalvo = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const el = $("act-salvo");
    if (el) { el.textContent = `✓ Salvo às ${ultimoSalvo}`; el.classList.remove("pisca"); void el.offsetWidth; el.classList.add("pisca"); }
  }

  // Salvar geral: grava o que ainda está nos campos (passo digitado, observação, prazo) e fecha.
  async function salvarTudo({ fechar = true } = {}) {
    if (!atual || !cur()) return;
    const a = cur();
    const patch = {};
    const passo = $("ck-new")?.value.trim();
    if (passo) patch.checklist = [...a.checklist, { texto: passo, feito: false }];
    const obs = $("act-obs")?.value;
    if (obs != null && obs !== a.observacoes) patch.observacoes = obs;
    const prazo = $("act-prazo")?.value.trim();
    if (prazo != null && !$("act-prazo").disabled && prazo !== a.prazo) patch.prazo = prazo;
    if (Object.keys(patch).length) {
      const r = await saveAct(patch);
      if (r?.ok === false) return;
      if ($("ck-new")) $("ck-new").value = "";
    }
    if (fechar) {
      closeModal("modal-activity");
      toast(Object.keys(patch).length ? "Atividade salva." : "Tudo já estava salvo.");
    }
  }

  function init() {
    $("plan-body").addEventListener("change", (e) => {
      const cb = e.target.closest("[data-plan]");
      if (!cb) return;
      if (cb.checked) plano.add(cb.dataset.plan); else plano.delete(cb.dataset.plan);
      const ini = cb.dataset.plan.split("|")[0];
      const n = [...plano].filter((k) => k.startsWith(`${ini}|`)).length;
      const el = $("plan-body").querySelector(`[data-plan-count="${CSS.escape(ini)}"]`);
      if (el) el.textContent = n ? `${n} no ciclo` : "";
      planCounter();
    });
    $("plan-body").addEventListener("click", (e) => { if (e.target.id === "plan-save") savePlan(); });

    const body = $("act-body");
    body.addEventListener("change", (e) => {
      const el = e.target;
      if (!atual) return;
      if (el.id === "act-col") A.board.moveActivity(atual.ini, atual.act, el.value);
      else if (el.id === "act-r") {
        const r = A.store.setRaci(atual.ini, atual.act, el.value || (A.store.raciPeople(cur().raci, "R")[0] || ""), el.value ? "R" : "");
        if (!r.ok) toast(r.error, "error");
      } else if (el.id === "act-prazo") saveAct({ prazo: el.value.trim() });
      else if (el.id === "act-obs") saveAct({ observacoes: el.value });
      else if (el.dataset.ckToggle) {
        saveAct({ checklist: cur().checklist.map((x) => (x.id === el.dataset.ckToggle ? { ...x, feito: el.checked } : x)) });
      }
    });
    body.addEventListener("click", (e) => {
      if (!atual) return;
      const del = e.target.closest("[data-ck-del]");
      if (del) saveAct({ checklist: cur().checklist.filter((x) => x.id !== del.dataset.ckDel) });
      if (e.target.id === "act-sprint-toggle") {
        const sp = A.store.sprintAtual();
        const dentro = A.store.noKanban(A.store.findInitiative(atual.ini), cur(), sp);
        Promise.resolve(saveAct({ sprint: dentro ? `-${sp.id}` : sp.id }))
          .then((r) => { if (r?.ok !== false) toast(dentro ? "Atividade tirada do Kanban." : "Atividade colocada no Kanban."); });
      }
      if (e.target.closest("[data-close-act]")) closeModal("modal-activity");
    });
    body.addEventListener("submit", (e) => {
      if (e.target.id !== "ck-form") return;
      e.preventDefault();
      const texto = $("ck-new").value.trim();
      if (!texto) return toast("Escreva o passo antes de adicionar.", "warn");
      $("ck-new").value = ""; // limpa já, para o redesenho não trazer o texto de volta
      saveAct({ checklist: [...cur().checklist, { texto, feito: false }] })
        .then((r) => { if (r?.ok === false) $("ck-new").value = texto; setTimeout(() => $("ck-new")?.focus(), 0); });
    });
    body.addEventListener("click", (e) => { if (e.target.id === "act-salvar") salvarTudo(); });
    // Fechar no ✕ ou fora da janela também guarda o que ficou digitado (nada se perde).
    $("modal-activity").addEventListener("modal:dismiss", () => salvarTudo({ fechar: false }));
    // Mantém a janela atualizada quando os dados mudam (ex.: arrastar o card com ela aberta),
    // sem apagar o que está sendo digitado.
    A.store.subscribe(() => {
      if (!atual || !$("modal-activity").classList.contains("open")) return;
      renderActivity();
    });
  }

  A.sprint = { init, openPlan, novaSprint, openActivity };
})();
