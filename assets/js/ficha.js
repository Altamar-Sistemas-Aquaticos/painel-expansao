/* Ficha de novo projeto: dados do projeto + atividades + matriz RACI, validados e salvos como Rascunho. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum, toast, openModal, closeModal, confirmDialog } = A.util;
  const $ = (id) => document.getElementById(id);

  const DRAFT_KEY = "altamar_ficha_rascunho";
  const ROLES = ["R", "A", "C", "I"];
  const ROLE_LABEL = { R: "Responsável — executa", A: "Aprovador — aprova a entrega", C: "Consultado — participa/opina", I: "Informado — acompanha o status" };

  let draft = null;
  let errors = []; // [{ key, msg }]
  let tried = false; // só mostra erros depois da 1ª tentativa de validar/salvar

  const blankActivity = () => ({ nome: "", entregavel: "", inicio: "", prazo: "", dependeDe: "", raci: {} });
  function newDraft(area) {
    const S = A.store;
    const user = S.findPessoa(S.state.settings.user || "")?.nome || "";
    return {
      nome: "", area: area || (S.state.ui.area !== "ALL" ? S.state.ui.area : S.areas()[0].key), responsavel: user, autor: user, eixo: "",
      valor: "", esforco: "", urgencia: "", onda: "", prazo: "", objetivo: "", prontoQuando: "", indicador: "", investimento: false, observacoes: "",
      equipe: user ? [user] : [],
      atividades: [blankActivity(), blankActivity()].map((a) => ({ ...a, raci: user ? { [user]: "R" } : {} })),
    };
  }

  const saveDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {} };
  const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; } };
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} };
  const hasContent = (d) => d && (d.nome || d.objetivo || d.atividades.some((a) => a.nome));

  const isoToBR = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };

  /* ---------- Validação ---------- */
  function validate() {
    const S = A.store;
    const e = [];
    const req = (key, label) => { if (!String(draft[key] ?? "").trim()) e.push({ key, msg: `${label} é obrigatório.` }); };
    req("nome", "Nome do projeto"); req("area", "Área"); req("responsavel", "Responsável pelo projeto");
    req("objetivo", "Objetivo"); req("prontoQuando", "Pronto quando");
    req("valor", "Valor"); req("esforco", "Esforço");
    if (draft.prontoQuando && S.calc.parseDate(draft.prontoQuando)) e.push({ key: "prontoQuando", msg: "“Pronto quando” deve descrever o resultado final, não uma data (a data vai em Prazo final)." });
    const dup = S.state.data.initiatives.find((i) => A.util.norm(i.nome) === A.util.norm(draft.nome));
    if (draft.nome && dup) e.push({ key: "nome", msg: `Já existe um projeto com esse nome (${dup.id}).` });

    const acts = draft.atividades;
    if (acts.filter((a) => a.nome.trim()).length < 2) e.push({ key: "acts", msg: "Cadastre pelo menos 2 atividades." });
    acts.forEach((a, i) => {
      const n = i + 1;
      if (!a.nome.trim()) e.push({ key: `a${i}.nome`, msg: `Atividade ${n}: falta o nome.` });
      if (!a.entregavel.trim()) e.push({ key: `a${i}.entregavel`, msg: `Atividade ${n}: informe o entregável (o que existe quando ela termina).` });
      if (!a.prazo) e.push({ key: `a${i}.prazo`, msg: `Atividade ${n}: informe o prazo.` });
      if (a.inicio && a.prazo && a.inicio > a.prazo) e.push({ key: `a${i}.inicio`, msg: `Atividade ${n}: início depois do prazo.` });
      if (a.dependeDe && a.prazo && acts[a.dependeDe - 1]?.prazo > a.prazo) {
        e.push({ key: `a${i}.prazo`, msg: `Atividade ${n}: prazo antes do prazo da atividade ${a.dependeDe}, da qual depende.` });
      }
      const roles = Object.values(a.raci);
      const nR = roles.filter((r) => r === "R").length;
      if (nR !== 1) e.push({ key: `r${i}`, msg: `Atividade ${n}: a RACI precisa de exatamente um R (responsável).` });
      if (roles.filter((r) => r === "A").length > 1) e.push({ key: `r${i}`, msg: `Atividade ${n}: no máximo um A (aprovador).` });
    });
    const ultimo = acts.map((a) => a.prazo).filter(Boolean).sort().pop();
    if (draft.prazo && ultimo && ultimo > draft.prazo) e.push({ key: "prazo", msg: `Prazo final do projeto (${isoToBR(draft.prazo)}) antes do prazo da última atividade (${isoToBR(ultimo)}).` });
    return e;
  }

  /* ---------- Renderização ---------- */
  const errFor = (key) => (tried ? errors.filter((x) => x.key === key) : []);
  const bad = (key) => (errFor(key).length ? "invalid" : "");

  function calcBox() {
    const S = A.store;
    const v = Number(draft.valor), es = Number(draft.esforco);
    const id = draft.area ? S.nextId(draft.area) : "—";
    if (!v || !es) return `<span>ID: <strong>${esc(id)}</strong></span><span class="muted">Escolha Valor e Esforço para ver o V÷E e a linha de corte.</span>`;
    const cut = S.calc.cutoff([...S.state.data.initiatives, { valor: v, esforco: es }]).value;
    const ve = v / es, above = ve >= cut - 1e-9;
    return `
      <span>ID: <strong>${esc(id)}</strong></span>
      <span>V ÷ E: <strong style="color:${above ? "var(--ok)" : "var(--text-muted)"}">${fmtNum(ve)}</strong></span>
      <span>Linha de corte: <strong>${fmtNum(cut)}</strong></span>
      <span>Tempo estimado: <strong>${esc(A.meta.tempoPorEsforco(es))}</strong></span>
      <span class="badge ${above ? "ok" : ""}">${above ? "Acima da linha — prioritário" : "Abaixo da linha"}</span>`;
  }

  const opt = (list, sel, blank = "— Escolha —") =>
    `<option value="">${esc(blank)}</option>` + list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? "selected" : ""}>${esc(l)}</option>`).join("");

  function projectSection() {
    const S = A.store;
    const f = (key) => `data-f="${key}" class="input ${bad(key)}"`;
    return `
      <section class="ficha-sec">
        <h4 class="ficha-h">1 · Projeto</h4>
        <div class="form-grid cols-3">
          <div class="field" style="grid-column:1/-1"><label>Nome do projeto *</label><input ${f("nome")} value="${esc(draft.nome)}" placeholder="ex.: Acompanhamento de vendas de produtos" autocomplete="off"></div>
          <div class="field"><label>Área *</label><select ${f("area")}>${opt(S.areas().map((a) => [a.key, `${a.key} (${a.code})`]), draft.area)}</select></div>
          <div class="field"><label>Responsável pelo projeto *</label><select ${f("responsavel")}>${opt(S.pessoas({ ativas: true }).map((p) => [p.nome, p.funcao ? `${p.nome} — ${p.funcao}` : p.nome]), draft.responsavel)}</select></div>
          <div class="field"><label>Prazo final</label><input type="date" ${f("prazo")} value="${esc(draft.prazo)}"></div>
          <div class="field"><label>Valor *</label><select ${f("valor")}>${A.meta.valorOptions(draft.valor, "— Escolha —")}</select></div>
          <div class="field"><label>Esforço *</label><select ${f("esforco")}>${A.meta.esforcoOptions(draft.esforco, "— Escolha —")}</select></div>
          <div class="field"><label>Urgência <span class="ajuda" title="Quanto se perde a cada mês de espera. Não muda o V÷E: aparece como etiqueta e desempata na Priorização.">?</span></label><select ${f("urgencia")}>${A.meta.urgenciaOptions(draft.urgencia || "", "— A definir —")}</select></div>
        </div>
        <div class="calc-box" id="ficha-calc">${calcBox()}</div>
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1"><label>Objetivo *</label><textarea ${f("objetivo")} rows="2" style="min-height:0" placeholder="Por que este projeto existe?">${esc(draft.objetivo)}</textarea></div>
          <div class="field" style="grid-column:1/-1"><label>Pronto quando *</label><textarea ${f("prontoQuando")} rows="2" style="min-height:0" placeholder="Qual resultado existe quando o projeto termina? (ex.: relatório mensal de faturamento por produto gerado automaticamente)">${esc(draft.prontoQuando)}</textarea></div>
          <div class="field"><label>Indicador de sucesso</label><input ${f("indicador")} value="${esc(draft.indicador)}" placeholder="Como vamos medir?" autocomplete="off"></div>
          <div class="field"><label>Observações</label><input ${f("observacoes")} value="${esc(draft.observacoes)}" placeholder="Contexto, riscos, justificativas" autocomplete="off"></div>
        </div>
        <label class="checkbox"><input type="checkbox" data-f="investimento" ${draft.investimento ? "checked" : ""}> Exige investimento (precisa de aprovação de verba)</label>
      </section>`;
  }

  function activitiesSection() {
    const rows = draft.atividades.map((a, i) => {
      const k = (af) => `data-a="${i}" data-af="${af}"`;
      const depOpts = `<option value="">—</option>` + draft.atividades.slice(0, i).map((_, j) => `<option value="${j + 1}" ${String(a.dependeDe) === String(j + 1) ? "selected" : ""}>${j + 1}</option>`).join("");
      return `
        <div class="ficha-act">
          <span class="ficha-n">${i + 1}</span>
          <div class="field"><label>Atividade *</label><textarea class="input ${bad(`a${i}.nome`)}" rows="1" ${k("nome")} placeholder="Ação + objeto (ex.: Mapear com a Bia onde estão os dados)">${esc(a.nome)}</textarea></div>
          <div class="field"><label>Entregável *</label><textarea class="input ${bad(`a${i}.entregavel`)}" rows="1" ${k("entregavel")} placeholder="O que existe quando termina">${esc(a.entregavel)}</textarea></div>
          <div class="field"><label>Início</label><input type="date" class="input ${bad(`a${i}.inicio`)}" ${k("inicio")} value="${esc(a.inicio)}"></div>
          <div class="field"><label>Prazo *</label><input type="date" class="input ${bad(`a${i}.prazo`)}" ${k("prazo")} value="${esc(a.prazo)}"></div>
          <div class="field"><label>Depende de</label><select class="input" ${k("dependeDe")}>${depOpts}</select></div>
          <button type="button" class="btn btn-xs btn-danger-ghost icon-btn ficha-del" data-ficha="del-act" data-i="${i}" title="Remover atividade" aria-label="Remover atividade ${i + 1}" ${draft.atividades.length <= 1 ? "disabled" : ""}>✕</button>
        </div>`;
    }).join("");
    return `
      <section class="ficha-sec">
        <h4 class="ficha-h">2 · Atividades <span class="muted small">(mínimo 2)</span></h4>
        ${errFor("acts").map((x) => `<div class="field-error">${esc(x.msg)}</div>`).join("")}
        <div class="stack">${rows}</div>
        <button type="button" class="btn btn-sm btn-outline" data-ficha="add-act" style="margin-top:0.6rem">+ Adicionar atividade</button>
      </section>`;
  }

  function raciSection() {
    const S = A.store;
    const disponiveis = S.pessoas({ ativas: true }).map((p) => p.nome).filter((n) => !draft.equipe.includes(n));
    const head = draft.equipe.map((n) => `
      <th class="raci-person"><span>${esc(n)}</span><button type="button" class="raci-x" data-ficha="del-member" data-name="${esc(n)}" title="Tirar ${esc(n)} da equipe" aria-label="Tirar ${esc(n)} da equipe">✕</button></th>`).join("");
    const rows = draft.atividades.map((a, i) => {
      const ok = Object.values(a.raci).filter((r) => r === "R").length === 1;
      const cells = draft.equipe.map((n) => `
        <td><select class="raci-cell raci-${a.raci[n] || "none"}" data-raci="${i}" data-name="${esc(n)}" aria-label="Papel de ${esc(n)} na atividade ${i + 1}">
          <option value="">—</option>${ROLES.map((r) => `<option ${a.raci[n] === r ? "selected" : ""} title="${esc(ROLE_LABEL[r])}">${r}</option>`).join("")}
        </select></td>`).join("");
      return `<tr class="${bad(`r${i}`)}"><th class="raci-act"><span class="raci-ok">${ok ? "✓" : "⚠"}</span> ${i + 1}. ${esc(a.nome || "(sem nome)")}</th>${cells}</tr>`;
    }).join("");
    return `
      <section class="ficha-sec">
        <h4 class="ficha-h">3 · Matriz RACI</h4>
        <div class="raci-legend">${ROLES.map((r) => `<span class="raci-tag raci-${r}">${r}</span> ${esc(ROLE_LABEL[r])}`).join(" · ")}</div>
        <div class="row" style="margin:0.6rem 0">
          <select class="input input-sm" id="ficha-add-member" aria-label="Adicionar pessoa à equipe">
            <option value="">+ Adicionar pessoa à equipe…</option>${disponiveis.map((n) => `<option>${esc(n)}</option>`).join("")}
          </select>
          <input class="input input-sm" id="ficha-new-person" placeholder="ou cadastre alguém novo" autocomplete="off" style="max-width:220px">
          <button type="button" class="btn btn-sm btn-outline" data-ficha="new-person">Cadastrar e incluir</button>
        </div>
        ${draft.equipe.length ? `
        <div class="table-wrap">
          <table class="data raci-table">
            <thead><tr><th>Atividade</th>${head}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : `<div class="empty">Adicione as pessoas da equipe para distribuir os papéis.</div>`}
        <div class="muted small" style="margin-top:0.4rem">Cada atividade precisa de exatamente um <strong>R</strong>; no máximo um <strong>A</strong>; C e I quantos forem necessários.</div>
      </section>`;
  }

  function render() {
    errors = validate();
    const errList = tried && errors.length
      ? `<div class="ficha-errors"><strong>${errors.length} pendência(s):</strong><ul>${errors.slice(0, 8).map((x) => `<li>${esc(x.msg)}</li>`).join("")}${errors.length > 8 ? `<li>+ ${errors.length - 8}…</li>` : ""}</ul></div>` : "";
    $("ficha-body").innerHTML = `
      <div class="modal-head">
        <h3 id="ficha-title">Novo projeto</h3>
        <button class="btn btn-xs btn-ghost" data-ficha="close" aria-label="Fechar">✕</button>
      </div>
      <p class="muted small" style="margin-top:0">O projeto entra na Triagem como <strong>Rascunho</strong>, para ser avaliado. O preenchimento fica guardado se você fechar a ficha antes de salvar.</p>
      ${errList}
      ${projectSection()}
      <div id="ficha-acts">${activitiesSection()}</div>
      <div id="ficha-raci">${raciSection()}</div>
      <div class="modal-foot">
        <button type="button" class="btn btn-sm btn-danger-ghost" data-ficha="discard">Descartar ficha</button>
        <div class="right">
          <button type="button" class="btn btn-outline" data-ficha="validate">Validar</button>
          <button type="button" class="btn btn-primary" data-ficha="save">Salvar como rascunho</button>
        </div>
      </div>`;
  }

  // Redesenha só uma parte (mantém o foco de quem está digitando nas outras).
  function refresh(part) {
    errors = validate();
    if (part === "calc") $("ficha-calc").innerHTML = calcBox();
    if (part === "acts") $("ficha-acts").innerHTML = activitiesSection();
    if (part === "raci") $("ficha-raci").innerHTML = raciSection();
  }

  /* ---------- Ações ---------- */
  function open(area) {
    const saved = draft || loadDraft();
    draft = hasContent(saved) ? saved : newDraft(area);
    if (area && !hasContent(saved)) draft.area = area;
    tried = false;
    render();
    openModal("modal-ficha");
    if (hasContent(saved)) toast("Continuando a ficha que você começou.", "ok", 2500);
  }

  function addMember(nome) {
    if (!nome || draft.equipe.includes(nome)) return;
    draft.equipe.push(nome);
    saveDraft();
    refresh("raci");
  }

  async function save() {
    tried = true;
    errors = validate();
    if (errors.length) {
      render();
      $("ficha-body").scrollTop = 0;
      return toast(`Faltam ${errors.length} ajuste(s) antes de salvar.`, "warn");
    }
    const S = A.store;
    const input = {
      nome: draft.nome.trim(), area: draft.area, responsavel: draft.responsavel, autor: A.store.state.settings.user || "", eixo: draft.eixo || "",
      valor: Number(draft.valor), esforco: Number(draft.esforco), urgencia: Number(draft.urgencia) || 0, onda: "Fila", prazo: isoToBR(draft.prazo),
      objetivo: draft.objetivo.trim(), prontoQuando: draft.prontoQuando.trim(), indicador: draft.indicador.trim(),
      investimento: draft.investimento ? "Sim" : "Não", observacoes: draft.observacoes.trim(),
    };
    const acts = draft.atividades.map((a) => ({
      nome: a.nome.trim(), entregavel: a.entregavel.trim(), inicio: isoToBR(a.inicio), prazo: isoToBR(a.prazo),
      dependeDe: a.dependeDe ? String(a.dependeDe) : "", raci: a.raci,
    }));
    const r = S.createProject(input, acts);
    if (!r.ok) return toast(r.error, "error", 5000);
    draft = null;
    clearDraft();
    closeModal("modal-ficha");
    toast(`${r.item.id} salvo como Rascunho com ${r.item.atividades.length} atividades.`);
    location.hash = A.drill.projectHref(r.item.id);
  }

  function init() {
    const body = $("ficha-body");

    body.addEventListener("input", (e) => {
      const el = e.target;
      if (el.dataset.f) {
        draft[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value;
        if (["valor", "esforco", "area"].includes(el.dataset.f)) refresh("calc");
        saveDraft();
      } else if (el.dataset.a != null && el.dataset.af) {
        draft.atividades[Number(el.dataset.a)][el.dataset.af] = el.value;
        if (el.dataset.af === "nome") refresh("raci");
        saveDraft();
      }
    });

    body.addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset.f === "responsavel" && el.value) {
        // O responsável entra na equipe e vira R das atividades que ainda não têm responsável.
        if (!draft.equipe.includes(el.value)) draft.equipe.push(el.value);
        draft.atividades.forEach((a) => { if (!Object.values(a.raci).includes("R")) a.raci[el.value] = "R"; });
        saveDraft();
        refresh("raci");
      } else if (el.dataset.raci != null) {
        const a = draft.atividades[Number(el.dataset.raci)];
        const nome = el.dataset.name, role = el.value;
        if (role === "R" || role === "A") Object.keys(a.raci).forEach((n) => { if (a.raci[n] === role) delete a.raci[n]; });
        if (role) a.raci[nome] = role; else delete a.raci[nome];
        saveDraft();
        refresh("raci");
      } else if (el.id === "ficha-add-member") {
        addMember(el.value);
      } else if (tried && (el.dataset.f || el.dataset.a != null)) {
        render();
      }
    });

    body.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-ficha]");
      if (!b) return;
      const S = A.store;
      switch (b.dataset.ficha) {
        case "add-act": {
          const a = blankActivity();
          if (draft.responsavel) a.raci[draft.responsavel] = "R";
          draft.atividades.push(a);
          saveDraft(); refresh("acts"); refresh("raci");
          const fields = $("ficha-acts").querySelectorAll('[data-af="nome"]');
          fields[fields.length - 1]?.focus();
          break;
        }
        case "del-act": {
          const i = Number(b.dataset.i);
          draft.atividades.splice(i, 1);
          // Renumera as dependências depois da remoção.
          draft.atividades.forEach((a) => {
            const d = Number(a.dependeDe);
            if (d === i + 1) a.dependeDe = "";
            else if (d > i + 1) a.dependeDe = String(d - 1);
          });
          saveDraft(); refresh("acts"); refresh("raci");
          break;
        }
        case "del-member": {
          const n = b.dataset.name;
          draft.equipe = draft.equipe.filter((x) => x !== n);
          draft.atividades.forEach((a) => delete a.raci[n]);
          saveDraft(); refresh("raci");
          break;
        }
        case "new-person": {
          const input = $("ficha-new-person");
          const nome = input.value.trim();
          if (!nome) return input.focus();
          const r = S.findPessoa(nome) ? { ok: true, item: S.findPessoa(nome) } : S.savePessoa({ nome });
          if (!r.ok) return toast(r.error, "error");
          addMember(r.item.nome);
          toast(`${r.item.nome} cadastrado(a) e incluído(a) na equipe.`);
          break;
        }
        case "validate":
          tried = true;
          render();
          if (!errors.length) toast("Ficha completa. Pode salvar.");
          break;
        case "save":
          save();
          break;
        case "discard":
          if (await confirmDialog("Descartar tudo o que foi preenchido nesta ficha?", { title: "Descartar ficha", okLabel: "Descartar", danger: true })) {
            draft = null; clearDraft(); closeModal("modal-ficha");
          }
          break;
        case "close":
          closeModal("modal-ficha");
          if (hasContent(draft)) toast("Ficha guardada. Clique em “+ Novo projeto” para continuar.", "ok", 3500);
          break;
      }
    });
  }

  A.ficha = { init, open };
})();
