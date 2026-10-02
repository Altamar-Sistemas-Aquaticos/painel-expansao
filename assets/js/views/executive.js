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
      atraso: keys.map((k, i) => (i === keys.length - 1 ? overdue(S).total : snaps[k]?.atraso ?? null)),
    };
  }

  A.metrics = {
    overdue,
    snapshot: (S) => ({ wip: S.calc.wipCount(), atraso: overdue(S).total, total: S.state.data.initiatives.length }),
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
    if (wip > A.meta.WIP_MAX) items.push({ sev: "alert", text: `Reduzir WIP de ${wip} para ${A.meta.WIP_MAX}`, sub: "Pausar ou concluir uma iniciativa antes de puxar outra", go: "kanban" });

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
    if (drafts.length) items.push({ sev: "accent", text: `Validar ${drafts.length} rascunho(s)`, sub: drafts.map((i) => i.id).join(", "), go: "portfolio" });

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

  // Próximos 5 dias úteis a partir de hoje (numa sexta, a "semana" já seria quase toda passado).
  function nextWorkdays(n = 5) {
    const out = [];
    for (let d = today(); out.length < n; d = new Date(d.getTime() + DAY)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) out.push(d);
    }
    return out;
  }

  function weekStrip(S, soon) {
    const days = nextWorkdays();
    const t = today().getTime();
    const label = (d) => d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "") + " " + String(d.getDate()).padStart(2, "0");
    const events = (d) => {
      const out = [];
      if (d.getDay() === 4) out.push({ cls: "warn", text: "Reunião" }); // quinta = reunião com a diretoria
      S.state.data.initiatives.forEach((it) => {
        if (!isOpen(it.status)) return;
        it.atividades.forEach((a) => {
          const p = period(a.prazo);
          if (p?.exact && isOpen(a.status) && p.end.getTime() === d.getTime()) out.push({ cls: "accent", text: `${it.id} prazo`, go: `projeto/${it.id}` });
        });
        const pp = period(it.prazo);
        if (pp?.exact && pp.end.getTime() === d.getTime()) out.push({ cls: "alert", text: `${it.id} entrega`, go: `projeto/${it.id}` });
      });
      return out;
    };
    const cells = days.map((d) => {
      const ev = events(d);
      const isToday = d.getTime() === t;
      return `
        <div class="wk-day ${isToday ? "today" : ""} ${d.getTime() < t ? "past" : ""}">
          <span class="wk-label">${isToday ? "hoje" : label(d)}</span>
          <div class="wk-cell">${ev.slice(0, 3).map((e) => `<span class="wk-ev ${e.cls}" ${e.go ? `data-action="go-tab" data-tab="${esc(e.go)}" role="button" tabindex="0"` : ""}>${esc(e.text)}</span>`).join("")}${ev.length > 3 ? `<span class="wk-more">+${ev.length - 3}</span>` : ""}</div>
        </div>`;
    }).join("");
    const nPrazos = days.reduce((n, d) => n + events(d).filter((e) => e.cls !== "warn").length, 0);
    const next = nextMilestone(S, new Date(days[days.length - 1].getTime() + DAY));
    return `
      <div class="wk-grid">${cells}</div>
      <p class="wk-foot">${nPrazos ? `${nPrazos} prazo(s) nos próximos 5 dias úteis` : "Nenhum prazo nos próximos 5 dias úteis"}${next ? ` · próximo marco: <strong>${esc(next.id)}</strong> em ${esc(next.data)}` : ""}</p>`;
  }

  function nextMilestone(S, after) {
    const sexta = after;
    let best = null;
    S.state.data.initiatives.forEach((it) => {
      if (!isOpen(it.status) || it.situacao === "Rascunho") return;
      const p = period(it.prazo);
      if (p?.exact && p.end >= sexta && (!best || p.end < best.d)) best = { id: it.id, d: p.end, data: p.end.toLocaleDateString("pt-BR") };
    });
    return best;
  }

  function summarySentence(S, od, wip) {
    const parts = [];
    parts.push(od.total ? `${od.total} item(ns) em atraso.` : "Nada atrasado.");
    if (od.total) parts.push("O ponto da semana é recuperar os prazos.");
    else if (wip > A.meta.WIP_MAX) parts.push(`O ponto da semana é o WIP: ${wip} em andamento para um limite de ${A.meta.WIP_MAX}.`);
    else parts.push("O fluxo está dentro do limite.");
    return parts.join(" ");
  }

  /* ---------- Render ---------- */
  function renderHeader(S) {
    const wip = S.calc.wipCount();
    const pill = document.getElementById("wip-pill");
    const over = wip > A.meta.WIP_MAX;
    pill.className = `wip-pill ${over ? "warn" : "ok"}`;
    pill.innerHTML = `Em andamento: <strong>${wip}</strong> <span class="small">${over ? `(acima de ${A.meta.WIP_MAX})` : "(no limite)"}</span>`;

    const pending = S.state.data.decisions.filter((d) => d.status === "Pendente").length;
    const decCount = document.getElementById("tab-count-decisoes");
    decCount.textContent = pending;
    decCount.className = `tab-count ${pending ? "alert" : ""}`;
    document.getElementById("tab-count-ranking").textContent = S.filtered().length;

    const cut = S.calc.cutoff();
    document.getElementById("footer-cutoff").textContent =
      `Linha de corte atual: Σ Valor ${cut.sumValor} ÷ Σ Esforço ${cut.sumEsforco} = ${fmtNum(cut.value)}`;
  }

  function renderDashboard(S) {
    const el = document.getElementById("exec-dashboard");
    if (!el) return;
    const all = S.state.data.initiatives;
    const s = series(S);
    const last = s.keys.length - 1;
    const wip = S.calc.wipCount();
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
          <p class="exec-hero-title">${new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite"}${user ? `, ${esc(user)}` : ""}. ${esc(summarySentence(S, od, wip))}</p>
        </div>
        <div class="exec-hero-chips">
          ${urgentes ? `<span class="kchip bad big">${urgentes} urgente${urgentes === 1 ? "" : "s"}</span>` : `<span class="kchip good big">Sem urgências</span>`}
          ${soon.length ? `<span class="kchip warnc big">${soon.length} vence${soon.length === 1 ? "" : "m"} em 7 dias</span>` : ""}
        </div>
      </div>

      <div class="kgrid">
        ${kpiCard({
          label: "Projetos cadastrados", value: all.length,
          chipHtml: chip(s.novos[last], { zeroLabel: "+0" }),
          spark: sparkline(s.total, "#378ADD"),
          foot: `${s.novos[last]} novo(s) nesta semana`, go: "portfolio",
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
          label: `WIP · limite ${A.meta.WIP_MAX}`, value: wip, valueClass: wip > A.meta.WIP_MAX ? "bad" : "",
          chipHtml: wip > A.meta.WIP_MAX ? `<span class="kchip bad">+${wip - A.meta.WIP_MAX}</span>` : `<span class="kchip good">ok</span>`,
          spark: sparkline(s.wip, wip > A.meta.WIP_MAX ? "#E24B4A" : "#378ADD", A.meta.WIP_MAX),
          foot: "tracejado = limite", go: "kanban",
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
            : `<div class="todo-clear"><span aria-hidden="true">✓</span> Nada pendente. Bom momento para revisar o Portfólio.</div>`}
        </section>
        <section class="panel">
          <div class="panel-head"><h3 class="panel-title">Próximos dias</h3><span class="muted small">5 dias úteis</span></div>
          ${weekStrip(S, soon)}
        </section>
      </div>`;
  }

  A.views = A.views || {};
  A.views.executive = function (S) {
    renderHeader(S);
    renderDashboard(S);
  };
})();
