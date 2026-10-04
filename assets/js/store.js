/* Estado da aplicação: persistência, regras de negócio, histórico e cálculos. */
(function () {
  const A = window.Altamar;
  const { clone, uid, norm } = A.util;
  const { ONDAS, STATUS, SEMAFOROS, COLUNAS, FIBONACCI, ESFORCO_PONTOS } = A.meta;

  const DATA_KEY = "altamar_painel_v2";
  const SETTINGS_KEY = "altamar_painel_settings_v2";
  const LEGACY_INI = "altamar_expansao_iniciativas_v1";
  const LEGACY_DEC = "altamar_expansao_decisoes_v1";
  const SCHEMA_VERSION = 6; // 4: esforço em meses, sprints e checklist · 5: "esforço a revisar" · 6: eixos e fases
  const PORTFOLIO_BASE_DATE = "2026-09-01T12:00:00.000Z"; // data-base dos 29 projetos iniciais
  const HISTORY_LIMIT = 2000;

  const ONDA_KEYS = ONDAS.map((o) => o.key);
  const SEMAFORO_KEYS = SEMAFOROS.map((s) => s.key);
  const COLUNA_KEYS = COLUNAS.map((c) => c.key);
  const STATUS_BY_COLUNA = Object.fromEntries(COLUNAS.map((c) => [c.key, c.status]));
  const SITUACOES = ["Rascunho", "Validado"]; // a onda é decidida em Ondas/Priorização, não na situação
  const RACI_ROLES = ["R", "A", "C", "I"];
  const NAO_PESSOA = new Set(["", "adefinir", "definir", "todos", "equipe"]);

  const INITIATIVE_FIELDS = {
    id: "ID", nome: "Nome", area: "Área", valor: "Valor", esforco: "Esforço", onda: "Onda",
    status: "Status", semaforo: "Semáforo", responsavel: "Responsável", prazo: "Prazo",
    observacoes: "Observações", enabler: "Habilitadora", coluna: "Coluna do Kanban",
    objetivo: "Objetivo", prontoQuando: "Pronto quando", indicador: "Indicador de sucesso",
    investimento: "Exige investimento", situacao: "Situação do cadastro", autor: "Autor da ideia", esforcoRevisar: "Esforço a revisar", eixo: "Eixo", faseDe: "Fase do projeto",
  };
  const ACTIVITY_FIELDS = {
    nome: "Atividade", entregavel: "Entregável", pct: "% concluído", status: "Status", raci: "RACI",
    inicio: "Início", prazo: "Prazo", dependeDe: "Depende de", observacoes: "Observações",
    sprint: "Sprint", esperando: "Esperando / travada", checklist: "Checklist",
  };
  const DECISION_FIELDS = {
    data: "Data", quem: "Quem decide", grupo: "Iniciativa", pauta: "Pauta", status: "Status", resultado: "Decisão / encaminhamento",
  };
  const AREA_FIELDS = { key: "Nome", code: "Código", cor: "Cor" };
  const EIXO_FIELDS = { key: "Nome", icone: "Ícone", vagas: "Vagas por onda", descricao: "Descrição" };
  const PESSOA_FIELDS = { nome: "Nome", funcao: "Função", email: "E-mail", area: "Área", ativo: "Ativa" };
  const COMPROMISSO_FIELDS = {
    titulo: "Título", data: "Data", horaInicio: "Início", horaFim: "Fim", projeto: "Projeto",
    participantes: "Participantes", local: "Local / link", notas: "Notas", enviarConvite: "Enviar convite",
  };

  const store = {
    data: { version: SCHEMA_VERSION, config: { areas: [], pessoas: [] }, initiatives: [], decisions: [], history: [] },
    settings: { user: "", theme: "auto", lastBackupAt: null, lastSavedAt: null },
    ui: {
      area: "ALL", status: "ALL", onda: "ALL", search: "", rankingSort: "ve", decisionFilter: "ALL",
      historyQuery: "", historyEntity: "ALL", triagemFiltro: "triar",
    },
    saveError: false,
  };
  const listeners = new Set();

  /* ---------- Áreas e pessoas (cadastros) ---------- */
  const AREA_PALETTE = ["#0b7285", "#2b8a3e", "#6741d9", "#c2410c", "#a61e4d", "#1971c2", "#5c940d", "#e67700", "#862e9c", "#0c8599", "#495057"];
  const areas = () => store.data.config.areas;
  const pessoas = ({ ativas = false } = {}) => store.data.config.pessoas.filter((p) => !ativas || p.ativo);
  const findArea = (key) => areas().find((a) => a.key === key);
  const eixos = () => store.data.config.eixos;
  const findEixo = (key) => eixos().find((e) => e.key === key);
  // Eixo para exibição (projetos sem eixo aparecem como "A definir").
  A.eixo = (key) => findEixo(key) || { key: key || "", icone: "❔", vagas: 0, descricao: "" };
  // Substitui o A.area estático de data.js: as áreas agora vêm dos cadastros.
  A.area = (key) => findArea(key) || { key: key || "—", code: "?", cor: "#64748b" };

  const nextAreaColor = () => AREA_PALETTE.find((c) => !areas().some((a) => a.cor === c)) || AREA_PALETTE[areas().length % AREA_PALETTE.length];
  function suggestAreaCode(name) {
    const letters = norm(name).toUpperCase().replace(/[^A-Z]/g, "") || "X";
    for (let len = 1; len <= 3; len++) {
      const code = letters.slice(0, len);
      if (code.length === len && !areas().some((a) => a.code === code)) return code;
    }
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!areas().some((a) => a.code === letters[0] + ch)) return letters[0] + ch;
    return letters.slice(0, 2) + areas().length;
  }

  // Divide textos como "Pedro e Maíra", "Bia, Matheus" ou "Maíra / Shei" em nomes.
  const splitNames = (s) => String(s ?? "").split(/\s*(?:,|;|\/|\se\s)\s*/).map((x) => x.trim()).filter((x) => x && !NAO_PESSOA.has(norm(x)));

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
  const sprintLimites = () => ({ min: store.data.config.sprintMin, max: store.data.config.sprintMax });
  // Vagas de uma onda = soma das vagas dos eixos.
  const projetosPorOnda = () => eixos().reduce((s, e) => s + e.vagas, 0) || A.meta.PROJETOS_POR_ONDA_PADRAO;

  // 0 = nota ainda "a definir" (ideias recém-cadastradas, antes da triagem).
  const isBlank = (v) => v === 0 || v === "0" || v === "" || v == null;
  const snapTo = (list) => (v) => {
    const n = Number(String(v ?? "").replace(",", "."));
    if (!isFinite(n) || n <= 0) return list[0];
    return list.reduce((best, f) => (Math.abs(f - n) < Math.abs(best - n) ? f : best), list[0]);
  };
  const snapFib = snapTo(FIBONACCI);          // valor: 1, 2, 3, 5, 8
  const snapEsforco = snapTo(ESFORCO_PONTOS); // esforço: 1 a 5 (1 mês a 1 ano)
  const scoreOrZero = (v) => (isBlank(v) ? 0 : snapFib(v));
  const esforcoOrZero = (v) => (isBlank(v) ? 0 : snapEsforco(v));

  // Lê "dd/mm/aaaa" ou "15/Nov/2026"; textos como "Jan/2027" ou "2028" retornam null.
  const MESES = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
  function parseDate(s) {
    const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2}|[A-Za-z]{3})\/(\d{4})$/);
    if (!m) return null;
    const month = /^\d+$/.test(m[2]) ? Number(m[2]) - 1 : MESES[m[2].toLowerCase()];
    if (month == null) return null;
    const d = new Date(Number(m[3]), month, Number(m[1]));
    return isNaN(d) ? null : d;
  }

  /* ---------- RACI ---------- */
  const raciText = (raci) => RACI_ROLES
    .map((r) => [r, Object.keys(raci || {}).filter((n) => raci[n] === r)])
    .filter(([, ns]) => ns.length).map(([r, ns]) => `${r}: ${ns.join(", ")}`).join(" · ");
  const raciPeople = (raci, role) => Object.keys(raci || {}).filter((n) => raci[n] === role);

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

  function normalizeRaci(raw) {
    const out = {};
    Object.entries(raw || {}).forEach(([nome, role]) => {
      const n = String(nome).trim();
      if (n && RACI_ROLES.includes(role)) out[n] = role;
    });
    return out;
  }

  function normalizeChecklist(raw) {
    return (Array.isArray(raw) ? raw : [])
      .map((x) => ({ id: x.id || uid("ck"), texto: String(x.texto ?? "").trim(), feito: !!x.feito }))
      .filter((x) => x.texto);
  }

  function normalizeActivity(raw) {
    const status = STATUS.includes(raw.status) ? raw.status : "A fazer";
    const checklist = normalizeChecklist(raw.checklist);
    // Com checklist, o % da atividade sai dos itens marcados (até ela ser concluída).
    const pctChecklist = checklist.length && status !== "Concluído" && status !== "Cancelado"
      ? Math.round((checklist.filter((x) => x.feito).length / checklist.length) * 100) : null;
    // RACI por atividade; dados antigos (responsável/envolvidos) viram R e C.
    let raci = normalizeRaci(raw.raci);
    if (!raw.raci) {
      splitNames(raw.responsavel).slice(0, 1).forEach((n) => { raci[n] = "R"; });
      splitNames(raw.envolvidos).forEach((n) => { if (!raci[n]) raci[n] = "C"; });
    }
    return {
      id: raw.id || uid("atv"),
      nome: String(raw.nome ?? "").trim(),
      entregavel: String(raw.entregavel ?? "").trim(),
      pct: pctChecklist ?? clampPct(raw.pct ?? (status === "Concluído" ? 100 : 0)),
      status,
      sprint: String(raw.sprint ?? "").trim(),
      esperando: status === "Em andamento" && !!raw.esperando,
      checklist,
      raci,
      // Derivados da RACI (mantidos para exportação e telas resumidas).
      responsavel: raciPeople(raci, "R")[0] || "",
      envolvidos: Object.keys(raci).filter((n) => raci[n] !== "R").join(", "),
      inicio: String(raw.inicio ?? "").trim(),
      prazo: String(raw.prazo ?? "").trim(),
      dependeDe: String(raw.dependeDe ?? "").trim(),
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
    const status = STATUS.includes(raw.status) ? raw.status : "A fazer";
    const it = {
      id: String(raw.id ?? "").trim().toUpperCase(),
      nome: String(raw.nome ?? "").trim(),
      area: String(raw.area ?? "").trim() || (areas()[0] || {}).key || "Projetos",
      valor: scoreOrZero(raw.valor),
      esforco: esforcoOrZero(raw.esforco),
      // Esforço convertido automaticamente da escala antiga: fica marcado até alguém confirmar ou mudar.
      esforcoRevisar: !!raw.esforcoRevisar && !isBlank(raw.esforco),
      autor: String(raw.autor ?? "").trim(),
      eixo: String(raw.eixo ?? "").trim(),
      faseDe: String(raw.faseDe ?? "").trim().toUpperCase(), // projeto principal, quando este é uma fase dele
      onda: ONDA_KEYS.includes(raw.onda) ? raw.onda : "Fila",
      status,
      semaforo: SEMAFORO_KEYS.includes(raw.semaforo) ? raw.semaforo : "verde",
      responsavel: String(raw.responsavel ?? "").trim(),
      prazo: String(raw.prazo ?? "").trim(),
      observacoes: String(raw.observacoes ?? "").trim(),
      enabler: !!raw.enabler,
      objetivo: String(raw.objetivo ?? "").trim(),
      prontoQuando: String(raw.prontoQuando ?? "").trim(),
      indicador: String(raw.indicador ?? "").trim(),
      investimento: raw.investimento === "Sim" ? "Sim" : "Não",
      // "Aprovado para onda" (versão anterior) e projetos sem situação viram "Validado".
      situacao: raw.situacao === "Rascunho" ? "Rascunho" : "Validado",
      coluna: COLUNA_KEYS.includes(raw.coluna) ? raw.coluna : null,
      atividades: Array.isArray(raw.atividades)
        ? raw.atividades.map(normalizeActivity).filter((a) => a.nome)
        : seedActivities(String(raw.id ?? "").trim().toUpperCase()),
      criadoEm: raw.criadoEm || new Date().toISOString(),
      atualizadoEm: raw.atualizadoEm || raw.criadoEm || new Date().toISOString(),
    };
    if (raw.patrocinador) it.patrocinador = String(raw.patrocinador).trim(); // legado (substituído pela RACI)
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

  function normalizeEixo(raw) {
    return {
      key: String(raw.key ?? "").trim(),
      icone: String(raw.icone ?? "").trim().slice(0, 4) || "•",
      vagas: Math.max(0, Math.round(Number(raw.vagas)) || 0),
      descricao: String(raw.descricao ?? "").trim(),
    };
  }

  function normalizeArea(raw) {
    return {
      key: String(raw.key ?? "").trim(),
      code: String(raw.code ?? "").trim().toUpperCase(),
      cor: /^#[0-9a-f]{6}$/i.test(raw.cor) ? raw.cor : "#64748b",
    };
  }
  // Call ou reunião marcada no painel (vai para o Google Agenda com horário).
  function normalizeCompromisso(raw) {
    const hora = (h, def) => (/^\d{2}:\d{2}$/.test(String(h ?? "")) ? h : def);
    const inicio = hora(raw.horaInicio, "09:00");
    let fim = hora(raw.horaFim, "");
    if (!fim || fim <= inicio) {
      const [h, m] = inicio.split(":").map(Number);
      fim = `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return {
      id: raw.id || uid("cmp"),
      titulo: String(raw.titulo ?? "").trim(),
      data: String(raw.data ?? "").trim(), // dd/mm/aaaa
      horaInicio: inicio,
      horaFim: fim,
      projeto: String(raw.projeto ?? "").trim().toUpperCase(),
      participantes: Array.isArray(raw.participantes) ? raw.participantes.map((n) => String(n).trim()).filter(Boolean) : [],
      local: String(raw.local ?? "").trim(),
      notas: String(raw.notas ?? "").trim(),
      enviarConvite: !!raw.enviarConvite,
      criadoEm: raw.criadoEm || new Date().toISOString(),
    };
  }

  function normalizePessoa(raw) {
    return {
      nome: String(raw.nome ?? "").trim(),
      funcao: String(raw.funcao ?? "").trim(),
      email: String(raw.email ?? "").trim().toLowerCase(),
      area: String(raw.area ?? "").trim(),
      ativo: raw.ativo !== false,
    };
  }

  /* ---------- Sprints (4 semanas) ---------- */
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromIso = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  // 1ª sprint: começa na segunda desta semana (de segunda a quarta) ou na próxima segunda.
  function primeiraSegunda(hoje = new Date()) {
    const d = new Date(hoje); d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7; // 0 = segunda
    return addDays(d, dow <= 2 ? -dow : 7 - dow);
  }
  function makeSprint(numero, inicio, objetivo = "") {
    return { id: `S${numero}`, numero, inicio: isoDay(inicio), fim: isoDay(addDays(inicio, A.meta.SPRINT_SEMANAS * 7 - 1)), objetivo, encerrada: false };
  }
  function normalizeSprint(raw) {
    return {
      id: String(raw.id || `S${raw.numero}`), numero: Number(raw.numero) || 1,
      inicio: /^\d{4}-\d{2}-\d{2}$/.test(raw.inicio) ? raw.inicio : isoDay(primeiraSegunda()),
      fim: /^\d{4}-\d{2}-\d{2}$/.test(raw.fim) ? raw.fim : isoDay(addDays(primeiraSegunda(), 27)),
      objetivo: String(raw.objetivo ?? "").trim(), encerrada: !!raw.encerrada,
    };
  }

  function normalizeData(raw) {
    const cfg = raw.config || {};
    const posInt = (v, def) => (Number(v) > 0 ? Math.round(Number(v)) : def);
    // Antes da versão 4 o esforço usava 1, 2, 3, 5 e 8 (1 semana a 3+ meses): converte para meses (1 a 5).
    if (!(raw.version >= 4) && Array.isArray(raw.initiatives)) {
      raw = { ...raw, initiatives: raw.initiatives.map((i) => ({ ...i, esforco: isBlank(i.esforco) ? 0 : (A.meta.ESFORCO_ANTIGO_PARA_NOVO[snapFib(i.esforco)] || 1), esforcoRevisar: !isBlank(i.esforco) })) };
    }
    const data = {
      version: SCHEMA_VERSION,
      config: {
        areas: (cfg.areas || A.defaults.areas).map(normalizeArea).filter((a) => a.key && a.code),
        pessoas: (cfg.pessoas || A.defaults.pessoas).map(normalizePessoa).filter((p) => p.nome),
        sprintMin: posInt(cfg.sprintMin, A.meta.SPRINT_MIN_PADRAO),
        sprintMax: posInt(cfg.sprintMax, A.meta.SPRINT_MAX_PADRAO),
        eixos: (Array.isArray(cfg.eixos) ? cfg.eixos : clone(A.meta.EIXOS_PADRAO)).map(normalizeEixo).filter((e) => e.key),
      },
      sprints: (Array.isArray(raw.sprints) ? raw.sprints : []).map(normalizeSprint),
      initiatives: [],
      decisions: (raw.decisions || []).map(normalizeDecision).filter((d) => d.pauta),
      compromissos: (raw.compromissos || []).map(normalizeCompromisso).filter((c) => c.titulo && c.data),
      history: Array.isArray(raw.history) ? raw.history.slice(0, HISTORY_LIMIT) : [],
      // Foto semanal dos indicadores ({ "2026-09-28": { wip, atraso, total } }) para as tendências do painel.
      snapshots: raw.snapshots && typeof raw.snapshots === "object" ? raw.snapshots : {},
    };
    const prev = store.data;
    store.data = data; // normalizeInitiative consulta as áreas cadastradas
    try {
      data.initiatives = (raw.initiatives || []).map(normalizeInitiative).filter((i) => i.id && i.nome);
      // Os projetos iniciais do painel não foram "cadastrados" no dia em que ele foi aberto pela 1ª vez:
      // sem registro de criação no histórico, recebem a data-base do portfólio (evita "+29 novos na semana").
      const criadosNoHistorico = new Set(data.history.filter((h) => h.entity === "iniciativa" && h.action === "criou").map((h) => h.refId));
      const iniciais = new Set(A.defaults.initiatives.map((i) => i.id));
      data.initiatives.forEach((it) => {
        if (iniciais.has(it.id) && !criadosNoHistorico.has(it.id)) it.criadoEm = PORTFOLIO_BASE_DATE;
      });
      // Autor: quem registrou a criação no histórico; os projetos iniciais vieram da planilha do Pedro.
      const autorNoHistorico = {};
      data.history.forEach((h) => { if (h.entity === "iniciativa" && h.action === "criou" && h.user) autorNoHistorico[h.refId] = h.user; });
      data.initiatives.forEach((it) => {
        if (!it.autor) it.autor = autorNoHistorico[it.id] || (iniciais.has(it.id) ? "Pedro" : "");
      });
      // Dados da versão 4: a conversão antiga achatou o esforço (quase tudo virou 1). Recupera a nota da escala
      // antiga (histórico, ficha de criação ou dados iniciais) e renumera nível a nível, como na conversão nova.
      if (raw.version === 4) {
        const mig = data.history.find((h) => h.action === "migrou" && /esforço convertido/.test(h.label));
        const migTs = mig ? mig.ts : "";
        const antesDaMig = (h) => !migTs || h.ts < migTs;
        const mexidos = new Set(data.history.filter((h) => h.entity === "iniciativa" && migTs && h.ts >= migTs && (h.changes || []).some((c) => c.field === "esforco")).map((h) => h.refId));
        const doHistorico = (h) => h.entity === "iniciativa" && antesDaMig(h);
        function esforcoAntigo(it) {
          const ed = data.history.find((h) => doHistorico(h) && h.refId === it.id && (h.changes || []).some((c) => c.field === "esforco"));
          if (ed) return Number(ed.changes.find((c) => c.field === "esforco").to);
          const cri = data.history.find((h) => doHistorico(h) && h.refId === it.id && h.action === "criou");
          const m = cri && (cri.changes || []).map((c) => c.from).join(" ").match(/\/E(\d)/);
          if (m) return Number(m[1]);
          return A.defaults.initiatives.find((d) => d.id === it.id)?.esforco ?? null;
        }
        data.initiatives.forEach((it) => {
          const antigo = migTs ? it.criadoEm < migTs : iniciais.has(it.id);
          if (!it.esforco || !antigo || mexidos.has(it.id)) return;
          const velho = esforcoAntigo(it);
          if (velho) it.esforco = A.meta.ESFORCO_ANTIGO_PARA_NOVO[snapFib(velho)] || it.esforco;
          it.esforcoRevisar = true;
        });
      }
      // Antes da versão 6 não havia eixos: aplica a classificação inicial combinada com a diretoria.
      if (!(raw.version >= 6)) {
        data.initiatives.forEach((it) => {
          if (!it.eixo && A.meta.EIXO_INICIAL[it.id] && data.config.eixos.some((e) => e.key === A.meta.EIXO_INICIAL[it.id])) it.eixo = A.meta.EIXO_INICIAL[it.id];
        });
      }
      // Sem sprints ainda: cria a Sprint 1 com a próxima atividade aberta de cada projeto em andamento.
      if (!data.sprints.length) {
        const s1 = makeSprint(1, primeiraSegunda());
        data.sprints.push(s1);
        data.initiatives.filter((it) => it.status === "Em andamento").forEach((it) => {
          const a = it.atividades.find((x) => x.status === "Em andamento") || it.atividades.find((x) => x.status === "A fazer");
          if (a) a.sprint = s1.id;
        });
      }
      registerMissing(data);
    } finally {
      store.data = prev;
    }
    return data;
  }

  // Áreas e pessoas citadas nos projetos que ainda não estão cadastradas entram automaticamente.
  function registerMissing(data) {
    data.initiatives.forEach((it) => {
      if (!data.config.areas.some((a) => a.key === it.area)) {
        data.config.areas.push({ key: it.area, code: suggestAreaCode(it.area), cor: nextAreaColor() });
      }
    });
    const known = new Set(data.config.pessoas.map((p) => norm(p.nome)));
    const add = (nome) => {
      splitNames(nome).forEach((n) => {
        if (!known.has(norm(n))) { known.add(norm(n)); data.config.pessoas.push(normalizePessoa({ nome: n })); }
      });
    };
    data.initiatives.forEach((it) => {
      add(it.responsavel);
      it.atividades.forEach((a) => Object.keys(a.raci).forEach(add));
    });
  }

  /* ---------- Persistência ---------- */
  function readJSON(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }

  // Adota um conjunto de dados salvo (do navegador ou da nuvem), aplicando as migrações de versão.
  // Retorna "upgraded" quando houve migração com novidades a avisar, senão "saved".
  function adotar(saved) {
    store.data = normalizeData(saved);
    if (saved.version === SCHEMA_VERSION) return "saved";
    if (!(saved.version >= 4)) {
      store.data.history.unshift(entry("sistema", null, "migrou",
        "Nova versão: esforço convertido para meses (1 = 1 mês … 5 = 1 ano), Sprint 1 de 4 semanas criada e “Aprovado para onda” passou a “Validado”", [], "Sistema"));
    }
    if (saved.version === 4) {
      store.data.history.unshift(entry("sistema", null, "migrou",
        "Esforço renumerado mantendo a proporção da escala antiga (1, 2, 3, 5, 8 → 1, 2, 3, 4, 5); projetos marcados como “esforço a revisar” na Triagem", [], "Sistema"));
    }
    if (saved.version >= 4 && saved.version < 6) {
      store.data.history.unshift(entry("sistema", null, "migrou",
        "Eixos criados (Receita e vendas, Gestão e processos, Engenharia e ferramentas, Marca e relacionamento, Novos mercados e inovação) e projetos classificados", [], "Sistema"));
    }
    return saved.version >= 6 ? "saved" : "upgraded";
  }

  // Dados vindos da nuvem (carga inicial ou alteração de outra pessoa): substitui os locais sem reenviar.
  function adotarDaNuvem(raw) {
    const origem = adotar(raw);
    persist();
    emit();
    A.google?.schedule(); // prazos alterados por outras pessoas também vão para a agenda de quem tem o Google conectado
    return origem;
  }

  function load() {
    const settings = readJSON(SETTINGS_KEY);
    if (settings) Object.assign(store.settings, settings);

    const saved = readJSON(DATA_KEY);
    if (saved && Array.isArray(saved.initiatives)) {
      const origem = adotar(saved);
      persist();
      return origem;
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

  // Segunda-feira da semana de `d` (chave das fotos semanais).
  function weekKey(d = new Date()) {
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }

  function persist() {
    store.settings.lastSavedAt = new Date().toISOString();
    try {
      if (A.metrics) store.data.snapshots[weekKey()] = A.metrics.snapshot(A.store);
    } catch {}
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

  const fmtValue = (v) => (Array.isArray(v) ? v.map((x) => `${x.feito ? "☑" : "☐"} ${x.texto}`).join("; ")
    : v && typeof v === "object" ? raciText(v) : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v ?? ""));
  function diff(before, after, fields) {
    const changes = [];
    Object.keys(fields).forEach((f) => {
      const a = fmtValue(before ? before[f] : undefined);
      const b = fmtValue(after[f]);
      if (a !== b) changes.push({ field: f, label: fields[f], from: a, to: b });
    });
    return changes;
  }

  function commit(entries) {
    if (entries.length) {
      store.data.history.unshift(...entries);
      if (store.data.history.length > HISTORY_LIMIT) store.data.history.length = HISTORY_LIMIT;
    }
    const ok = persist();
    A.nuvem?.agendar(); // envia ao banco compartilhado (se conectado)
    emit();
    if (!ok) A.util.toast("Não foi possível salvar no navegador. Exporte um backup agora.", "error", 6000);
    A.google?.schedule(); // leva prazos e compromissos para o Google Agenda (se conectado)
  }

  /* ---------- Iniciativas ---------- */
  const findInitiative = (id) => store.data.initiatives.find((i) => i.id === id);

  function nextId(area) {
    const code = A.area(area).code;
    const nums = store.data.initiatives
      .filter((i) => i.id.startsWith(code) && /^\d+$/.test(i.id.slice(code.length)))
      .map((i) => parseInt(i.id.slice(code.length), 10));
    return code + ((nums.length ? Math.max(...nums) : 0) + 1);
  }

  function validateInitiative(input, originalId) {
    const id = String(input.id || "").trim().toUpperCase();
    if (!id) return "Informe um ID (ex.: P11).";
    if (!/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(id)) return "ID deve ter só letras, números, - ou _ (até 12 caracteres).";
    if (id !== originalId && findInitiative(id)) return `Já existe uma iniciativa com o ID ${id}.`;
    if (!String(input.nome || "").trim()) return "Informe o nome da iniciativa.";
    if (!findArea(input.area)) return "Escolha uma área cadastrada.";
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
      registerMissing(store.data);
      const e = entry("iniciativa", item.id, "criou", `${item.id} · ${item.nome}`, [], source);
      if (!silent) commit([e]);
      return { ok: true, item, entry: e };
    }

    const idx = store.data.initiatives.findIndex((i) => i.id === originalId);
    const before = store.data.initiatives[idx];
    const merged = { ...before, ...input };
    if ("esforco" in input && !("esforcoRevisar" in input)) merged.esforcoRevisar = false; // mexeu no esforço = revisado
    // Se o status mudou e a coluna não foi informada explicitamente, a coluna acompanha o status.
    if (input.status && input.status !== before.status && !("coluna" in input)) merged.coluna = null;
    if (merged.status === "Concluído" && before.status !== "Concluído" && !("semaforo" in input)) merged.semaforo = "verde";
    const after = normalizeInitiative(merged);
    const changes = diff(before, after, INITIATIVE_FIELDS);
    if (!changes.length) return { ok: true, item: before, unchanged: true };

    after.atualizadoEm = new Date().toISOString();
    store.data.initiatives[idx] = after;
    registerMissing(store.data);
    if (after.id !== originalId) {
      store.data.decisions.forEach((d) => { if (d.grupo === originalId) d.grupo = after.id; });
    }
    const e = entry("iniciativa", after.id, "editou", `${after.id} · ${after.nome}`, changes, source);
    if (!silent) commit([e]);
    return { ok: true, item: after, entry: e };
  }

  /**
   * Cria um projeto completo a partir da ficha (dados + atividades com RACI), como Rascunho.
   * Tudo ou nada: se algo falhar, nada é gravado.
   */
  function createProject(input, activities) {
    const id = nextId(input.area);
    const item = normalizeInitiative({
      autor: store.settings.user || "",
      ...input, id, situacao: "Rascunho", status: "A fazer", semaforo: "verde",
      atividades: activities.map((a) => normalizeActivity(a)), criadoEm: new Date().toISOString(),
    });
    const error = validateInitiative(item, null);
    if (error) return { ok: false, error };
    store.data.initiatives.push(item);
    registerMissing(store.data);
    commit([entry("iniciativa", id, "criou", `${id} · ${item.nome}`, [
      { field: "snapshot", label: "Ficha", from: `${item.area} · V${item.valor}/E${item.esforco} · ${item.onda} · ${item.atividades.length} atividades`, to: "" },
    ], "Ficha")]);
    return { ok: true, item };
  }

  /**
   * Cadastro rápido de ideia (Triagem): só o essencial — nome, área, autor, prazo pensado e,
   * se já souber, valor e esforço. Entra como Rascunho, sem atividades.
   */
  function quickIdea(input) {
    if (!String(input.nome || "").trim()) return { ok: false, error: "Descreva a ideia." };
    if (!findArea(input.area)) return { ok: false, error: "Escolha a área." };
    const dup = store.data.initiatives.find((i) => norm(i.nome) === norm(input.nome));
    if (dup) return { ok: false, error: `Já existe um projeto com esse nome (${dup.id}).` };
    const id = nextId(input.area);
    const item = normalizeInitiative({
      id, nome: input.nome, area: input.area, autor: input.autor || store.settings.user || "", eixo: input.eixo || "",
      prazo: input.prazo || "", valor: input.valor, esforco: input.esforco, objetivo: input.objetivo || "",
      onda: "Fila", situacao: "Rascunho", status: "A fazer", semaforo: "verde", atividades: [],
      criadoEm: new Date().toISOString(),
    });
    store.data.initiatives.push(item);
    registerMissing(store.data);
    commit([entry("iniciativa", id, "criou", `${id} · ${item.nome}`, [], "Triagem")]);
    return { ok: true, item };
  }

  const CONFIG_FIELDS = { sprintMin: "Mínimo de atividades por sprint", sprintMax: "Máximo de atividades por sprint" };
  function saveConfig(patch) {
    const cfg = store.data.config;
    const before = Object.fromEntries(Object.keys(CONFIG_FIELDS).map((k) => [k, cfg[k]]));
    const after = Object.fromEntries(Object.keys(CONFIG_FIELDS).map((k) => [k, Math.max(1, Math.round(Number(patch[k] ?? before[k])) || before[k])]));
    if (after.sprintMin > after.sprintMax) return { ok: false, error: "O mínimo de atividades não pode passar do máximo." };
    const changes = diff(before, after, CONFIG_FIELDS);
    if (!changes.length) return { ok: true, unchanged: true };
    Object.assign(cfg, after);
    commit([entry("cadastro", null, "editou", "Capacidade de execução", changes)]);
    return { ok: true };
  }

  /* ---------- Sprint ---------- */
  const sprints = () => store.data.sprints;
  const sprintAtual = () => [...store.data.sprints].reverse().find((s) => !s.encerrada) || null;
  const findSprint = (id) => store.data.sprints.find((s) => s.id === id) || null;
  // Atividades (com o projeto) de uma sprint.
  function sprintItems(sp = sprintAtual()) {
    if (!sp) return [];
    const out = [];
    store.data.initiatives.forEach((it) => it.atividades.forEach((a) => {
      if (a.sprint === sp.id && a.status !== "Cancelado" && it.status !== "Cancelado") out.push({ it, a });
    }));
    return out;
  }
  const activityCol = (a) => (a.status === "Concluído" ? "done" : a.status === "Em andamento" ? (a.esperando ? "waiting" : "doing") : "todo");
  const sprintDates = (sp) => ({ inicio: fromIso(sp.inicio), fim: fromIso(sp.fim) });

  // Planejamento: `selecionadas` = lista de "iniId|actId" que ficam na sprint atual (as demais saem).
  function planSprint(selecionadas, objetivo) {
    const sp = sprintAtual();
    if (!sp) return { ok: false, error: "Nenhuma sprint aberta." };
    const set = new Set(selecionadas);
    const entries = [];
    store.data.initiatives.forEach((it) => it.atividades.forEach((a) => {
      const quer = set.has(`${it.id}|${a.id}`);
      if (quer === (a.sprint === sp.id)) return;
      const r = saveActivity(it.id, a.id, { sprint: quer ? sp.id : "" }, { source: "Sprint", silent: true });
      if (r.entry) entries.push(r.entry);
    }));
    const changes = [];
    if (objetivo != null && objetivo.trim() !== sp.objetivo) {
      changes.push({ field: "objetivo", label: "Objetivo", from: sp.objetivo, to: objetivo.trim() });
      sp.objetivo = objetivo.trim();
    }
    if (!entries.length && !changes.length) return { ok: true, unchanged: true };
    entries.push(entry("sprint", sp.id, "planejou", `Sprint ${sp.numero}: ${set.size} atividade(s)`, changes, "Sprint"));
    commit(entries.reverse());
    return { ok: true, total: set.size };
  }

  // Move o card no Kanban da sprint: muda o status da atividade e, ao começar, coloca o projeto em andamento.
  function moveActivity(iniId, actId, col) {
    const it = findInitiative(iniId);
    const a = findActivity(iniId, actId);
    if (!it || !a) return { ok: false, error: "Atividade não encontrada." };
    if (activityCol(a) === col) return { ok: true, unchanged: true };
    const patch = {
      todo: { status: "A fazer", esperando: false },
      doing: { status: "Em andamento", esperando: false },
      waiting: { status: "Em andamento", esperando: true },
      done: { status: "Concluído", esperando: false },
    }[col];
    if (!patch) return { ok: false, error: "Coluna inválida." };
    if (a.status === "Concluído" && col !== "done" && !a.checklist.length) patch.pct = Math.min(a.pct, 90);
    const entries = [];
    const r = saveActivity(iniId, actId, patch, { source: "Kanban", silent: true });
    if (!r.ok) return r;
    if (r.entry) entries.push(r.entry);
    let iniciouProjeto = false;
    if (col !== "todo" && it.status === "A fazer") {
      const p = saveInitiative({ status: "Em andamento" }, iniId, { source: "Kanban", silent: true });
      if (p.entry) { entries.push(p.entry); iniciouProjeto = true; }
    }
    const projetoPronto = findInitiative(iniId).atividades.filter((x) => x.status !== "Cancelado").every((x) => x.status === "Concluído");
    commit(entries.reverse());
    return { ok: true, iniciouProjeto, projetoPronto };
  }

  // Encerra a sprint atual e abre a próxima; o que não foi feito passa para a nova sprint.
  function novaSprint() {
    const atual = sprintAtual();
    const numero = (Math.max(0, ...store.data.sprints.map((s) => s.numero)) || 0) + 1;
    const inicio = atual ? addDays(fromIso(atual.fim), 1) : primeiraSegunda();
    const nova = makeSprint(numero, inicio);
    let levadas = 0, feitas = 0;
    if (atual) {
      sprintItems(atual).forEach(({ a }) => {
        if (a.status === "Concluído") feitas++;
        else { a.sprint = nova.id; levadas++; }
      });
      atual.encerrada = true;
    }
    store.data.sprints.push(nova);
    const entries = [entry("sprint", nova.id, "abriu", `Sprint ${nova.numero} aberta (${nova.inicio} a ${nova.fim})`, [], "Sprint")];
    if (atual) entries.push(entry("sprint", atual.id, "encerrou", `Sprint ${atual.numero} encerrada: ${feitas} feita(s), ${levadas} levada(s) para a Sprint ${nova.numero}`, [], "Sprint"));
    commit(entries);
    return { ok: true, sprint: nova, levadas, feitas };
  }

  function saveSprint(patch) {
    const sp = sprintAtual();
    if (!sp) return { ok: false, error: "Nenhuma sprint aberta." };
    const after = { ...sp, ...patch };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(after.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(after.fim) || after.fim < after.inicio) {
      return { ok: false, error: "Datas da sprint inválidas." };
    }
    const changes = diff(sp, after, { objetivo: "Objetivo", inicio: "Início", fim: "Fim" });
    if (!changes.length) return { ok: true, unchanged: true };
    Object.assign(sp, after);
    commit([entry("sprint", sp.id, "editou", `Sprint ${sp.numero}`, changes, "Sprint")]);
    return { ok: true };
  }

  const saveChecklist = (iniId, actId, checklist) => saveActivity(iniId, actId, { checklist }, { source: "Checklist" });

  const canDelete = (it) => it && it.situacao === "Rascunho";

  // Só rascunhos podem ser excluídos; projetos validados são cancelados (ficam no histórico).
  function deleteInitiative(id) {
    const it = findInitiative(id);
    if (!canDelete(it)) return { ok: false, error: "Só projetos em Rascunho podem ser excluídos. Para tirar do fluxo, use o status Cancelado." };
    store.data.initiatives = store.data.initiatives.filter((i) => i.id !== id);
    store.data.decisions.forEach((d) => { if (d.grupo === id) d.grupo = ""; });
    commit([entry("iniciativa", id, "excluiu", `${it.id} · ${it.nome}`, [
      { field: "snapshot", label: "Dados", from: `Rascunho · ${it.area} · V${it.valor}/E${it.esforco} · ${it.atividades.length} atividades`, to: "" },
    ])]);
    return { ok: true };
  }

  function advanceSituacao(id) {
    const it = findInitiative(id);
    if (!it) return { ok: false, error: "Iniciativa não encontrada." };
    const next = SITUACOES[SITUACOES.indexOf(it.situacao) + 1];
    if (!next) return { ok: true, unchanged: true };
    return saveInitiative({ situacao: next }, id, { source: "Triagem" });
  }

  function moveToColumn(id, coluna) {
    const it = findInitiative(id);
    if (!it || it.coluna === coluna) return { ok: true, unchanged: true };
    const patch = { coluna, status: STATUS_BY_COLUNA[coluna] };
    if (coluna === "done") patch.semaforo = "verde";
    return saveInitiative(patch, id, { source: "Kanban" });
  }

  const setOnda = (id, onda) => saveInitiative({ onda }, id, { source: "Ondas" });
  const confirmarEsforco = (id) => saveInitiative({ esforcoRevisar: false }, id, { source: "Triagem" });
  const setStatus = (id, status) => saveInitiative({ status }, id);

  /* ---------- Consistência (avisos da Triagem e da tela do projeto) ---------- */
  function warnings(it) {
    const w = [];
    const acts = it.atividades.filter((a) => a.status !== "Cancelado");
    if (it.status === "Concluído" || it.status === "Cancelado") return w;
    if (!it.valor || !it.esforco) w.push("Valor e esforço a definir (Triagem).");
    if (!it.objetivo) w.push("Objetivo não preenchido.");
    if (!it.prontoQuando) w.push("“Pronto quando” não preenchido.");
    else if (parseDate(it.prontoQuando)) w.push("“Pronto quando” deve descrever o resultado, não uma data.");
    if (acts.length < 2) w.push(acts.length ? "Só 1 atividade cadastrada." : "Nenhuma atividade cadastrada.");
    const semR = acts.filter((a) => !raciPeople(a.raci, "R").length).length;
    if (semR) w.push(`${semR} atividade(s) sem responsável (R) na RACI.`);
    const semPrazo = acts.filter((a) => !a.prazo).length;
    if (semPrazo) w.push(`${semPrazo} atividade(s) sem prazo.`);
    const fim = parseDate(it.prazo);
    const ultimas = acts.map((a) => parseDate(a.prazo)).filter(Boolean);
    if (fim && ultimas.length) {
      const maior = new Date(Math.max(...ultimas));
      if (maior > fim) w.push(`Prazo do projeto (${it.prazo}) anterior à última atividade (${maior.toLocaleDateString("pt-BR")}).`);
    }
    if (it.valor && it.esforco && it.onda === "Onda 1" && !isAboveCut(it) && !it.observacoes) {
      w.push("Na Onda 1, mas abaixo da linha de corte: registre o motivo nas observações.");
    }
    return w;
  }

  /* ---------- Atividades ---------- */
  /**
   * Cria (actId = null) ou atualiza uma atividade da iniciativa `iniId`.
   * Atividades de projetos validados não são apagadas: para tirar do cálculo, use o status "Cancelado".
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
    const base = { ...(before || {}), ...patch };
    // Edições antigas por "responsavel"/"envolvidos" (importação) sem RACI explícita: recalcula a partir deles.
    if (!("raci" in patch) && ("responsavel" in patch || "envolvidos" in patch)) {
      base.raci = { ...(before ? before.raci : {}) };
      if ("responsavel" in patch) {
        Object.keys(base.raci).forEach((n) => { if (base.raci[n] === "R") delete base.raci[n]; });
        splitNames(patch.responsavel).slice(0, 1).forEach((n) => { base.raci[n] = "R"; });
      }
      if ("envolvidos" in patch) splitNames(patch.envolvidos).forEach((n) => { if (!base.raci[n]) base.raci[n] = "C"; });
    }
    const after = normalizeActivity(base);
    if (!after.nome) return { ok: false, error: "Informe o nome da atividade." };
    const nR = raciPeople(after.raci, "R").length, nA = raciPeople(after.raci, "A").length;
    if (nR > 1) return { ok: false, error: "Cada atividade tem só um responsável (R)." };
    if (nA > 1) return { ok: false, error: "Cada atividade tem no máximo um aprovador (A)." };

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
    registerMissing(store.data);
    if (!silent) commit([e]);
    return { ok: true, item: after, entry: e };
  }

  // Define o papel RACI de uma pessoa numa atividade ("" remove). R e A são únicos: quem tinha passa a não ter.
  function setRaci(iniId, actId, nome, role) {
    const a = findActivity(iniId, actId);
    if (!a) return { ok: false, error: "Atividade não encontrada." };
    const raci = { ...a.raci };
    if (role === "R" || role === "A") Object.keys(raci).forEach((n) => { if (raci[n] === role && n !== nome) delete raci[n]; });
    if (role) raci[nome] = role; else delete raci[nome];
    return saveActivity(iniId, actId, { raci }, { source: "RACI" });
  }

  function deleteActivity(iniId, actId) {
    const it = findInitiative(iniId);
    if (!canDelete(it)) return { ok: false, error: "Atividades só podem ser removidas enquanto o projeto é Rascunho. Use o status Cancelado." };
    const a = it.atividades.find((x) => x.id === actId);
    if (!a) return { ok: false, error: "Atividade não encontrada." };
    it.atividades = it.atividades.filter((x) => x.id !== actId);
    commit([entry("atividade", it.id, "excluiu", `${it.id} · ${a.nome}`)]);
    return { ok: true };
  }

  const findActivity = (iniId, actId) => findInitiative(iniId)?.atividades.find((a) => a.id === actId) || null;

  // Pessoas que participam do projeto (aparecem em alguma RACI das atividades).
  function projectTeam(it) {
    const names = new Set();
    it.atividades.forEach((a) => Object.keys(a.raci).forEach((n) => names.add(n)));
    (it.equipeExtra || []).forEach((n) => names.add(n));
    return [...names];
  }

  /* ---------- Cadastros: áreas ---------- */
  function saveArea(input, originalKey = null) {
    const before = originalKey ? findArea(originalKey) : null;
    const after = normalizeArea({ ...(before || {}), ...input });
    if (!after.key) return { ok: false, error: "Informe o nome da área." };
    if (!/^[A-Z]{1,3}$/.test(after.code)) return { ok: false, error: "O código deve ter de 1 a 3 letras (ex.: F, FIN)." };
    if (areas().some((a) => a !== before && norm(a.key) === norm(after.key))) return { ok: false, error: "Já existe uma área com esse nome." };
    if (areas().some((a) => a !== before && a.code === after.code)) return { ok: false, error: `O código ${after.code} já é usado por outra área.` };
    const emUso = before ? store.data.initiatives.filter((i) => i.area === before.key).length : 0;
    if (before && after.code !== before.code && emUso) {
      return { ok: false, error: `O código não pode mudar: ${emUso} projeto(s) desta área já têm ID com “${before.code}”.` };
    }
    if (!before) {
      areas().push(after);
      commit([entry("cadastro", null, "criou", `Área ${after.key} (${after.code})`)]);
      return { ok: true, item: after };
    }
    const changes = diff(before, after, AREA_FIELDS);
    if (!changes.length) return { ok: true, unchanged: true };
    if (after.key !== before.key) {
      store.data.initiatives.forEach((i) => { if (i.area === before.key) i.area = after.key; });
      store.data.config.pessoas.forEach((p) => { if (p.area === before.key) p.area = after.key; });
    }
    Object.assign(before, after);
    commit([entry("cadastro", null, "editou", `Área ${after.key}`, changes)]);
    return { ok: true, item: before };
  }

  function deleteArea(key) {
    const emUso = store.data.initiatives.filter((i) => i.area === key).length;
    if (emUso) return { ok: false, error: `A área tem ${emUso} projeto(s). Mova-os para outra área antes de excluir.` };
    if (areas().length <= 1) return { ok: false, error: "É preciso ter pelo menos uma área." };
    store.data.config.areas = areas().filter((a) => a.key !== key);
    commit([entry("cadastro", null, "excluiu", `Área ${key}`)]);
    return { ok: true };
  }

  /* ---------- Cadastros: eixos ---------- */
  const eixoUso = (key) => store.data.initiatives.filter((i) => i.eixo === key).length;

  function saveEixo(input, originalKey = null) {
    const before = originalKey ? findEixo(originalKey) : null;
    const after = normalizeEixo({ ...(before || {}), ...input });
    if (!after.key) return { ok: false, error: "Informe o nome do eixo." };
    if (eixos().some((e) => e !== before && norm(e.key) === norm(after.key))) return { ok: false, error: "Já existe um eixo com esse nome." };
    if (!before) {
      eixos().push(after);
      commit([entry("cadastro", null, "criou", `Eixo ${after.icone} ${after.key} (${after.vagas} vaga(s) por onda)`)]);
      return { ok: true, item: after };
    }
    const changes = diff(before, after, EIXO_FIELDS);
    if (!changes.length) return { ok: true, unchanged: true };
    if (after.key !== before.key) store.data.initiatives.forEach((i) => { if (i.eixo === before.key) i.eixo = after.key; });
    Object.assign(before, after);
    commit([entry("cadastro", null, "editou", `Eixo ${after.key}`, changes)]);
    return { ok: true, item: before };
  }

  function deleteEixo(key) {
    const uso = eixoUso(key);
    if (uso) return { ok: false, error: `O eixo tem ${uso} projeto(s). Mude o eixo deles antes de excluir.` };
    store.data.config.eixos = eixos().filter((e) => e.key !== key);
    commit([entry("cadastro", null, "excluiu", `Eixo ${key}`)]);
    return { ok: true };
  }

  /* ---------- Fases de projetos longos ---------- */
  const fasesDe = (id) => store.data.initiatives.filter((i) => i.faseDe === id);

  // Cria a próxima fase de um projeto (ex.: "Internacionalização · Fase 1"), que entra na Triagem como rascunho
  // com o mesmo eixo e valor; o esforço da fase fica a definir.
  function criarFase(id) {
    const mae = findInitiative(id);
    if (!mae) return { ok: false, error: "Projeto não encontrado." };
    const n = fasesDe(id).length + 1;
    const novoId = nextId(mae.area);
    const item = normalizeInitiative({
      id: novoId, nome: `${mae.nome} · Fase ${n}`, area: mae.area, eixo: mae.eixo, autor: store.settings.user || mae.autor,
      valor: mae.valor, esforco: 0, onda: "Fila", situacao: "Rascunho", status: "A fazer", semaforo: "verde",
      objetivo: n === 1 ? `Primeira entrega de ${mae.id}: diagnóstico ou piloto que reduz a incerteza do projeto.` : "",
      faseDe: mae.id, atividades: [], criadoEm: new Date().toISOString(),
    });
    store.data.initiatives.push(item);
    commit([entry("iniciativa", novoId, "criou", `${novoId} · ${item.nome}`, [{ field: "faseDe", label: "Fase do projeto", from: "", to: mae.id }], "Fases")]);
    return { ok: true, item };
  }
  /* ---------- Cadastros: pessoas ---------- */
  const findPessoa = (nome) => store.data.config.pessoas.find((p) => norm(p.nome) === norm(nome));

  function pessoaUso(nome) {
    let n = 0;
    store.data.initiatives.forEach((it) => {
      if (norm(it.responsavel) === norm(nome)) n++;
      it.atividades.forEach((a) => { if (Object.keys(a.raci).some((k) => norm(k) === norm(nome))) n++; });
    });
    return n;
  }

  function savePessoa(input, originalNome = null) {
    const before = originalNome ? findPessoa(originalNome) : null;
    const after = normalizePessoa({ ...(before || {}), ...input });
    if (!after.nome) return { ok: false, error: "Informe o nome." };
    if (after.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(after.email)) return { ok: false, error: "E-mail inválido." };
    const dup = findPessoa(after.nome);
    if (dup && dup !== before) return { ok: false, error: "Já existe uma pessoa com esse nome." };
    if (!before) {
      store.data.config.pessoas.push(after);
      commit([entry("cadastro", null, "criou", `Pessoa ${after.nome}`)]);
      return { ok: true, item: after };
    }
    const changes = diff(before, after, PESSOA_FIELDS);
    if (!changes.length) return { ok: true, unchanged: true };
    if (after.nome !== before.nome) {
      // Renomear propaga para responsáveis e RACI.
      const old = before.nome;
      store.data.initiatives.forEach((it) => {
        if (it.responsavel === old) it.responsavel = after.nome;
        it.atividades.forEach((a) => {
          if (a.raci[old]) { a.raci[after.nome] = a.raci[old]; delete a.raci[old]; Object.assign(a, normalizeActivity(a)); }
        });
      });
    }
    Object.assign(before, after);
    commit([entry("cadastro", null, "editou", `Pessoa ${after.nome}`, changes)]);
    return { ok: true, item: before };
  }

  function deletePessoa(nome) {
    const uso = pessoaUso(nome);
    if (uso) return { ok: false, error: `${nome} aparece em ${uso} projeto(s)/atividade(s). Desative em vez de excluir.` };
    store.data.config.pessoas = store.data.config.pessoas.filter((p) => norm(p.nome) !== norm(nome));
    commit([entry("cadastro", null, "excluiu", `Pessoa ${nome}`)]);
    return { ok: true };
  }

  /* ---------- Compromissos (calls e reuniões) ---------- */
  const findCompromisso = (id) => store.data.compromissos.find((c) => c.id === id);

  function saveCompromisso(input) {
    const existing = input.id ? findCompromisso(input.id) : null;
    const after = normalizeCompromisso({ ...(existing || {}), ...input });
    if (!after.titulo) return { ok: false, error: "Dê um título ao compromisso." };
    if (!parseDate(after.data)) return { ok: false, error: "Informe a data do compromisso." };
    if (after.projeto && !findInitiative(after.projeto)) return { ok: false, error: `Projeto ${after.projeto} não encontrado.` };
    const label = `${after.data} ${after.horaInicio} · ${after.titulo}`;
    if (!existing) {
      store.data.compromissos.push(after);
      commit([entry("compromisso", after.projeto || null, "criou", label)]);
      return { ok: true, item: after };
    }
    const changes = diff(existing, after, COMPROMISSO_FIELDS);
    if (!changes.length) return { ok: true, item: existing, unchanged: true };
    Object.assign(existing, after);
    commit([entry("compromisso", after.projeto || null, "editou", label, changes)]);
    return { ok: true, item: existing };
  }

  function deleteCompromisso(id) {
    const c = findCompromisso(id);
    if (!c) return { ok: false, error: "Compromisso não encontrado." };
    store.data.compromissos = store.data.compromissos.filter((x) => x.id !== id);
    commit([entry("compromisso", c.projeto || null, "excluiu", `${c.data} ${c.horaInicio} · ${c.titulo}`)]);
    return { ok: true };
  }

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
    (plan.newAreas || []).forEach((name) => {
      if (!findArea(name)) areas().push({ key: name, code: suggestAreaCode(name), cor: nextAreaColor() });
    });
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
    store.data = { ...normalizeData(clone(A.defaults)), history: store.data.history, snapshots: store.data.snapshots };
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
      const q = norm(ui.search);
      const hay = norm(`${it.id} ${it.nome} ${it.responsavel} ${it.observacoes}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  }
  const filtered = () => store.data.initiatives.filter((it) => matchesFilters(it));
  const hasActiveFilters = () => store.ui.area !== "ALL" || store.ui.status !== "ALL" || store.ui.onda !== "ALL" || !!store.ui.search;

  A.store = {
    state: store, load, persist, subscribe, emit, saveSettings, adotarDaNuvem, SCHEMA_VERSION,
    calc: { ve, cutoff, isAboveCut, wipCount, snapFib, snapEsforco, progress, parseDate, weekKey, sprintLimites, projetosPorOnda },
    eixos, findEixo, saveEixo, deleteEixo, eixoUso, criarFase, fasesDe,
    sprints, sprintAtual, findSprint, sprintItems, activityCol, sprintDates, planSprint, moveActivity, novaSprint, saveSprint, saveChecklist,
    findInitiative, nextId, saveInitiative, createProject, quickIdea, saveConfig, deleteInitiative, canDelete, advanceSituacao,
    moveToColumn, setOnda, setStatus, warnings, confirmarEsforco,
    saveActivity, setRaci, deleteActivity, findActivity, projectTeam, raciText, raciPeople, splitNames,
    areas, findArea, saveArea, deleteArea, suggestAreaCode, nextAreaColor,
    pessoas, findPessoa, savePessoa, deletePessoa, pessoaUso,
    findDecision, saveDecision, deleteDecision,
    findCompromisso, saveCompromisso, deleteCompromisso,
    replaceAll, applyImportPlan, resetToDefaults, clearHistory, markBackup, backupOverdue,
    matchesFilters, filtered, hasActiveFilters,
    SITUACOES, RACI_ROLES,
    FIELDS: { INITIATIVE_FIELDS, DECISION_FIELDS, ACTIVITY_FIELDS },
  };
})();
