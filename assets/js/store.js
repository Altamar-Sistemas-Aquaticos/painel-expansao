/* Estado da aplicação: persistência, regras de negócio, histórico e cálculos. */
(function () {
  const A = window.Altamar;
  const { clone, uid } = A.util;
  const { AREAS, ONDAS, STATUS, SEMAFOROS, COLUNAS, FIBONACCI } = A.meta;

  const DATA_KEY = "altamar_painel_v2";
  const SETTINGS_KEY = "altamar_painel_settings_v2";
  const LEGACY_INI = "altamar_expansao_iniciativas_v1";
  const LEGACY_DEC = "altamar_expansao_decisoes_v1";
  const SCHEMA_VERSION = 2;
  const HISTORY_LIMIT = 2000;

  const AREA_KEYS = AREAS.map((a) => a.key);
  const ONDA_KEYS = ONDAS.map((o) => o.key);
  const SEMAFORO_KEYS = SEMAFOROS.map((s) => s.key);
  const COLUNA_KEYS = COLUNAS.map((c) => c.key);
  const STATUS_BY_COLUNA = Object.fromEntries(COLUNAS.map((c) => [c.key, c.status]));

  const INITIATIVE_FIELDS = {
    id: "ID", nome: "Nome", area: "Área", valor: "Valor", esforco: "Esforço", onda: "Onda",
    status: "Status", semaforo: "Semáforo", responsavel: "Responsável", prazo: "Prazo",
    observacoes: "Observações", enabler: "Habilitadora", coluna: "Coluna do Kanban",
  };
  const ACTIVITY_FIELDS = {
    nome: "Atividade", pct: "% concluído", status: "Status", responsavel: "Responsável", prazo: "Prazo", observacoes: "Observações",
  };
  const DECISION_FIELDS = {
    data: "Data", quem: "Quem decide", grupo: "Iniciativa", pauta: "Pauta", status: "Status", resultado: "Decisão / encaminhamento",
  };

  const store = {
    data: { version: SCHEMA_VERSION, initiatives: [], decisions: [], history: [] },
    settings: { user: "", theme: "auto", lastBackupAt: null, lastSavedAt: null },
    ui: { area: "ALL", status: "ALL", onda: "ALL", search: "", rankingSort: "ve", decisionFilter: "ALL", historyQuery: "", historyEntity: "ALL" },
    saveError: false,
  };
  const listeners = new Set();

  /* ---------- Cálculos ---------- */
  const ve = (it) => (it.esforco > 0 ? it.valor / it.esforco : 0);
  // Linha de corte = Σ Valor ÷ Σ Esforço (mesma fórmula da planilha 1_Grupos!C3).
  function cutoff(list = store.data.initiatives) {
    let sv = 0, se = 0;
    list.forEach((it) => { if (it.valor > 0 && it.esforco > 0) { sv += it.valor; se += it.esforco; } });
    return { value: se ? sv / se : 0, sumValor: sv, sumEsforco: se };
  }
  const isAboveCut = (it, cut = cutoff().value) => ve(it) >= cut - 1e-9;
  // % do projeto = média das % das atividades não canceladas (nunca digitado). null = sem atividades.
  function progress(it) {
    const acts = (it.atividades || []).filter((a) => a.status !== "Cancelado");
    if (!acts.length) return null;
    return Math.round(acts.reduce((s, a) => s + a.pct, 0) / acts.length);
  }
  const wipCount = () => store.data.initiatives.filter((i) => i.status === "Em andamento").length;

  function snapFib(v) {
    const n = Number(String(v ?? "").replace(",", "."));
    if (!isFinite(n) || n <= 0) return 1;
    return FIBONACCI.reduce((best, f) => (Math.abs(f - n) < Math.abs(best - n) ? f : best), FIBONACCI[0]);
  }

  /* ---------- Normalização ---------- */
  function columnFromStatus(it) {
    if (it.status === "Concluído") return "done";
    if (it.status === "Em andamento") return it.semaforo === "vermelho" ? "waiting" : "doing";
    if (it.status === "A fazer" && (it.onda === "Onda 1" || it.onda === "Onda 2")) return "todo";
    return "backlog";
  }

  // Mantém coluna do Kanban coerente com o status.
  function syncColumn(it) {
    switch (it.status) {
      case "Concluído": it.coluna = "done"; break;
      case "Em andamento": if (it.coluna !== "doing" && it.coluna !== "waiting") it.coluna = "doing"; break;
      case "A fazer": if (it.coluna !== "todo" && it.coluna !== "backlog") it.coluna = "todo"; break;
      case "Cancelado": it.coluna = "backlog"; break;
    }
    return it;
  }

  function clampPct(v) {
    const n = Math.round(Number(v));
    return isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  }

  function normalizeActivity(raw) {
    const status = STATUS.includes(raw.status) ? raw.status : "A fazer";
    return {
      id: raw.id || uid("atv"),
      nome: String(raw.nome ?? "").trim(),
      pct: clampPct(raw.pct ?? (status === "Concluído" ? 100 : 0)),
      status,
      responsavel: String(raw.responsavel ?? "").trim(),
      prazo: String(raw.prazo ?? "").trim(),
      observacoes: String(raw.observacoes ?? "").trim(),
    };
  }

  // Atividades iniciais da planilha (activities-seed.js), usadas quando a iniciativa ainda não tem o campo.
  function seedActivities(id) {
    return (A.seedActivities || [])
      .filter(([g]) => g === id)
      .map(([, nome, obs], i) => normalizeActivity({ id: `atv_${id}_${i + 1}`, nome, observacoes: obs }));
  }

  function normalizeInitiative(raw) {
    const it = {
      id: String(raw.id ?? "").trim().toUpperCase(),
      nome: String(raw.nome ?? "").trim(),
      area: AREA_KEYS.includes(raw.area) ? raw.area : "Projetos",
      valor: snapFib(raw.valor),
      esforco: snapFib(raw.esforco),
      onda: ONDA_KEYS.includes(raw.onda) ? raw.onda : "Fila",
      status: STATUS.includes(raw.status) ? raw.status : "A fazer",
      semaforo: SEMAFORO_KEYS.includes(raw.semaforo) ? raw.semaforo : "verde",
      responsavel: String(raw.responsavel ?? "").trim(),
      prazo: String(raw.prazo ?? "").trim(),
      observacoes: String(raw.observacoes ?? "").trim(),
      enabler: !!raw.enabler,
      coluna: COLUNA_KEYS.includes(raw.coluna) ? raw.coluna : null,
      atividades: Array.isArray(raw.atividades)
        ? raw.atividades.map(normalizeActivity).filter((a) => a.nome)
        : seedActivities(String(raw.id ?? "").trim().toUpperCase()),
      criadoEm: raw.criadoEm || new Date().toISOString(),
      atualizadoEm: raw.atualizadoEm || raw.criadoEm || new Date().toISOString(),
    };
    if (!it.coluna) it.coluna = columnFromStatus(it);
    return syncColumn(it);
  }

  function normalizeDecision(raw) {
    return {
      id: raw.id || uid("dec"),
      data: String(raw.data ?? "").trim(),
      quem: String(raw.quem ?? "").trim(),
      grupo: String(raw.grupo ?? "").trim().toUpperCase(),
      pauta: String(raw.pauta ?? "").trim(),
      status: raw.status === "Decidido" ? "Decidido" : "Pendente",
      resultado: String(raw.resultado ?? "").trim(),
    };
  }

  function normalizeData(raw) {
    return {
      version: SCHEMA_VERSION,
      initiatives: (raw.initiatives || []).map(normalizeInitiative).filter((i) => i.id && i.nome),
      decisions: (raw.decisions || []).map(normalizeDecision).filter((d) => d.pauta),
      history: Array.isArray(raw.history) ? raw.history.slice(0, HISTORY_LIMIT) : [],
    };
  }

  /* ---------- Persistência ---------- */
  function readJSON(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }

  function load() {
    const settings = readJSON(SETTINGS_KEY);
    if (settings) Object.assign(store.settings, settings);

    const saved = readJSON(DATA_KEY);
    if (saved && Array.isArray(saved.initiatives)) {
      store.data = normalizeData(saved);
      return "saved";
    }
    // Migra dados da versão anterior (arquivo HTML único), se existirem neste navegador.
    const legacyIni = readJSON(LEGACY_INI);
    const legacyDec = readJSON(LEGACY_DEC);
    if (Array.isArray(legacyIni)) {
      store.data = normalizeData({ initiatives: legacyIni, decisions: legacyDec || A.defaults.decisions });
      store.data.history.unshift(entry("sistema", null, "migrou", "Dados migrados do painel anterior (versão HTML única)", [], "Sistema"));
      persist();
      return "migrated";
    }
    store.data = normalizeData(clone(A.defaults));
    persist();
    return "default";
  }

  function persist() {
    store.settings.lastSavedAt = new Date().toISOString();
    const ok = writeJSON(DATA_KEY, store.data) && writeJSON(SETTINGS_KEY, store.settings);
    store.saveError = !ok;
    return ok;
  }

  function saveSettings(patch) {
    Object.assign(store.settings, patch);
    writeJSON(SETTINGS_KEY, store.settings);
    emit();
  }

  /* ---------- Eventos ---------- */
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => fn(store));

  /* ---------- Histórico ---------- */
  function entry(entity, refId, action, label, changes = [], source = "Painel") {
    return { id: uid("h"), ts: new Date().toISOString(), user: store.settings.user || "Anônimo", entity, refId, action, label, changes, source };
  }

  function diff(before, after, fields) {
    const changes = [];
    Object.keys(fields).forEach((f) => {
      const a = before ? before[f] : undefined;
      const b = after[f];
      if (String(a ?? "") !== String(b ?? "")) changes.push({ field: f, label: fields[f], from: a ?? "", to: b ?? "" });
    });
    return changes;
  }

  function commit(entries) {
    if (entries.length) {
      store.data.history.unshift(...entries);
      if (store.data.history.length > HISTORY_LIMIT) store.data.history.length = HISTORY_LIMIT;
    }
    const ok = persist();
    emit();
    if (!ok) A.util.toast("Não foi possível salvar no navegador. Exporte um backup agora.", "error", 6000);
  }

  /* ---------- Iniciativas ---------- */
  const findInitiative = (id) => store.data.initiatives.find((i) => i.id === id);

  function nextId(area) {
    const code = A.area(area).code;
    const nums = store.data.initiatives
      .filter((i) => i.id.startsWith(code))
      .map((i) => parseInt(i.id.slice(code.length), 10))
      .filter((n) => isFinite(n));
    return code + ((nums.length ? Math.max(...nums) : 0) + 1);
  }

  function validateInitiative(input, originalId) {
    const id = String(input.id || "").trim().toUpperCase();
    if (!id) return "Informe um ID (ex.: P11).";
    if (!/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(id)) return "ID deve ter só letras, números, - ou _ (até 12 caracteres).";
    if (id !== originalId && findInitiative(id)) return `Já existe uma iniciativa com o ID ${id}.`;
    if (!String(input.nome || "").trim()) return "Informe o nome da iniciativa.";
    return null;
  }

  /**
   * Cria (originalId = null) ou atualiza uma iniciativa.
   * Retorna { ok, error?, item? }.
   */
  function saveInitiative(input, originalId = null, { source = "Painel", silent = false } = {}) {
    const current = originalId ? findInitiative(originalId) : null;
    if (originalId && !current) return { ok: false, error: "Iniciativa não encontrada." };
    // Valida o registro final (atual + alterações), pois `input` pode ser um patch parcial.
    const error = validateInitiative(current ? { ...current, ...input } : input, originalId);
    if (error) return { ok: false, error };

    if (!originalId) {
      const item = normalizeInitiative({ atividades: [], ...input, criadoEm: new Date().toISOString() });
      store.data.initiatives.push(item);
      const e = entry("iniciativa", item.id, "criou", `${item.id} · ${item.nome}`, [], source);
      if (!silent) commit([e]);
      return { ok: true, item, entry: e };
    }

    const idx = store.data.initiatives.findIndex((i) => i.id === originalId);
    if (idx < 0) return { ok: false, error: "Iniciativa não encontrada." };
    const before = store.data.initiatives[idx];
    const merged = { ...before, ...input };
    // Se o status mudou e a coluna não foi informada explicitamente, a coluna acompanha o status.
    if (input.status && input.status !== before.status && !("coluna" in input)) merged.coluna = null;
    if (merged.status === "Concluído" && before.status !== "Concluído" && !("semaforo" in input)) merged.semaforo = "verde";
    const after = normalizeInitiative(merged);
    const changes = diff(before, after, INITIATIVE_FIELDS);
    if (!changes.length) return { ok: true, item: before, unchanged: true };

    after.atualizadoEm = new Date().toISOString();
    store.data.initiatives[idx] = after;
    if (after.id !== originalId) {
      store.data.decisions.forEach((d) => { if (d.grupo === originalId) d.grupo = after.id; });
    }
    const e = entry("iniciativa", after.id, "editou", `${after.id} · ${after.nome}`, changes, source);
    if (!silent) commit([e]);
    return { ok: true, item: after, entry: e };
  }

  function deleteInitiative(id) {
    const it = findInitiative(id);
    if (!it) return;
    store.data.initiatives = store.data.initiatives.filter((i) => i.id !== id);
    store.data.decisions.forEach((d) => { if (d.grupo === id) d.grupo = ""; });
    commit([entry("iniciativa", id, "excluiu", `${it.id} · ${it.nome}`, [
      { field: "snapshot", label: "Dados", from: `${it.area} · V${it.valor}/E${it.esforco} · ${it.onda} · ${it.status}`, to: "" },
    ])]);
  }

  function moveToColumn(id, coluna) {
    const it = findInitiative(id);
    if (!it || it.coluna === coluna) return { ok: true, unchanged: true };
    const patch = { coluna, status: STATUS_BY_COLUNA[coluna] };
    if (coluna === "done") patch.semaforo = "verde";
    return saveInitiative(patch, id, { source: "Kanban" });
  }

  const setOnda = (id, onda) => saveInitiative({ onda }, id, { source: "Ondas" });
  const setStatus = (id, status) => saveInitiative({ status }, id);

  /* ---------- Atividades ---------- */
  /**
   * Cria (actId = null) ou atualiza uma atividade da iniciativa `iniId`.
   * Atividades nunca são apagadas: para tirar do cálculo, use o status "Cancelado".
   */
  function saveActivity(iniId, actId, input, { source = "Projeto", silent = false } = {}) {
    const it = findInitiative(iniId);
    if (!it) return { ok: false, error: "Iniciativa não encontrada." };
    const idx = actId ? it.atividades.findIndex((a) => a.id === actId) : -1;
    if (actId && idx < 0) return { ok: false, error: "Atividade não encontrada." };
    const before = idx >= 0 ? it.atividades[idx] : null;
    const patch = { ...input };
    // Marcar como concluída sem informar o % leva a atividade a 100%.
    if (patch.status === "Concluído" && !("pct" in patch)) patch.pct = 100;
    const after = normalizeActivity({ ...(before || {}), ...patch });
    if (!after.nome) return { ok: false, error: "Informe o nome da atividade." };

    const label = `${it.id} · ${after.nome}`;
    let e;
    if (!before) {
      it.atividades.push(after);
      e = entry("atividade", it.id, "criou", label, [], source);
    } else {
      const changes = diff(before, after, ACTIVITY_FIELDS);
      if (!changes.length) return { ok: true, item: before, unchanged: true };
      it.atividades[idx] = after;
      e = entry("atividade", it.id, "editou", label, changes, source);
    }
    it.atualizadoEm = new Date().toISOString();
    if (!silent) commit([e]);
    return { ok: true, item: after, entry: e };
  }

  const findActivity = (iniId, actId) => findInitiative(iniId)?.atividades.find((a) => a.id === actId) || null;

  /* ---------- Decisões ---------- */
  const findDecision = (id) => store.data.decisions.find((d) => d.id === id);

  function saveDecision(input, { source = "Painel", silent = false } = {}) {
    const existing = input.id ? findDecision(input.id) : null;
    if (!String({ ...(existing || {}), ...input }.pauta || "").trim()) return { ok: false, error: "Descreva a pauta / decisão necessária." };
    const after = normalizeDecision({ ...(existing || {}), ...input });
    if (!existing) {
      store.data.decisions.push(after);
      const e = entry("decisao", after.id, "criou", after.pauta, [], source);
      if (!silent) commit([e]);
      return { ok: true, item: after, entry: e };
    }
    const changes = diff(existing, after, DECISION_FIELDS);
    if (!changes.length) return { ok: true, item: existing, unchanged: true };
    Object.assign(existing, after);
    const e = entry("decisao", after.id, after.status === "Decidido" && changes.some((c) => c.field === "status") ? "decidiu" : "editou", after.pauta, changes, source);
    if (!silent) commit([e]);
    return { ok: true, item: existing, entry: e };
  }

  function deleteDecision(id) {
    const d = findDecision(id);
    if (!d) return;
    store.data.decisions = store.data.decisions.filter((x) => x.id !== id);
    commit([entry("decisao", id, "excluiu", d.pauta)]);
  }

  /* ---------- Operações em lote ---------- */
  function replaceAll(raw, label) {
    const keepHistory = store.data.history;
    const next = normalizeData(raw);
    // Mantém o histórico local e acrescenta o do backup sem duplicar.
    const seen = new Set(keepHistory.map((h) => h.id));
    next.history = [...keepHistory, ...next.history.filter((h) => !seen.has(h.id))]
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .slice(0, HISTORY_LIMIT);
    store.data = next;
    commit([entry("sistema", null, "importou", label, [], "Sistema")]);
  }

  // Aplica o plano gerado pela importação do Excel (ver excel.js).
  function applyImportPlan(plan) {
    const entries = [];
    plan.initiatives.forEach((p) => {
      const r = p.isNew
        ? saveInitiative(p.data, null, { source: "Excel", silent: true })
        : saveInitiative(p.patch, p.id, { source: "Excel", silent: true });
      if (r.entry) entries.push(r.entry);
    });
    plan.decisions.forEach((p) => {
      const r = saveDecision(p.data, { source: "Excel", silent: true });
      if (r.entry) entries.push(r.entry);
    });
    (plan.activities || []).forEach((p) => {
      const r = saveActivity(p.iniId, p.actId || null, p.data, { source: "Excel", silent: true });
      if (r.entry) entries.push(r.entry);
    });
    const changed = entries.length;
    entries.push(entry("sistema", null, "importou", `Planilha "${plan.fileName}" importada (${changed} alterações)`, [], "Excel"));
    commit(entries.reverse()); // histórico é armazenado do mais recente para o mais antigo
    return changed;
  }

  function resetToDefaults() {
    store.data = { ...normalizeData(clone(A.defaults)), history: store.data.history };
    commit([entry("sistema", null, "restaurou", "Dados restaurados para o padrão inicial", [], "Sistema")]);
  }

  function clearHistory() {
    store.data.history = [];
    commit([entry("sistema", null, "limpou", "Histórico de alterações apagado", [], "Sistema")]);
  }

  function markBackup() {
    saveSettings({ lastBackupAt: new Date().toISOString() });
  }

  // Há alterações desde o último backup e ele tem mais de 7 dias (ou nunca foi feito)?
  function backupOverdue() {
    const last = store.settings.lastBackupAt;
    const lastChange = store.data.history.find((h) => h.entity !== "sistema");
    if (!lastChange) return false;
    if (!last) return true;
    const week = 7 * 24 * 3600 * 1000;
    return lastChange.ts > last && Date.now() - new Date(last).getTime() > week;
  }

  /* ---------- Filtros ---------- */
  function matchesFilters(it, ui = store.ui) {
    if (ui.area !== "ALL" && it.area !== ui.area) return false;
    if (ui.status !== "ALL" && it.status !== ui.status) return false;
    if (ui.onda !== "ALL" && it.onda !== ui.onda) return false;
    if (ui.search) {
      const q = A.util.norm(ui.search);
      const hay = A.util.norm(`${it.id} ${it.nome} ${it.responsavel} ${it.observacoes}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  }
  const filtered = () => store.data.initiatives.filter((it) => matchesFilters(it));
  const hasActiveFilters = () => store.ui.area !== "ALL" || store.ui.status !== "ALL" || store.ui.onda !== "ALL" || !!store.ui.search;

  A.store = {
    state: store, load, persist, subscribe, emit, saveSettings,
    calc: { ve, cutoff, isAboveCut, wipCount, snapFib, progress },
    findInitiative, nextId, saveInitiative, deleteInitiative, moveToColumn, setOnda, setStatus,
    saveActivity, findActivity,
    findDecision, saveDecision, deleteDecision,
    replaceAll, applyImportPlan, resetToDefaults, clearHistory, markBackup, backupOverdue,
    matchesFilters, filtered, hasActiveFilters,
    FIELDS: { INITIATIVE_FIELDS, DECISION_FIELDS, ACTIVITY_FIELDS },
  };
})();
