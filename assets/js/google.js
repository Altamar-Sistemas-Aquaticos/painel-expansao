/* Integração com o Google Agenda via a "ponte" do Apps Script (google-apps-script/Codigo.gs).
   Painel → Google: prazos, entregas e compromissos vão para a agenda "Painel Altamar".
   Google → painel: seus compromissos aparecem no calendário de 2 semanas. */
(function () {
  const A = window.Altamar;
  const { toast } = A.util;
  const DAY = 86400000;

  let events = [];       // compromissos lidos do Google (cache da sessão)
  let timer = null;
  let syncing = false;
  let pending = false;

  const cfg = () => A.store.state.settings.google || {};
  const isConnected = () => !!(cfg().url && cfg().token);

  const pad = (n) => String(n).padStart(2, "0");
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const brToIso = (s) => { const d = A.store.calc.parseDate(s); return d ? isoDay(d) : null; };
  const isOpen = (s) => s !== "Concluído" && s !== "Cancelado";

  async function call(action, payload = {}, conf = cfg()) {
    // Corpo em texto puro = requisição "simples" (sem pré-verificação CORS), aceita pelo Apps Script.
    const res = await fetch(conf.url, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify({ ...payload, action, token: conf.token }),
    });
    let data;
    try { data = await res.json(); } catch { throw new Error("A ponte não respondeu em JSON. Confira a URL do app da Web."); }
    if (!data.ok) throw new Error(data.error || "Erro na ponte do Google Agenda.");
    return data;
  }

  // Tudo o que o painel quer ver no Google, dentro da janela de sincronização.
  function buildEvents(S) {
    const out = [];
    const pessoas = Object.fromEntries(S.pessoas().map((p) => [p.nome, p]));
    S.state.data.initiatives.forEach((it) => {
      if (!isOpen(it.status)) return;
      it.atividades.forEach((a, i) => {
        if (!isOpen(a.status)) return;
        const p = S.calc.parseDate(a.prazo);
        if (!p) return;
        const r = S.raciPeople(a.raci, "R")[0];
        out.push({
          id: `atv-${it.id}-${a.id}`, allDay: true, date: isoDay(p),
          title: `⏳ ${it.id} · ${a.nome}`,
          description: [`Prazo da atividade ${i + 1} do projeto ${it.id} · ${it.nome}`, r && `Responsável (R): ${r}`,
            a.entregavel && `Entregável: ${a.entregavel}`, `Progresso: ${a.pct}%`, "", "Painel de Expansão Altamar"].filter((x) => x !== undefined && x !== null && x !== false).join("\n"),
        });
      });
      const pp = S.calc.parseDate(it.prazo);
      if (pp) {
        out.push({
          id: `ent-${it.id}`, allDay: true, date: isoDay(pp),
          title: `🏁 Entrega ${it.id} · ${it.nome}`,
          description: `Prazo final do projeto ${it.id}${it.responsavel ? `\nResponsável: ${it.responsavel}` : ""}\n\nPainel de Expansão Altamar`,
        });
      }
    });
    S.state.data.compromissos.forEach((c) => {
      const d = brToIso(c.data);
      if (!d) return;
      const ini = c.projeto ? S.findInitiative(c.projeto) : null;
      const emails = c.participantes.map((n) => pessoas[n]?.email).filter(Boolean);
      out.push({
        id: `cmp-${c.id}`, allDay: false, start: `${d}T${c.horaInicio}`, end: `${d}T${c.horaFim}`,
        title: `${c.titulo}${c.projeto ? ` (${c.projeto})` : ""}`,
        location: c.local,
        description: [ini && `Projeto ${ini.id} · ${ini.nome}`, c.participantes.length && `Participantes: ${c.participantes.join(", ")}`,
          c.notas, "", "Painel de Expansão Altamar"].filter((x) => x !== undefined && x !== null && x !== false && x !== 0).join("\n"),
        // Convidados só quando o usuário marcou "enviar convite" no compromisso.
        guests: c.enviarConvite ? emails : [],
        sendInvites: c.enviarConvite,
      });
    });
    return out;
  }

  function window_() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return { from: isoDay(new Date(t.getTime() - 30 * DAY)), to: isoDay(new Date(t.getTime() + 400 * DAY)) };
  }

  async function sync({ silent = true } = {}) {
    if (!isConnected()) return;
    if (syncing) { pending = true; return; }
    syncing = true;
    const S = A.store;
    try {
      const w = window_();
      const r = await call("sync", { events: buildEvents(S), ...w });
      // Seus compromissos: desta segunda até 3 semanas à frente.
      const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
      const l = await call("list", { from: isoDay(mon), to: isoDay(new Date(mon.getTime() + 21 * DAY)) });
      events = l.eventos || [];
      S.saveSettings({ google: { ...cfg(), lastSync: new Date().toISOString(), lastError: "", lastResult: r.resultado, cache: events } });
      if (!silent) {
        const x = r.resultado;
        toast(`Google Agenda sincronizado: ${x.criados} criado(s), ${x.atualizados} atualizado(s), ${x.removidos} removido(s).`);
      }
    } catch (err) {
      S.saveSettings({ google: { ...cfg(), lastError: String(err.message || err) } });
      if (!silent) toast(`Google Agenda: ${err.message || err}`, "error", 7000);
    } finally {
      syncing = false;
      if (pending) { pending = false; schedule(); }
    }
  }

  // Agrupa várias alterações seguidas (ex.: arrastar o controle de %) numa única sincronização.
  function schedule(ms = 5000) {
    if (!isConnected()) return;
    clearTimeout(timer);
    timer = setTimeout(() => sync(), ms);
  }

  // Eventos do Google no formato do calendário do painel.
  function calendarEvents(from, to) {
    const list = events.length ? events : (cfg().cache || []);
    const out = [];
    list.forEach((e) => {
      const s = new Date(e.start);
      const day = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      if (day < from || day > to) return;
      const hora = e.allDay ? "" : `${pad(s.getHours())}:${pad(s.getMinutes())} `;
      out.push({
        date: day, kind: "google", cls: "gcal", id: `g-${e.id}-${s.getTime()}`, ini: null,
        short: `${hora}${e.title}`, title: e.title,
        detail: `${e.allDay ? "Dia inteiro" : `${hora.trim()} – ${new Date(e.end).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}${e.location ? ` · ${e.location}` : ""} · da sua agenda Google`,
      });
    });
    return out;
  }

  /* ---------- Tela de conexão ---------- */
  function openSettings() {
    const c = cfg();
    const $ = (id) => document.getElementById(id);
    $("g-url").value = c.url || "";
    $("g-token").value = c.token || "";
    $("g-status").innerHTML = statusHtml();
    $("g-disconnect").classList.toggle("hidden", !isConnected());
    A.util.openModal("modal-google");
  }

  function statusHtml() {
    const c = cfg();
    if (!isConnected()) return `<span class="badge">Não conectado</span>`;
    if (c.lastError) return `<span class="badge alert">Erro</span> ${A.util.esc(c.lastError)}`;
    if (c.lastSync) return `<span class="badge ok">Conectado</span> Última sincronização: ${A.util.fmtDateTime(c.lastSync)}`;
    return `<span class="badge accent">Conectado</span> Aguardando a primeira sincronização`;
  }

  function init() {
    const $ = (id) => document.getElementById(id);
    $("g-test").addEventListener("click", async () => {
      const conf = { url: $("g-url").value.trim(), token: $("g-token").value.trim() };
      // Contas comuns: script.google.com/macros/s/ID/exec · Google Workspace: script.google.com/a/macros/DOMÍNIO/s/ID/exec
      const m = conf.url.match(/^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+|macros)\/s\/([\w-]+)\/exec\/?$/);
      if (!m) {
        $("g-status").innerHTML = `<span class="badge alert">URL inválida</span> Use a URL do app da Web, que termina em <code>/exec</code>.`;
        return;
      }
      $("g-status").innerHTML = `<span class="badge">Testando…</span>`;
      try {
        // Tenta a URL como foi colada e, se não responder, o formato padrão (o de Workspace às vezes exige login).
        const padrao = `https://script.google.com/macros/s/${m[1]}/exec`;
        let r;
        try { r = await call("ping", {}, conf); }
        catch (err) {
          if (conf.url === padrao) throw err;
          conf.url = padrao;
          r = await call("ping", {}, conf);
        }
        A.store.saveSettings({ google: { ...cfg(), ...conf, lastError: "" } });
        $("g-status").innerHTML = `<span class="badge ok">Conectado</span> Conta ${A.util.esc(r.conta)} · agenda “${A.util.esc(r.agenda)}”`;
        $("g-disconnect").classList.remove("hidden");
        toast("Google Agenda conectado. Sincronizando…");
        sync({ silent: false });
      } catch (err) {
        $("g-status").innerHTML = `<span class="badge alert">Falhou</span> ${A.util.esc(err.message || String(err))}`;
      }
    });
    $("g-disconnect").addEventListener("click", () => {
      A.store.saveSettings({ google: {} });
      events = [];
      A.util.closeModal("modal-google");
      toast("Google Agenda desconectado. Os eventos já criados continuam na agenda “Painel Altamar”.", "warn", 6000);
    });
    // Ao abrir o painel, sincroniza em segundo plano.
    if (isConnected()) setTimeout(() => sync(), 1500);
  }

  A.google = { init, sync, schedule, isConnected, calendarEvents, openSettings, statusHtml, buildEvents };
})();
