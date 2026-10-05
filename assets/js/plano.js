/* Plano do projeto: a lista única de atividades (◆ = marco), com cadastro rápido, visão por mês ou linha do tempo,
   revisor e aprovação. O líder do setor monta e envia a proposta; o Pedro ou a diretoria aprovam.
   Quem aprova edita o plano direto; o líder trabalha num rascunho que só vale depois de aprovado. */
(function () {
  const A = window.Altamar;
  const { esc, toast } = A.util;
  const $ = (id) => document.getElementById(id);

  const CHAVE_VISTA = "altamar_plano_vista";
  let vista = "lista";
  try { vista = sessionStorage.getItem(CHAVE_VISTA) === "tempo" ? "tempo" : "lista"; } catch {}

  const isoDeBr = (br) => { const d = A.store.calc.parseDate(br); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : ""; };
  const brDeIso = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  const hoje = () => { const h = new Date(); h.setHours(0, 0, 0, 0); return h; };
  const novoId = () => `atv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const resp = (a) => A.store.raciPeople(a.raci, "R")[0] || "";

  /* ---------- Quem edita como ---------- */
  // Líder de setor: trabalha num rascunho e envia para aprovação. Gestor e diretoria: editam e aprovam.
  const modoLider = () => A.visao.atual().tipo === "lider";

  // Rascunho do líder (fica neste navegador até ser enviado).
  const chaveRascunho = (id) => `altamar_plano_rascunho_${id}`;
  function lerRascunho(id) {
    try { const r = JSON.parse(localStorage.getItem(chaveRascunho(id)) || "null"); return Array.isArray(r) ? r : null; } catch { return null; }
  }
  function gravarRascunho(id, lista) {
    try { lista ? localStorage.setItem(chaveRascunho(id), JSON.stringify(lista)) : localStorage.removeItem(chaveRascunho(id)); } catch {}
  }
  const copia = (lista) => lista.map((a) => JSON.parse(JSON.stringify(a)));
  // Lista em que o líder está trabalhando: o rascunho, a proposta já enviada ou o plano atual.
  function listaDoLider(it) {
    return lerRascunho(it.id) || copia(it.planoProposta ? it.planoProposta.atividades : it.atividades);
  }
  const listaDeTrabalho = (it) => (modoLider() ? listaDoLider(it) : it.atividades);

  /* ---------- Desenho ---------- */
  const NOME_MES = (d) => { const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1); };
  const chaveMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  function situacao(S, a) {
    if (a.status === "Cancelado") return ["Cancelada", "cancelada"];
    const col = S.activityCol(a);
    return { todo: ["A fazer", "todo"], doing: ["Fazendo", "doing"], waiting: ["Travada", "waiting"], done: ["Feito", "done"] }[col];
  }

  function linha(S, it, a, lider) {
    const d = S.calc.parseDate(a.prazo);
    const feito = a.status === "Concluído";
    const atrasada = d && d < hoje() && !feito;
    const [rot, cls] = situacao(S, a);
    const previsto = !lider && it.planoBase?.prazos?.[a.id];
    const mudou = previsto && previsto !== a.prazo && S.calc.parseDate(previsto) && d;
    const desvio = mudou ? Math.round((d - S.calc.parseDate(previsto)) / 86400000) : 0;
    const kanban = !lider && S.noKanban(it, a);
    const k = (campo) => `data-pl-id="${esc(a.id)}" data-pl-campo="${campo}" data-key="pl:${esc(a.id)}:${campo}"`;
    return `
      <li class="pl-linha ${feito ? "feito" : ""} ${atrasada ? "atrasada" : ""} ${a.marco ? "marco" : ""}">
        ${lider ? `<span class="pl-check ${feito ? "on" : ""}" title="${esc(rot)}">${feito ? "✓" : ""}</span>`
          : `<button class="pl-check ${feito ? "on" : ""}" data-pl-feito="${esc(a.id)}" title="${feito ? "Feita: clique para reabrir" : "Marcar como feita"}" aria-label="${feito ? "Reabrir" : "Marcar como feita"}">${feito ? "✓" : ""}</button>`}
        <button class="pl-marco ${a.marco ? "on" : ""}" data-pl-marco="${esc(a.id)}" title="${a.marco ? "É um marco (entrega importante): clique para tirar" : "Marcar como marco (entrega importante)"}" aria-label="Marco">◆</button>
        <input class="pl-nome" ${k("nome")} value="${esc(a.nome)}" aria-label="Atividade">
        <select class="pl-r ${resp(a) ? "" : "vazio"}" ${k("r")} aria-label="Responsável">${A.ui.peopleOptions(resp(a), { blank: "Responsável?" })}</select>
        <input type="date" class="pl-prazo ${d ? "" : "vazio"}" ${k("prazo")} value="${isoDeBr(a.prazo)}" aria-label="Prazo">
        <span class="pl-sit">
          <span class="minha-col ${cls}">${rot}</span>
          ${kanban ? `<span class="pl-kanban" title="Está no Kanban do ciclo">Kanban</span>` : ""}
          ${mudou ? `<span class="pl-desvio ${desvio > 0 ? "atras" : "frente"}" title="Previsto no plano aprovado: ${esc(previsto)}">${desvio > 0 ? `+${desvio}` : desvio} d</span>` : ""}
          ${atrasada ? `<span class="pl-atraso">atrasada</span>` : ""}
        </span>
        <span class="pl-acoes no-print">
          ${lider ? "" : `<button class="pl-mais" data-action="open-activity" data-id="${esc(it.id)}|${esc(a.id)}" title="Abrir: passos, observações, Kanban">⋯</button>`}
          <button class="pl-del" data-pl-del="${esc(a.id)}" title="Tirar do plano" aria-label="Tirar do plano">✕</button>
        </span>
      </li>`;
  }

  function listaPorMes(S, it, lista, lider) {
    const ativas = lista.filter((a) => a.status !== "Cancelado");
    const canceladas = lista.length - ativas.length;
    if (!ativas.length) return `<div class="pl-vazio">Nenhuma atividade ainda. Escreva acima o que precisa acontecer, da primeira à última entrega.</div>`;
    const sp = S.sprintAtual();
    const mesAtual = sp ? chaveMes(S.sprintDates(sp).inicio) : "";
    const mesProx = sp ? chaveMes(S.proximoCicloInfo() ? new Date(S.proximoCicloInfo().inicio + "T12:00:00") : new Date()) : "";
    const grupos = new Map();
    ativas.slice().sort((a, b) => (S.calc.parseDate(a.prazo)?.getTime() ?? Infinity) - (S.calc.parseDate(b.prazo)?.getTime() ?? Infinity))
      .forEach((a) => {
        const d = S.calc.parseDate(a.prazo);
        const k = d ? chaveMes(d) : "sem";
        if (!grupos.has(k)) grupos.set(k, { titulo: d ? NOME_MES(d) : "Sem prazo", itens: [] });
        grupos.get(k).itens.push(a);
      });
    return [...grupos.entries()].map(([k, g]) => {
      const feitas = g.itens.filter((a) => a.status === "Concluído").length;
      const tag = k === mesAtual ? " · ciclo em andamento" : k === mesProx ? " · próximo ciclo" : "";
      return `
        <div class="pl-mes ${k === mesAtual ? "atual" : ""} ${k === "sem" ? "sem" : ""}">
          <div class="pl-mes-head"><strong>${esc(g.titulo)}</strong><span class="muted small">${esc(tag)}</span>
            <span class="pl-mes-conta">${feitas} de ${g.itens.length} feita${g.itens.length === 1 ? "" : "s"}</span></div>
          <ul class="pl-lista">${g.itens.map((a) => linha(S, it, a, lider)).join("")}</ul>
        </div>`;
    }).join("") + (canceladas ? `<div class="muted small pl-canceladas">${canceladas} atividade(s) cancelada(s) não aparecem aqui (continuam no histórico).</div>` : "");
  }

  // Linha do tempo: uma faixa por atividade, do início ao prazo (ou um ponto no prazo), ◆ nos marcos.
  function linhaDoTempo(S, it, lista) {
    const P = S.calc.parseDate;
    const ativas = lista.filter((a) => a.status !== "Cancelado" && P(a.prazo))
      .sort((a, b) => P(a.prazo) - P(b.prazo));
    if (!ativas.length) return `<div class="pl-vazio">Dê prazo às atividades para vê-las na linha do tempo.</div>`;
    const datas = [P(it.inicio), P(it.prazo), ...ativas.flatMap((a) => [P(a.inicio), P(a.prazo)])].filter(Boolean);
    let ini = new Date(Math.min(...datas, hoje())), fim = new Date(Math.max(...datas));
    ini = new Date(ini.getFullYear(), ini.getMonth(), 1);
    fim = new Date(fim.getFullYear(), fim.getMonth() + 1, 0);
    const total = fim - ini || 1;
    const pos = (d) => Math.max(0, Math.min(100, ((d - ini) / total) * 100));
    const meses = [];
    for (let d = new Date(ini); d <= fim; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) meses.push(d);
    const passo = meses.length > 12 ? 3 : meses.length > 6 ? 2 : 1;
    const h = hoje();
    const cabeca = `<div class="pl-tl-eixo">${meses.map((m, i) => i % passo ? "" : `<span style="left:${pos(m)}%">${m.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}${m.getMonth() === 0 || i === 0 ? ` ${m.getFullYear()}` : ""}</span>`).join("")}</div>`;
    const linhaHoje = h >= ini && h <= fim ? `<span class="pl-tl-hoje" style="left:${pos(h)}%"></span>` : "";
    const fimProj = P(it.prazo);
    return `
      <div class="pl-tl">
        <div class="pl-tl-row pl-tl-top"><span></span>${cabeca}</div>
        ${ativas.map((a) => {
          const d = P(a.prazo), di = P(a.inicio);
          const feito = a.status === "Concluído";
          const cls = feito ? "feito" : d < h ? "atrasada" : "";
          const r = resp(a);
          const marca = a.marco
            ? `<span class="pl-tl-diamante ${cls}" style="left:${pos(d)}%" title="${esc(`◆ ${a.nome} · ${a.prazo}`)}"></span>`
            : di && di < d
              ? `<span class="pl-tl-barra ${cls}" style="left:${pos(di)}%;width:${Math.max(pos(d) - pos(di), 0.8)}%" title="${esc(`${a.nome} · ${a.inicio} → ${a.prazo}`)}"></span>`
              : `<span class="pl-tl-ponto ${cls}" style="left:${pos(d)}%" title="${esc(`${a.nome} · ${a.prazo}`)}"></span>`;
          return `<div class="pl-tl-row ${a.marco ? "marco" : ""}">
            <span class="pl-tl-nome" title="${esc(a.nome)}">${a.marco ? "◆ " : ""}${esc(a.nome)}${r ? ` <span class="muted small">· ${esc(r)}</span>` : ""}</span>
            <span class="pl-tl-trilho">${linhaHoje}${fimProj ? `<span class="pl-tl-fim" style="left:${pos(fimProj)}%" title="Prazo do projeto: ${esc(it.prazo)}"></span>` : ""}${marca}</span>
          </div>`;
        }).join("")}
        <div class="muted small pl-tl-legenda">◆ marco · barra = do início ao prazo · ponto = só prazo · linha azul = hoje · linha tracejada = prazo do projeto</div>
      </div>`;
  }

  function painelProposta(S, it) {
    const p = it.planoProposta;
    if (!p) return "";
    const quando = new Date(p.em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    if (p.status === "ajuste") {
      return `<div class="pl-aviso ajuste">✏️ Você pediu ajuste no plano proposto por ${esc(p.por || "—")}: <em>“${esc(p.comentario)}”</em>. Aguardando nova versão.</div>`;
    }
    const d = S.diferencasDaProposta(it);
    const itens = [
      ...d.novas.map((a) => `<li><span class="pl-dif nova">nova</span> ${a.marco ? "◆ " : ""}${esc(a.nome)}${a.prazo ? ` · ${esc(a.prazo)}` : ""}${resp(a) ? ` · ${esc(resp(a))}` : ""}</li>`),
      ...d.alteradas.map(({ a, mudancas }) => `<li><span class="pl-dif alterada">alterada</span> ${esc(a.nome)}: ${mudancas.map((m) => `${esc(m.label.toLowerCase())} ${esc(String(m.from || "—"))} → <strong>${esc(String(m.to || "—"))}</strong>`).join("; ")}</li>`),
      ...d.retiradas.map((a) => `<li><span class="pl-dif retirada">retirada</span> ${esc(a.nome)}</li>`),
    ];
    return `
      <div class="pl-proposta">
        <div class="pl-proposta-head">📨 <strong>${esc(p.por || "O líder")}</strong> propôs ${it.atividades.length ? "mudanças no" : "o"} plano em ${quando}
          <span class="muted small">· ${d.novas.length} nova(s), ${d.alteradas.length} alterada(s), ${d.retiradas.length} retirada(s)</span></div>
        ${itens.length ? `<ul class="pl-proposta-lista">${itens.join("")}</ul>` : `<div class="muted small">A proposta é igual ao plano atual.</div>`}
        ${S.revisorPlano(it, p.atividades).length ? `<div class="muted small">⚠ O revisor encontrou ${S.revisorPlano(it, p.atividades).length} ponto(s) na proposta.</div>` : ""}
        <div class="pl-proposta-acoes no-print">
          <button class="btn btn-sm btn-outline" data-pl-ajuste>Pedir ajuste</button>
          <button class="btn btn-sm btn-primary" data-pl-aprovar>Aprovar plano</button>
        </div>
      </div>`;
  }

  function render(S, it) {
    const lider = modoLider();
    const lista = listaDeTrabalho(it);
    // Mantém o que estava sendo digitado no cadastro rápido quando a tela é redesenhada.
    const form = $("pl-add");
    const mesmo = form && form.dataset.ini === it.id;
    const keep = {
      nome: mesmo ? $("pl-nome").value : "",
      r: mesmo ? $("pl-r").value : it.responsavel || "",
      prazo: mesmo ? $("pl-prazo").value : "",
      marco: mesmo ? $("pl-marco").checked : false,
    };
    const rascunho = lider && lerRascunho(it.id);
    const p = it.planoProposta;
    const rev = S.revisorPlano(it, lista);
    const quando = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "");

    let selo;
    if (lider) {
      selo = rascunho ? `<span class="pl-selo rascunho">Rascunho não enviado</span>`
        : p?.status === "ajuste" ? `<span class="pl-selo ajuste">Ajuste pedido por ${esc(p.ajustePor || "Pedro")}</span>`
        : p ? `<span class="pl-selo enviado">Enviado em ${quando(p.em)} · aguardando aprovação</span>`
        : it.planoBase ? `<span class="pl-selo ok">Plano aprovado</span>` : `<span class="pl-selo">Ainda sem plano aprovado</span>`;
    } else {
      selo = p && p.status !== "ajuste" ? `<span class="pl-selo enviado">Proposta de ${esc(p.por || "—")} aguardando aprovação</span>`
        : it.planoBase ? `<span class="pl-selo ok" title="Os prazos de ${quando(it.planoBase.em)} são a referência do “previsto”">✓ Aprovado em ${quando(it.planoBase.em)}${it.planoBase.por ? ` por ${esc(it.planoBase.por)}` : ""}</span>`
        : lista.length ? `<span class="pl-selo">Ainda não aprovado</span>` : "";
    }

    return `
      <section class="panel plano" id="plano-root" data-ini="${esc(it.id)}">
        <div class="pl-head">
          <div class="pl-titulo"><h3 class="panel-title">📋 Plano do projeto</h3>${selo}</div>
          <div class="seg pl-vistas no-print" role="group" aria-label="Forma de ver o plano">
            <button class="seg-btn ${vista === "lista" ? "active" : ""}" data-pl-vista="lista">Lista por mês</button>
            <button class="seg-btn ${vista === "tempo" ? "active" : ""}" data-pl-vista="tempo">Linha do tempo</button>
          </div>
        </div>
        ${lider && p?.status === "ajuste" && !rascunho ? `<div class="pl-aviso ajuste">✏️ ${esc(p.ajustePor || "O gestor")} pediu ajuste: <em>“${esc(p.comentario)}”</em>. Faça as mudanças e envie de novo.</div>` : ""}
        ${lider ? `<div class="pl-aviso info">Você está montando o plano: as mudanças valem depois que o Pedro ou a diretoria aprovarem.</div>` : painelProposta(S, it)}

        <form class="pl-add no-print" id="pl-add" data-ini="${esc(it.id)}" autocomplete="off">
          <label class="pl-add-marco" title="Marco: uma entrega importante do projeto"><input type="checkbox" id="pl-marco" ${keep.marco ? "checked" : ""}> ◆</label>
          <input class="input" id="pl-nome" placeholder="O que precisa ser feito (ex.: aprovar o orçamento)" value="${esc(keep.nome)}" aria-label="Nova atividade">
          <select class="input" id="pl-r" aria-label="Responsável">${A.ui.peopleOptions(keep.r, { blank: "Responsável" })}</select>
          <input type="date" class="input" id="pl-prazo" value="${esc(keep.prazo)}" aria-label="Prazo">
          <button class="btn btn-primary" type="submit">Adicionar</button>
        </form>
        <div class="muted small pl-dica no-print">Enter adiciona e já deixa pronto para a próxima. Colar uma lista (do Excel, WhatsApp ou de uma ata) cria uma atividade por linha. Marque ◆ nas entregas importantes.</div>

        <div class="pl-corpo">${vista === "tempo" ? linhaDoTempo(S, it, lista) : listaPorMes(S, it, lista, lider)}</div>

        ${rev.length ? `<div class="pl-revisor"><strong>⚠ Revisor do plano</strong><ul>${rev.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`
          : lista.length ? `<div class="pl-revisor ok">✓ Revisor: o plano está completo (todas com responsável e prazo, dentro do prazo do projeto).</div>` : ""}

        <div class="pl-rodape no-print">
          ${lider ? `
            ${rascunho ? `<button class="btn btn-sm btn-ghost" data-pl-descartar>Descartar rascunho</button>` : ""}
            <button class="btn btn-sm btn-primary" data-pl-enviar ${lista.length ? "" : "disabled"}>Enviar para aprovação</button>`
          : !p || p.status === "ajuste" ? (lista.length ? `<span class="muted small">${it.planoBase ? "Mudou o plano? Atualize a referência do “previsto”." : "Aprovar guarda os prazos de hoje como referência para medir atrasos."}</span>
            <button class="btn btn-sm ${it.planoBase ? "btn-outline" : "btn-primary"}" data-pl-aprovar>${it.planoBase ? "Atualizar referência" : "Aprovar plano"}</button>` : "") : ""}
        </div>
      </section>`;
  }

  /* ---------- Ações ---------- */
  const S = () => A.store;
  const iniAtual = () => $("plano-root")?.dataset.ini;
  const projeto = () => S().findInitiative(iniAtual());

  // Aplica uma mudança: no plano (quem aprova) ou no rascunho (líder).
  function mudar(fnPlano, fnRascunho) {
    const it = projeto();
    if (!it) return;
    if (modoLider()) {
      const lista = listaDoLider(it);
      fnRascunho(lista);
      gravarRascunho(it.id, lista);
      S().emit();
    } else {
      const r = fnPlano(it);
      if (r && r.ok === false) { toast(r.error, "error"); S().emit(); }
    }
  }

  function limparLinha(t) {
    return t.replace(/^\s*(?:[-•*·▪◦]|\d+[.)]|\[\s?[xX ]?\s?\])\s*/, "").trim();
  }

  function adicionar(nomes) {
    const r = $("pl-r").value, prazo = brDeIso($("pl-prazo").value), marco = $("pl-marco").checked;
    const novas = nomes.map(limparLinha).filter(Boolean).map((nome) => ({ nome, prazo, marco, raci: r ? { [r]: "R" } : {} }));
    if (!novas.length) { $("pl-nome").focus(); return; }
    $("pl-nome").value = "";
    $("pl-marco").checked = false;
    mudar(
      (it) => S().adicionarAtividades(it.id, novas),
      (lista) => novas.forEach((x) => lista.push({ id: novoId(), status: "A fazer", pct: 0, checklist: [], entregavel: "", inicio: "", dependeDe: "", observacoes: "", sprint: "", ...x })),
    );
    toast(novas.length > 1 ? `${novas.length} atividades adicionadas.` : "Atividade adicionada.");
    setTimeout(() => $("pl-nome")?.focus(), 0);
  }

  function init() {
    document.addEventListener("submit", (e) => {
      if (e.target.id !== "pl-add") return;
      e.preventDefault();
      adicionar([$("pl-nome").value]);
    });
    // Colar uma lista: uma atividade por linha.
    document.addEventListener("paste", (e) => {
      if (e.target.id !== "pl-nome") return;
      const texto = e.clipboardData?.getData("text") || "";
      const linhas = texto.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      if (linhas.length < 2) return;
      e.preventDefault();
      adicionar(linhas);
    });

    document.addEventListener("change", (e) => {
      const el = e.target;
      const id = el.dataset?.plId;
      if (!id || !el.closest("#plano-root")) return;
      const campo = el.dataset.plCampo;
      if (campo === "nome") {
        const nome = el.value.trim();
        if (!nome) { toast("A atividade precisa de um nome.", "warn"); return S().emit(); }
        mudar((it) => S().saveActivity(it.id, id, { nome }, { source: "Plano do projeto" }), (l) => { l.find((a) => a.id === id).nome = nome; });
      } else if (campo === "prazo") {
        const prazo = brDeIso(el.value);
        mudar((it) => S().saveActivity(it.id, id, { prazo }, { source: "Plano do projeto" }), (l) => { l.find((a) => a.id === id).prazo = prazo; });
      } else if (campo === "r") {
        const nome = el.value;
        mudar((it) => {
          const atual = resp(S().findActivity(it.id, id));
          return nome ? S().setRaci(it.id, id, nome, "R") : atual ? S().setRaci(it.id, id, atual, "") : { ok: true };
        }, (l) => {
          const a = l.find((x) => x.id === id);
          const raci = { ...(a.raci || {}) };
          Object.keys(raci).forEach((n) => { if (raci[n] === "R") delete raci[n]; });
          if (nome) raci[nome] = "R";
          a.raci = raci;
        });
      }
    });

    document.addEventListener("click", async (e) => {
      const t = e.target;
      if (!t.closest?.("#plano-root")) return;
      const vistaBtn = t.closest("[data-pl-vista]");
      if (vistaBtn) {
        vista = vistaBtn.dataset.plVista;
        try { sessionStorage.setItem(CHAVE_VISTA, vista); } catch {}
        return S().emit();
      }
      const feito = t.closest("[data-pl-feito]");
      if (feito) {
        const it = projeto(), a = S().findActivity(it.id, feito.dataset.plFeito);
        const r = A.board.moveActivity(it.id, a.id, a.status === "Concluído" ? "todo" : "done");
        return Promise.resolve(r).then((x) => { if (x?.ok !== false && a.status !== "Concluído") toast("Atividade feita ✓"); });
      }
      const marco = t.closest("[data-pl-marco]");
      if (marco) {
        const id = marco.dataset.plMarco;
        return mudar((it) => S().saveActivity(it.id, id, { marco: !S().findActivity(it.id, id).marco }, { source: "Plano do projeto" }),
          (l) => { const a = l.find((x) => x.id === id); a.marco = !a.marco; });
      }
      const del = t.closest("[data-pl-del]");
      if (del) {
        const id = del.dataset.plDel;
        const it = projeto();
        const a = (modoLider() ? listaDoLider(it) : it.atividades).find((x) => x.id === id);
        if (!a) return;
        const andou = a.status !== "A fazer" || a.pct > 0;
        const ok = await A.util.confirmDialog(andou && !modoLider()
          ? `“${a.nome}” já andou (${a.pct}%). Ela será cancelada: sai do plano, mas o que foi feito fica registrado.`
          : `Tirar “${a.nome}” do plano?`, { title: "Tirar do plano", okLabel: andou && !modoLider() ? "Cancelar a atividade" : "Tirar", danger: true });
        if (!ok) return;
        return mudar((it2) => S().removerDoPlano(it2.id, id), (l) => { const i = l.findIndex((x) => x.id === id); if (i >= 0) l.splice(i, 1); });
      }
      if (t.closest("[data-pl-aprovar]")) {
        const it = projeto();
        const ok = await A.util.confirmDialog(it.planoProposta && it.planoProposta.status !== "ajuste"
          ? `Aprovar o plano proposto por ${it.planoProposta.por || "o líder"}? Ele passa a valer e os prazos viram a referência do “previsto”.`
          : "Aprovar o plano como está? Os prazos de hoje viram a referência para medir atrasos (previsto × atual).",
          { title: "Aprovar plano", okLabel: "Aprovar" });
        if (!ok) return;
        const r = S().aprovarPlano(it.id);
        return r.ok ? toast("Plano aprovado ✓") : toast(r.error, "error");
      }
      if (t.closest("[data-pl-ajuste]")) {
        const it = projeto();
        const txt = await A.util.pedirTexto(`O que ${it.planoProposta?.por || "o líder"} precisa ajustar no plano?`,
          { title: "Pedir ajuste", okLabel: "Enviar pedido", placeholder: "ex.: separar a obra em duas etapas; prazo da compra está curto", obrigatorio: true });
        if (txt == null) return;
        const r = S().pedirAjustePlano(it.id, txt);
        return r.ok ? toast("Pedido de ajuste registrado.") : toast(r.error, "error");
      }
      if (t.closest("[data-pl-descartar]")) {
        if (!(await A.util.confirmDialog("Descartar as mudanças que você ainda não enviou?", { title: "Descartar rascunho", okLabel: "Descartar", danger: true }))) return;
        gravarRascunho(iniAtual(), null);
        return S().emit();
      }
      if (t.closest("[data-pl-enviar]")) {
        const it = projeto();
        const lista = listaDoLider(it);
        const rev = S().revisorPlano(it, lista);
        if (rev.length && !(await A.util.confirmDialog(`O revisor ainda aponta ${rev.length} ponto(s), como “${rev[0]}”. Enviar mesmo assim?`,
          { title: "Enviar para aprovação", okLabel: "Enviar assim mesmo" }))) return;
        // Com o banco e perfil de líder, o envio passa pela regra do banco; senão, grava como proposta direto.
        const r = A.nuvem?.conectado?.() && A.nuvem.perfil() === "visualizacao"
          ? await A.nuvem.enviarPlano(it.id, lista)
          : S().enviarProposta(it.id, lista);
        if (r.ok) { gravarRascunho(it.id, null); toast("Plano enviado para aprovação ✓"); S().emit(); }
      }
    });
  }

  A.plano = { init, render };
})();
