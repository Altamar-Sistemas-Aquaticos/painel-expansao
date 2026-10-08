/* Painel executivo "Tendências em destaque": resumo do dia, 4 KPIs com tendência de 8 semanas,
   fila "Para resolver" e a semana. Também define auxiliares de interface usados pelas outras telas. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum } = A.util;

  /* ---------- Auxiliares compartilhados ---------- */
  const ui = (A.ui = A.ui || {});
  // Cor vem do cadastro da área (Cadastros → Áreas).
  ui.areaBadge = (area, label) => `<span class="area-badge" style="--ac:${A.area(area).cor}">${esc(label ?? area)}</span>`;
  ui.areaOptions = (selected) => A.store.areas()
    .map((a) => `<option value="${esc(a.key)}" ${a.key === selected ? "selected" : ""}>${esc(a.key)} (${esc(a.code)})</option>`).join("");
  ui.peopleOptions = (selected, { blank = "— Escolha —" } = {}) => {
    const list = A.store.pessoas({ ativas: true }).map((p) => p.nome);
    if (selected && !list.includes(selected)) list.unshift(selected); // mantém valor antigo ainda não cadastrado
    return `<option value="">${esc(blank)}</option>` + list.map((n) => `<option ${n === selected ? "selected" : ""}>${esc(n)}</option>`).join("");
  };
  ui.dot = (sem) => {
    const s = A.meta.SEMAFOROS.find((x) => x.key === sem) || A.meta.SEMAFOROS[0];
    return `<span class="dot ${s.key}" title="${esc(s.label + " — " + s.desc)}" aria-label="Semáforo ${esc(s.label)}"></span>`;
  };
  ui.decisionBadge = (status) => `<span class="badge ${status === "Pendente" ? "alert" : "ok"}">${esc(status)}</span>`;
  ui.empty = (msg) => `<div class="empty">${msg}</div>`;
  ui.eixoOptions = (selected, blank = "— Eixo —") => `<option value="">${esc(blank)}</option>` +
    A.store.eixos().map((e) => `<option value="${esc(e.key)}" ${e.key === selected ? "selected" : ""}>${esc(e.icone)} ${esc(e.key)}</option>`).join("");
  ui.eixoIcon = (key) => {
    const e = A.eixo(key);
    return `<span class="eixo-ico" title="${esc(e.key ? `Eixo: ${e.key}` : "Eixo a definir")}">${esc(e.icone)}</span>`;
  };

  // Resumo da sprint atual, usado no topo, no painel executivo, no Kanban e no Guia.
  A.sprintInfo = (S) => {
    const sp = S.sprintAtual();
    const { min, max } = S.calc.sprintLimites();
    if (!sp) return { sp: null, items: [], total: 0, feitas: 0, min, max };
    const items = S.sprintItems(sp);
    const { inicio, fim } = S.sprintDates(sp);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const total = items.length, feitas = items.filter(({ a }) => a.status === "Concluído").length;
    return {
      sp, items, total, feitas, min, max,
      projetos: new Set(items.map(({ it }) => it.id)).size,
      acima: total > max, abaixo: total < min,
      terminou: hoje > fim, naoComecou: hoje < inicio,
      diasRestantes: Math.max(0, Math.round((fim - hoje) / 86400000)),
      periodo: `${fmt(inicio)} a ${fmt(fim)}`, fimTxt: fmt(fim),
      rotulo: S.nomeCiclo(sp),
    };
  };

  /* ---------- Métricas ---------- */
  const DAY = 86400000;
  const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const isOpen = (s) => s !== "Concluído" && s !== "Cancelado";
  const period = (txt) => (A.overview ? A.overview.period(txt) : null);

  // Fim do prazo de projeto/atividade (datas aproximadas como "Jan/2027" valem pelo fim do período).
  const deadline = (txt) => period(txt)?.end || null;

  function overdue(S, ref = today()) {
    const projetos = [], atividades = [];
    S.state.data.initiatives.forEach((it) => {
      if (it.situacao === "Rascunho") return;
      const end = deadline(it.prazo);
      if (end && end < ref && isOpen(it.status)) projetos.push(it);
      it.atividades.forEach((a) => {
        const e = deadline(a.prazo);
        if (e && e < ref && isOpen(a.status) && isOpen(it.status)) atividades.push({ it, a });
      });
    });
    return { projetos, atividades, total: projetos.length + atividades.length };
  }

  // Atividades concluídas por semana, a partir do histórico (mudança de status para Concluído).
  function completionsByWeek(S) {
    const map = {};
    S.state.data.history.forEach((h) => {
      if (h.entity !== "atividade") return;
      if ((h.changes || []).some((c) => c.field === "status" && c.to === "Concluído")) {
        const k = S.calc.weekKey(new Date(h.ts));
        map[k] = (map[k] || 0) + 1;
      }
    });
    return map;
  }

  function weeks(n = 8) {
    const start = mondayOf(new Date());
    return Array.from({ length: n }, (_, i) => new Date(start.getTime() - (n - 1 - i) * 7 * DAY));
  }

  // % da sprint atual concluído (média do % das atividades).
  function sprintPct(S) {
    const items = S.sprintItems();
    return items.length ? Math.round(items.reduce((s, { a }) => s + a.pct, 0) / items.length) : null;
  }

  function series(S) {
    const ws = weeks();
    const keys = ws.map((w) => S.calc.weekKey(w));
    const snaps = S.state.data.snapshots || {};
    const created = S.state.data.initiatives.map((i) => new Date(i.criadoEm));
    const done = completionsByWeek(S);
    return {
      keys,
      total: ws.map((w) => created.filter((d) => d < new Date(w.getTime() + 7 * DAY)).length),
      novos: ws.map((w) => created.filter((d) => d >= w && d < new Date(w.getTime() + 7 * DAY)).length),
      concluidas: keys.map((k) => done[k] || 0),
      // WIP e atraso só existem a partir das fotos semanais (semanas sem foto ficam sem ponto).
      wip: keys.map((k, i) => (i === keys.length - 1 ? S.calc.wipCount() : snaps[k]?.wip ?? null)),
      sprintPct: keys.map((k, i) => (i === keys.length - 1 ? sprintPct(S) : snaps[k]?.sprintPct ?? null)),
      atraso: keys.map((k, i) => (i === keys.length - 1 ? overdue(S).total : snaps[k]?.atraso ?? null)),
    };
  }

  A.metrics = {
    overdue,
    snapshot: (S) => ({ wip: S.calc.wipCount(), sprintPct: sprintPct(S), atraso: overdue(S).total, total: S.state.data.initiatives.length }),
  };

  /* ---------- Fila "Para resolver" ---------- */
  function actionItems(S) {
    const items = [];
    const all = S.state.data.initiatives;
    const wip = S.calc.wipCount();
    const od = overdue(S);
    const in7 = new Date(today().getTime() + 7 * DAY);

    if (od.projetos.length) items.push({ sev: "alert", text: `${od.projetos.length} projeto(s) com prazo vencido`, sub: od.projetos.slice(0, 4).map((i) => i.id).join(", "), go: "overview" });
    if (od.atividades.length) items.push({ sev: "alert", text: `${od.atividades.length} atividade(s) atrasada(s)`, sub: [...new Set(od.atividades.map((x) => x.it.id))].slice(0, 5).join(", "), go: "overview" });
    const si = A.sprintInfo(S);
    if (!si.sp || si.terminou) items.push({ sev: "alert", text: si.sp ? `${si.rotulo} terminou em ${si.fimTxt}` : "Nenhum ciclo aberto", sub: "Encerrar e planejar o próximo ciclo", go: "kanban" });
    else if (!si.total) items.push({ sev: "alert", text: `Planejar o ${si.rotulo}`, sub: `Escolher de ${si.min} a ${si.max} atividades dos projetos do ciclo`, go: "kanban" });
    else if (si.acima) items.push({ sev: "alert", text: `${si.rotulo} com ${si.total} atividades (máximo ${si.max})`, sub: "Tirar atividades do ciclo ou ajustar o limite", go: "kanban" });
    else if (si.abaixo) items.push({ sev: "warn", text: `${si.rotulo} com só ${si.total} atividade(s) (mínimo ${si.min})`, sub: "Dá para puxar mais atividades no planejamento", go: "kanban" });

    const active = all.filter((i) => i.status === "Em andamento");
    const semR = active.flatMap((it) => it.atividades.filter((a) => isOpen(a.status) && !S.raciPeople(a.raci, "R").length).map((a) => ({ it, a })));
    if (semR.length) items.push({ sev: "alert", text: `Definir R em ${semR.length} atividade(s) em andamento`, sub: [...new Set(semR.map((x) => x.it.id))].join(", "), go: semR.length ? `projeto/${semR[0].it.id}` : "kanban" });

    const vermelhos = all.filter((i) => isOpen(i.status) && i.semaforo === "vermelho");
    if (vermelhos.length) items.push({ sev: "alert", text: `${vermelhos.length} projeto(s) com semáforo vermelho`, sub: vermelhos.map((i) => i.id).join(", "), go: `projeto/${vermelhos[0].id}` });

    const soon = [];
    all.forEach((it) => it.atividades.forEach((a) => {
      const e = deadline(a.prazo);
      if (e && e >= today() && e <= in7 && isOpen(a.status) && isOpen(it.status)) soon.push({ it, a });
    }));
    if (soon.length) items.push({ sev: "warn", text: `${soon.length} atividade(s) vencem em 7 dias`, sub: soon.slice(0, 3).map((x) => `${x.it.id} ${x.a.nome.slice(0, 28)}`).join(" · "), go: `projeto/${soon[0].it.id}` });

    const pend = S.state.data.decisions.filter((d) => d.status === "Pendente");
    if (pend.length) items.push({ sev: "warn", text: `${pend.length} decisão(ões) com a diretoria`, sub: pend.slice(0, 3).map((d) => d.grupo || d.quem).join(" · "), go: "decisoes" });

    const amarelos = all.filter((i) => isOpen(i.status) && i.situacao !== "Rascunho" && i.semaforo === "amarelo");
    if (amarelos.length) items.push({ sev: "warn", text: `${amarelos.length} projeto(s) em atenção`, sub: amarelos.map((i) => i.id).join(", "), go: `projeto/${amarelos[0].id}` });

    const drafts = all.filter((i) => i.situacao === "Rascunho");
    if (drafts.length) items.push({ sev: "accent", text: `Validar ${drafts.length} rascunho(s)`, sub: drafts.map((i) => i.id).join(", "), go: "triagem" });
    // Projeto validado parado na fila há 3 meses ou mais: a diretoria decide de propósito o que fica para trás.
    const parados = all.filter((i) => (S.tempoNaFila(i) ?? 0) >= 3);
    if (parados.length) items.push({ sev: "warn", text: `${parados.length} projeto(s) na fila há 3 meses ou mais`, sub: `Decidir: subir (⭐), dividir em fases ou arquivar · ${parados.slice(0, 5).map((i) => i.id).join(", ")}`, go: "priorizacao" });
    const semNota = all.filter((i) => isOpen(i.status) && (!i.valor || !i.esforco));
    if (semNota.length) items.push({ sev: "accent", text: `Dar nota a ${semNota.length} ideia(s) na Triagem`, sub: semNota.slice(0, 5).map((i) => i.id).join(", "), go: "triagem" });

    return { items, soon, od };
  }

  /* ---------- Componentes visuais ---------- */
  function sparkline(values, color, limit = null) {
    const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
    if (!pts.length) return `<div class="spark-empty">sem histórico ainda</div>`;
    const max = Math.max(1, limit ?? 0, ...pts.map(([, v]) => v)) * 1.15;
    const W = 120, H = 36, n = values.length - 1 || 1;
    const x = (i) => (i / n) * W, y = (v) => H - 3 - (v / max) * (H - 8);
    const line = pts.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const [li, lv] = pts[pts.length - 1];
    return `<svg class="spark" viewBox="-4 0 ${W + 8} ${H}" preserveAspectRatio="none" aria-hidden="true">
      ${limit != null ? `<line x1="0" x2="${W}" y1="${y(limit)}" y2="${y(limit)}" class="spark-limit"/>` : ""}
      ${pts.length > 1 ? `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` : ""}
      <circle cx="${x(li)}" cy="${y(lv)}" r="3.2" fill="${color}"/>
    </svg>`;
  }

  function chip(delta, { goodWhenDown = false, zeroLabel = "=" } = {}) {
    if (delta == null) return "";
    if (delta === 0) return `<span class="kchip neutral">${zeroLabel}</span>`;
    const good = goodWhenDown ? delta < 0 : delta > 0;
    return `<span class="kchip ${good ? "good" : "bad"}">${delta > 0 ? "+" : ""}${delta}</span>`;
  }

  function kpiCard({ label, value, valueClass = "", chipHtml, spark, foot, go }) {
    return `
      <button class="kcard" data-action="go-tab" data-tab="${esc(go)}" title="Abrir detalhes">
        <span class="kcard-top"><span>${esc(label)}</span>${chipHtml || ""}</span>
        <span class="kcard-value ${valueClass}">${value}</span>
        ${spark}
        <span class="kcard-foot">${foot}</span>
      </button>`;
  }


  /* ---------- Agenda (calendário de 4 semanas, o tamanho do ciclo, + exportação) ---------- */
  // Eventos com data exata: prazos de atividades, entregas de projetos e a reunião de quinta.
  function agendaEvents(S, from, to, { reuniao = true } = {}) {
    const out = [];
    S.state.data.initiatives.forEach((it) => {
      if (!isOpen(it.status)) return; // rascunhos entram: seus prazos já são compromissos planejados
      it.atividades.forEach((a, i) => {
        if (!isOpen(a.status)) return;
        const p = period(a.prazo);
        if (p?.exact && p.end >= from && p.end <= to) {
          const r = S.raciPeople(a.raci, "R")[0];
          out.push({ date: p.end, kind: "prazo", cls: "accent", id: `${it.id}-${a.id}`, ini: it.id,
            short: `${it.id} · ${a.nome}`, title: `${it.id} · ${a.nome}`, detail: `Prazo da atividade ${i + 1} de ${it.nome}${r ? ` · R: ${r}` : ""}${a.entregavel ? ` · Entregável: ${a.entregavel}` : ""}` });
        }
      });
      const pp = period(it.prazo);
      if (pp?.exact && pp.end >= from && pp.end <= to) {
        out.push({ date: pp.end, kind: "entrega", cls: "alert", id: it.id, ini: it.id,
          short: `${it.id} entrega`, title: `Entrega: ${it.id} · ${it.nome}`, detail: `Prazo final do projeto${it.responsavel ? ` · Responsável: ${it.responsavel}` : ""}` });
      }
    });
    // Calls e reuniões marcadas no painel.
    S.state.data.compromissos.forEach((c) => {
      const d = S.calc.parseDate(c.data);
      if (!d || d < from || d > to) return;
      out.push({ date: d, kind: "compromisso", cls: "pro", id: `cmp-${c.id}`, cmp: c.id, ini: c.projeto || null,
        short: `${c.horaInicio} ${c.titulo}`, title: c.titulo, hora: c.horaInicio,
        detail: `${c.horaInicio} – ${c.horaFim}${c.projeto ? ` · ${c.projeto}` : ""}${c.participantes.length ? ` · ${c.participantes.join(", ")}` : ""}${c.local ? ` · ${c.local}` : ""}` });
    });
    // Compromissos da agenda Google (quando conectada). A reunião fixa de quinta só aparece sem Google.
    const google = A.google?.isConnected();
    if (google && reuniao) out.push(...A.google.calendarEvents(from, to));
    if (reuniao && !google) {
      for (let d = new Date(from); d <= to; d = new Date(d.getTime() + DAY)) {
        if (d.getDay() === 4) out.push({ date: new Date(d), kind: "reuniao", cls: "warn", id: `reuniao-${d.toISOString().slice(0, 10)}`,
          short: "Reunião diretoria", title: "Reunião de gestão com a diretoria", detail: "Quinta-feira: status, prazos, impedimentos e decisões" });
      }
    }
    // Prazos das minhas tarefas pessoais (só na agenda da tela, nunca enviados ao Google).
    if (reuniao && A.tarefas) out.push(...A.tarefas.eventosAgenda(from, to));
    const order = { reuniao: 0, compromisso: 1, google: 1, entrega: 2, prazo: 3, tarefa: 4 };
    return out.sort((a, b) => a.date - b.date || order[a.kind] - order[b.kind] || String(a.short).localeCompare(String(b.short)));
  }

  const CHAVE_FILTRO = "altamar_agenda_ocultos";
  function agendaOcultos() {
    try { return JSON.parse(localStorage.getItem(CHAVE_FILTRO) || "[]"); } catch { return []; }
  }
  // Clicar numa etiqueta da legenda liga/desliga aquele tipo de evento (vários ao mesmo tempo).
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-cal-filtro]");
    if (!b) return;
    let ocultos = agendaOcultos();
    const k = b.dataset.calFiltro;
    ocultos = k === "todos" ? [] : ocultos.includes(k) ? ocultos.filter((x) => x !== k) : [...ocultos, k];
    try { localStorage.setItem(CHAVE_FILTRO, JSON.stringify(ocultos)); } catch {}
    renderDashboard(A.store);
  });

  function calendar(S) {
    const start = mondayOf(new Date());
    const DIAS = 28; // 4 semanas a partir da segunda desta semana
    const end = new Date(start.getTime() + (DIAS - 1) * DAY);
    const t = today().getTime();
    // Tipos escondidos pelo filtro da legenda (guardado neste navegador).
    const ocultos = agendaOcultos();
    const tipoDe = (e) => (e.kind === "google" || e.kind === "reuniao" ? "agenda" : e.kind);
    const evs = agendaEvents(S, start, end).filter((e) => !ocultos.includes(tipoDe(e)));
    const byDay = {};
    evs.forEach((e) => { (byDay[e.date.getTime()] ||= []).push(e); });
    const dow = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    const cells = Array.from({ length: DIAS }, (_, i) => {
      const d = new Date(start.getTime() + i * DAY);
      const list = byDay[d.getTime()] || [];
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const isToday = d.getTime() === t;
      const firstOfMonth = d.getDate() === 1 || i === 0;
      return `
        <div class="cal-day ${isToday ? "today" : ""} ${d.getTime() < t ? "past" : ""} ${weekend ? "weekend" : ""}">
          <span class="cal-num">${isToday ? `<span class="cal-today">${d.getDate()}</span>` : d.getDate()}${firstOfMonth ? ` <span class="cal-month">${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>` : ""}</span>
          ${list.slice(0, 3).map((e) => `<button class="cal-ev ${e.cls}" data-cal-ev="${esc(e.id)}" title="${esc(e.title)}">${esc(e.short)}</button>`).join("")}
          ${list.length > 3 ? `<button class="cal-more" data-cal-day="${d.getTime()}">+${list.length - 3} mais</button>` : ""}
        </div>`;
    }).join("");
    const nPrazos = evs.filter((e) => e.kind === "prazo" || e.kind === "entrega").length;
    const nComp = evs.filter((e) => e.kind === "compromisso" || e.kind === "google").length;
    const depois = agendaEvents(S, new Date(end.getTime() + DAY), new Date(end.getTime() + 120 * DAY), { reuniao: false }).slice(0, 3);
    A.agenda._last = evs; // usados pelo popover
    return `
      <div class="cal-head">${dow.map((x, i) => `<span class="${i > 4 ? "weekend" : ""}">${x}</span>`).join("")}</div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-foot">
        <span>${nPrazos ? `${nPrazos} prazo(s)` : "Nenhum prazo"}${nComp ? ` · ${nComp} reunião(ões)` : ""} nestas 4 semanas</span>
        ${depois.length ? `<span>Depois: ${depois.map((e) => `<button class="link-btn" data-action="go-tab" data-tab="projeto/${esc(e.ini)}" title="${esc(e.title)}">${esc(e.ini)} ${e.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</button>`).join(" · ")}</span>` : ""}
      </div>
      <div class="cal-legend" role="group" aria-label="Filtrar o que aparece no calendário">
        <span class="muted small">Mostrar:</span>
        ${[
          ["agenda", A.google?.isConnected() ? "gcal" : "warn", A.google?.isConnected() ? "Sua agenda Google" : "Reunião de quinta"],
          ["compromisso", "pro", "Reunião"],
          ["entrega", "alert", "Entrega de projeto"],
          ["prazo", "accent", "Prazo de atividade"],
          ["tarefa", "ok", "Minha tarefa"],
        ].map(([k, cls, txt]) => `<button class="cal-ev cal-filtro ${cls} ${ocultos.includes(k) ? "off" : ""}" data-cal-filtro="${k}" aria-pressed="${!ocultos.includes(k)}" title="Mostrar ou esconder">${ocultos.includes(k) ? "○" : "●"} ${txt}</button>`).join("")}
        ${ocultos.length ? `<button class="link-btn small" data-cal-filtro="todos">Mostrar tudo</button>` : ""}
      </div>
      <div class="cal-google no-print">${A.google?.isConnected()
        ? `${A.google.statusHtml()} · <button class="link-btn" data-g-sync>Sincronizar agora</button>`
        : `Google Agenda não conectado · <button class="link-btn" data-g-open>Conectar</button>`}</div>
      <div class="cal-pop hidden" id="cal-pop" role="dialog" aria-label="Detalhes do evento"></div>`;
  }

  /* Google Agenda: link "adicionar evento" (um clique por evento) e arquivo .ics com todos os prazos. */
  const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  function googleLink(e) {
    const next = new Date(e.date.getTime() + DAY);
    const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${ymd(e.date)}/${ymd(next)}`, details: `${e.detail}\n\nPainel de Expansão Altamar` });
    return `https://calendar.google.com/calendar/render?${q.toString()}`;
  }

  function exportIcs(S) {
    const from = today(), to = new Date(from.getTime() + 365 * DAY);
    const evs = agendaEvents(S, from, to, { reuniao: false });
    if (!evs.length) return A.util.toast("Nenhum prazo com data exata para exportar.", "warn");
    const escIcs = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Altamar//Painel de Expansao//PT", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Painel Altamar — prazos"];
    evs.forEach((e) => {
      lines.push("BEGIN:VEVENT", `UID:${e.id}@painel-altamar`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(new Date(e.date.getTime() + DAY))}`,
        `SUMMARY:${escIcs(e.title)}`, `DESCRIPTION:${escIcs(e.detail)}`, "TRANSP:TRANSPARENT", "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    A.util.downloadBlob(new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }), "prazos_painel_altamar.ics");
    A.util.toast(`${evs.length} prazo(s) exportado(s). Importe o arquivo no Google Agenda.`);
  }

  function showPopover(btn, ev) {
    const pop = document.getElementById("cal-pop");
    if (!pop) return;
    const panel = pop.parentElement.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    pop.innerHTML = `
      <div class="cal-pop-date">${ev.date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>
      <div class="cal-pop-title">${esc(ev.title)}</div>
      <div class="cal-pop-detail">${esc(ev.detail)}</div>
      <div class="cal-pop-actions">
        ${ev.kind === "compromisso" ? `<button class="btn btn-xs btn-primary" data-cmp-edit="${esc(ev.cmp)}">Editar reunião</button>` : ""}
        ${ev.ini ? `<button class="btn btn-xs btn-outline" data-action="go-tab" data-tab="projeto/${esc(ev.ini)}">Abrir projeto</button>` : ""}
        ${(ev.kind === "prazo" || ev.kind === "entrega") && !A.google?.isConnected()
          ? `<a class="btn btn-xs btn-primary" href="${esc(googleLink(ev))}" target="_blank" rel="noopener">Adicionar ao Google Agenda ↗</a>` : ""}
        ${(ev.kind === "prazo" || ev.kind === "entrega" || ev.kind === "compromisso") && A.google?.isConnected()
          ? `<span class="muted small">✓ Sincronizado com a agenda “Painel Altamar”</span>` : ""}
      </div>`;
    pop.style.left = `${Math.min(Math.max(0, r.left - panel.left), panel.width - 280)}px`;
    pop.style.top = `${r.bottom - panel.top + 6}px`;
    pop.classList.remove("hidden");
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-cal-ev]");
    const more = e.target.closest?.("[data-cal-day]");
    const pop = document.getElementById("cal-pop");
    if (b) {
      const ev = (A.agenda._last || []).find((x) => x.id === b.dataset.calEv);
      if (ev) showPopover(b, ev);
      return;
    }
    if (more) {
      // "+N mais": mostra os eventos do dia num popover em lista.
      const day = Number(more.dataset.calDay);
      const list = (A.agenda._last || []).filter((x) => x.date.getTime() === day);
      if (pop) {
        const panel = pop.parentElement.getBoundingClientRect(), r = more.getBoundingClientRect();
        pop.innerHTML = `<div class="cal-pop-date">${new Date(day).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>` +
          list.map((x) => `<button class="cal-ev ${x.cls} full" data-cal-ev="${esc(x.id)}">${esc(x.title)}</button>`).join("");
        pop.style.left = `${Math.min(Math.max(0, r.left - panel.left), panel.width - 280)}px`;
        pop.style.top = `${r.bottom - panel.top + 6}px`;
        pop.classList.remove("hidden");
      }
      return;
    }
    if (e.target.closest?.("[data-ics-export]")) return exportIcs(A.store);
    if (e.target.closest?.("[data-g-sync]")) return A.google.sync({ silent: false });
    if (e.target.closest?.("[data-g-open]")) return A.google.openSettings();
    const novo = e.target.closest?.("[data-cmp-new]");
    if (novo) { pop?.classList.add("hidden"); return A.compromissos.open(null, { projeto: novo.dataset.cmpNew || "" }); }
    const edit = e.target.closest?.("[data-cmp-edit]");
    if (edit) { pop?.classList.add("hidden"); return A.compromissos.open(edit.dataset.cmpEdit); }
    if (pop && !e.target.closest?.("#cal-pop")) pop.classList.add("hidden");
  });

  A.agenda = { agendaEvents, exportIcs, googleLink };

  function nextMilestone(S, after) {
    let best = null;
    S.state.data.initiatives.forEach((it) => {
      if (!isOpen(it.status) || it.situacao === "Rascunho") return;
      const p = period(it.prazo);
      if (p?.exact && p.end >= after && (!best || p.end < best.d)) best = { id: it.id, d: p.end, data: p.end.toLocaleDateString("pt-BR") };
    });
    return best;
  }

  function summarySentence(S, od) {
    const parts = [];
    const si = A.sprintInfo(S);
    parts.push(od.total ? `${od.total} item(ns) em atraso.` : "Nada atrasado.");
    if (od.total) parts.push("O ponto da semana é recuperar os prazos.");
    else if (!si.sp || si.terminou || !si.total) parts.push("O ponto da semana é planejar o ciclo.");
    else parts.push(`${si.rotulo}: ${si.feitas} de ${si.total} atividades feitas, faltam ${si.diasRestantes} dia(s).`);
    return parts.join(" ");
  }

  /* ---------- Minhas atividades (quem está logado é o R) ---------- */
  function minhasAtividades(S) {
    const eu = S.state.settings.user;
    const si = A.sprintInfo(S);
    if (!eu || !si.sp) return "";
    const minhas = si.items.filter(({ a }) => S.raciPeople(a.raci, "R")[0] === eu)
      .sort((x, y) => (x.a.status === "Concluído") - (y.a.status === "Concluído"));
    if (!minhas.length) {
      return `<section class="panel minhas vazio"><strong>Minhas atividades no ${esc(si.rotulo)}</strong>
        <span class="muted small">Nenhuma atividade sua (como responsável R) neste ciclo.</span></section>`;
    }
    const COL = Object.fromEntries(A.meta.SPRINT_COLUNAS.map((c) => [c.key, c.label]));
    return `
      <section class="panel minhas">
        <div class="panel-head">
          <h3 class="panel-title">Minhas atividades no ${esc(si.rotulo)}</h3>
          <span class="muted small">${minhas.filter(({ a }) => a.status === "Concluído").length} de ${minhas.length} feitas · até ${esc(si.fimTxt)}</span>
        </div>
        <div class="minhas-grid">
          ${minhas.map(({ it, a }) => {
            const key = `${it.id}|${a.id}`;
            const col = S.activityCol(a);
            return `
              <article class="minha ${col}" style="--ac:${A.area(it.area).cor}">
                <div class="minha-top">
                  <span class="act-card-id">${esc(it.id)}</span>
                  <span class="minha-col ${col}">${esc(COL[col])}</span>
                  <span class="act-ring" style="--p:${a.pct}" title="${a.pct}% concluído"><b>${a.pct}</b></span>
                </div>
                <button class="minha-nome" data-action="open-activity" data-id="${esc(key)}" title="Abrir a atividade">${esc(a.nome)}</button>
                ${a.prazo ? `<div class="muted small">📅 ${esc(a.prazo)}</div>` : ""}
                ${a.checklist.length ? `<ul class="minha-check">${a.checklist.map((x) => `
                  <li class="${x.feito ? "done" : ""}"><label><input type="checkbox" data-minha-ck="${esc(key)}|${esc(x.id)}" ${x.feito ? "checked" : ""} ${col === "done" ? "disabled" : ""}> <span>${esc(x.texto)}</span></label></li>`).join("")}</ul>`
                  : `<button class="btn btn-xs btn-ghost" data-action="open-activity" data-id="${esc(key)}">+ Quebrar em passos (checklist)</button>`}
                <div class="minha-acoes">
                  ${col === "todo" ? `<button class="btn btn-xs btn-outline" data-action="act-quick" data-id="${esc(key)}" data-q="next">▶ Começar</button>` : ""}
                  ${col === "doing" ? `<button class="btn btn-xs btn-outline" data-action="act-quick" data-id="${esc(key)}" data-q="block">⚠ Travou</button><button class="btn btn-xs btn-primary" data-action="act-quick" data-id="${esc(key)}" data-q="next">✓ Concluir</button>` : ""}
                  ${col === "waiting" || col === "blocked" ? `<button class="btn btn-xs btn-outline" data-action="act-quick" data-id="${esc(key)}" data-q="next" title="Registrar o que resolveu e voltar para Fazendo">✓ Resolvido</button>` : ""}
                </div>
              </article>`;
          }).join("")}
        </div>
      </section>`;
  }

  // Marcar um passo do checklist direto no Painel executivo.
  document.addEventListener("change", (e) => {
    const cb = e.target.closest?.("[data-minha-ck]");
    if (!cb) return;
    const [ini, act, ck] = cb.dataset.minhaCk.split("|");
    const a = A.store.findActivity(ini, act);
    if (!a) return;
    const patch = { checklist: a.checklist.map((x) => (x.id === ck ? { ...x, feito: cb.checked } : x)) };
    if (cb.checked && a.status === "A fazer") Object.assign(patch, { status: "Em andamento", esperando: false, travado: false });
    A.board.salvarAtividade(ini, act, patch, "Painel executivo");
  });
  /* ---------- Render ---------- */
  function renderHeader(S) {
    const si = A.sprintInfo(S);
    const pill = document.getElementById("wip-pill");
    const alerta = !si.sp || si.terminou || si.acima || !si.total;
    pill.className = `wip-pill ${alerta ? "warn" : "ok"}`;
    pill.title = si.sp ? `${si.rotulo}: ${si.periodo} · limite de ${si.min} a ${si.max} atividades` : "Nenhum ciclo aberto";
    pill.innerHTML = si.sp
      ? `${si.rotulo}: <strong>${si.feitas}</strong> de ${si.total} feitas <span class="small">· até ${si.fimTxt}</span>`
      : "Sem ciclo aberto";

    const pending = S.state.data.decisions.filter((d) => d.status === "Pendente").length;
    const decCount = document.getElementById("tab-count-decisoes");
    decCount.textContent = pending;
    decCount.className = `tab-count ${pending ? "alert" : ""}`;
    const tri = S.state.data.initiatives.filter((i) => i.status !== "Cancelado" && i.status !== "Concluído" && (i.situacao === "Rascunho" || !i.valor || !i.esforco)).length;
    const triCount = document.getElementById("tab-count-triagem");
    if (triCount) { triCount.textContent = tri; triCount.className = `tab-count ${tri ? "accent" : ""}`; }

    const cut = S.calc.cutoff();
    document.getElementById("footer-cutoff").textContent =
      `Linha de corte atual: Σ Valor ${cut.sumValor} ÷ Σ Esforço ${cut.sumEsforco} = ${fmtNum(cut.value)}`;
  }

  // Um quadro por setor: projetos no ciclo, etapas comprometidas × feitas, atrasos e o pior semáforo.
  function setoresNoCiclo(S, si, od) {
    const limite = A.meta.LIMITE_PROJETOS_SETOR;
    const SEM = { vermelho: 0, amarelo: 1, verde: 2 };
    const linhas = S.areas().map((a) => {
      const projs = S.projetosNoCiclo(a.key);
      const acts = si.items.filter(({ it }) => it.area === a.key);
      const feitas = acts.filter(({ a: x }) => x.status === "Concluído").length;
      const atrasos = od.projetos.filter((it) => it.area === a.key).length + od.atividades.filter(({ it }) => it.area === a.key).length;
      const pior = projs.map((p) => p.semaforo).sort((x, y) => (SEM[x] ?? 3) - (SEM[y] ?? 3))[0];
      const pct = acts.length ? Math.round((feitas / acts.length) * 100) : 0;
      const parados = S.state.data.initiatives.filter((it) => it.area === a.key && it.situacao === "Validado" && !it.ciclo && (S.tempoNaFila(it) || 0) >= 3).length;
      return `
        <button class="ex-setor" data-ex-setor="${esc(a.key)}" data-action="go-tab" data-tab="kanban" style="--ac:${a.cor}" title="Abrir o Kanban de ${esc(a.key)}">
          <span class="ex-setor-nome"><strong>${esc(a.key)}</strong><span class="muted small">${esc(a.lider || "líder a definir")}</span></span>
          <span class="ex-setor-proj ${projs.length > limite ? "bad" : ""}" title="${esc(projs.map((p) => `${p.id} · ${p.nome}`).join("\n") || "Nenhum projeto no ciclo")}"><strong>${projs.length}</strong>/${limite}<small>projetos</small></span>
          <span class="ex-setor-barra" title="${feitas} de ${acts.length} etapas feitas"><i style="width:${pct}%"></i><small>${acts.length ? `${feitas} de ${acts.length} etapas feitas` : "sem etapas comprometidas"}</small></span>
          <span class="ex-setor-sinais">
            ${pior ? `<span title="Pior semáforo entre os projetos do ciclo">${{ verde: "🟢", amarelo: "🟡", vermelho: "🔴" }[pior] || ""}</span>` : ""}
            ${atrasos ? `<span class="kchip bad">${atrasos} atraso${atrasos === 1 ? "" : "s"}</span>` : ""}
            ${parados ? `<span class="kchip warnc" title="Validados esperando há 3 ciclos ou mais">⏳ ${parados}</span>` : ""}
          </span>
        </button>`;
    }).join("");
    return `
      <section class="panel ex-setores">
        <div class="panel-head"><h3 class="panel-title">Setores · ${si.sp ? esc(si.rotulo) : "sem ciclo aberto"}</h3>
          <span class="muted small">Comprometido × feito · clique para abrir o Kanban do setor</span></div>
        <div class="ex-setores-lista">${linhas}</div>
      </section>`;
  }
  // Ao abrir o Kanban por um setor, já filtra por ele (roda antes do go-tab).
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ex-setor]");
    if (b) A.store.state.ui.area = b.dataset.exSetor;
  }, true);

  function renderDashboard(S) {
    const el = document.getElementById("exec-dashboard");
    if (!el) return;
    const all = S.state.data.initiatives;
    const s = series(S);
    const last = s.keys.length - 1;
    const wip = S.calc.wipCount();
    const si = A.sprintInfo(S);
    const { items, soon, od } = actionItems(S);
    const urgentes = items.filter((i) => i.sev === "alert").length;
    const user = S.state.settings.user;
    const semana = (() => {
      const d = new Date(); const onejan = new Date(d.getFullYear(), 0, 1);
      return Math.ceil(((d - onejan) / DAY + onejan.getDay() + 1) / 7);
    })();
    const mon = mondayOf(new Date()), sun = new Date(mon.getTime() + 6 * DAY);
    const fmtD = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const concluidosProj = all.filter((i) => i.status === "Concluído").length;

    el.innerHTML = `
      <div class="exec-hero">
        <div>
          <p class="exec-hero-date">Semana ${semana} · ${fmtD(mon)} a ${fmtD(sun)}</p>
          <p class="exec-hero-title">${new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite"}${user ? `, ${esc(user)}` : ""}. ${esc(summarySentence(S, od))}</p>
        </div>
        <div class="exec-hero-chips">
          ${urgentes ? `<span class="kchip bad big">${urgentes} urgente${urgentes === 1 ? "" : "s"}</span>` : `<span class="kchip good big">Sem urgências</span>`}
          ${soon.length ? `<span class="kchip warnc big">${soon.length} vence${soon.length === 1 ? "" : "m"} em 7 dias</span>` : ""}
        </div>
      </div>

      ${minhasAtividades(S)}
      ${A.tarefas?.resumoPainel(S) || ""}

      ${A.visao.atual().tipo === "lider" ? "" : setoresNoCiclo(S, si, od)}

      <div class="kgrid">
        ${kpiCard({
          label: "Projetos cadastrados", value: all.length,
          chipHtml: chip(s.novos[last], { zeroLabel: "+0" }),
          spark: sparkline(s.total, "#378ADD"),
          foot: `${s.novos[last]} novo(s) nesta semana`, go: "triagem",
        })}
        ${kpiCard({
          label: "Concluídas na semana", value: s.concluidas[last],
          chipHtml: chip(s.concluidas[last] - s.concluidas[last - 1]),
          spark: sparkline(s.concluidas, "#1D9E75"),
          foot: `atividades · ${concluidosProj} projeto(s) concluído(s) no total`, go: "historico",
        })}
        ${kpiCard({
          label: "Em atraso", value: od.total, valueClass: od.total ? "bad" : "good",
          chipHtml: od.total ? `<span class="kchip bad">atenção</span>` : `<span class="kchip good">em dia</span>`,
          spark: sparkline(s.atraso, "#E24B4A"),
          foot: `${od.projetos.length} projeto(s) · ${od.atividades.length} atividade(s)`, go: "overview",
        })}
        ${kpiCard({
          label: si.sp ? `${si.rotulo} · até ${si.fimTxt}` : "Ciclo", value: si.sp ? `${si.feitas}/${si.total}` : "—",
          valueClass: si.acima || si.terminou ? "bad" : "",
          chipHtml: !si.sp || si.terminou ? `<span class="kchip bad">encerrar</span>`
            : si.acima ? `<span class="kchip bad">acima de ${si.max}</span>`
            : `<span class="kchip good">${si.diasRestantes} dia(s)</span>`,
          spark: sparkline(s.sprintPct, "#378ADD"),
          foot: `atividades feitas · ${si.projetos || 0} projeto(s) no ciclo`, go: "kanban",
        })}
      </div>

      <div class="exec-bottom">
        <section class="panel">
          <div class="panel-head"><h3 class="panel-title">Para resolver</h3><span class="muted small">por urgência</span></div>
          ${items.length ? `<ol class="todo">${items.map((it, i) => `
            <li>
              <button class="todo-item" data-action="go-tab" data-tab="${esc(it.go)}">
                <span class="todo-n ${it.sev}">${i + 1}</span>
                <span class="todo-text"><strong>${esc(it.text)}</strong>${it.sub ? `<span class="muted small">${esc(it.sub)}</span>` : ""}</span>
                <span class="todo-go" aria-hidden="true">→</span>
              </button>
            </li>`).join("")}</ol>`
            : `<div class="todo-clear"><span aria-hidden="true">✓</span> Nada pendente. Bom momento para revisar a Triagem.</div>`}
        </section>
        <section class="panel cal-panel">
          <div class="panel-head">
            <h3 class="panel-title">Agenda · 4 semanas</h3>
            <div class="row no-print">
              <button class="btn btn-xs btn-primary" data-cmp-new="">+ Reunião</button>
              ${A.google?.isConnected() ? "" : `<button class="btn btn-xs btn-outline" data-ics-export title="Baixa um arquivo .ics com todos os prazos para importar no Google Agenda">Exportar .ics</button>`}
            </div>
          </div>
          ${calendar(S)}
        </section>
      </div>`;
  }

  A.views = A.views || {};
  A.views.executive = function (S) {
    renderHeader(S);
    renderDashboard(S);
  };
})();
