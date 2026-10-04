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
    patrocinador: ["patrocinador", "patrocinadorquemcobra"],
    objetivo: ["objetivo"],
    prontoQuando: ["prontoquando"],
    indicador: ["indicadordesucesso", "indicador"],
    investimento: ["investimento", "exigeinvestimento"],
    situacao: ["situacaodocadastro", "situacao"],
    autor: ["autor", "autordaideia", "quemtrouxe"],
    eixo: ["eixo", "eixodonegocio"],
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

  // Aba 2_Atividades da planilha oficial ou aba "Atividades" exportada pelo painel.
  const ACTIVITY_COLUMNS = {
    grupo: ["grupo", "idiniciativa", "iniciativaid"],
    nome: ["atividade", "atividades"],
    pct: ["concluido", "conclusao", "percentualconcluido", "percentual"],
    status: ["status"],
    responsavel: ["responsavelr", "responsavel"],
    aprovador: ["aprovadora", "aprovador"],
    consultados: ["consultadosc", "consultados", "consultado"],
    informados: ["informadosi", "informados", "informado"],
    prazo: ["prazo"],
    observacoes: ["observacoes", "obs"],
    entregavel: ["entregavel", "entregavelprontoquando"],
    envolvidos: ["envolvidos"],
    inicio: ["inicio", "datadeinicio"],
    dependeDe: ["dependede", "dependedeno"],
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

  // Casa o texto da planilha com uma área cadastrada (nome exato, depois aproximações conhecidas).
  function toArea(v) {
    const n = norm(v);
    if (!n) return null;
    const areas = A.store.areas();
    const exact = areas.find((a) => norm(a.key) === n);
    if (exact) return exact.key;
    const guess = [["projet", "Projetos"], ["vend", "Vendas"], ["comerc", "Vendas"], ["market", "Marketing"], ["brand", "Marketing"], ["estrat", "Estratégia"], ["diret", "Estratégia"]]
      .find(([frag, key]) => n.includes(frag) && areas.some((a) => a.key === key));
    return guess ? guess[1] : null;
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
  // Aceita 50, "50%", "50,5" ou 0,5 (célula formatada como porcentagem no Excel).
  function toPct(v) {
    if (v === "" || v == null) return null;
    const n = Number(String(v).replace("%", "").replace(",", ".").trim());
    if (!isFinite(n) || n < 0) return null;
    return Math.min(100, Math.round(n <= 1 ? n * 100 : n));
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

    const actTable = findTable(XLSX, wb, ACTIVITY_COLUMNS,
      (m) => m.grupo != null && m.nome != null,
      /ativid/i);

    if (!iniTable && !decTable && !actTable) {
      throw new Error("Não encontrei as abas esperadas. A planilha precisa de uma tabela com colunas Grupo/ID, Nome, Valor e Esforço (ex.: aba 1_Grupos), Grupo e Atividade (aba 2_Atividades) e/ou Descrição, Quem decide e Status (aba de decisões).");
    }

    const plan = { fileName: file.name, initiatives: [], decisions: [], activities: [], skipped: [], sheets: [], newAreas: [] };

    if (iniTable) {
      plan.sheets.push(iniTable.sheet);
      iniTable.rows.forEach((row) => {
        const id = toText(row.id).toUpperCase();
        const nome = toText(row.nome);
        if (!id || !nome || !/^[A-Z0-9][A-Z0-9_-]{0,11}$/.test(id)) return;

        const incoming = { nome };
        const areaText = toText(row.area);
        let area = toArea(areaText);
        if (!area && areaText) {
          // Área ainda não cadastrada: será criada na importação.
          area = areaText;
          if (!plan.newAreas.includes(area)) plan.newAreas.push(area);
        }
        if (!area) area = S.areas().find((a) => id.startsWith(a.code) && /^\d+$/.test(id.slice(a.code.length)))?.key;
        if (area) incoming.area = area;
        const valor = toNumber(row.valor) ?? toNumber(row.valorSugerido);
        if (valor) incoming.valor = calc.snapFib(valor);
        const esforco = toNumber(row.esforco);
        if (esforco) incoming.esforco = calc.snapEsforco(esforco);
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
        const eixo = toText(row.eixo);
        if (eixo && S.findEixo(eixo)) incoming.eixo = eixo;
        ["objetivo", "prontoQuando", "indicador", "autor"].forEach((k) => {
          const v = toText(row[k]);
          if (v) incoming[k] = v;
        });
        const inv = norm(row.investimento);
        if (inv) incoming.investimento = inv.startsWith("s") ? "Sim" : "Não";
        const sit = toText(row.situacao);
        if (["Rascunho", "Validado", "Aprovado para onda"].includes(sit)) incoming.situacao = sit;

        const existing = S.findInitiative(id);
        if (!existing) {
          plan.initiatives.push({ isNew: true, id, data: { id, valor: 0, esforco: 0, onda: "Fila", ...incoming } });
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

    if (actTable) {
      plan.sheets.push(actTable.sheet);
      const newIds = new Set(plan.initiatives.filter((p) => p.isNew).map((p) => p.id));
      const used = new Set(); // atividades com nome repetido casam uma a uma, na ordem
      actTable.rows.forEach((row) => {
        const iniId = toText(row.grupo).toUpperCase();
        const nome = toText(row.nome).replace(/\s+/g, " ");
        if (!iniId || !nome) return;
        const ini = S.findInitiative(iniId);
        if (!ini && !newIds.has(iniId)) { plan.skipped.push(`${iniId}: ${nome}`); return; }

        const incoming = { nome };
        const status = toStatus(row.status);
        if (status) incoming.status = status;
        const pct = toPct(row.pct);
        if (pct != null) incoming.pct = pct;
        else if (status === "Concluído") incoming.pct = 100;
        const prazo = toText(row.prazo);
        if (prazo) incoming.prazo = prazo;
        const obs = toText(row.observacoes);
        if (obs) incoming.observacoes = obs;
        ["entregavel", "inicio", "dependeDe"].forEach((k) => {
          const v = toText(row[k]);
          if (v) incoming[k] = v;
        });
        // RACI: colunas R/A/C/I (exportação do painel) ou Responsável + Envolvidos (planilhas antigas → R e C).
        const raci = {};
        S.splitNames(toText(row.responsavel)).slice(0, 1).forEach((n) => { raci[n] = "R"; });
        S.splitNames(toText(row.aprovador)).slice(0, 1).forEach((n) => { if (!raci[n]) raci[n] = "A"; });
        S.splitNames(toText(row.consultados)).forEach((n) => { if (!raci[n]) raci[n] = "C"; });
        S.splitNames(toText(row.informados)).forEach((n) => { if (!raci[n]) raci[n] = "I"; });
        S.splitNames(toText(row.envolvidos)).forEach((n) => { if (!raci[n]) raci[n] = "C"; });
        if (Object.keys(raci).length) incoming.raci = raci;

        const existing = ini?.atividades.find((a) => !used.has(a.id) && norm(a.nome) === norm(nome));
        if (!existing) {
          plan.activities.push({ isNew: true, iniId, data: incoming });
          return;
        }
        used.add(existing.id);
        // "Não iniciado"/"A fazer" na planilha é o valor padrão das linhas: não desfaz avanço registrado no painel.
        if (incoming.status === "A fazer" && existing.status !== "A fazer") delete incoming.status;
        const patch = {};
        const changes = [];
        Object.entries(incoming).forEach(([k, v]) => {
          const from = k === "raci" ? S.raciText(existing.raci) : String(existing[k] ?? "");
          const to = k === "raci" ? S.raciText(v) : String(v);
          if (k !== "nome" && from !== to) {
            patch[k] = v;
            changes.push({ label: S.FIELDS.ACTIVITY_FIELDS[k] || k, from, to });
          }
        });
        if (changes.length) plan.activities.push({ isNew: false, iniId, actId: existing.id, data: patch, changes, nome: existing.nome });
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
      "% concluído": S.calc.progress(it) ?? "",
      Atividades: it.atividades.length,
      "Acima da linha?": isAboveCut(it, cut) ? "Sim" : "Não",
      "Tempo estimado": A.meta.tempoPorEsforco(it.esforco),
      Onda: it.onda,
      Status: it.status,
      Semáforo: it.semaforo,
      "Coluna Kanban": A.meta.COLUNAS.find((c) => c.key === it.coluna)?.label || "",
      Responsável: it.responsavel,
      Prazo: it.prazo,
      Habilitadora: it.enabler ? "Sim" : "",
      Objetivo: it.objetivo,
      "Pronto quando": it.prontoQuando,
      "Indicador de sucesso": it.indicador,
      "Investimento?": it.investimento,
      "Situação do cadastro": it.situacao,
      "Autor da ideia": it.autor,
      Eixo: it.eixo,
      "Fase de": it.faseDe,
      Observações: it.observacoes,
    }));
    const actRows = [];
    // Uma linha por atividade, com a RACI em quatro colunas; % gravado como fração (0–1) com formato de porcentagem.
    ranked.forEach((it) => it.atividades.forEach((a, i) => actRows.push({
      Grupo: it.id,
      "Nome do projeto": it.nome,
      "Nº": i + 1,
      Atividade: a.nome,
      Entregável: a.entregavel,
      "Responsável (R)": S.raciPeople(a.raci, "R").join(", "),
      "Aprovador (A)": S.raciPeople(a.raci, "A").join(", "),
      "Consultados (C)": S.raciPeople(a.raci, "C").join(", "),
      "Informados (I)": S.raciPeople(a.raci, "I").join(", "),
      Início: a.inicio,
      Prazo: a.prazo,
      "Depende de": a.dependeDe,
      Status: a.status,
      "% concluído": a.pct / 100,
      Observações: a.observacoes,
      Sprint: a.sprint ? a.sprint.replace("S", "Sprint ") : "",
      Checklist: a.checklist.map((x) => `${x.feito ? "[x]" : "[ ]"} ${x.texto}`).join(" | "),
    })));
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
    add(iniRows, "Iniciativas", [8, 6, 60, 12, 7, 8, 7, 12, 10, 14, 16, 9, 14, 10, 18, 14, 14, 12, 40, 40, 30, 12, 16, 14, 24, 8, 50]);
    add(actRows, "Atividades", [8, 40, 5, 60, 40, 16, 16, 22, 22, 12, 12, 10, 13, 12, 40, 10, 60]);
    // Cadastros (referência; a importação não lê estas abas)
    add(S.areas().map((a) => ({ Área: a.key, Código: a.code, Cor: a.cor })), "Areas", [20, 8, 10]);
    add(S.pessoas().map((p) => ({ Nome: p.nome, Função: p.funcao, Área: p.area, Ativa: p.ativo ? "Sim" : "Não" })), "Pessoas", [20, 24, 16, 8]);
    const wsAct = wb.Sheets["Atividades"];
    const pctCol = Object.keys(actRows[0] || {}).indexOf("% concluído");
    for (let r = 1; r <= actRows.length && pctCol >= 0; r++) {
      const cell = wsAct[XLSX.utils.encode_cell({ r, c: pctCol })];
      if (cell) cell.z = "0%";
    }
    add(decRows, "Decisoes", [12, 16, 8, 70, 11, 60]);
    add(histRows, "Historico", [17, 12, 10, 50, 10, 80]);

    const resumo = [
      { Indicador: "Linha de corte (Σ Valor ÷ Σ Esforço)", Valor: Math.round(cut * 100) / 100 },
      { Indicador: "Iniciativas acima da linha", Valor: ranked.filter((i) => isAboveCut(i, cut)).length },
      { Indicador: "Projetos em andamento", Valor: S.calc.wipCount() },
      { Indicador: "Sprint atual", Valor: S.sprintAtual() ? `Sprint ${S.sprintAtual().numero} (${S.sprintItems().length} atividades)` : "—" },
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
