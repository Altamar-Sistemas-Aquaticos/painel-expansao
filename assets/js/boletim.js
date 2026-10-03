/* Boletim semanal para a diretoria: página única (HTML) gerada com os dados do painel,
   para mandar quando a reunião semanal de acompanhamento não acontecer. */
(function () {
  const A = window.Altamar;
  const { esc, toast, openModal } = A.util;
  const $ = (id) => document.getElementById(id);

  const DAY = 86400000;
  const hoje = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const aberto = (s) => s !== "Concluído" && s !== "Cancelado";
  const fimDe = (txt) => (A.overview ? A.overview.period(txt)?.end : null) || null;
  const marcados = (txt) => String(txt || "").split("; ").filter((x) => x.startsWith("☑")).map((x) => x.slice(2));

  /* ---------- Dados ---------- */
  function dados(S) {
    const t0 = hoje();
    const desde = new Date(t0.getTime() - 6 * DAY);
    const desdeIso = desde.toISOString();
    const ate14 = new Date(t0.getTime() + 14 * DAY);
    const si = A.sprintInfo(S);
    const all = S.state.data.initiatives;
    const hist = S.state.data.history.filter((h) => h.ts >= desdeIso);
    const nomeProj = (id) => S.findInitiative(id)?.nome || "";

    // Feito na semana: atividades concluídas, passos de checklist marcados e decisões tomadas.
    const concluidas = [], passos = [], decididas = [];
    hist.forEach((h) => {
      if (h.entity === "atividade") {
        (h.changes || []).forEach((c) => {
          if (c.field === "status" && c.to === "Concluído") concluidas.push({ proj: h.refId, nome: h.label.replace(/^[^·]+·\s*/, ""), quem: h.user });
          if (c.field === "checklist") {
            const antes = new Set(marcados(c.from));
            marcados(c.to).filter((x) => !antes.has(x)).forEach((x) => passos.push({ proj: h.refId, atividade: h.label.replace(/^[^·]+·\s*/, ""), passo: x }));
          }
        });
      }
      if (h.entity === "decisao" && h.action === "decidiu") decididas.push(h.label);
    });
    // O histórico guarda do mais recente para o mais antigo; o mesmo passo pode ter sido marcado e desmarcado.
    const unicos = (list, key) => [...new Map(list.map((x) => [key(x), x])).values()];

    // Sprint: atividades em aberto, na ordem do quadro.
    const ordemCol = { waiting: 0, doing: 1, todo: 2, done: 3 };
    const emAndamento = si.items.filter(({ a }) => a.status !== "Concluído")
      .sort((x, y) => ordemCol[S.activityCol(x.a)] - ordemCol[S.activityCol(y.a)] || y.a.pct - x.a.pct);

    // Travado ou em risco.
    const esperando = si.items.filter(({ a }) => S.activityCol(a) === "waiting");
    const projRisco = all.filter((i) => aberto(i.status) && i.situacao !== "Rascunho" && i.semaforo !== "verde")
      .sort((a, b) => (a.semaforo === "vermelho" ? -1 : 1) - (b.semaforo === "vermelho" ? -1 : 1));
    const atraso = A.metrics ? A.metrics.overdue(S) : { total: 0, projetos: [], atividades: [] };

    // Precisa da diretoria.
    const decisoes = S.state.data.decisions.filter((d) => d.status === "Pendente");

    // Próximos 14 dias.
    const prazos = [];
    all.forEach((it) => {
      if (!aberto(it.status) || it.situacao === "Rascunho") return;
      const fp = fimDe(it.prazo);
      if (fp && fp >= t0 && fp <= ate14) prazos.push({ d: fp, tipo: "Entrega do projeto", txt: `${it.id} · ${it.nome}` });
      it.atividades.forEach((a) => {
        const fa = fimDe(a.prazo);
        if (fa && fa >= t0 && fa <= ate14 && aberto(a.status)) prazos.push({ d: fa, tipo: "Atividade", txt: `${it.id} · ${a.nome}`, quem: S.raciPeople(a.raci, "R")[0] || "" });
      });
    });
    prazos.sort((a, b) => a.d - b.d);

    // Novidades: ideias novas e mudanças de onda.
    const ideias = hist.filter((h) => h.entity === "iniciativa" && h.action === "criou")
      .map((h) => ({ id: h.refId, nome: nomeProj(h.refId) || h.label, autor: S.findInitiative(h.refId)?.autor || h.user }));
    const ondas = [];
    hist.forEach((h) => (h.changes || []).forEach((c) => {
      if (h.entity === "iniciativa" && c.field === "onda") ondas.push({ id: h.refId, de: c.from, para: c.to });
    }));

    // Situação geral (semáforo).
    let pctEsperado = null, pctReal = null;
    if (si.sp && si.total) {
      const { inicio, fim } = S.sprintDates(si.sp);
      const dur = (fim - inicio) / DAY + 1;
      pctEsperado = Math.max(0, Math.min(100, Math.round(((t0 - inicio) / DAY + 1) / dur * 100)));
      pctReal = Math.round(si.items.reduce((s, { a }) => s + a.pct, 0) / si.total);
    }
    const atrasada = pctEsperado != null && pctReal < pctEsperado - 25;
    const vermelhos = projRisco.filter((i) => i.semaforo === "vermelho").length;
    const nivel = vermelhos || atraso.total > 2 ? "vermelho"
      : esperando.length || projRisco.length || atraso.total || atrasada || decisoes.length ? "amarelo" : "verde";
    const partes = [];
    if (si.sp) partes.push(`${si.rotulo}: ${si.feitas} de ${si.total} atividades feitas${si.terminou ? ", sprint encerrada" : `, faltam ${si.diasRestantes} dia(s)`}.`);
    if (atraso.total) partes.push(`${atraso.total} item(ns) com prazo vencido.`);
    if (esperando.length) partes.push(`${esperando.length} atividade(s) travada(s).`);
    if (decisoes.length) partes.push(`${decisoes.length} decisão(ões) aguardando a diretoria.`);
    if (!atraso.total && !esperando.length && !decisoes.length) partes.push("Nada travado.");

    return {
      periodo: `${fmt(desde)} a ${t0.toLocaleDateString("pt-BR")}`,
      autor: S.state.settings.user || "Pedro",
      geradoEm: new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
      si, nivel, frase: partes.join(" "), pctEsperado, pctReal, atrasada,
      concluidas: unicos(concluidas, (x) => `${x.proj}|${x.nome}`),
      passos: unicos(passos, (x) => `${x.proj}|${x.atividade}|${x.passo}`),
      decididas, emAndamento, esperando, projRisco, atraso, decisoes, prazos, ideias,
      ondas: unicos(ondas, (x) => x.id),
      S,
    };
  }

  /* ---------- Página HTML ---------- */
  const NIVEL = {
    verde: { cor: "#15803d", fundo: "#dcfce7", rotulo: "No prazo" },
    amarelo: { cor: "#b45309", fundo: "#fef3c7", rotulo: "Atenção" },
    vermelho: { cor: "#b91c1c", fundo: "#fee2e2", rotulo: "Travado" },
  };
  const COL_LABEL = { todo: "A fazer", doing: "Fazendo", waiting: "Travado", done: "Feito" };

  function html(d) {
    const S = d.S;
    const n = NIVEL[d.nivel];
    const cor = (id) => A.area(S.findInitiative(id)?.area).cor;
    const chip = (id) => `<span class="id" style="background:${cor(id)}">${esc(id)}</span>`;
    const vazio = (msg) => `<p class="vazio">${msg}</p>`;
    const secao = (icone, titulo, corpo, destaque = "") => `<section class="sec ${destaque}"><h2>${icone} ${titulo}</h2>${corpo}</section>`;

    const precisa = [
      ...d.decisoes.map((x) => `<li>${x.grupo ? chip(x.grupo) : ""}<div><strong>${esc(x.pauta)}</strong>${x.resultado ? `<span>${esc(x.resultado)}</span>` : ""}</div></li>`),
      ...d.esperando.map(({ it, a }) => `<li>${chip(it.id)}<div><strong>${esc(a.nome)}</strong><span>Travada${a.observacoes ? `: ${esc(a.observacoes)}` : ""}</span></div></li>`),
    ];

    const feito = [
      ...d.concluidas.map((x) => `<li>${chip(x.proj)}<div><strong>${esc(x.nome)}</strong><span>Atividade concluída${x.quem ? ` · ${esc(x.quem)}` : ""}</span></div></li>`),
      ...d.decididas.map((x) => `<li><span class="id" style="background:#475569">✓</span><div><strong>${esc(x)}</strong><span>Decisão tomada</span></div></li>`),
    ];
    const passosHtml = d.passos.length ? `<p class="sub">Passos de checklist concluídos (${d.passos.length}):</p><ul class="passos">${d.passos.slice(0, 12).map((x) =>
      `<li>${chip(x.proj)} ${esc(x.passo)} <span class="muted">· ${esc(x.atividade)}</span></li>`).join("")}${d.passos.length > 12 ? `<li class="muted">+ ${d.passos.length - 12} passo(s)</li>` : ""}</ul>` : "";

    const andamento = d.emAndamento.map(({ it, a }) => {
      const col = S.activityCol(a);
      return `<li>${chip(it.id)}<div class="grow"><strong>${esc(a.nome)}</strong>
        <span>${esc(S.raciPeople(a.raci, "R")[0] || "Sem responsável")}${a.prazo ? ` · prazo ${esc(a.prazo)}` : ""}${a.checklist.length ? ` · ${a.checklist.filter((x) => x.feito).length}/${a.checklist.length} passos` : ""}</span>
        <div class="bar"><i style="width:${a.pct}%"></i></div></div>
        <em class="col ${col}">${COL_LABEL[col]} · ${a.pct}%</em></li>`;
    });

    const risco = d.projRisco.map((it) => `<li>${chip(it.id)}<div><strong>${esc(it.nome)}</strong><span>${it.semaforo === "vermelho" ? "🔴 Travado" : "🟡 Atenção"}${it.observacoes ? `: ${esc(it.observacoes)}` : ""}</span></div></li>`);
    const vencidos = [
      ...d.atraso.projetos.map((it) => `<li>${chip(it.id)}<div><strong>${esc(it.nome)}</strong><span>Prazo do projeto vencido (${esc(it.prazo)})</span></div></li>`),
      ...d.atraso.atividades.map(({ it, a }) => `<li>${chip(it.id)}<div><strong>${esc(a.nome)}</strong><span>Atividade com prazo vencido (${esc(a.prazo)})</span></div></li>`),
    ];

    const prazos = d.prazos.map((p) => `<li><span class="data">${fmt(p.d)}</span><div><strong>${esc(p.txt)}</strong><span>${esc(p.tipo)}${p.quem ? ` · ${esc(p.quem)}` : ""}</span></div></li>`);
    const novidades = [
      ...d.ideias.map((x) => `<li>${chip(x.id)}<div><strong>${esc(x.nome)}</strong><span>Ideia nova${x.autor ? `, trazida por ${esc(x.autor)}` : ""}</span></div></li>`),
      ...d.ondas.map((x) => `<li>${chip(x.id)}<div><strong>${esc(S.findInitiative(x.id)?.nome || x.id)}</strong><span>Mudou de onda: ${esc(x.de)} → ${esc(x.para)}</span></div></li>`),
    ];
    const lista = (itens, msg) => (itens.length ? `<ul class="lista">${itens.join("")}</ul>` : vazio(msg));
    const si = d.si;

    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boletim semanal · Altamar · ${esc(d.periodo)}</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#e9eef3;color:#14171f;font:15px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif}
  .pg{max-width:780px;margin:0 auto;padding:16px}
  header{background:#133f58;color:#fff;border-radius:14px;padding:18px 20px}
  header .marca{font-size:22px;font-weight:800;letter-spacing:.2px} header .marca b{color:#7cc8f0}
  header .t{font-size:13px;opacity:.85;margin-top:2px}
  .geral{margin-top:12px;border-radius:14px;padding:16px 18px;background:${n.fundo};border:2px solid ${n.cor}}
  .geral .nv{display:inline-block;background:${n.cor};color:#fff;font-weight:800;border-radius:999px;padding:3px 12px;font-size:13px}
  .geral p{margin:8px 0 0;font-size:16px;font-weight:600}
  .sprint{margin-top:12px;background:#fff;border-radius:14px;padding:14px 18px}
  .sprint .obj{font-weight:600} .sprint .nums{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:14px;color:#5b6472;margin:6px 0}
  .big{height:10px;border-radius:5px;background:#eef2f6;overflow:hidden} .big i{display:block;height:100%;background:#15803d}
  .sec{margin-top:12px;background:#fff;border-radius:14px;padding:14px 18px}
  .sec.destaque{border:2px solid #b91c1c}
  h2{font-size:16px;margin:0 0 8px}
  .lista{list-style:none;margin:0;padding:0} .lista li{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #eef2f6}
  .lista li:first-child{border-top:none} .lista div{display:flex;flex-direction:column;min-width:0} .lista span{color:#5b6472;font-size:13px}
  .grow{flex:1} .id{flex:none;color:#fff;font-weight:800;font-size:12px;border-radius:6px;padding:2px 7px;margin-top:1px}
  .data{flex:none;font-weight:800;color:#133f58;min-width:46px}
  .bar{height:6px;border-radius:3px;background:#eef2f6;margin-top:5px;overflow:hidden} .bar i{display:block;height:100%;background:#1a9fd8}
  .col{flex:none;font-style:normal;font-size:12px;font-weight:700;border-radius:999px;padding:2px 8px;background:#eef2f6;color:#5b6472;white-space:nowrap}
  .col.waiting{background:#fee2e2;color:#991b1b} .col.doing{background:#e0f2f8;color:#026488}
  .passos{margin:4px 0 0;padding-left:0;list-style:none;font-size:14px} .passos li{padding:3px 0} .sub{margin:10px 0 2px;font-size:13px;color:#5b6472}
  .muted{color:#5b6472} .vazio{margin:0;color:#5b6472;font-style:italic}
  footer{text-align:center;color:#5b6472;font-size:12px;padding:14px 0 6px}
  @media print{body{background:#fff}.pg{padding:0}.sec,.sprint,.geral{break-inside:avoid}}
</style></head>
<body><div class="pg">
  <header>
    <div class="marca">Alta<b>mar</b> · Boletim semanal</div>
    <div class="t">Projeto de Expansão · semana de ${esc(d.periodo)} · preparado por ${esc(d.autor)}</div>
  </header>

  <div class="geral"><span class="nv">${n.rotulo}</span><p>${esc(d.frase)}</p></div>

  ${si.sp ? `<div class="sprint">
    <h2>📋 ${esc(si.rotulo)} · ${esc(si.periodo)}</h2>
    ${si.sp.objetivo ? `<div class="obj">🎯 ${esc(si.sp.objetivo)}</div>` : ""}
    <div class="nums"><span><strong>${si.feitas}</strong> de <strong>${si.total}</strong> atividades feitas</span>
      ${d.pctReal != null ? `<span>andamento médio <strong>${d.pctReal}%</strong></span><span>tempo da sprint já passado: ${d.pctEsperado}%</span>` : ""}
      <span>${si.terminou ? "sprint encerrada" : `faltam ${si.diasRestantes} dia(s)`}</span></div>
    <div class="big"><i style="width:${d.pctReal ?? 0}%"></i></div>
    ${d.atrasada ? `<p class="sub" style="color:#b45309;font-weight:700">A sprint está andando mais devagar que o tempo: vale conversar sobre o que tirar ou destravar.</p>` : ""}
  </div>` : ""}

  ${secao("🔴", `Precisa de você, Maíra`, lista(precisa, "Nenhuma decisão ou bloqueio esperando a diretoria."), precisa.length ? "destaque" : "")}
  ${secao("✅", "Feito na semana", lista(feito, d.passos.length ? "Nenhuma atividade concluída por inteiro, mas houve avanço nos passos:" : "Nenhuma entrega registrada nesta semana.") + passosHtml)}
  ${secao("⏳", "Em andamento na sprint", lista(andamento, "Nenhuma atividade em aberto na sprint."))}
  ${secao("⚠️", "Travado ou em risco", lista([...vencidos, ...risco], "Nenhum projeto em risco."))}
  ${secao("📅", "Próximos 14 dias", lista(prazos.slice(0, 15), "Nenhum prazo nos próximos 14 dias."))}
  ${novidades.length ? secao("💡", "Novidades", lista(novidades, "")) : ""}

  <footer>Gerado pelo Painel de Gestão Altamar em ${esc(d.geradoEm)}.</footer>
</div></body></html>`;
  }

  /* ---------- Texto curto (WhatsApp / e-mail) ---------- */
  function texto(d) {
    const n = { verde: "🟢 No prazo", amarelo: "🟡 Atenção", vermelho: "🔴 Travado" }[d.nivel];
    const L = [`*Boletim semanal · Expansão Altamar*`, `${d.periodo}`, ``, `${n}: ${d.frase}`];
    if (d.si.sp?.objetivo) L.push(`🎯 ${d.si.sp.objetivo}`);
    if (d.decisoes.length || d.esperando.length) {
      L.push(``, `*🔴 Precisa de você:*`);
      d.decisoes.forEach((x) => L.push(`• ${x.grupo ? `${x.grupo}: ` : ""}${x.pauta}`));
      d.esperando.forEach(({ it, a }) => L.push(`• ${it.id}: ${a.nome} (travada)`));
    }
    if (d.concluidas.length || d.decididas.length) {
      L.push(``, `*✅ Feito na semana:*`);
      d.concluidas.forEach((x) => L.push(`• ${x.proj}: ${x.nome}`));
      d.decididas.forEach((x) => L.push(`• Decidido: ${x}`));
    }
    if (d.passos.length) L.push(`• ${d.passos.length} passo(s) de checklist concluído(s)`);
    if (d.prazos.length) {
      L.push(``, `*📅 Próximos 14 dias:*`);
      d.prazos.slice(0, 6).forEach((p) => L.push(`• ${fmt(p.d)} · ${p.txt}`));
    }
    L.push(``, `O boletim completo vai em anexo.`);
    return L.join("\n");
  }

  /* ---------- Janela do boletim ---------- */
  let atual = null; // { html, texto, nome }

  function open() {
    const S = A.store;
    const d = dados(S);
    atual = { html: html(d), texto: texto(d), nome: `boletim_altamar_${new Date().toISOString().slice(0, 10)}.html` };
    $("boletim-frame").srcdoc = atual.html;
    $("boletim-info").textContent = `Semana de ${d.periodo} · ${NIVEL[d.nivel].rotulo}`;
    openModal("modal-boletim");
  }

  function init() {
    $("boletim-download").addEventListener("click", () => {
      A.util.downloadBlob(new Blob([atual.html], { type: "text/html" }), atual.nome);
      toast("Boletim baixado. É só anexar no e-mail ou no WhatsApp.");
    });
    $("boletim-open").addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([atual.html], { type: "text/html" }));
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
    $("boletim-print").addEventListener("click", () => $("boletim-frame").contentWindow.print());
    $("boletim-copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(atual.texto); toast("Resumo copiado. Cole no WhatsApp ou no e-mail."); }
      catch { toast("Não foi possível copiar automaticamente.", "error"); }
    });
  }

  A.boletim = { init, open, dados, html, texto };
})();
