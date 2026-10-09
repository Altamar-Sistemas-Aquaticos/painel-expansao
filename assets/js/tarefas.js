/* Minhas tarefas: o Kanban pessoal de cada pessoa, fora dos projetos.
   Fica numa tabela própria do banco (supabase/07_tarefas_pessoais.sql). O dono decide em cada tarefa:
   🔒 privada (só ele vê) ou 👁 visível para a gestão (Pedro e diretoria). Só o dono mexe nas suas.
   Sem o banco (uso local), as tarefas ficam guardadas neste navegador. */
(function () {
  const A = window.Altamar;
  const { esc, toast } = A.util;
  const $ = (id) => document.getElementById(id);
  const CHAVE_LOCAL = "altamar_tarefas_local";
  const COLS = () => A.meta.SPRINT_COLUNAS;
  const PROXIMA = { todo: "doing", doing: "done", waiting: "doing", blocked: "doing" };

  let lista = [];          // tarefas que o banco devolve: as minhas + as visíveis dos outros (para a gestão)
  let carregado = false;
  let faltaScript = false;
  let canal = null;
  let vista = "minhas";    // "minhas" | "equipe"

  const cliente = () => A.nuvem?.cliente?.() || null;
  const local = () => !cliente();
  const meuEmail = () => (local() ? "local" : A.nuvem.email());
  const ehGestao = () => !local() ? ["admin", "diretoria"].includes(A.nuvem.perfil()) : true;
  const minhas = () => lista.filter((t) => t.dono_email === meuEmail());
  const daEquipe = () => lista.filter((t) => t.dono_email !== meuEmail() && t.visivel);
  const hoje = () => { const h = new Date(); h.setHours(0, 0, 0, 0); return h; };
  const dataDe = (iso) => (iso ? new Date(`${iso}T00:00:00`) : null);
  const br = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

  /* ---------- Dados ---------- */
  function lerLocal() { try { return JSON.parse(localStorage.getItem(CHAVE_LOCAL) || "[]"); } catch { return []; } }
  function gravarLocal() { try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(lista)); } catch {} }

  async function carregar() {
    if (local()) { lista = lerLocal(); carregado = true; return A.store.emit(); }
    const sb = cliente();
    const { data, error } = await sb.from("tarefas").select("*").order("criado_em");
    faltaScript = !!error && /does not exist|Could not find|relation/i.test(String(error.message || ""));
    lista = error ? [] : data;
    carregado = true;
    if (!canal && !faltaScript) {
      canal = sb.channel("tarefas-altamar")
        .on("postgres_changes", { event: "*", schema: "public", table: "tarefas" }, () => carregar())
        .subscribe();
    }
    A.store.emit();
  }
  function limpar() {
    lista = []; carregado = false;
    if (canal) { try { cliente()?.removeChannel(canal); } catch {} canal = null; }
  }

  async function criar(campos) {
    const nova = { titulo: campos.titulo, prazo: campos.prazo || null, projeto_id: campos.projeto_id || "", visivel: !!campos.visivel, coluna: "todo", observacao: "" };
    if (local()) {
      lista.push({ ...nova, id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, dono_email: "local", dono_nome: A.store.state.settings.user || "Eu", criado_em: new Date().toISOString() });
      gravarLocal(); return A.store.emit();
    }
    const { error } = await cliente().from("tarefas").insert(nova);
    if (error) return toast(faltaScript ? "O banco ainda não tem as tarefas pessoais. Avise o administrador (script 07)." : "Não foi possível criar a tarefa.", "error", 6000);
    await carregar();
  }
  async function mudar(id, patch) {
    if (local()) {
      lista = lista.map((t) => (t.id === id ? { ...t, ...patch, concluido_em: patch.coluna === "done" ? new Date().toISOString() : patch.coluna ? null : t.concluido_em } : t));
      gravarLocal(); return A.store.emit();
    }
    // Mostra já na tela e confirma com o banco.
    lista = lista.map((t) => (t.id === id ? { ...t, ...patch } : t)); A.store.emit();
    const { error } = await cliente().from("tarefas").update(patch).eq("id", id);
    if (error) toast(/etiquetas|checklist/i.test(String(error.message || "")) ? "O banco ainda não guarda etiquetas e checklist das tarefas. Avise o administrador (script 08)." : "Não foi possível salvar a tarefa.", "error", 6000);
    await carregar();
  }
  async function remover(id) {
    if (local()) { lista = lista.filter((t) => t.id !== id); gravarLocal(); return A.store.emit(); }
    const { error } = await cliente().from("tarefas").delete().eq("id", id);
    if (error) return toast("Não foi possível apagar a tarefa.", "error");
    await carregar();
  }

  /* ---------- Desenho ---------- */
  const etqs = (t) => (Array.isArray(t.etiquetas) ? t.etiquetas : []).map((id) => A.store.findEtiqueta(id)).filter(Boolean);
  const passos = (t) => (Array.isArray(t.checklist) ? t.checklist : []);
  const lblHtml = (e) => { const c = A.meta.corEtiqueta(e.cor); return `<span class="lbl" style="--lb:${c.bg};--lbt:${c.fg}">${esc(e.nome)}</span>`; };
  function prazoBadge(t) {
    const d = dataDe(t.prazo);
    if (!d) return "";
    const dias = Math.round((d - hoje()) / 86400000);
    const cls = t.coluna === "done" ? "feito" : dias < 0 ? "late" : dias <= 2 ? "soon" : "";
    const txt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "").replace(" de ", " ");
    return `<span class="tbadge prazo ${cls}" title="Prazo: ${br(t.prazo)}">🕑 ${esc(txt)}</span>`;
  }

  function card(S, t, editavel) {
    const proj = t.projeto_id && S.findInitiative(t.projeto_id);
    const ck = passos(t), feitos = ck.filter((x) => x.feito).length;
    return `
      <div class="k-card act-card tcard tarefa-card ${t.coluna}" ${editavel ? `draggable="true" data-tarefa-drag="${esc(t.id)}" data-tarefa-abrir="${esc(t.id)}" tabindex="0" role="button" title="Clique para abrir"` : ""} style="--ac:${proj ? A.area(proj.area).cor : "#5f6b7a"}">
        <div class="tcard-lbls">
          ${proj ? `<span class="lbl lbl-proj" title="${esc(`${proj.id} · ${proj.nome}`)}">${esc(proj.id)}</span>` : ""}
          ${etqs(t).map(lblHtml).join("")}
          <span class="tcard-sem" title="${t.visivel ? "Visível para a gestão (Pedro e diretoria)" : "Privada: só você vê"}">${t.visivel ? "👁" : "🔒"}</span>
        </div>
        <div class="tcard-title">${esc(t.titulo)}</div>
        <div class="tcard-foot">
          ${prazoBadge(t)}
          ${ck.length ? `<span class="tbadge ${feitos === ck.length ? "feito" : ""}">☑ ${feitos}/${ck.length}</span>` : ""}
          ${t.observacao ? `<span class="tbadge" title="${esc(t.observacao)}">≡</span>` : ""}
          ${!editavel ? `<span class="muted small" style="margin-left:auto">${esc(t.dono_nome || "")}</span>` : ""}
        </div>
        ${editavel ? `<div class="act-quick no-print">
          ${PROXIMA[t.coluna] ? `<button class="q-btn go" data-tarefa-mover="${esc(t.id)}" data-col="${PROXIMA[t.coluna]}">${t.coluna === "doing" ? "✓ Concluir" : t.coluna === "todo" ? "▶ Começar" : "✓ Resolvido"}</button>` : ""}
          ${t.coluna === "todo" || t.coluna === "doing" ? `<button class="q-btn warn" data-tarefa-mover="${esc(t.id)}" data-col="blocked" title="Travou">⚠</button>` : ""}
        </div>` : ""}
      </div>`;
  }

  /* ---------- Tarefa aberta (janela no estilo cartão) ---------- */
  let aberta = null;
  function desenharTarefa() {
    const S = A.store;
    const t = lista.find((x) => x.id === aberta);
    const body = $("tarefa-body");
    if (!t || !body) { aberta = null; return A.util.closeModal("modal-tarefa"); }
    const novo = $("tf-ck-new")?.value || "";
    const foco = document.activeElement?.id;
    const ck = passos(t), feitos = ck.filter((x) => x.feito).length;
    const pct = ck.length ? Math.round((feitos / ck.length) * 100) : 0;
    const projetos = S.state.data.initiatives.filter((i) => i.status !== "Cancelado" && i.status !== "Concluído" && A.visao.veProjeto(i))
      .sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
    const todas = S.etiquetas();
    body.innerHTML = `
      <div class="tmodal-head">
        <div class="tmodal-crumb"><span class="muted small">Minhas tarefas · ${t.visivel ? "👁 visível para a gestão" : "🔒 privada"}</span></div>
        <select id="tf-col" class="input input-sm tmodal-col" aria-label="Coluna">${COLS().map((c) => `<option value="${c.key}" ${c.key === t.coluna ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>
        <button class="btn btn-xs btn-ghost" data-action="close-modal" data-target="modal-tarefa" aria-label="Fechar">✕</button>
      </div>
      <div class="tmodal-main">
        <input id="tf-titulo" class="tmodal-title" value="${esc(t.titulo)}" aria-label="Título da tarefa" autocomplete="off">
        <div class="tmodal-resumo">
          <div><small>Entrega</small><input type="date" id="tf-prazo" class="input input-sm" value="${esc(t.prazo || "")}"></div>
          <div><small>Projeto</small><select id="tf-proj" class="input input-sm"><option value="">Sem projeto</option>
            ${projetos.map((i) => `<option value="${esc(i.id)}" ${i.id === t.projeto_id ? "selected" : ""}>${esc(i.id)} · ${esc(i.nome.length > 34 ? i.nome.slice(0, 34) + "…" : i.nome)}</option>`).join("")}</select></div>
          <div><small>Quem vê</small><label class="mb-row"><input type="checkbox" id="tf-vis" ${t.visivel ? "checked" : ""}> 👁 Visível para a gestão</label></div>
        </div>
        <div><small class="tf-rot">Etiquetas</small>
          <div class="tcard-lbls">${todas.length ? todas.map((e) => { const c = A.meta.corEtiqueta(e.cor); const on = (t.etiquetas || []).includes(e.id);
            return `<button type="button" class="lbl lbl-filtro ${on ? "on" : ""}" data-tf-etq="${esc(e.id)}" style="--lb:${c.bg};--lbt:${c.fg}" aria-pressed="${on}">${esc(e.nome)}</button>`; }).join("")
            : `<span class="muted small">Nenhuma etiqueta criada ainda (a gestão cria no Kanban).</span>`}</div></div>
        <section class="tmodal-sec">
          <h4>≡ Descrição</h4>
          <textarea id="tf-obs" class="input" rows="3" placeholder="Detalhes, contatos, o que falta…">${esc(t.observacao || "")}</textarea>
        </section>
        <section class="tmodal-sec act-check">
          <div class="act-check-head"><h4>☑ Checklist</h4><span class="muted small">${ck.length ? `${feitos} de ${ck.length}` : ""}</span></div>
          ${ck.length ? `<div class="act-check-bar ${feitos === ck.length ? "completo" : ""}"><span style="width:${pct}%"></span></div>` : ""}
          <ul class="act-check-list">${ck.map((x) => `
            <li class="${x.feito ? "done" : ""}"><label><input type="checkbox" data-tf-ck="${esc(x.id)}" ${x.feito ? "checked" : ""}> <span>${esc(x.texto)}</span></label>
              <button type="button" class="raci-x" data-tf-ck-del="${esc(x.id)}" aria-label="Remover item">✕</button></li>`).join("")}</ul>
          <form id="tf-ck-form" class="act-check-add" autocomplete="off">
            <input id="tf-ck-new" class="input input-sm" placeholder="Adicionar um item">
            <button class="btn btn-sm btn-outline" type="submit">Adicionar</button>
          </form>
        </section>
      </div>
      <div class="modal-foot">
        <div class="row">
          <button type="button" class="btn btn-sm btn-danger-ghost" data-tarefa-del="${esc(t.id)}">Apagar</button>
          ${t.projeto_id && t.coluna !== "done" ? `<button type="button" class="btn btn-sm btn-outline" data-tarefa-projeto="${esc(t.id)}" title="Levar para o plano do projeto como atividade">↗ Virar atividade do projeto</button>` : ""}
        </div>
        <div class="right"><button type="button" class="btn btn-primary" data-action="close-modal" data-target="modal-tarefa">Pronto</button></div>
      </div>`;
    if (novo && $("tf-ck-new")) $("tf-ck-new").value = novo;
    if (foco && $(foco)) $(foco).focus();
  }
  function abrirTarefa(id) {
    aberta = id;
    if ($("tf-ck-new")) $("tf-ck-new").value = "";
    desenharTarefa();
    A.util.openModal("modal-tarefa");
  }
  const tarefaAberta = () => lista.find((x) => x.id === aberta);

  function colunas(S, itens, editavel) {
    return COLS().map((c) => {
      const da = itens.filter((t) => t.coluna === c.key)
        .sort((a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999"));
      return `
        <section class="k-col ${c.key}" ${editavel ? `data-tarefa-drop="${c.key}"` : ""}>
          <div class="kb-col-head ${c.key}" title="${esc(c.hint)}"><span>${esc(c.label)}</span><b>${da.length}</b></div>
          <div class="k-list">${da.map((t) => card(S, t, editavel)).join("") || `<div class="muted small k-empty">${editavel ? "Arraste tarefas para cá" : "—"}</div>`}</div>
        </section>`;
    }).join("");
  }

  A.views = A.views || {};
  A.views.tarefas = function (S) {
    const el = $("tarefas-root");
    if (!el) return;
    if (!carregado && local()) { lista = lerLocal(); carregado = true; }
    const rascunho = { titulo: $("tarefa-titulo")?.value || "", prazo: $("tarefa-prazo-nova")?.value || "", projeto: $("tarefa-projeto")?.value || "", visivel: $("tarefa-visivel")?.checked ?? false };
    const foco = document.activeElement?.id;
    const gestao = ehGestao() && !local();
    if (vista === "equipe" && !gestao) vista = "minhas";
    const minhasT = minhas();
    const abertas = minhasT.filter((t) => t.coluna !== "done").length;
    const equipe = daEquipe();
    const projetos = S.state.data.initiatives.filter((i) => i.status !== "Cancelado" && i.status !== "Concluído" && A.visao.veProjeto(i))
      .sort((a, b) => a.id.localeCompare(b.id, "pt-BR", { numeric: true }));

    let corpo;
    if (faltaScript) {
      corpo = `<div class="fin-aviso">As tarefas pessoais precisam de uma tabela nova no banco. Rode o script <code>07_tarefas_pessoais.sql</code> no Supabase.</div>`;
    } else if (vista === "equipe") {
      const pessoas = [...new Set(equipe.map((t) => t.dono_nome || t.dono_email))].sort((a, b) => a.localeCompare(b, "pt-BR"));
      corpo = pessoas.length ? `
        <div class="kb-lanes" style="--ncols:${COLS().length}">
          <div class="kb-lane kb-lane-head"><span></span>${COLS().map((c) => `<div class="kb-col-head ${c.key}"><span>${esc(c.label)}</span><b>${equipe.filter((t) => t.coluna === c.key).length}</b></div>`).join("")}</div>
          ${pessoas.map((p) => {
            const dela = equipe.filter((t) => (t.dono_nome || t.dono_email) === p);
            return `<div class="kb-lane" style="--ac:#5f6b7a">
              <div class="kb-lane-nome"><strong>${esc(p)}</strong><span>${dela.filter((t) => t.coluna !== "done").length} em aberto</span></div>
              ${COLS().map((c) => `<div class="kb-cell ${c.key}">${dela.filter((t) => t.coluna === c.key).map((t) => card(S, t, false)).join("")}</div>`).join("")}
            </div>`;
          }).join("")}
        </div>` : `<div class="kb-vazio">Ninguém deixou tarefas visíveis para a gestão ainda. Cada pessoa escolhe, em cada tarefa, se ela é 🔒 privada ou 👁 visível.</div>`;
    } else {
      corpo = `<div class="kanban sprint-board tarefas-board">${colunas(S, minhasT, true)}</div>`;
    }

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h2>${vista === "equipe" ? "Tarefas da equipe" : "Minhas tarefas"}</h2>
          <div class="muted">${vista === "equipe"
            ? "Tarefas pessoais que cada um deixou 👁 visíveis para a gestão. Só o dono pode mudá-las."
            : `O seu Kanban pessoal, fora dos projetos: ${abertas} em aberto. Cada tarefa é 🔒 privada (só você vê) ou 👁 visível para a gestão (Pedro e diretoria).`}</div>
        </div>
        ${gestao ? `<div class="seg no-print" role="group" aria-label="Ver">
          <button class="seg-btn ${vista === "minhas" ? "active" : ""}" data-tarefa-vista="minhas">Minhas</button>
          <button class="seg-btn ${vista === "equipe" ? "active" : ""}" data-tarefa-vista="equipe">Da equipe <span class="muted">${equipe.filter((t) => t.coluna !== "done").length}</span></button>
        </div>` : ""}
      </div>
      ${vista === "minhas" && !faltaScript ? `
      <form class="tarefa-add panel no-print" id="tarefa-form" autocomplete="off">
        <input class="input" id="tarefa-titulo" placeholder="Nova tarefa (ex.: ligar para o fornecedor de UV)" value="${esc(rascunho.titulo)}" aria-label="Nova tarefa">
        <input class="input" type="date" id="tarefa-prazo-nova" value="${esc(rascunho.prazo)}" title="Prazo (opcional)" aria-label="Prazo">
        <select class="input" id="tarefa-projeto" title="Projeto relacionado (opcional)" aria-label="Projeto relacionado">
          <option value="">Sem projeto</option>
          ${projetos.map((i) => `<option value="${esc(i.id)}" ${i.id === rascunho.projeto ? "selected" : ""}>${esc(i.id)} · ${esc(i.nome.length > 40 ? i.nome.slice(0, 40) + "…" : i.nome)}</option>`).join("")}
        </select>
        <label class="tarefa-vis-novo" title="Marcado: a gestão (Pedro e diretoria) vê esta tarefa"><input type="checkbox" id="tarefa-visivel" ${rascunho.visivel ? "checked" : ""}> 👁 Visível</label>
        <button class="btn btn-primary" type="submit">Adicionar</button>
      </form>` : ""}
      ${local() && !A.nuvem?.configurado ? "" : local() ? `<div class="fin-aviso">Entre com seu login para as tarefas ficarem no banco (por enquanto ficam só neste navegador).</div>` : ""}
      ${corpo}`;
    if (foco && $(foco)) $(foco).focus();
  };

  // Resumo para o Painel executivo: as próximas tarefas abertas.
  function resumoPainel(S) {
    const abertas = minhas().filter((t) => t.coluna !== "done")
      .sort((a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999"));
    if (!abertas.length) return "";
    return `
      <section class="panel tarefas-resumo">
        <div class="panel-head"><h3 class="panel-title">✅ Minhas tarefas</h3>
          <button class="link-btn small" data-action="go-tab" data-tab="tarefas">ver todas (${abertas.length}) →</button></div>
        <ul>${abertas.slice(0, 5).map((t) => {
          const d = dataDe(t.prazo); const late = d && d < hoje();
          return `<li><span class="minha-col ${t.coluna}">${esc(COLS().find((c) => c.key === t.coluna)?.label || "")}</span> ${esc(t.titulo)}${t.prazo ? ` <span class="muted small ${late ? "late" : ""}">· ${br(t.prazo)}${late ? " · atrasada" : ""}</span>` : ""}</li>`;
        }).join("")}</ul>
      </section>`;
  }
  // Prazos das minhas tarefas para a agenda do Painel executivo.
  function eventosAgenda(from, to) {
    return minhas().filter((t) => t.prazo && t.coluna !== "done").map((t) => ({ t, d: dataDe(t.prazo) }))
      .filter(({ d }) => d >= from && d <= to)
      .map(({ t, d }) => ({ date: d, kind: "tarefa", cls: "ok", id: `tarefa-${t.id}`, ini: t.projeto_id || null,
        short: t.titulo, title: `Tarefa: ${t.titulo}`, detail: `Tarefa pessoal${t.projeto_id ? ` · ${t.projeto_id}` : ""}${t.visivel ? " · visível para a gestão" : " · privada"}` }));
  }

  /* ---------- Eventos ---------- */
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "tarefa-form") return;
    e.preventDefault();
    const titulo = $("tarefa-titulo").value.trim();
    if (!titulo) return $("tarefa-titulo").focus();
    const campos = { titulo, prazo: $("tarefa-prazo-nova").value, projeto_id: $("tarefa-projeto").value, visivel: $("tarefa-visivel").checked };
    $("tarefa-titulo").value = "";
    criar(campos).then(() => { toast("Tarefa criada."); setTimeout(() => $("tarefa-titulo")?.focus(), 0); });
  });
  // Campos da tarefa aberta: cada mudança já é salva.
  document.addEventListener("change", (e) => {
    const t = tarefaAberta();
    if (!t || !e.target.closest?.("#tarefa-body")) return;
    const el = e.target;
    if (el.id === "tf-titulo") { if (el.value.trim() && el.value.trim() !== t.titulo) mudar(t.id, { titulo: el.value.trim() }); }
    else if (el.id === "tf-col") mudar(t.id, { coluna: el.value });
    else if (el.id === "tf-prazo") mudar(t.id, { prazo: el.value || null });
    else if (el.id === "tf-proj") mudar(t.id, { projeto_id: el.value });
    else if (el.id === "tf-vis") mudar(t.id, { visivel: el.checked }).then(() => toast(el.checked ? "Tarefa visível para a gestão." : "Tarefa privada: só você vê."));
    else if (el.id === "tf-obs") mudar(t.id, { observacao: el.value.trim() });
    else if (el.dataset.tfCk) mudar(t.id, { checklist: passos(t).map((x) => (x.id === el.dataset.tfCk ? { ...x, feito: el.checked } : x)) });
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "tf-ck-form") return;
    e.preventDefault();
    const t = tarefaAberta();
    const texto = $("tf-ck-new").value.trim();
    if (!t || !texto) return;
    $("tf-ck-new").value = "";
    mudar(t.id, { checklist: [...passos(t), { id: `ck_${Date.now().toString(36)}`, texto, feito: false }] }).then(() => setTimeout(() => $("tf-ck-new")?.focus(), 0));
  });
  A.store?.subscribe?.(() => { if (aberta && $("modal-tarefa")?.classList.contains("open")) desenharTarefa(); });
  document.addEventListener("click", async (e) => {
    const t = e.target;
    const v = t.closest?.("[data-tarefa-vista]");
    if (v) { vista = v.dataset.tarefaVista; return A.store.emit(); }
    const mv = t.closest?.("[data-tarefa-mover]");
    if (mv) return mudar(mv.dataset.tarefaMover, { coluna: mv.dataset.col });
    const etq = t.closest?.("[data-tf-etq]");
    if (etq && tarefaAberta()) {
      const x = tarefaAberta(), atuais = Array.isArray(x.etiquetas) ? x.etiquetas : [];
      const id = etq.dataset.tfEtq;
      return mudar(x.id, { etiquetas: atuais.includes(id) ? atuais.filter((y) => y !== id) : [...atuais, id] });
    }
    const ckDel = t.closest?.("[data-tf-ck-del]");
    if (ckDel && tarefaAberta()) return mudar(aberta, { checklist: passos(tarefaAberta()).filter((x) => x.id !== ckDel.dataset.tfCkDel) });
    const abre = t.closest?.("[data-tarefa-abrir]");
    if (abre && !t.closest("button, input, select, a")) return abrirTarefa(abre.dataset.tarefaAbrir);
    const del = t.closest?.("[data-tarefa-del]");
    if (del) {
      const x = lista.find((y) => y.id === del.dataset.tarefaDel);
      if (await A.util.confirmDialog(`Apagar a tarefa “${x.titulo}”?`, { title: "Apagar tarefa", okLabel: "Apagar", danger: true })) {
        A.util.closeModal("modal-tarefa");
        remover(x.id);
      }
      return;
    }
    // ↗ Levar para o projeto: vira atividade (gestão: direto no plano; líder: no rascunho do plano, para enviar).
    const pj = t.closest?.("[data-tarefa-projeto]");
    if (pj) {
      const x = lista.find((y) => y.id === pj.dataset.tarefaProjeto);
      const S = A.store, it = S.findInitiative(x.projeto_id);
      if (!it) return toast("Projeto não encontrado.", "error");
      const eu = S.state.settings.user;
      const atividade = { nome: x.titulo, prazo: br(x.prazo), raci: eu ? { [eu]: "R" } : {} };
      const lider = A.visao.atual().tipo === "lider";
      if (!(await A.util.confirmDialog(lider
        ? `Levar “${x.titulo}” para o plano de ${it.id} · ${it.nome}? Ela entra no rascunho do plano; depois é só enviar para aprovação na página do projeto.`
        : `Levar “${x.titulo}” para o plano de ${it.id} · ${it.nome} como atividade?`, { title: "↗ Virar atividade do projeto", okLabel: "Levar" }))) return;
      if (lider) A.plano.adicionarAoRascunho(it.id, atividade);
      else {
        const r = S.adicionarAtividades(it.id, [atividade], { source: "Minhas tarefas" });
        if (!r.ok) return toast(r.error, "error");
      }
      A.util.closeModal("modal-tarefa");
      await remover(x.id);
      toast(lider ? `Foi para o rascunho do plano de ${it.id}. Envie para aprovação na página do projeto.` : `Virou atividade de ${it.id}.`, "ok", 6000);
    }
  });
  // Arrastar entre as colunas
  let arrastando = null;
  document.addEventListener("dragstart", (e) => {
    const c = e.target.closest?.("[data-tarefa-drag]");
    if (!c) return;
    arrastando = c.dataset.tarefaDrag;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", arrastando); } catch {}
  });
  document.addEventListener("dragover", (e) => {
    if (!arrastando) return;
    const z = e.target.closest?.("[data-tarefa-drop]");
    if (z) { e.preventDefault(); z.classList.add("drag-over"); }
  });
  document.addEventListener("dragleave", (e) => { e.target.closest?.("[data-tarefa-drop]")?.classList.remove("drag-over"); });
  document.addEventListener("drop", (e) => {
    const z = e.target.closest?.("[data-tarefa-drop]");
    if (!z || !arrastando) return;
    e.preventDefault(); z.classList.remove("drag-over");
    const id = arrastando; arrastando = null;
    if (lista.find((t) => t.id === id)?.coluna !== z.dataset.tarefaDrop) mudar(id, { coluna: z.dataset.tarefaDrop });
  });
  document.addEventListener("dragend", () => { arrastando = null; });

  A.tarefas = { carregar, limpar, resumoPainel, eventosAgenda };
})();
