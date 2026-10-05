/* Domínio: metadados fixos e dados iniciais do projeto de expansão. */
(function () {
  const A = (window.Altamar = window.Altamar || {});

  // Áreas iniciais. A lista definitiva fica nos Cadastros (podem ser criadas novas áreas).
  // Setores do Programa de Expansão, cada um com o seu líder (o "setor" é o que o painel chamava de "área").
  const AREAS = [
    { key: "Projetos de infraestrutura", code: "P", cor: "#0b7285", lider: "Pedro" },
    { key: "Produtos (engenharia mecânica)", code: "PD", cor: "#e67700", lider: "Matheus" },
    { key: "Vendas", code: "V", cor: "#2b8a3e", lider: "Isabela" },
    { key: "Marketing", code: "M", cor: "#6741d9", lider: "Pedro" },
    { key: "Estratégia", code: "E", cor: "#c2410c", lider: "Pedro" },
    { key: "Financeiro", code: "F", cor: "#a61e4d", lider: "Maíra" },
    { key: "Administrativo", code: "AD", cor: "#1971c2", lider: "Bia" },
  ];
  const PESSOAS_INICIAIS = [
    { nome: "Pedro", funcao: "Gestor do programa", area: "Projetos de infraestrutura" },
    { nome: "Maíra", funcao: "Diretoria", area: "Financeiro" },
    { nome: "Shei", funcao: "Diretoria", area: "Estratégia" },
    { nome: "Isabela", funcao: "Líder de Vendas", area: "Vendas" },
    { nome: "Matheus", funcao: "Líder de Produtos (engenharia mecânica)", area: "Produtos (engenharia mecânica)" },
    { nome: "Bia", funcao: "Líder do Administrativo", area: "Administrativo" },
  ];

  const ONDAS = [
    { key: "Onda 1", inicio: "2026-10-01", fim: "2026-12-31", periodo: "Out–Dez/2026", titulo: "Arrumar a casa e gerar receita rápida", descricao: "Processos internos essenciais e conversão rápida de propostas na mesa", color: "var(--area-p)" },
    { key: "Onda 2", inicio: "2027-01-01", fim: "2027-03-31", periodo: "Jan–Mar/2027", titulo: "Ferramentas e produtos que vendem", descricao: "Skids padronizados, parcerias com construtores e esteira de dimensionamento SSV/RAS", color: "var(--area-v)" },
    { key: "Onda 3", inicio: "2027-04-01", fim: "2027-06-30", periodo: "Abr–Jun/2027", titulo: "Escalar e padronizar", descricao: "Oferta de fazenda completa, alinhamento Vendas × Marketing e padronização TAP", color: "var(--area-m)" },
    { key: "Fila", periodo: "Sem data", titulo: "Fila sequencial", descricao: "Aguardando destravamento, capacidade ou investimento prévio", color: "var(--area-q)" },
  ];

  const STATUS = ["A fazer", "Em andamento", "Concluído", "Cancelado"];

  const SEMAFOROS = [
    { key: "verde", label: "Verde", desc: "No prazo / normal" },
    { key: "amarelo", label: "Amarelo", desc: "Atenção / risco" },
    { key: "vermelho", label: "Vermelho", desc: "Atrasado / travado" },
  ];

  // Colunas do Kanban e o status que cada uma implica.
  const COLUNAS = [
    { key: "backlog", label: "Backlog", hint: "Fora do ciclo atual", status: "A fazer" },
    { key: "todo", label: "A fazer no ciclo", hint: "Comprometido neste ciclo", status: "A fazer" },
    { key: "doing", label: "Fazendo", hint: "Em execução", status: "Em andamento" },
    { key: "waiting", label: "Esperando / Travado", hint: "Depende de alguém", status: "Em andamento" },
    { key: "done", label: "Feito", hint: "Concluído", status: "Concluído" },
  ];

  const FIBONACCI = [1, 2, 3, 5, 8];

  // Escalas usadas no Guia e em todas as listas de nota (valor dado pela diretoria, esforço conferido com quem executa).
  const VALOR_ESCALA = {
    1: { curto: "Melhoria pequena", texto: "Melhoria pequena, “seria bom ter”", exemplo: "Padronizar um modelo de e-mail" },
    2: { curto: "Pontual num setor", texto: "Melhora pontual num setor", exemplo: "Organizar a pasta de projetos" },
    3: { curto: "Impacto num setor", texto: "Impacto claro num setor ou ganho indireto de receita", exemplo: "Cases de zoológicos para o site" },
    5: { curto: "Clientes ou receita", texto: "Impacto em clientes, receita ou em vários setores", exemplo: "Formulário padrão de requisitos" },
    8: { curto: "Estratégico", texto: "Estratégico: muda faturamento ou posicionamento", exemplo: "Prospecção por CNAE · oferta de fazenda completa" },
  };
  // Urgência = quanto perdemos se o projeto esperar (entra no WSJF: custo do atraso ÷ esforço).
  const URGENCIA_ESCALA = {
    1: { curto: "Pode esperar", texto: "Sem perda se ficar para o ano que vem" },
    2: { curto: "Melhor logo", texto: "Pequena perda a cada mês de espera" },
    3: { curto: "Este semestre", texto: "Perda clara ou oportunidade de temporada" },
    5: { curto: "Este trimestre", texto: "Cliente, concorrente ou meta do ano dependem disso" },
    8: { curto: "Agora", texto: "Data de contrato, cliente ou evento: prejuízo se atrasar" },
  };
  // Esforço = tempo até a entrega final do projeto (escala própria, de 1 a 5).
  const ESFORCO_PONTOS = [1, 2, 3, 4, 5];
  const ESFORCO_ESCALA = {
    1: { curto: "1 mês", texto: "Entrega em até um mês" },
    2: { curto: "2 meses", texto: "Algumas etapas, pouca dependência de outras áreas" },
    3: { curto: "3 meses", texto: "Um trimestre inteiro" },
    4: { curto: "6 meses", texto: "Dois trimestres: vale dividir em fases" },
    5: { curto: "1 ano", texto: "Investimento, fornecedor externo ou muita incerteza: dividir em fases" },
  };
  // Esforço da escala antiga (1, 2, 3, 5, 8) renumerado nível a nível para a nova (1 a 5), mantendo a proporção entre projetos.
  const ESFORCO_ANTIGO_PARA_NOVO = { 1: 1, 2: 2, 3: 3, 5: 4, 8: 5 };

  // Eixos do negócio: "o que o projeto melhora na Altamar". Cada onda reserva vagas por eixo, e o V÷E
  // compara projetos só dentro do mesmo eixo (assim os de longo prazo não ficam eternamente na fila).
  const EIXOS_PADRAO = [
    { key: "Receita e vendas", icone: "💰", vagas: 3, descricao: "Faturar mais: prospecção, funil, produtos e ofertas" },
    { key: "Gestão e processos", icone: "⚙️", vagas: 2, descricao: "Organizar, padronizar e medir a casa" },
    { key: "Engenharia e ferramentas", icone: "🛠️", vagas: 1, descricao: "Projetar e orçar mais rápido e com menos erro" },
    { key: "Marca e relacionamento", icone: "📣", vagas: 1, descricao: "Ser lembrado, gerar demanda e parcerias" },
    { key: "Novos mercados e inovação", icone: "🌍", vagas: 1, descricao: "Abrir o que ainda não existe: país, setor, P&D" },
  ];
  // Classificação inicial dos projetos (ponto de partida para a reunião com a diretoria).
  const EIXO_INICIAL = {
    V1: "Receita e vendas", V5: "Receita e vendas", V7: "Receita e vendas", M1: "Receita e vendas", V4: "Receita e vendas",
    V2: "Receita e vendas", V3: "Receita e vendas", V6: "Receita e vendas", M3: "Receita e vendas",
    P1: "Gestão e processos", P2: "Gestão e processos", P3: "Gestão e processos", P4: "Gestão e processos", P8: "Gestão e processos",
    P9: "Gestão e processos", E1: "Gestão e processos", E2: "Gestão e processos", V9: "Gestão e processos",
    P5: "Engenharia e ferramentas", P6: "Engenharia e ferramentas", P7: "Engenharia e ferramentas",
    M2: "Marca e relacionamento", M4: "Marca e relacionamento", M5: "Marca e relacionamento", M6: "Marca e relacionamento", M7: "Marca e relacionamento",
    P10: "Novos mercados e inovação", V8: "Novos mercados e inovação", E3: "Novos mercados e inovação", E4: "Novos mercados e inovação",
  };

  // Sprint de 4 semanas (3 sprints por onda) com 5 a 8 atividades; cada onda com até 8 projetos.
  const SPRINT_SEMANAS = 4;
  const SPRINT_MIN_PADRAO = 5;
  const SPRINT_MAX_PADRAO = 8;
  const PROJETOS_POR_ONDA_PADRAO = 8;
  const SPRINTS_POR_ONDA = 3;
  // Colunas do Kanban da sprint (cada card é uma atividade).
  const SPRINT_COLUNAS = [
    { key: "todo", label: "A fazer", hint: "Combinado para este ciclo" },
    { key: "doing", label: "Fazendo", hint: "Em execução" },
    { key: "waiting", label: "Esperando", hint: "Depende de alguém de fora (fornecedor, cliente)" },
    { key: "blocked", label: "Travado", hint: "Parado: precisa de decisão ou ajuda" },
    { key: "done", label: "Feito", hint: "Entregue" },
  ];
  const WIP_MIN = 4;
  const WIP_MAX = 5;
  const PESSOAS = ["Pedro", "Maíra", "Shei"];

  function tempoPorEsforco(esforco) {
    return ESFORCO_ESCALA[esforco]?.curto || "—";
  }
  const DEFAULT_INITIATIVES = [
    { id: "V1", nome: "Lista de prospecção por CNAE e outbound (incl. zoológicos do IBAMA)", area: "Vendas", valor: 8, esforco: 3, onda: "Onda 1", status: "Em andamento", responsavel: "Pedro", prazo: "15/Nov/2026", semaforo: "verde", observacoes: "Base de contatos e scripts frios estruturados" },
    { id: "M1", nome: "Larvicultura de tilápia: base de clientes e divulgação", area: "Marketing", valor: 8, esforco: 3, onda: "Onda 1", status: "Em andamento", responsavel: "Pedro", prazo: "20/Nov/2026", semaforo: "verde", observacoes: "Campanha inicial focada em produtores" },
    { id: "P2", nome: "Quadro de gestão do setor de projetos", area: "Projetos", valor: 5, esforco: 2, onda: "Onda 1", status: "Em andamento", responsavel: "Pedro", prazo: "10/Nov/2026", semaforo: "verde", observacoes: "Quadro físico/digital com pipeline de entregas" },
    { id: "P3", nome: "Organização do setor: papéis e processos com o time", area: "Projetos", valor: 5, esforco: 2, onda: "Onda 1", status: "Em andamento", responsavel: "Pedro", prazo: "12/Nov/2026", semaforo: "amarelo", observacoes: "Ajustando definição de escopo com desenhistas" },
    { id: "V7", nome: "Aproveitar oportunidades que já estão na mesa (ganho rápido)", area: "Vendas", valor: 5, esforco: 2, onda: "Onda 1", status: "Em andamento", responsavel: "Pedro", prazo: "15/Nov/2026", semaforo: "verde", observacoes: "Retomada de propostas enviadas nos últimos 60 dias" },
    { id: "P1", nome: "Formulário padrão de requisitos do cliente", area: "Projetos", valor: 5, esforco: 3, onda: "Onda 1", status: "Em andamento", responsavel: "Pedro", prazo: "30/Nov/2026", semaforo: "amarelo", observacoes: "Minuta criada, aguarda validação com comercial" },

    { id: "V5", nome: "Mapear o funil de vendas e o primeiro contato com IA", area: "Vendas", valor: 5, esforco: 3, onda: "Onda 2", status: "A fazer", responsavel: "A definir", prazo: "Jan/2027", semaforo: "verde", observacoes: "" },
    { id: "P7", nome: "Precificação por complexidade e documentação de preços", area: "Projetos", valor: 8, esforco: 5, onda: "Onda 2", status: "A fazer", responsavel: "A definir", prazo: "Fev/2027", semaforo: "verde", observacoes: "Depende de acesso aos dados de custo" },
    { id: "V2", nome: "Skids padrão para lagos ornamentais e piscinas naturais", area: "Vendas", valor: 8, esforco: 5, onda: "Onda 2", status: "A fazer", responsavel: "A definir", prazo: "Fev/2027", semaforo: "verde", observacoes: "" },
    { id: "M2", nome: "Parceria com construtores de lagos (escovas × tambores)", area: "Marketing", valor: 8, esforco: 5, onda: "Onda 2", status: "A fazer", responsavel: "A definir", prazo: "Mar/2027", semaforo: "verde", observacoes: "Depende de alinhamento de comissionamento" },
    { id: "P5", nome: "Planilha de dimensionamento RAS/SSV e relatório padrão", area: "Projetos", valor: 8, esforco: 8, onda: "Onda 2", status: "A fazer", responsavel: "A definir", prazo: "Mar/2027", semaforo: "verde", observacoes: "Habilitadora técnica: destrava M3", enabler: true },

    { id: "M3", nome: "Oferta de fazenda completa (inclui carcinicultura)", area: "Marketing", valor: 8, esforco: 5, onda: "Onda 3", status: "A fazer", responsavel: "A definir", prazo: "Abr/2027", semaforo: "verde", observacoes: "Necessita da planilha P5 finalizada" },
    { id: "M4", nome: "Cases de zoológicos e centros de reabilitação", area: "Marketing", valor: 3, esforco: 2, onda: "Onda 3", status: "A fazer", responsavel: "A definir", prazo: "Mai/2027", semaforo: "verde", observacoes: "" },
    { id: "E2", nome: "Integração entre Vendas, Marketing e Produtos", area: "Estratégia", valor: 3, esforco: 2, onda: "Onda 3", status: "A fazer", responsavel: "A definir", prazo: "Mai/2027", semaforo: "verde", observacoes: "Reuniões semanais e metas conjuntas" },
    { id: "P4", nome: "Padronizar o fluxo do projeto (TAP, validação por etapas, revisão de entregáveis)", area: "Projetos", valor: 5, esforco: 5, onda: "Onda 3", status: "A fazer", responsavel: "A definir", prazo: "Jun/2027", semaforo: "verde", observacoes: "" },
    { id: "P8", nome: "Meta de crescimento do setor e painel de indicadores", area: "Projetos", valor: 5, esforco: 5, onda: "Onda 3", status: "A fazer", responsavel: "A definir", prazo: "Jun/2027", semaforo: "verde", observacoes: "" },
    { id: "E1", nome: "Plano de crescimento de curto, médio e longo prazo", area: "Estratégia", valor: 5, esforco: 5, onda: "Onda 3", status: "A fazer", responsavel: "A definir", prazo: "Jun/2027", semaforo: "verde", observacoes: "" },

    { id: "V3", nome: "Skids padrão para piscinas comerciais (vem depois do V2)", area: "Vendas", valor: 5, esforco: 5, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "2º Sem/2027", semaforo: "verde", observacoes: "Aguardar maturidade do V2" },
    { id: "V6", nome: "Catálogo de produtos organizado", area: "Vendas", valor: 5, esforco: 5, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "2º Sem/2027", semaforo: "verde", observacoes: "" },
    { id: "P9", nome: "Relatórios auditáveis e cronograma por etapa", area: "Projetos", valor: 3, esforco: 3, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "2º Sem/2027", semaforo: "verde", observacoes: "" },
    { id: "V8", nome: "Investigar novos setores para os produtos", area: "Vendas", valor: 3, esforco: 3, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "2º Sem/2027", semaforo: "verde", observacoes: "" },
    { id: "M5", nome: "Publicação padrão de projetos e mídias sociais", area: "Marketing", valor: 3, esforco: 3, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "2º Sem/2027", semaforo: "verde", observacoes: "" },
    { id: "M6", nome: "Manuais-isca sobre RAS", area: "Marketing", valor: 3, esforco: 3, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "2º Sem/2027", semaforo: "verde", observacoes: "" },
    { id: "P6", nome: "Nova planilha hidráulica (seleção de bombas, perdas de carga)", area: "Projetos", valor: 5, esforco: 8, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "2º Sem/2027", semaforo: "verde", observacoes: "" },
    { id: "P10", nome: "Internacionalização (Chile, Angola, Ásia)", area: "Projetos", valor: 5, esforco: 8, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "2028", semaforo: "verde", observacoes: "" },
    { id: "V4", nome: "Estruturação comercial: consultoria PJ e CRM (exige investimento)", area: "Vendas", valor: 5, esforco: 8, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "A definir", semaforo: "verde", observacoes: "Requer aprovação de teto de investimento" },
    { id: "M7", nome: "Vídeos técnicos (tambores, UV-C, RAS no YouTube)", area: "Marketing", valor: 2, esforco: 5, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "A definir", semaforo: "verde", observacoes: "" },
    { id: "E3", nome: "P&D: dreno para transporte de peixes (exige investimento)", area: "Estratégia", valor: 3, esforco: 8, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "A definir", semaforo: "verde", observacoes: "Aguardando deliberação da diretoria" },
    { id: "E4", nome: "P&D: testes de eficiência e showroom (exige investimento)", area: "Estratégia", valor: 3, esforco: 8, onda: "Fila", status: "A fazer", responsavel: "A definir", prazo: "A definir", semaforo: "verde", observacoes: "Aguardando deliberação da diretoria" },
  ];

  const DEFAULT_DECISIONS = [
    { id: "d1", data: "12/10/2026", quem: "Shei / Maíra", grupo: "M2", pauta: "Definir remuneração e comissionamento da parceria com construtores de lagos (M2)", status: "Pendente", resultado: "Em avaliação modelo de 5% sobre escovas ou desconto escalonado no tambor." },
    { id: "d2", data: "19/10/2026", quem: "Maíra", grupo: "P7", pauta: "Liberar acesso aos dados históricos de custo e margem para P7 (Precificação)", status: "Pendente", resultado: "Aguardando envio dos relatórios contábeis fechados do 3º trimestre para o Pedro." },
    { id: "d3", data: "24/10/2026", quem: "Maíra / Shei", grupo: "V4", pauta: "Aprovar teto orçamentário de investimento para V4, E3 e E4 (P&D e Consultoria Comercial)", status: "Pendente", resultado: "Pauta agendada para a reunião mensal de fechamento estratégico." },
  ];

  A.meta = {
    ONDAS, STATUS, SEMAFOROS, COLUNAS, FIBONACCI, WIP_MIN, WIP_MAX, PESSOAS, tempoPorEsforco,
    VALOR_ESCALA, ESFORCO_ESCALA, ESFORCO_PONTOS, ESFORCO_ANTIGO_PARA_NOVO, SPRINTS_POR_ONDA, SPRINT_SEMANAS,
    SPRINT_MIN_PADRAO, SPRINT_MAX_PADRAO, PROJETOS_POR_ONDA_PADRAO, SPRINT_COLUNAS, EIXOS_PADRAO, EIXO_INICIAL, URGENCIA_ESCALA,
  };
  // Opções de <select> com a descrição da escala ("5 · Clientes ou receita").
  A.meta.valorOptions = (sel, blank = "— A definir —") => `<option value="">${blank}</option>` +
    FIBONACCI.map((f) => `<option value="${f}" ${String(f) === String(sel) ? "selected" : ""}>${f} · ${VALOR_ESCALA[f].curto}</option>`).join("");
  A.meta.urgenciaOptions = (sel, blank = "— A definir —") => `<option value="">${blank}</option>` +
    FIBONACCI.map((f) => `<option value="${f}" ${String(f) === String(sel) ? "selected" : ""}>${f} · ${URGENCIA_ESCALA[f].curto}</option>`).join("");
  A.meta.esforcoOptions = (sel, blank = "— A definir —") => `<option value="">${blank}</option>` +
    ESFORCO_PONTOS.map((f) => `<option value="${f}" ${String(f) === String(sel) ? "selected" : ""}>${f} · ${ESFORCO_ESCALA[f].curto}</option>`).join("");
  A.meta.SETORES_PADRAO = AREAS;
  A.meta.LIMITE_PROJETOS_SETOR = 4; // projetos ativos ao mesmo tempo em cada setor
  A.defaults = { areas: AREAS, pessoas: PESSOAS_INICIAIS, initiatives: DEFAULT_INITIATIVES, decisions: DEFAULT_DECISIONS };

  A.onda = (key) => ONDAS.find((o) => o.key === key) || ONDAS[ONDAS.length - 1];
})();
