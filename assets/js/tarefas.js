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
    if (error) toast("Não foi possível salvar a tarefa.", "error");
    await carregar();
  }
  async function remover(id) {
    if (local()) { lista = lista.filter((t) => t.id !== id); gravarLocal(); return A.store.emit(); }
    const { error } = await cliente().from("tarefas").delete().eq("id", id);
    if (error) return toast("Não foi possível apagar a tarefa.", "error");
    await carregar();
  }

  /* ---------- Desenho ---------- */
  function card(S, t, editavel) {
    const d = dataDe(t.prazo);
    const atrasada = d && d < hoje() && t.coluna !== "done";
    const proj = t.projeto_id && S.findInitiative(t.projeto_id);
    return `
      <div class="k-card act-card tarefa-card ${t.coluna}" ${editavel ? `draggable="true" data-tarefa-drag="${esc(t.id)}"` : ""} style="--ac:${proj ? A.area(proj.area).cor : "#5f6b7a"}">
        <div class="act-top">
          <span class="act-card-proj">${proj ? `<span class="act-card-pname">${esc(proj.id)} · ${esc(proj.nome)}</span>` : `<span class="act-card-pname">Tarefa pessoal</span>`}</span>
          ${editavel
            ? `<button class="tarefa-vis ${t.visivel ? "on" : ""}" data-tarefa-vis="${esc(t.id)}" title="${t.visivel ? "Visível para a gestão (Pedro e diretoria). Clique para deixar privada." : "Privada: só você vê. Clique para deixar visível para a gestão."}">${t.visivel ? "👁" : "🔒"}</button>`
            : `<span class="tarefa-vis on" title="Visível para a gestão">👁</span>`}
        </div>
        <div class="act-card-title">${editavel ? `<button class="tarefa-titulo" data-tarefa-edit="${esc(t.id)}" title="Clique para editar">${esc(t.titulo)}</button>` : esc(t.titulo)}</div>
        <div class="act-meta">
          ${editavel ? `<input type="date" class="tarefa-prazo ${atrasada ? "late" : ""}" data-tarefa-prazo="${esc(t.id)}" value="${esc(t.prazo || "")}" title="Prazo (opcional)">`
            : t.prazo ? `<span class="act-prazo ${atrasada ? "late" : ""}">📅 ${br(t.prazo)}${atrasada ? " · atrasada" : ""}</span>` : ""}
          ${t.observacao ? `<span title="${esc(t.observacao)}">📝</span>` : ""}
        </div>
        ${editavel ? `<div class="act-quick no-print">
          ${PROXIMA[t.coluna] ? `<button class="q-btn go" data-tarefa-mover="${esc(t.id)}" data-col="${PROXIMA[t.coluna]}">${t.coluna === "doing" ? "✓ Concluir" : t.coluna === "todo" ? "▶ Começar" : "✓ Resolvido"}</button>` : ""}
          ${t.coluna === "todo" || t.coluna === "doing" ? `<button class="q-btn warn" data-tarefa-mover="${esc(t.id)}" data-col="blocked" title="Travou">⚠</button>` : ""}
          ${t.projeto_id && t.coluna !== "done" ? `<button class="q-btn" data-tarefa-projeto="${esc(t.id)}" title="Levar para o plano do projeto como atividade">↗ Projeto</button>` : ""}
          <button class="q-btn" data-tarefa-obs="${esc(t.id)}" title="Observação">📝</button>
          <button class="q-btn" data-tarefa-del="${esc(t.id)}" title="Apagar">✕</button>
        </div>` : ""}
      </div>`;
  }

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
  document.addEventListener("change", (e) => {
    const p = e.target.closest?.("[data-tarefa-prazo]");
    if (p) mudar(p.dataset.tarefaPrazo, { prazo: p.value || null });
  });
  document.addEventListener("click", async (e) => {
    const t = e.target;
    const v = t.closest?.("[data-tarefa-vista]");
    if (v) { vista = v.dataset.tarefaVista; return A.store.emit(); }
    const mv = t.closest?.("[data-tarefa-mover]");
    if (mv) return mudar(mv.dataset.tarefaMover, { coluna: mv.dataset.col });
    const vis = t.closest?.("[data-tarefa-vis]");
    if (vis) {
      const x = lista.find((y) => y.id === vis.dataset.tarefaVis);
      await mudar(x.id, { visivel: !x.visivel });
      return toast(x.visivel ? "Tarefa privada: só você vê." : "Tarefa visível para a gestão.");
    }
    const ed = t.closest?.("[data-tarefa-edit]");
    if (ed) {
      const x = lista.find((y) => y.id === ed.dataset.tarefaEdit);
      const novo = await A.util.pedirTexto("Editar a tarefa", { title: "✏️ Tarefa", okLabel: "Salvar", placeholder: x.titulo, obrigatorio: true });
      if (novo && novo.trim()) mudar(x.id, { titulo: novo.trim() });
      return;
    }
    const ob = t.closest?.("[data-tarefa-obs]");
    if (ob) {
      const x = lista.find((y) => y.id === ob.dataset.tarefaObs);
      const txt = await A.util.pedirTexto(x.observacao ? `Observação atual: “${x.observacao}”. Escreva a nova (deixe vazio para apagar).` : "Observação da tarefa", { title: "📝 Observação", okLabel: "Salvar", placeholder: "ex.: aguardando retorno até sexta" });
      if (txt != null) mudar(x.id, { observacao: txt.trim() });
      return;
    }
    const del = t.closest?.("[data-tarefa-del]");
    if (del) {
      const x = lista.find((y) => y.id === del.dataset.tarefaDel);
      if (await A.util.confirmDialog(`Apagar a tarefa “${x.titulo}”?`, { title: "Apagar tarefa", okLabel: "Apagar", danger: true })) remover(x.id);
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
