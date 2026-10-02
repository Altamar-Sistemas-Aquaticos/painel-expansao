/* Integração com Excel: leitura da planilha oficial (1_Grupos / 4_Decisoes) e exportação. */
(function () {
  const A = window.Altamar;
  const { norm, excelSerialToStr, toast } = A.util;

  const SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

  async function ensureXLSX() {
    if (window.XLSX) return window.XLSX;
    try {
      await A.util.loadScript(SHEETJS_URL);
    } catch {
      throw new Error("Não foi possível carregar o leitor de Excel. Verifique a conexão com a internet.");
    }
    return window.XLSX;
  }

  // Cabeçalhos aceitos (normalizados) para cada campo, em ordem de prioridade.
  const INITIATIVE_COLUMNS = {
    id: ["grupo", "id", "codigo", "cod"],
    nome: ["nomedogrupo", "iniciativa", "nomedainiciativa", "nome", "projetoiniciativa"],
    area: ["area", "setor"],
    responsavel: ["responsavel"],
    valorSugerido: ["valorsugerido"],
    valor: ["valor"],
    esforco: ["esforco"],
    onda: ["onda"],
    status: ["status"],
    semaforo: ["semaforo"],
    prazo: ["prazo"],
    observacoes: ["observacoes", "obs"],
  };
  const DECISION_COLUMNS = {
    data: ["data"],
    reuniao: ["reuniao"],
    pauta: ["descricao", "pauta", "pautadecisaonecessaria", "decisaonecessaria"],
    grupo: ["grupo", "iniciativa"],
    quem: ["quemdecide", "quem"],
    status: ["status"],
    resultado: ["oquefoidecidido", "resultado", "decisao", "encaminhamento"],
  };

  function mapHeader(row, spec) {
    const normalized = row.map((h) => norm(h));
    const map = {};
    Object.entries(spec).forEach(([field, aliases]) => {
      for (const alias of aliases) {
        const idx = normalized.indexOf(alias);
        if (idx >= 0 && !Object.values(map).includes(idx)) { map[field] = idx; break; }
      }
    });
    return map;
  }

  // Procura, nas primeiras linhas de cada aba, uma linha de cabeçalho que satisfaça `isMatch`.
  function findTable(XLSX, wb, spec, isMatch, preferSheet) {
    const names = [...wb.SheetNames].sort((a, b) => (preferSheet.test(b) ? 1 : 0) - (preferSheet.test(a) ? 1 : 0));
    for (const name of names) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" });
      for (let r = 0; r < Math.min(rows.length, 20); r++) {
        const map = mapHeader(rows[r], spec);
        if (isMatch(map)) {
          const body = rows.slice(r + 1).map((row) => {
            const obj = {};
            Object.entries(map).forEach(([field, idx]) => { obj[field] = row[idx]; });
            return obj;
          });
          return { sheet: name, map, rows: body };
        }
      }
    }
    return null;
  }

  function toArea(v) {
    const n = norm(v);
    if (!n) return null;
    if (n.includes("projet")) return "Projetos";
    if (n.includes("vend") || n.includes("comerc")) return "Vendas";
    if (n.includes("market") || n.includes("brand")) return "Marketing";
    if (n.includes("estrat") || n.includes("diret")) return "Estratégia";
    return null;
  }
  function toStatus(v) {
    const n = norm(v);
    if (!n) return null;
    if (n.includes("conclu") || n === "feito") return "Concluído";
    if (n.includes("cancel")) return "Cancelado";
    if (n.includes("andamento") || n.includes("fazendo") || n.includes("execu")) return "Em andamento";
    return "A fazer"; // "Não iniciado", "Pausado", "Fila"...
  }
  function toOnda(v) {
    const n = norm(v);
    if (!n) return null;
    const m = n.match(/onda([123])/);
    if (m) return `Onda ${m[1]}`;
    if (n.includes("fila")) return "Fila";
    return null;
  }
  function toSemaforo(v) {
    const n = norm(v);
    if (n.includes("verm")) return "vermelho";
    if (n.includes("amar")) return "amarelo";
    if (n.includes("verd")) return "verde";
    return null;
  }
  function toNumber(v) {
    if (v === "" || v == null) return null;
    const n = Number(String(v).replace(",", "."));
    return isFinite(n) && n > 0 ? n : null;
  }
  function toText(v) {
    if (v == null) return "";
    if (typeof v === "number" && v > 30000 && v < 80000) return excelSerialToStr(v);
    return String(v).trim();
  }

  /**
   * Lê o arquivo e monta um plano de importação (sem alterar nada).
   * Iniciativas casam pelo ID; decisões casam pelo texto da pauta.
   */
  async function buildImportPlan(file) {
    const XLSX = await ensureXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const S = A.store;
    const calc = S.calc;

    const iniTable = findTable(XLSX, wb, INITIATIVE_COLUMNS,
      (m) => m.id != null && m.nome != null && (m.valor != null || m.esforco != null || m.valorSugerido != null),
      /grupo|inici|prior/i);
    const decTable = findTable(XLSX, wb, DECISION_COLUMNS,
      (m) => m.pauta != null && m.status != null && m.quem != null,
      /decis/i);

    if (!iniTable && !decTable) {
      throw new Error("Não encontrei as abas esperadas. A planilha precisa de uma tabela com colunas Grupo/ID, Nome, Valor e Esforço (ex.: aba 1_Grupos) e/ou Descrição, Quem decide e Status (aba de decisões).");
    }

    const plan = { fileName: file.name, initiatives: [], decisions: [], skipped: [], sheets: [] };

    if (iniTable) {
      plan.sheets.push(iniTable.sheet);
      iniTable.rows.forEach((row) => {
        const id = toText(row.id).toUpperCase();
        const nome = toText(row.nome);
        if (!id || !nome || !/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(id)) return;

        const incoming = { nome };
        const area = toArea(row.area) || A.meta.AREAS.find((a) => a.code === id[0])?.key;
        if (area) incoming.area = area;
        const valor = toNumber(row.valor) ?? toNumber(row.valorSugerido);
        if (valor) incoming.valor = calc.snapFib(valor);
        const esforco = toNumber(row.esforco);
        if (esforco) incoming.esforco = calc.snapFib(esforco);
        const resp = toText(row.responsavel);
        if (resp) incoming.responsavel = resp;
        const status = toStatus(row.status);
        if (status) incoming.status = status;
        const onda = toOnda(row.onda);
        if (onda) incoming.onda = onda;
        const sem = toSemaforo(row.semaforo);
        if (sem) incoming.semaforo = sem;
        const prazo = toText(row.prazo);
        if (prazo) incoming.prazo = prazo;
        const obs = toText(row.observacoes);
        if (obs) incoming.observacoes = obs;

        const existing = S.findInitiative(id);
        if (!existing) {
          plan.initiatives.push({ isNew: true, id, data: { id, valor: 1, esforco: 1, onda: "Fila", ...incoming } });
          return;
        }
        const patch = {};
        const changes = [];
        Object.entries(incoming).forEach(([k, v]) => {
          if (String(existing[k] ?? "") !== String(v)) {
            patch[k] = v;
            changes.push({ label: S.FIELDS.INITIATIVE_FIELDS[k] || k, from: existing[k], to: v });
          }
        });
        if (changes.length) plan.initiatives.push({ isNew: false, id, patch, changes, nome: existing.nome });
      });
    }

    if (decTable) {
      plan.sheets.push(decTable.sheet);
      decTable.rows.forEach((row) => {
        const pauta = toText(row.pauta);
        if (!pauta) return;
        const data = {
          pauta,
          data: toText(row.data) || A.util.todayStr(),
          quem: toText(row.quem),
          grupo: toText(row.grupo).toUpperCase(),
          status: norm(row.status).includes("decid") ? "Decidido" : "Pendente",
          resultado: toText(row.resultado),
        };
        const existing = S.state.data.decisions.find((d) => norm(d.pauta) === norm(pauta));
        if (!existing) {
          plan.decisions.push({ isNew: true, data });
          return;
        }
        const changes = [];
        const patch = { id: existing.id };
        ["data", "quem", "grupo", "status", "resultado"].forEach((k) => {
          if (data[k] && String(existing[k] ?? "") !== data[k]) {
            patch[k] = data[k];
            changes.push({ label: S.FIELDS.DECISION_FIELDS[k], from: existing[k], to: data[k] });
          }
        });
        if (changes.length) plan.decisions.push({ isNew: false, data: patch, changes, pauta: existing.pauta });
      });
    }

    return plan;
  }

  /* ---------- Exportação ---------- */
  async function exportWorkbook() {
    const XLSX = await ensureXLSX();
    const S = A.store;
    const { ve, cutoff, isAboveCut } = S.calc;
    const cut = cutoff().value;
    const ranked = [...S.state.data.initiatives].sort((a, b) => ve(b) - ve(a) || b.valor - a.valor);

    const iniRows = ranked.map((it, i) => ({
      Ranking: i + 1,
      ID: it.id,
      Iniciativa: it.nome,
      Área: it.area,
      Valor: it.valor,
      Esforço: it.esforco,
      "V ÷ E": Math.round(ve(it) * 100) / 100,
      "Acima da linha?": isAboveCut(it, cut) ? "Sim" : "Não",
      "Tempo estimado": A.meta.tempoPorEsforco(it.esforco),
      Onda: it.onda,
      Status: it.status,
      Semáforo: it.semaforo,
      "Coluna Kanban": A.meta.COLUNAS.find((c) => c.key === it.coluna)?.label || "",
      Responsável: it.responsavel,
      Prazo: it.prazo,
      Habilitadora: it.enabler ? "Sim" : "",
      Observações: it.observacoes,
    }));
    const decRows = S.state.data.decisions.map((d) => ({
      Data: d.data, "Quem decide": d.quem, Grupo: d.grupo, Descrição: d.pauta, Status: d.status, "O que foi decidido": d.resultado,
    }));
    const histRows = S.state.data.history.map((h) => ({
      "Data/hora": A.util.fmtDateTime(h.ts),
      Pessoa: h.user,
      Ação: h.action,
      Item: h.label,
      Origem: h.source,
      Alterações: (h.changes || []).map((c) => `${c.label}: ${c.from} → ${c.to}`).join(" | "),
    }));

    const wb = XLSX.utils.book_new();
    const add = (rows, name, widths) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "(vazio)": "" }]);
      ws["!cols"] = widths.map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    add(iniRows, "Iniciativas", [8, 6, 60, 12, 7, 8, 7, 14, 16, 9, 14, 10, 18, 14, 14, 12, 50]);
    add(decRows, "Decisoes", [12, 16, 8, 70, 11, 60]);
    add(histRows, "Historico", [17, 12, 10, 50, 10, 80]);

    const resumo = [
      { Indicador: "Linha de corte (Σ Valor ÷ Σ Esforço)", Valor: Math.round(cut * 100) / 100 },
      { Indicador: "Iniciativas acima da linha", Valor: ranked.filter((i) => isAboveCut(i, cut)).length },
      { Indicador: "Em andamento (WIP)", Valor: S.calc.wipCount() },
      { Indicador: "Concluídas", Valor: ranked.filter((i) => i.status === "Concluído").length },
      { Indicador: "Decisões pendentes", Valor: S.state.data.decisions.filter((d) => d.status === "Pendente").length },
      { Indicador: "Exportado em", Valor: A.util.fmtDateTime(new Date().toISOString()) },
    ];
    add(resumo, "Resumo", [38, 20]);

    XLSX.writeFile(wb, `painel_expansao_altamar_${new Date().toISOString().slice(0, 10)}.xlsx`);
    S.markBackup();
    toast("Planilha exportada.");
  }

  A.excel = { buildImportPlan, exportWorkbook };
})();
