/* Domínio: metadados fixos e dados iniciais do projeto de expansão. */
(function () {
  const A = (window.Altamar = window.Altamar || {});

  // Áreas iniciais. A lista definitiva fica nos Cadastros (podem ser criadas novas áreas).
  const AREAS = [
    { key: "Projetos", code: "P", cor: "#0b7285" },
    { key: "Vendas", code: "V", cor: "#2b8a3e" },
    { key: "Marketing", code: "M", cor: "#6741d9" },
    { key: "Estratégia", code: "E", cor: "#c2410c" },
  ];
  const PESSOAS_INICIAIS = [
    { nome: "Pedro", funcao: "Gestor de projetos", area: "Projetos" },
    { nome: "Maíra", funcao: "Diretoria", area: "Estratégia" },
    { nome: "Shei", funcao: "Diretoria", area: "Estratégia" },
  ];

  const ONDAS = [
    { key: "Onda 1", periodo: "Out–Dez/2026", titulo: "Arrumar a casa e gerar receita rápida", descricao: "Processos internos essenciais e conversão rápida de propostas na mesa", color: "var(--area-p)" },
    { key: "Onda 2", periodo: "Jan–Mar/2027", titulo: "Ferramentas e produtos que vendem", descricao: "Skids padronizados, parcerias com construtores e esteira de dimensionamento SSV/RAS", color: "var(--area-v)" },
    { key: "Onda 3", periodo: "Abr–Jun/2027", titulo: "Escalar e padronizar", descricao: "Oferta de fazenda completa, alinhamento Vendas × Marketing e padronização TAP", color: "var(--area-m)" },
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
    { key: "backlog", label: "Backlog", hint: "Fora da sprint atual", status: "A fazer" },
    { key: "todo", label: "A fazer na sprint", hint: "Comprometido nesta sprint", status: "A fazer" },
    { key: "doing", label: "Fazendo", hint: "Em execução", status: "Em andamento" },
    { key: "waiting", label: "Esperando / Travado", hint: "Depende de alguém", status: "Em andamento" },
    { key: "done", label: "Feito", hint: "Concluído", status: "Concluído" },
  ];

  const FIBONACCI = [1, 2, 3, 5, 8];
  const WIP_MIN = 4;
  const WIP_MAX = 5;
  const PESSOAS = ["Pedro", "Maíra", "Shei"];

  // Mesma regra da planilha (coluna "Tempo estimado").
  function tempoPorEsforco(esforco) {
    return { 1: "1 semana", 2: "2 semanas", 3: "1 mês", 5: "2 meses", 8: "3 meses ou mais" }[esforco] || "—";
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

  A.meta = { ONDAS, STATUS, SEMAFOROS, COLUNAS, FIBONACCI, WIP_MIN, WIP_MAX, PESSOAS, tempoPorEsforco };
  A.defaults = { areas: AREAS, pessoas: PESSOAS_INICIAIS, initiatives: DEFAULT_INITIATIVES, decisions: DEFAULT_DECISIONS };

  A.onda = (key) => ONDAS.find((o) => o.key === key) || ONDAS[ONDAS.length - 1];
})();
