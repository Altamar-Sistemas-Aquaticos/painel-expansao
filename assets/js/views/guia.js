/* Guia: duas versões. Gestor e diretoria veem o guia completo do programa;
   cada líder de setor vê só o que usa (Programa, Kanban do setor e como atualizar), sem jargão. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum } = A.util;

  const indice = (secoes) => `
    <nav class="guia-nav no-print" aria-label="Seções do guia">
      ${secoes.map(([id, t]) => `<a href="#${id}" data-guia-link="${id}">${t}</a>`).join("")}
    </nav>`;

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

  // Exemplos de códigos com as siglas reais dos setores cadastrados.
  function secaoCodigos(S) {
    const ex = S.areas().slice(0, 4).map((a) => `<li><span class="guia-cod" style="--ac:${a.cor}">${esc(a.code)}1</span> = 1º projeto cadastrado em <strong>${esc(a.key)}</strong></li>`).join("");
    return `
      <h3>Como ler os códigos (V1, M3, P10…)</h3>
      <p>Cada projeto tem um código: <strong>as letras dizem o setor</strong> e <strong>o número é a ordem em que ele foi cadastrado</strong>.
      O número <strong>não é prioridade</strong> nem importância: o V5 não é mais nem menos importante que o V1, só foi cadastrado depois.</p>
      <ul class="guia-cods">${ex}</ul>
      <p class="muted small">A cor do código também é a cor do setor, a mesma da tela Programa.</p>`;
  }

  const termos = (porLider) => `
    <div class="table-wrap">
      <table class="data guia-termos">
        <thead><tr><th>Palavra</th><th>O que é</th><th>Exemplo</th></tr></thead>
        <tbody>
          ${porLider ? "" : `<tr><td><strong>Onda</strong></td><td>Os projetos escolhidos para um trimestre</td><td>Onda 1 = out a dez</td></tr>`}
          <tr><td><strong>Ciclo</strong></td><td>Um mês de trabalho. Em outras empresas se chama <em>sprint</em></td><td>Ciclo de novembro: 1 a 30/11</td></tr>
          <tr><td><strong>Projeto</strong></td><td>Uma melhoria com começo, fim e um resultado</td><td>V1 · Lista de prospecção</td></tr>
          <tr><td><strong>Etapa</strong></td><td>Uma tarefa do projeto. Cada card do Kanban é uma etapa</td><td>“Levantar 50 contatos de zoológicos”</td></tr>
          <tr><td><strong>Checklist</strong></td><td>Os passos de uma etapa, que você marca conforme faz</td><td>☑ Montar planilha · ☐ Validar com o Pedro</td></tr>
          <tr><td><strong>Responsável (R)</strong></td><td>Quem faz a etapa. Cada etapa tem um só</td><td>R: Isabela</td></tr>
          <tr><td><strong>Travado</strong></td><td>Etapa parada esperando alguém ou uma decisão</td><td>“Aguardando o orçamento do fornecedor”</td></tr>
          <tr><td><strong>Prazo</strong></td><td>Até quando a etapa precisa estar pronta</td><td>15/11/2026</td></tr>
        </tbody>
      </table>
    </div>`;

  /* ---------- Guia do líder ---------- */
  function guiaLider(S, v) {
    const setores = v.setores.length ? v.setores.join(" e ") : "o seu setor";
    const meu = S.areas().find((a) => v.setores.includes(a.key)) || { cor: "#2b8a3e", code: "V" };
    return `
      <div class="guia">
        ${indice([["gl-programa", "O programa"], ["gl-papel", "Seu papel"], ["gl-codigos", "Os códigos"], ["gl-palavras", "Palavras"], ["gl-semana", "Toda semana"], ["gl-card", "Atualizar um card"], ["gl-travou", "Quando travar"]])}
        <div class="guia-body">
          <section class="panel guia-sec" id="gl-programa">
            <h3>O Programa de Expansão</h3>
            <p>É o conjunto de projetos que vão fazer a Altamar crescer e funcionar melhor. Cada setor cuida dos seus projetos, e o
            <strong>Pedro</strong> acompanha o programa inteiro junto com a diretoria (<strong>Maíra e Shei</strong>).</p>
            <p>Na aba <strong>🧭 Programa</strong> você vê todos os setores em volta da Altamar e quantos projetos cada um tem em andamento.</p>
            <button class="btn btn-xs btn-outline no-print" data-action="go-tab" data-tab="programa">Abrir o Programa →</button>
          </section>

          <section class="panel guia-sec" id="gl-papel">
            <h3>Seu papel como líder de ${esc(setores)}</h3>
            <ul class="guia-rules">
              <li><strong>Manter o Kanban do seu setor em dia</strong>: cada card mostra uma etapa e onde ela está (a fazer, fazendo, travado ou feito).</li>
              <li><strong>Quebrar cada etapa em passos</strong> (checklist) e ir marcando o que foi feito.</li>
              <li><strong>Avisar quando algo travar</strong>, escrevendo o motivo no card.</li>
              <li><strong>Quais projetos entram em cada mês</strong> é decisão do Pedro com a diretoria. Se tiver opinião ou ideia de projeto, fale com o Pedro.</li>
            </ul>
          </section>

          <section class="panel guia-sec" id="gl-codigos">${secaoCodigos(S)}</section>

          <section class="panel guia-sec" id="gl-palavras">
            <h3>Palavras que vamos usar</h3>
            ${termos(true)}
          </section>

          <section class="panel guia-sec" id="gl-semana">
            <h3>Toda semana: uns 10 minutos</h3>
            <ol class="guia-steps">
              ${passo(1, "Abra o Kanban", "Você vê só os cards do seu setor.", ["kanban", "Kanban"])}
              ${passo(2, "Marque os passos que foram feitos", "No card, clique no ☐ ou abra o card e marque o checklist. A porcentagem sobe sozinha.")}
              ${passo(3, "Mova os cards", "Começou? Mova para “Fazendo”. Terminou? Para “Feito”. Dá para arrastar ou usar a seta → do card.")}
              ${passo(4, "Travou? Avise", "Use o ⚠ do card e escreva o motivo. O Pedro vê na hora.")}
            </ol>
          </section>

          <section class="panel guia-sec" id="gl-card">
            <h3>Como atualizar um card</h3>
            <div class="guia-card-demo">
              <div class="guia-card-ex" style="--ac:${esc(meu.cor)}">
                <div class="guia-card-top"><span class="guia-cod" style="--ac:${esc(meu.cor)}">${esc(meu.code)}1</span><span class="act-av">${esc(A.util.initials(v.nome || "Você"))}</span></div>
                <strong>Levantar 50 contatos de zoológicos</strong>
                <div class="guia-card-bottom"><span class="act-ring" style="--p:40"><b>40</b></span><span class="muted small">☑ 2/5</span><span class="guia-card-btns"><b>☐</b><b>⚠</b><b>→</b></span></div>
              </div>
              <ul class="guia-rules">
                <li><strong>Código e cor</strong>: o projeto e o setor da etapa.</li>
                <li><strong>Bolinha com iniciais</strong>: quem é o responsável.</li>
                <li><strong>Anel</strong>: quanto da etapa já foi feito. <strong>☑ 2/5</strong>: passos do checklist.</li>
                <li><strong>☐</strong> marca o próximo passo · <strong>⚠</strong> avisa que travou · <strong>→</strong> passa para a próxima coluna.</li>
                <li>Clicando no card, você vê tudo: prazo, checklist completo e observações.</li>
              </ul>
            </div>
          </section>

          <section class="panel guia-sec" id="gl-travou">
            <h3>Quando travar ou tiver dúvida</h3>
            <ul class="guia-rules">
              <li>Marque o card como <strong>travado (⚠)</strong> e escreva o que falta e de quem depende.</li>
              <li>Se precisar de uma decisão, de verba ou de outra área, <strong>fale com o Pedro</strong>. Ele leva para a diretoria.</li>
              <li>Prazo que não vai dar? Avise antes de vencer. Um prazo combinado de novo é melhor que um prazo estourado.</li>
            </ul>
          </section>
        </div>
      </div>`;
  }

  /* ---------- Guia do gestor e da diretoria ---------- */
  function guiaGestor(S) {
    const cut = S.calc.cutoff();
    const limite = A.meta.LIMITE_PROJETOS_SETOR;
    return `
      <div class="guia">
        ${indice([["guia-programa", "Programa e projeto"], ["guia-setores", "Setores e líderes"], ["guia-termos", "Onda, ciclo, etapa"], ["guia-codigos", "Os códigos"],
          ["guia-escalas", "Valor e esforço"], ["guia-corte", "V÷E e custo do atraso"], ["guia-deps", "Dependências"], ["guia-abaixo", "Abaixo da linha"], ["guia-regras", "Regras"], ["guia-raci", "RACI"], ["guia-abas", "Mapa das abas"], ["guia-roteiro", "Reuniões"]])}
        <div class="guia-body">

          <section class="panel guia-sec" id="guia-programa">
            <h3>Programa e projeto: qual a diferença</h3>
            <p>O <strong>Programa de Expansão</strong> é o conjunto de todos os projetos que fazem a Altamar crescer e melhorar.
            O <strong>Pedro</strong> é o gestor do programa e, com a <strong>diretoria</strong> (Maíra e Shei), decide quais projetos andam em cada ciclo.
            Cada <strong>projeto</strong> pertence a um setor, e quem cuida do dia a dia dele é o <strong>líder do setor</strong>.</p>
            <div class="guia-flow">
              <span>💡 Ideia</span><span>→</span><span>📝 Triagem<br><small>valor e esforço</small></span><span>→</span>
              <span>🎯 Priorização<br><small>por setor</small></span><span>→</span><span>📋 Ciclo<br><small>até ${limite} por setor</small></span><span>→</span>
              <span>✅ Feito</span>
            </div>
            <p class="muted small">Tudo o que muda fica no Histórico, com nome, data e hora de quem mudou.</p>
          </section>

          <section class="panel guia-sec" id="guia-setores">
            <h3>Setores e líderes</h3>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Setor</th><th>Código</th><th>Líder</th></tr></thead>
                <tbody>${S.areas().map((a) => `<tr><td><span class="pr-tab-cor" style="--ac:${a.cor};display:inline-block"></span> <strong>${esc(a.key)}</strong></td><td>${esc(a.code)}</td><td>${esc(a.lider || "—")}</td></tr>`).join("")}</tbody>
              </table>
            </div>
            <p class="muted small">Cada líder entra no painel e vê só o Kanban do próprio setor, o Programa e um guia simplificado. Os líderes não dão notas nem escolhem projetos.</p>
          </section>

          <section class="panel guia-sec" id="guia-termos">
            <h3>Onda, ciclo, etapa e checklist</h3>
            ${termos(false)}
            <p class="muted small">Um projeto longo (6 meses, 1 ano) fica no ciclo até terminar: não precisa ser escolhido de novo todo mês. A cada mês ele se compromete só com as etapas daquele mês.</p>
          </section>

          <section class="panel guia-sec" id="guia-codigos">${secaoCodigos(S)}</section>

          <section class="panel guia-sec" id="guia-escalas">
            <h3>Como dar valor e esforço</h3>
            <p><strong>Valor</strong> é o quanto o projeto ajuda a Altamar, de 1 (melhoria pequena) a 8 (estratégico). A escala pula de 3 para 5 e de 5 para 8 de propósito:
            a conversa fica “é importante ou é estratégico?”, e não “é 6 ou 7?”. <strong>Esforço</strong> é o tempo até a entrega final, de 1 (um mês) a 5 (um ano).</p>
            <div class="guia-scales">
              ${escala("Valor", "Quanto isso ajuda a Altamar?", A.meta.FIBONACCI, A.meta.VALOR_ESCALA)}
              ${escala("Esforço", "Quanto tempo até a entrega final?", A.meta.ESFORCO_PONTOS, A.meta.ESFORCO_ESCALA)}
            </div>
            <h4>Valor pelos círculos de impacto</h4>
            <p>Na dúvida, pense em <strong>até onde o projeto chega</strong>: só uma tarefa, um setor, os clientes e a receita, ou o futuro da empresa.
            Na Triagem, o botão 🎯 ao lado do valor abre estes círculos para escolher clicando.</p>
            <div class="impacto-wrap">
              ${A.impacto.svg(null)}
              <ul class="impacto-legenda">${[1, 2, 3, 5, 8].map((v) => `<li><strong>${v}</strong><span><b>${esc(A.meta.VALOR_ESCALA[v].curto)}</b><br><span class="muted small">${esc(A.meta.VALOR_ESCALA[v].texto)}</span></span></li>`).join("")}</ul>
            </div>
          </section>

          <section class="panel guia-sec" id="guia-corte">
            <h3>V÷E e linha de corte</h3>
            <p><strong>V÷E</strong> = valor dividido pelo esforço: quanto retorno cada mês de trabalho traz. Valor 5 em 1 mês dá <strong>5,0</strong>;
            valor 8 em 1 ano dá <strong>1,6</strong>. A <strong>linha de corte</strong> é a média ponderada (Σ Valor ÷ Σ Esforço), hoje
            <strong>${fmtNum(cut.value)}</strong>. Na Priorização, cada setor tem a sua própria linha, comparando projetos parecidos entre si.</p>
            <h4>Segunda opinião: custo do atraso (WSJF)</h4>
            <p><strong>WSJF</strong> vem do inglês <em>Weighted Shortest Job First</em>: “primeiro o trabalho mais curto, pesado pelo que se perde esperando”.
            É uma ferramenta do método ágil (SAFe) para responder a uma pergunta que o V÷E não responde: <strong>o que custa mais caro deixar para depois?</strong>
            No painel ela aparece com o nome <strong>custo do atraso</strong>, na Priorização, em <em>Ordenar por: Custo do atraso</em>.</p>
            <p class="guia-formula"><strong>Custo do atraso = Valor + Urgência + Destrava</strong><br>
            <strong>Ordem = Custo do atraso ÷ Esforço</strong></p>
            <ul class="guia-rules">
              <li><strong>Valor</strong>: a mesma nota da Triagem (quanto o projeto ajuda a Altamar).</li>
              <li><strong>Urgência</strong>: quanto se perde a cada mês de espera. Nota dada na Triagem:
                ${Object.entries(A.meta.URGENCIA_ESCALA).map(([k, v]) => `<strong>${k}</strong> ${esc(v.curto)}`).join(" · ")}.</li>
              <li><strong>Destrava</strong>: calculado sozinho pelo painel. Conta quantos projetos <strong>ainda não terminados</strong> estão esperando por este
                (os que têm este projeto na seção 🔗 Dependências da ficha). Quanto mais gente parada esperando, mais caro é atrasar este projeto:
                <strong>nenhum</strong> = 0 · <strong>um</strong> = 2 · <strong>dois</strong> = 3 · <strong>três ou mais</strong> = 5.</li>
            </ul>
            <p><strong>Exemplo:</strong> P3 tem valor 3, urgência 5 (este trimestre) e dois projetos esperando por ele (destrava 3). Custo do atraso = 3 + 5 + 3 = <strong>11</strong>.
            Com esforço 2, a ordem fica 11 ÷ 2 = <strong>5,5</strong>. No V÷E ele daria só 3 ÷ 2 = 1,5: parece pouco importante, mas atrasá-lo trava outros projetos.</p>
            <p>Use as duas ordens na reunião: se um projeto sobe muito no custo do atraso, é sinal de que esperar vai sair caro, mesmo com o V÷E baixo.</p>
          </section>

          <section class="panel guia-sec" id="guia-deps">
            <h3>Dependências entre projetos</h3>
            <p>Na ficha de cada projeto, a seção <strong>🔗 Dependências</strong> diz de quem ele depende para começar. Há dois tipos:</p>
            <ul class="guia-rules">
              <li><strong>“…depois que X terminar”</strong> (em gerenciamento de projetos: <em>término → início</em>, sigla <strong>TI</strong> ou, em inglês, <strong>FS</strong>, <em>finish-to-start</em>).
                O caso mais comum: só dá para começar quando o outro estiver pronto. Ex.: a campanha de Marketing só começa depois que o catálogo novo <strong>terminar</strong>.</li>
              <li><strong>“…depois que X começar”</strong> (<em>início → início</em>, sigla <strong>II</strong> ou <strong>SS</strong>, <em>start-to-start</em>).
                Os dois podem andar juntos, mas este não pode sair na frente. Ex.: o treinamento da equipe de Vendas pode começar assim que o novo processo de vendas <strong>começar</strong>.</li>
            </ul>
            <p class="muted small">Se a dependência ainda não aconteceu, o projeto mostra ⚠ na Priorização e ⏳ na ficha. Cada dependência também aumenta o <strong>Destrava</strong> do projeto de quem se depende.</p>
          </section>
          <section class="panel guia-sec" id="guia-abaixo">
            <h3>E os projetos abaixo da linha?</h3>
            <p>A matriz é um <strong>guia para a conversa</strong>, não uma regra automática. Se só os projetos acima da linha entrassem, os de baixo
            nunca sairiam do lugar, porque sempre chega uma ideia nova mais rápida. Por isso há três regras:</p>
            <ul class="guia-rules">
              <li><strong>⭐ Escolha estratégica.</strong> Das ${limite} vagas de cada setor, <strong>uma</strong> pode ir para um projeto abaixo da linha, por decisão da diretoria.
                Na Priorização, use o ⭐ ao lado do projeto e escreva o motivo, que fica no histórico. É o caminho para os projetos que aumentam o valor da empresa no longo prazo.</li>
              <li><strong>⏳ Nada esquecido em silêncio.</strong> Cada projeto validado mostra há quantos ciclos espera na fila. Depois de uma onda inteira (3 ciclos),
                ele aparece com o alerta <em>“decidir”</em> na Priorização e no Painel executivo: <strong>subir</strong> (⭐), <strong>dividir em fases</strong> ou <strong>arquivar</strong>.</li>
              <li><strong>✂ Dividir antes de descartar.</strong> Muitos projetos ficam abaixo da linha por serem longos. Uma primeira fase de 1 ou 2 meses
                (um diagnóstico, um piloto) costuma subir para cima da linha e destravar o resto. Use “✂ Fase” na Triagem.</li>
            </ul>
          </section>

          <section class="panel guia-sec" id="guia-regras">
            <h3>Regras do jogo</h3>
            <ul class="guia-rules">
              <li><strong>Até ${limite} projetos por setor no ciclo.</strong> Marcados na Priorização, na coluna “Ciclo”. Projeto que não terminou passa sozinho para o ciclo seguinte.</li>
              <li><strong>Ciclo = mês do calendário.</strong> Três ciclos formam uma onda (trimestre).</li>
              <li><strong>Semáforo.</strong> 🟢 no prazo · 🟡 atenção · 🔴 travado, precisa de decisão.</li>
              <li><strong>Situação do cadastro.</strong> <span class="badge warn">Rascunho</span> acabou de entrar ·
                <span class="badge ok">Validado</span> passou pela triagem e pode entrar no ciclo.</li>
            </ul>
          </section>

          <section class="panel guia-sec" id="guia-raci">
            <h3>RACI: quem faz o quê em cada etapa</h3>
            <div class="guia-raci">
              <div><span class="raci-tag raci-R">R</span><strong>Responsável</strong><span class="muted small">Executa. Exatamente 1 por etapa.</span></div>
              <div><span class="raci-tag raci-A">A</span><strong>Aprovador</strong><span class="muted small">Dá o ok final. No máximo 1.</span></div>
              <div><span class="raci-tag raci-C">C</span><strong>Consultado</strong><span class="muted small">Opina antes de fazer.</span></div>
              <div><span class="raci-tag raci-I">I</span><strong>Informado</strong><span class="muted small">Fica sabendo depois.</span></div>
            </div>
          </section>

          <section class="panel guia-sec" id="guia-abas">
            <h3>Mapa das abas</h3>
            <div class="guia-map">
              ${[
                ["programa", "🧭 Programa", "A Altamar e os setores em volta: a porta de entrada para explicar o programa."],
                ["executivo", "📊 Painel executivo", "O que resolver, o ciclo e a agenda de 4 semanas."],
                ["triagem", "📝 Triagem", "Toda ideia nova entra aqui. Dar valor, esforço e validar."],
                ["priorizacao", "🎯 Priorização", "Ranking por setor e a escolha dos projetos de cada ciclo."],
                ["ondas", "🌊 Ondas", "Em que trimestre cada projeto entra."],
                ["kanban", "📋 Kanban", "As etapas do ciclo. Cada líder vê só o próprio setor."],
                ["overview", "🗓️ Cronograma", "Linha do tempo de todos os projetos."],
                ["decisoes", "⚖️ Decisões", "Pauta e decisões da diretoria."],
                ["historico", "🕘 Histórico", "Quem mudou o quê e quando."],
              ].map(([tab, t, d]) => `<button class="guia-map-item" data-action="go-tab" data-tab="${tab}"><strong>${t}</strong><span class="muted small">${d}</span></button>`).join("")}
            </div>
          </section>

          <section class="panel guia-sec" id="guia-roteiro">
            <h3>Reuniões</h3>
            ${reuniao("⚡", "Acompanhamento semanal", "Toda quinta: Pedro com a diretoria", "15 min",
              "Os líderes atualizam o Kanban durante a semana; na quinta, o Pedro mostra o que andou, o que travou e o que precisa de decisão. Se a reunião não acontecer, a diretoria recebe o boletim (📤 Compartilhar → Boletim).",
              [
                passo(1, "O que foi feito (5 min)", "Etapas que foram para “Feito” e passos concluídos.", ["kanban", "Kanban"]),
                passo(2, "O que está travado (5 min)", "Cards em “Travado” e semáforos vermelhos: o que falta e de quem depende.", ["kanban", "Kanban"]),
                passo(3, "Decisões (5 min)", "O que só a diretoria resolve. Registrar a decisão.", ["decisoes", "Decisões"]),
              ])}
            ${reuniao("🗓️", "Reunião do ciclo", "Todo mês, no fim do ciclo", "60 min",
              `Fechar o mês e escolher os projetos do próximo: até ${limite} por setor.`,
              [
                passo(1, "Fechar o ciclo (15 min)", "O que cada setor entregou, o que não entregou e por quê. Etapas pendentes passam sozinhas para o próximo ciclo.", ["kanban", "Kanban"]),
                passo(2, "Ideias novas (10 min)", "Triagem: dar valor e esforço ao que chegou no mês.", ["triagem", "Triagem"]),
                passo(3, "Escolher os projetos (25 min)", `Priorização, setor por setor: marcar na coluna “Ciclo” até ${limite} projetos de cada setor.`, ["priorizacao", "Priorização"]),
                passo(4, "Combinar com os líderes (10 min)", "O Pedro repassa a cada líder os projetos do mês; o líder cadastra as etapas no Kanban."),
              ])}
            ${reuniao("🌊", "Reunião trimestral", "A cada 3 ciclos, na virada da onda", "90 min",
              "Olhar o trimestre que passou e decidir a próxima onda.",
              [
                passo(1, "Fechar a onda (20 min)", "O que foi concluído, o que continua e o que volta para a Fila.", ["ondas", "Ondas"]),
                passo(2, "Revisar notas (20 min)", "O valor ou o esforço de algum projeto mudou com o que aprendemos?", ["triagem", "Triagem"]),
                passo(3, "Montar a próxima onda (40 min)", "Priorização por setor e arrastar na aba Ondas.", ["priorizacao", "Priorização"]),
                passo(4, "Ajustar a capacidade (10 min)", "Algum setor precisa de mais ou menos projetos por ciclo?"),
              ])}
          </section>
        </div>
      </div>`;
  }

  A.views.guia = function (S) {
    const el = document.getElementById("guia-root");
    if (!el) return;
    const v = A.visao.atual();
    el.innerHTML = v.tipo === "lider" ? guiaLider(S, v) : guiaGestor(S);
  };

  // Links internos do índice: rolam até a seção sem trocar a rota.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-guia-link]");
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.guiaLink)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
