/* Formulário de compromisso (call ou reunião): data, horário, projeto, participantes e convite. */
(function () {
  const A = window.Altamar;
  const { esc, toast, openModal, closeModal, confirmDialog } = A.util;
  const $ = (id) => document.getElementById(id);

  let editingId = null;
  const pad = (n) => String(n).padStart(2, "0");
  const brToIso = (s) => { const d = A.store.calc.parseDate(s); return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ""; };
  const isoToBr = (s) => { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };

  function open(id = null, preset = {}) {
    const S = A.store;
    const c = id ? S.findCompromisso(id) : null;
    editingId = c ? c.id : null;
    const amanha = new Date(Date.now() + 86400000);
    const data = c || {
      titulo: "", data: preset.data || `${pad(amanha.getDate())}/${pad(amanha.getMonth() + 1)}/${amanha.getFullYear()}`,
      horaInicio: "10:00", horaFim: "11:00", projeto: preset.projeto || "", participantes: [], local: "", notas: "", enviarConvite: false,
    };
    const projetos = A.views.rankAll(S).filter((i) => i.status !== "Cancelado");
    const pessoas = S.pessoas({ ativas: true });

    $("cmp-body").innerHTML = `
      <div class="modal-head">
        <h3>${c ? "Editar reunião" : "Nova reunião"}</h3>
        <button class="btn btn-xs btn-ghost" data-action="close-modal" data-target="modal-compromisso" aria-label="Fechar">✕</button>
      </div>
      <form id="cmp-form" novalidate>
        <div class="field" style="margin-bottom:0.85rem">
          <label for="cmp-titulo">Título *</label>
          <input id="cmp-titulo" class="input" value="${esc(data.titulo)}" placeholder="Call com o time de Marketing sobre a campanha" autocomplete="off">
        </div>
        <div class="form-grid cols-3">
          <div class="field"><label for="cmp-data">Data *</label><input id="cmp-data" type="date" class="input" value="${esc(brToIso(data.data))}"></div>
          <div class="field"><label for="cmp-ini">Início *</label><input id="cmp-ini" type="time" class="input" value="${esc(data.horaInicio)}"></div>
          <div class="field"><label for="cmp-fim">Fim *</label><input id="cmp-fim" type="time" class="input" value="${esc(data.horaFim)}"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label for="cmp-projeto">Projeto relacionado</label>
            <select id="cmp-projeto" class="input"><option value="">— Nenhum —</option>
              ${projetos.map((i) => `<option value="${esc(i.id)}" ${i.id === data.projeto ? "selected" : ""}>${esc(i.id)} · ${esc(i.nome.length > 60 ? i.nome.slice(0, 60) + "…" : i.nome)}</option>`).join("")}
            </select></div>
          <div class="field"><label for="cmp-local">Local ou link</label><input id="cmp-local" class="input" value="${esc(data.local)}" placeholder="Sala de reunião, Google Meet…" autocomplete="off"></div>
        </div>
        <div class="field" style="margin-bottom:0.85rem">
          <label>Participantes</label>
          <div class="cmp-people">
            ${pessoas.map((p) => `
              <label class="cmp-person ${data.participantes.includes(p.nome) ? "on" : ""}" title="${p.email ? esc(p.email) : "Sem e-mail cadastrado"}">
                <input type="checkbox" value="${esc(p.nome)}" ${data.participantes.includes(p.nome) ? "checked" : ""}>
                ${esc(p.nome)}${p.email ? ' <span aria-label="tem e-mail">✉</span>' : ""}
              </label>`).join("") || `<span class="muted small">Cadastre pessoas em Cadastros.</span>`}
          </div>
        </div>
        <div class="field" style="margin-bottom:0.85rem">
          <label for="cmp-notas">Notas / pauta</label>
          <textarea id="cmp-notas" class="input" rows="2" style="min-height:0">${esc(data.notas)}</textarea>
        </div>
        <label class="checkbox"><input type="checkbox" id="cmp-convite" ${data.enviarConvite ? "checked" : ""}> Enviar convite do Google Agenda aos participantes</label>
        <div class="muted small" id="cmp-convite-info" style="margin:0.3rem 0 0 1.6rem"></div>
        <div class="field-error" id="cmp-error" role="alert"></div>
        <div class="modal-foot">
          ${c ? `<button type="button" class="btn btn-sm btn-danger-ghost" id="cmp-delete">Excluir</button>` : "<span></span>"}
          <div class="right">
            <button type="button" class="btn btn-outline" data-action="close-modal" data-target="modal-compromisso">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar</button>
          </div>
        </div>
      </form>`;
    updateInviteInfo();
    openModal("modal-compromisso");
    setTimeout(() => $("cmp-titulo").focus(), 40);
  }

  function selectedPeople() {
    return [...document.querySelectorAll("#cmp-body .cmp-person input:checked")].map((x) => x.value);
  }

  // Explica para quem o convite irá (só quem tem e-mail cadastrado).
  function updateInviteInfo() {
    const S = A.store;
    const info = $("cmp-convite-info");
    if (!info) return;
    const sel = selectedPeople();
    const com = sel.filter((n) => S.findPessoa(n)?.email);
    const sem = sel.filter((n) => !S.findPessoa(n)?.email);
    const g = A.google?.isConnected();
    info.innerHTML = !g ? "Funciona com o Google Agenda conectado (⚙️ Dados → Google Agenda)."
      : !sel.length ? "Marque os participantes acima."
      : `${com.length ? `Convite para: ${esc(com.join(", "))}.` : "Nenhum participante com e-mail."}${sem.length ? ` Sem e-mail (cadastre em Cadastros): ${esc(sem.join(", "))}.` : ""}`;
  }

  function submit(e) {
    e.preventDefault();
    const S = A.store;
    const r = S.saveCompromisso({
      id: editingId || undefined,
      titulo: $("cmp-titulo").value,
      data: isoToBr($("cmp-data").value),
      horaInicio: $("cmp-ini").value,
      horaFim: $("cmp-fim").value,
      projeto: $("cmp-projeto").value,
      participantes: selectedPeople(),
      local: $("cmp-local").value,
      notas: $("cmp-notas").value,
      enviarConvite: $("cmp-convite").checked,
    });
    if (!r.ok) { $("cmp-error").textContent = r.error; return; }
    closeModal("modal-compromisso");
    if (r.unchanged) return;
    toast(A.google?.isConnected() ? "Reunião salva. Indo para o Google Agenda…" : "Reunião salva no painel.");
  }

  function init() {
    const body = $("cmp-body");
    body.addEventListener("submit", (e) => { if (e.target.id === "cmp-form") submit(e); });
    body.addEventListener("change", (e) => {
      const p = e.target.closest(".cmp-person");
      if (p) { p.classList.toggle("on", e.target.checked); updateInviteInfo(); }
    });
    body.addEventListener("click", async (e) => {
      if (e.target.id !== "cmp-delete" || !editingId) return;
      const c = A.store.findCompromisso(editingId);
      if (!(await confirmDialog(`Excluir “${c.titulo}” (${c.data} ${c.horaInicio})?${A.google?.isConnected() ? " O evento também sai do Google Agenda." : ""}`,
        { title: "Excluir reunião", okLabel: "Excluir", danger: true }))) return;
      A.store.deleteCompromisso(editingId);
      closeModal("modal-compromisso");
      toast("Reunião excluída.", "warn");
    });
  }

  A.compromissos = { init, open };
})();
