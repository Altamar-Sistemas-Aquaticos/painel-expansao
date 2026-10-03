/* Inicialização: navegação, filtros, ações delegadas, menu de dados e tema. */
(function () {
  const A = window.Altamar;
  const S = A.store;
  const { toast, closeModal, closeTopModal, confirmDialog, downloadBlob, esc, initials } = A.util;
  const $ = (id) => document.getElementById(id);

  const TABS = ["executivo", "guia", "triagem", "priorizacao", "ondas", "kanban", "overview", "decisoes", "historico", "cadastros"];
  // Endereços antigos (favoritos e links salvos) continuam funcionando.
  const ALIASES = { portfolio: "triagem", matriz: "priorizacao", ranking: "priorizacao", cronograma: "overview" };
  const TAB_KEY = "altamar_painel_tab";
  // Rota atual. Telas de detalhamento: "setor/<área>" e "projeto/<id>" (pertencem à aba Kanban).
  let route = { view: "executivo", param: null };

  /* ---------- Renderização ---------- */
  function renderAll() {
    A.views.executive(S);
    A.views.guia(S);
    A.views.triagem(S);
    A.views.priorizacao(S);
    A.views.overview(S);
    A.views.cadastros(S);
    A.views.kanban(S);
    A.views.waves(S);
    A.views.decisions(S);
    A.views.history(S);
    if (route.view === "setor") A.views.sector(S, route.param);
    if (route.view === "projeto") A.views.project(S, route.param);
    renderChrome();
  }

  function renderChrome() {
    const { settings } = S.state;
    $("user-chip-name").textContent = settings.user || "Identificar-se";
    $("user-chip-avatar").textContent = settings.user ? initials(settings.user) : "?";
    $("save-status").textContent = S.state.saveError
      ? "⚠️ Falha ao salvar no navegador"
      : settings.lastSavedAt ? `Salvo automaticamente às ${A.util.fmtTime(settings.lastSavedAt)}` : "";
    const overdue = S.backupOverdue();
    $("backup-dot").classList.toggle("hidden", !overdue);
    $("backup-note").textContent = settings.lastBackupAt
      ? `Último backup: ${A.util.fmtDateTime(settings.lastBackupAt)}`
      : "Nenhum backup feito ainda neste navegador.";
    document.documentElement.dataset.theme = resolveTheme(settings.theme);
    $("btn-theme").textContent = { auto: "🌓 Tema: automático", light: "☀️ Tema: claro", dark: "🌙 Tema: escuro" }[settings.theme] || "🌓 Tema";

    // Sincroniza controles de filtro com o estado (as áreas vêm dos Cadastros e podem mudar).
    if (S.state.ui.area !== "ALL" && !S.findArea(S.state.ui.area)) S.state.ui.area = "ALL";
    $("filter-areas").innerHTML =
      `<button class="btn btn-xs btn-outline" data-filter-area="ALL">Todas</button>` +
      S.areas().map((a) => `<button class="btn btn-xs btn-outline" data-filter-area="${esc(a.key)}">${esc(a.key)}</button>`).join("");
    document.querySelectorAll("[data-filter-area]").forEach((b) => b.classList.toggle("active", b.dataset.filterArea === S.state.ui.area));
    $("filter-status").value = S.state.ui.status;
    $("filter-onda").value = S.state.ui.onda;
    if (document.activeElement !== $("filter-search")) $("filter-search").value = S.state.ui.search;
    $("filter-clear").classList.toggle("hidden", !S.hasActiveFilters());
  }

  /* ---------- Tema ---------- */
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const resolveTheme = (pref) => (pref === "auto" ? (media.matches ? "dark" : "light") : pref);
  media.addEventListener?.("change", () => S.state.settings.theme === "auto" && renderChrome());

  /* ---------- Abas ---------- */
  function parseRoute(hash) {
    let [view, ...rest] = String(hash || "").split("/");
    view = ALIASES[view] || view;
    const param = rest.length ? decodeURIComponent(rest.join("/")) : null;
    if (view === "setor" && S.findArea(param)) return { view, param };
    if (view === "projeto" && param) return { view, param };
    return { view: TABS.includes(view) ? view : "executivo", param: null };
  }

  function switchTab(name, push = true) {
    const prev = route;
    route = parseRoute(name);
    const full = route.param ? `${route.view}/${encodeURIComponent(route.param)}` : route.view;
    const tab = route.view === "setor" || route.view === "projeto" ? "kanban" : route.view;
    document.querySelectorAll(".tab-btn").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
    });
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${route.view}`));
    // Os filtros de área/status/onda não se aplicam a estas telas.
    document.querySelector(".filter-bar").classList.toggle("hidden", ["executivo", "guia", "decisoes", "historico", "cadastros"].includes(route.view));
    if (route.view === "setor") A.views.sector(S, route.param);
    if (route.view === "projeto") A.views.project(S, route.param);
    if (route.view !== prev.view || route.param !== prev.param) window.scrollTo(0, 0);
    try { sessionStorage.setItem(TAB_KEY, full); } catch {}
    if (push && location.hash !== `#${full}`) history.replaceState(null, "", `#${full}`);
  }

  /* ---------- Ações delegadas ---------- */
  const actions = {
    "edit-initiative": (id) => A.forms.openInitiativeForm(id),
    "new-initiative": (area) => A.ficha.open(area),
    "advance-situacao": (id) => {
      const r = S.advanceSituacao(id);
      if (!r.ok) return toast(r.error, "error");
      if (!r.unchanged) toast(`${id}: ${r.item.situacao}.`);
    },
    "open-project": (id) => { location.hash = A.drill.projectHref(id); },
    "delete-initiative": (id) => A.forms.deleteInitiative(id),
    "edit-decision": (id) => {
      closeModal("modal-initiative");
      A.forms.openDecisionForm(id);
    },
    "new-decision": () => A.forms.openDecisionForm(null),
    "new-decision-for": (id) => A.forms.openDecisionForm(null, id),
    "open-sector": (id) => {
      const it = S.findInitiative(id);
      if (it) location.hash = A.drill.sectorHref(it.area);
    },
    "finish-project": (id) => A.board.moveCard(id, "done"),
    "delete-decision": (id) => A.forms.deleteDecision(id),
    "go-tab": (tab) => { closeMenu(); switchTab(tab); },
    "close-modal": (id) => {
      const m = $(id);
      closeModal(id);
      m?.dispatchEvent(new Event("modal:dismiss"));
    },
    "meeting-summary": () => A.forms.openMeetingSummary(),
    "print": () => window.print(),
    "change-user": () => A.forms.openUserForm(false),
  };

  function onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    // Cliques em campos dentro de um card clicável não devem abrir o card.
    const control = e.target.closest("select, input, textarea, label");
    if (control && control !== el && el.contains(control)) return;
    const fn = actions[el.dataset.action];
    if (fn) {
      e.preventDefault();
      fn(el.dataset.id ?? el.dataset.tab ?? el.dataset.target, el);
    }
  }

  function onChange(e) {
    const el = e.target.closest("[data-change]");
    if (!el) return;
    const id = el.dataset.id;
    if (el.dataset.change === "status") {
      const r = S.setStatus(id, el.value);
      if (r.ok && !r.unchanged) toast(`${id}: status alterado para “${el.value}”.`);
    } else if (el.dataset.change === "move-col") {
      A.board.moveCard(id, el.value);
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      const top = [...document.querySelectorAll(".modal-backdrop.open")].pop();
      if (top) {
        if (top.dataset.required) return;
        closeTopModal();
        top.dispatchEvent(new Event("modal:dismiss"));
        return;
      }
      closeMenu();
    }
    // Enter/Espaço em elementos com role=button que não são <button>.
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[role="button"][data-action]')) {
      e.preventDefault();
      e.target.click();
    }
    // Atalho: N = nova iniciativa (fora de campos de texto).
    if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest("input, textarea, select") && !document.querySelector(".modal-backdrop.open")) {
      e.preventDefault();
      A.ficha.open();
    }
  }

  /* ---------- Filtros ---------- */
  function setFilter(patch) {
    Object.assign(S.state.ui, patch);
    S.emit();
  }

  function initFilters() {
    const { STATUS, ONDAS } = A.meta;
    $("filter-status").innerHTML = `<option value="ALL">Todos os status</option>` + STATUS.map((s) => `<option>${esc(s)}</option>`).join("");
    $("filter-onda").innerHTML = `<option value="ALL">Todas as ondas</option>` + ONDAS.map((o) => `<option value="${esc(o.key)}">${esc(o.key === "Fila" ? "Fila posterior" : o.key)}</option>`).join("");

    $("filter-areas").addEventListener("click", (e) => {
      const b = e.target.closest("[data-filter-area]");
      if (b) setFilter({ area: b.dataset.filterArea });
    });
    $("filter-status").addEventListener("change", (e) => setFilter({ status: e.target.value }));
    $("filter-onda").addEventListener("change", (e) => setFilter({ onda: e.target.value }));
    let t;
    $("filter-search").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => setFilter({ search: e.target.value.trim() }), 150);
    });
    $("filter-clear").addEventListener("click", () => setFilter({ area: "ALL", status: "ALL", onda: "ALL", search: "" }));

    document.querySelectorAll("[data-dec-filter]").forEach((b) =>
      b.addEventListener("click", () => setFilter({ decisionFilter: b.dataset.decFilter })));
    $("history-search").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => setFilter({ historyQuery: e.target.value }), 150);
    });
    $("history-entity").addEventListener("change", (e) => setFilter({ historyEntity: e.target.value }));
  }

  /* ---------- Menu de dados ---------- */
  function closeMenu() {
    $("data-menu").classList.add("hidden");
    $("btn-data").setAttribute("aria-expanded", "false");
  }

  function exportJSON() {
    const payload = { app: "painel-expansao-altamar", ...S.state.data, exportedAt: new Date().toISOString() };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `painel_expansao_backup_${new Date().toISOString().slice(0, 10)}.json`);
    S.markBackup();
    toast("Backup JSON exportado.");
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data.initiatives)) throw new Error("formato");
        const ok = await confirmDialog(
          `Substituir os dados atuais pelo backup “${file.name}” (${data.initiatives.length} iniciativas, ${(data.decisions || []).length} decisões)? O histórico é mantido e mesclado.`,
          { title: "Restaurar backup", okLabel: "Substituir dados", danger: true });
        if (!ok) return;
        S.replaceAll(data, `Backup “${file.name}” restaurado`);
        toast("Backup restaurado.");
      } catch {
        toast("Arquivo inválido. Use um backup JSON exportado por este painel.", "error", 5000);
      }
    };
    reader.readAsText(file);
  }

  async function importExcel(file) {
    toast("Lendo planilha…", "ok", 1500);
    try {
      const plan = await A.excel.buildImportPlan(file);
      A.forms.openImportPreview(plan);
    } catch (err) {
      toast(err.message || "Não foi possível ler a planilha.", "error", 7000);
    }
  }

  function initDataMenu() {
    $("btn-data").addEventListener("click", (e) => {
      e.stopPropagation();
      const hidden = $("data-menu").classList.toggle("hidden");
      $("btn-data").setAttribute("aria-expanded", String(!hidden));
    });
    document.addEventListener("click", (e) => { if (!e.target.closest("#data-menu")) closeMenu(); });

    const pick = (input, handler) => {
      input.addEventListener("change", (e) => {
        const f = e.target.files[0];
        e.target.value = "";
        if (f) handler(f);
      });
    };
    $("menu-import-excel").addEventListener("click", () => { closeMenu(); $("file-excel").click(); });
    $("menu-export-excel").addEventListener("click", async () => {
      closeMenu();
      try { await A.excel.exportWorkbook(); } catch (err) { toast(err.message, "error", 6000); }
    });
    $("menu-export-json").addEventListener("click", () => { closeMenu(); exportJSON(); });
    $("menu-import-json").addEventListener("click", () => { closeMenu(); $("file-json").click(); });
    pick($("file-excel"), importExcel);
    pick($("file-json"), importJSON);

    $("menu-clear-history").addEventListener("click", async () => {
      closeMenu();
      if (await confirmDialog("Apagar todo o histórico de alterações deste navegador? Recomendo exportar para Excel antes.", { title: "Limpar histórico", okLabel: "Apagar histórico", danger: true })) {
        S.clearHistory();
        toast("Histórico apagado.", "warn");
      }
    });
    $("menu-reset").addEventListener("click", async () => {
      closeMenu();
      if (await confirmDialog("Restaurar as 29 iniciativas e decisões originais? Todas as alterações feitas no painel serão perdidas (o histórico é mantido). Exporte um backup antes se tiver dúvida.", { title: "Restaurar padrão", okLabel: "Restaurar padrão", danger: true })) {
        S.resetToDefaults();
        toast("Dados restaurados para o padrão.", "warn");
      }
    });

    $("btn-theme").addEventListener("click", () => {
      const order = ["auto", "light", "dark"];
      const next = order[(order.indexOf(S.state.settings.theme) + 1) % order.length];
      S.saveSettings({ theme: next });
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    const origin = S.load();
    A.forms.init();
    A.board.initDragAndDrop();
    A.drill.initActivityEvents();
    A.ficha.init();
    A.cadastros.init();
    A.triagem.init();
    A.compromissos.init();
    A.google.init();
    $("menu-google").addEventListener("click", () => { closeMenu(); A.google.openSettings(); });
    initFilters();
    initDataMenu();

    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKeydown);
    document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    $("btn-presentation").addEventListener("click", () => {
      const on = document.body.classList.toggle("presentation");
      $("btn-presentation").textContent = on ? "📺 Sair da projeção" : "📺 Modo reunião";
    });
    window.addEventListener("hashchange", () => switchTab(location.hash.slice(1), false));

    // Fecha modais ao clicar no fundo escurecido.
    document.querySelectorAll(".modal-backdrop").forEach((m) =>
      m.addEventListener("mousedown", (e) => {
        if (e.target === m && !m.dataset.required) {
          closeModal(m.id);
          m.dispatchEvent(new Event("modal:dismiss"));
        }
      }));

    // Mudanças feitas em outra aba do mesmo navegador.
    window.addEventListener("storage", (e) => {
      if (e.key && e.key.startsWith("altamar_painel_")) {
        S.load();
        renderAll();
        if (e.key === "altamar_painel_v2") toast("Dados atualizados a partir de outra aba.", "ok", 2500);
      }
    });

    S.subscribe(renderAll);
    let initialTab = location.hash.slice(1);
    if (!initialTab) { try { initialTab = sessionStorage.getItem(TAB_KEY); } catch {} }
    switchTab(initialTab || "executivo");
    renderAll();
    // O navegador rola até o elemento cujo id coincide com o #endereço (ex.: #kanban); a aba sempre abre no topo.
    window.addEventListener("load", () => window.scrollTo(0, 0));

    if (origin === "migrated") toast("Seus dados do painel anterior foram migrados automaticamente.", "ok", 6000);
    if (!S.state.settings.user) A.forms.openUserForm(true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
