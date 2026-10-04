/* Guia: o que é o painel, escalas de valor e esforço, regras e o roteiro das reuniões. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum } = A.util;

  const SECOES = [
    ["guia-o-que-e", "O que é"],
    ["guia-escalas", "Valor e esforço"],
    ["guia-corte", "V÷E e linha de corte"],
    ["guia-eixos", "Eixos"],
    ["guia-ritmo", "Onda e sprint"],
    ["guia-regras", "Regras"],
    ["guia-raci", "RACI"],
    ["guia-abas", "Mapa das abas"],
    ["guia-roteiro", "Reuniões"],
  ];

  function escala(titulo, pergunta, pontos, mapa) {
    return `
      <div class="guia-scale">
        <h4>${titulo}</h4>
        <p class="muted small">${pergunta}</p>
        <ol class="guia-scale-list">
          ${pontos.map((f) => `
            <li>
              <span class="guia-score">${f}</span>
              <span><strong>${esc(mapa[f].curto)}</strong><br><span class="muted small">${esc(mapa[f].texto)}${mapa[f].exemplo ? ` · ex.: ${esc(mapa[f].exemplo)}` : ""}</span></span>
            </li>`).join("")}
        </ol>
      </div>`;
  }

  const passo = (n, titulo, corpo, aba) => `
    <li class="guia-step">
      <span class="guia-step-n">${n}</span>
      <div>
        <strong>${titulo}</strong>
        <div class="muted">${corpo}</div>
        ${aba ? `<button class="btn btn-xs btn-outline no-print" data-action="go-tab" data-tab="${aba[0]}">Abrir ${aba[1]} →</button>` : ""}
      </div>
    </li>`;

  const reuniao = (icone, nome, quando, duracao, objetivo, passos) => `
    <div class="guia-meeting">
      <div class="guia-meeting-head">
        <span class="guia-meeting-ico" aria-hidden="true">${icone}</span>
        <div><h4>${nome}</h4><div class="muted small">${quando}</div></div>
        <span class="guia-meeting-dur">${duracao}</span>
      </div>
      <p class="guia-meeting-goal">${objetivo}</p>
      <ol class="guia-steps">${passos.join("")}</ol>
    </div>`;

  A.views.guia = function (S) {
    const el = document.getElementById("guia-root");
    if (!el) return;
    const { min, max } = S.calc.sprintLimites();
    const porOnda = S.calc.projetosPorOnda();
    const cut = S.calc.cutoff();

    el.innerHTML = `
      <div class="guia">
        <nav class="guia-nav no-print" aria-label="Seções do guia">
          ${SECOES.map(([id, t]) => `<a href="#${id}" data-guia-link="${id}">${t}</a>`).join("")}
        </nav>
        <div class="guia-body">

          <section class="panel guia-sec" id="guia-o-que-e">
            <h3>O que é este painel</h3>
            <p>É o lugar onde as ideias de melhoria e expansão da Altamar viram projetos com dono, prazo e prioridade.
            Toda ideia passa pelo mesmo caminho:</p>
            <div class="guia-flow">
              <span>💡 Ideia</span><span>→</span><span>📝 Triagem<br><small>valor e esforço</small></span><span>→</span>
              <span>🎯 Priorização<br><small>V÷E</small></span><span>→</span><span>🌊 Onda<br><small>trimestre</small></span><span>→</span>
              <span>📋 Sprint<br><small>atividades do mês</small></span><span>→</span><span>✅ Feito</span>
            </div>
            <p class="muted small">Quem trouxe a ideia fica registrado como <strong>autor</strong>. Tudo o que muda fica no Histórico, com nome e data.</p>
          </section>

          <section class="panel guia-sec" id="guia-escalas">
            <h3>Como dar valor e esforço</h3>
            <p><strong>Valor</strong> é o quanto o projeto ajuda a Altamar, de 1 (melhoria pequena) a 8 (estratégico). A escala pula de 3 para 5 e de 5 para 8 de propósito:
            assim a conversa é “é importante ou é estratégico?”, e não “é 6 ou 7?”.</p>
            <p><strong>Esforço</strong> é o tempo até a entrega final do projeto, de 1 (um mês) a 5 (um ano).</p>
            <div class="guia-scales">
              ${escala("Valor", "Quanto isso ajuda a Altamar?", A.meta.FIBONACCI, A.meta.VALOR_ESCALA)}
              ${escala("Esforço", "Quanto tempo até a entrega final?", A.meta.ESFORCO_PONTOS, A.meta.ESFORCO_ESCALA)}
            </div>
            <p class="muted small">Na dúvida entre duas notas, escolha a maior para o esforço e a menor para o valor. Projeto de 6 meses ou 1 ano: vale dividir em fases, com uma entrega por trimestre. Ideia sem nota fica como “a definir” na Triagem.</p>
          </section>

          <section class="panel guia-sec" id="guia-corte">
            <h3>V÷E e linha de corte</h3>
            <p><strong>V÷E</strong> = valor dividido pelo esforço: quanto retorno cada mês de trabalho traz.
            Exemplo: valor 5 em 1 mês dá <strong>5,0</strong>; valor 8 em 1 ano (esforço 5) dá <strong>1,6</strong>.
            O primeiro vem antes, mesmo valendo menos, porque entrega mais rápido.</p>
            <p>A <strong>linha de corte</strong> é a média ponderada de todos os projetos: Σ Valor ÷ Σ Esforço.
            Hoje ela está em <strong>${fmtNum(cut.value)}</strong> (${cut.sumValor} ÷ ${cut.sumEsforco}).
            Quem está acima da linha é candidato natural às primeiras ondas; quem está abaixo precisa de um bom motivo
            (por exemplo, destravar outro projeto) e esse motivo deve ficar escrito nas observações.</p>
          </section>

          <section class="panel guia-sec" id="guia-eixos">
            <h3>Eixos: o que o projeto melhora na Altamar</h3>
            <p>O V÷E sozinho sempre favorece o que é rápido. Se toda ideia competir com todas, os projetos que levam tempo
            (abrir um mercado, montar uma estrutura comercial) nunca entram em pauta. Por isso cada projeto tem um <strong>eixo</strong>,
            e <strong>cada onda reserva vagas para cada eixo</strong>.</p>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Eixo</th><th>O que melhora</th><th class="num">Vagas por onda</th></tr></thead>
                <tbody>${S.eixos().map((e) => `<tr><td class="nowrap"><strong>${esc(e.icone)} ${esc(e.key)}</strong></td><td>${esc(e.descricao)}</td><td class="num"><strong>${e.vagas}</strong></td></tr>`).join("")}</tbody>
              </table>
            </div>
            <ul class="guia-rules" style="margin-top:0.7rem">
              <li><strong>O V÷E compara só dentro do eixo.</strong> A internacionalização compete com outros projetos de novos mercados, não com um ganho rápido de vendas. Na Priorização, cada eixo tem sua aba e sua linha de corte.</li>
              <li><strong>As vagas garantem espaço para todos os eixos.</strong> Em toda onda, o melhor projeto de cada eixo entra, mesmo que o V÷E dele seja baixo comparado ao resto.</li>
              <li><strong>Projeto longo começa por uma fase.</strong> Esforço de 6 meses ou 1 ano: na Triagem, use “✂ Fase” para criar uma primeira entrega menor (diagnóstico, piloto), que ocupa a vaga e mostra resultado no trimestre.</li>
              <li><strong>O eixo não é a área.</strong> A área diz quem executa; o eixo diz o que melhora. Eixos e vagas se ajustam em ⚙️ Dados → Cadastros e capacidade.</li>
            </ul>
          </section>

          <section class="panel guia-sec" id="guia-ritmo">
            <h3>Onda e sprint: qual a diferença</h3>
            <div class="guia-ritmo">
              <div><span class="guia-ritmo-tag">🌊 Onda</span><strong>Trimestre</strong><span class="muted small">Decide <em>quais projetos</em> entram nos próximos 3 meses. Até ${porOnda} projetos por onda, distribuídos pelas vagas de cada eixo.</span></div>
              <div><span class="guia-ritmo-tag">📋 Sprint</span><strong>4 semanas</strong><span class="muted small">Decide <em>quais atividades</em> desses projetos andam neste mês. De ${min} a ${max} atividades. São 3 sprints por onda.</span></div>
              <div><span class="guia-ritmo-tag">✔️ Checklist</span><strong>Dia a dia</strong><span class="muted small">Os passos de cada atividade. Marcar os itens atualiza o % da atividade e do projeto.</span></div>
            </div>
            <p class="muted small">Projeto na Onda 1 ainda não quer dizer “em execução”: ele entra em execução quando alguma atividade dele é colocada na sprint e começa a andar no Kanban.</p>
          </section>

          <section class="panel guia-sec" id="guia-regras">
            <h3>Regras do jogo</h3>
            <ul class="guia-rules">
              <li><strong>Sprint de 4 semanas com ${min} a ${max} atividades.</strong> O Kanban mostra só as atividades da sprint. Ao fim, o que não terminou passa para a próxima.</li>
              <li><strong>Até ${porOnda} projetos por onda, divididos por eixo.</strong> Onda 1, 2 e 3 são os próximos trimestres; a Fila é o que ainda não tem data. Os limites se ajustam em ⚙️ Dados → Cadastros e capacidade.</li>
              <li><strong>Semáforo.</strong> 🟢 no prazo · 🟡 atenção, precisa de alinhamento · 🔴 travado, precisa de decisão.</li>
              <li><strong>Situação do cadastro.</strong> <span class="badge warn">Rascunho</span> acabou de entrar ·
                <span class="badge ok">Validado</span> passou pela triagem. Rascunho pode ser excluído; depois de validado, use o status Cancelado.
                Em que trimestre o projeto entra é decidido na aba Ondas.</li>
            </ul>
          </section>

          <section class="panel guia-sec" id="guia-raci">
            <h3>RACI: quem faz o quê em cada atividade</h3>
            <div class="guia-raci">
              <div><span class="raci-tag raci-R">R</span><strong>Responsável</strong><span class="muted small">Executa. Exatamente 1 por atividade.</span></div>
              <div><span class="raci-tag raci-A">A</span><strong>Aprovador</strong><span class="muted small">Dá o ok final. No máximo 1.</span></div>
              <div><span class="raci-tag raci-C">C</span><strong>Consultado</strong><span class="muted small">Opina antes de fazer.</span></div>
              <div><span class="raci-tag raci-I">I</span><strong>Informado</strong><span class="muted small">Fica sabendo depois.</span></div>
            </div>
          </section>

          <section class="panel guia-sec" id="guia-abas">
            <h3>Mapa das abas</h3>
            <div class="guia-map">
              ${[
                ["executivo", "📊 Painel executivo", "Resumo do dia: o que resolver, sprint e agenda de 2 semanas."],
                ["triagem", "📝 Triagem", "Toda ideia nova entra aqui. Dar valor, esforço e validar."],
                ["priorizacao", "🎯 Priorização", "Matriz e ranking por V÷E, lado a lado, com o que está na sprint."],
                ["ondas", "🌊 Ondas", "Em que trimestre cada projeto entra."],
                ["kanban", "📋 Kanban", "Só as atividades da sprint. Clique no card para ver a atividade e o checklist."],
                ["overview", "🗓️ Cronograma", "Linha do tempo de todos os projetos, por área."],
                ["decisoes", "⚖️ Decisões", "Pauta e decisões da diretoria."],
                ["historico", "🕘 Histórico", "Quem mudou o quê e quando."],
              ].map(([tab, t, d]) => `<button class="guia-map-item" data-action="go-tab" data-tab="${tab}"><strong>${t}</strong><span class="muted small">${d}</span></button>`).join("")}
            </div>
          </section>

          <section class="panel guia-sec" id="guia-roteiro">
            <h3>Reuniões</h3>
            <p class="muted">São três ritmos: a semanal (rápida, só acompanhamento), a de sprint (uma vez por mês, para planejar) e a trimestral (para montar a onda).
            Antes de tudo, uma reunião única de triagem para dar nota às ideias.</p>

            ${reuniao("⚡", "Reunião semanal de acompanhamento", "Toda quinta, com a Maíra", "15 min",
              "Só acompanhar: o que andou, o que travou e o que precisa de decisão. Não é lugar de replanejar. Se a reunião não acontecer, a Maíra recebe o boletim da semana com as mesmas informações (botão 📨 Boletim, no topo do painel).",
              [
                passo(1, "O que foi feito (5 min)", "Atividades que foram para “Feito” na semana e itens de checklist concluídos.", ["kanban", "Kanban"]),
                passo(2, "O que está travado (5 min)", "Coluna “Esperando / Travado” e semáforos vermelhos: o que falta e de quem depende.", ["kanban", "Kanban"]),
                passo(3, "Decisões (5 min)", "Pendências que só a diretoria resolve. Registrar o que foi decidido.", ["decisoes", "Decisões"]),
              ])}

            ${reuniao("🗓️", "Reunião de sprint", "A cada 4 semanas, no fim da sprint", "60 min",
              `Fechar a sprint que acabou e combinar a próxima: de ${min} a ${max} atividades, com responsável e checklist.`,
              [
                passo(1, "Fechar a sprint (15 min)", "O que foi entregue, o que não foi e por quê. O que ficou pendente passa sozinho para a próxima sprint ao clicar em “Encerrar e abrir”.", ["kanban", "Kanban"]),
                passo(2, "Ideias novas (10 min)", "Triagem, filtro “A triar”: dar valor e esforço às ideias que chegaram no mês.", ["triagem", "Triagem"]),
                passo(3, "Planejar a próxima sprint (30 min)", `Em “Planejar sprint”, escolher de ${min} a ${max} atividades dos projetos da onda atual, conferir o responsável (R) e escrever o objetivo da sprint.`, ["kanban", "Kanban"]),
                passo(4, "Decisões (5 min)", "O que precisa da diretoria para a sprint andar.", ["decisoes", "Decisões"]),
              ])}

            ${reuniao("🌊", "Reunião trimestral", "A cada 3 sprints, na virada da onda", "90 min",
              `Olhar o trimestre que passou e montar a próxima onda com até ${porOnda} projetos.`,
              [
                passo(1, "Fechar a onda (20 min)", "O que foi concluído, o que continua e o que volta para a Fila.", ["ondas", "Ondas"]),
                passo(2, "Revisar notas (20 min)", "Projetos da Fila e das próximas ondas: o valor ou o esforço mudou com o que aprendemos?", ["triagem", "Triagem"]),
                passo(3, "Montar a próxima onda (40 min)", "Na Priorização, eixo por eixo: os melhores V÷E de cada eixo ocupam as vagas dele. Depois, arrastar na aba Ondas.", ["priorizacao", "Priorização"]),
                passo(4, "Calibrar a capacidade (10 min)", "Comparar o que foi entregue com o planejado e ajustar os limites em ⚙️ Dados → Cadastros e capacidade.", ["cadastros", "Cadastros"]),
              ])}

            ${reuniao("📝", "1ª reunião: triagem com a Maíra", "Uma vez, para começar", "90 min",
              "Dar nota a todas as ideias, validar as que fazem sentido e montar a Onda 1 e a Sprint 1.",
              [
                passo(1, "Combinar as escalas (10 min)", "Leiam juntos “Como dar valor e esforço” e ajustem as descrições se algo não fizer sentido."),
                passo(2, "Dar nota a todas as ideias (45 min)", "Na Triagem, filtro “A triar”: primeiro o eixo, depois o valor e o esforço, no máximo 2 minutos por ideia. Se travar, deixe “a definir” e siga.", ["triagem", "Triagem"]),
                passo(3, "Validar ou descartar (10 min)", "O que faz sentido vira “Validado”; o que não faz, exclua (rascunho) ou cancele.", ["triagem", "Triagem"]),
                passo(4, "Montar a Onda 1 (15 min)", "Na Priorização, eixo por eixo, os melhores V÷E ocupam as vagas do eixo. Arraste-os para a Onda 1 na aba Ondas.", ["ondas", "Ondas"]),
                passo(5, "Planejar a Sprint 1 (10 min)", `Escolher de ${min} a ${max} atividades dos projetos da Onda 1.`, ["kanban", "Kanban"]),
              ])}
          </section>
        </div>
      </div>`;
  };

  // Links internos do índice: rolam até a seção sem trocar a rota.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-guia-link]");
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.guiaLink)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
