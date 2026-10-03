/* Guia: o que é o painel, escalas de valor e esforço, regras e o roteiro das reuniões. */
(function () {
  const A = window.Altamar;
  const { esc, fmtNum } = A.util;

  const SECOES = [
    ["guia-o-que-e", "O que é"],
    ["guia-escalas", "Valor e esforço"],
    ["guia-corte", "V÷E e linha de corte"],
    ["guia-regras", "Regras"],
    ["guia-raci", "RACI"],
    ["guia-abas", "Mapa das abas"],
    ["guia-roteiro", "Roteiro das reuniões"],
  ];

  function escala(titulo, pergunta, mapa) {
    return `
      <div class="guia-scale">
        <h4>${titulo}</h4>
        <p class="muted small">${pergunta}</p>
        <ol class="guia-scale-list">
          ${A.meta.FIBONACCI.map((f) => `
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

  A.views.guia = function (S) {
    const el = document.getElementById("guia-root");
    if (!el) return;
    const cap = S.calc.capacidade(), maxP = S.calc.maxProjetos();
    const cut = S.calc.cutoff();
    const capO = A.board.capOnda(S);

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
              <span>📋 Kanban<br><small>execução</small></span><span>→</span><span>✅ Feito</span>
            </div>
            <p class="muted small">Quem trouxe a ideia fica registrado como <strong>autor</strong>. Tudo o que muda fica no Histórico, com nome e data.</p>
          </section>

          <section class="panel guia-sec" id="guia-escalas">
            <h3>Como dar valor e esforço</h3>
            <p>As notas usam só <strong>1, 2, 3, 5 e 8</strong> (sequência de Fibonacci). Os saltos crescem de propósito:
            quanto maior o projeto, mais incerta a estimativa, então não faz sentido discutir se é 6 ou 7. A pergunta passa a ser
            “é 5 ou 8?”, e a reunião anda mais rápido.</p>
            <div class="guia-scales">
              ${escala("Valor", "Quanto isso ajuda a Altamar?", A.meta.VALOR_ESCALA)}
              ${escala("Esforço", "Quanto tempo e gente isso consome?", A.meta.ESFORCO_ESCALA)}
            </div>
            <p class="muted small">Na dúvida entre duas notas, escolha a maior para o esforço e a menor para o valor. Ideia sem nota fica como “a definir” na Triagem.</p>
          </section>

          <section class="panel guia-sec" id="guia-corte">
            <h3>V÷E e linha de corte</h3>
            <p><strong>V÷E</strong> = valor dividido pelo esforço: quanto retorno cada ponto de esforço traz.
            Exemplo: valor 5 e esforço 2 dá <strong>2,5</strong>; valor 8 e esforço 8 dá <strong>1,0</strong>.
            O primeiro vem antes, mesmo valendo menos, porque entrega mais por unidade de trabalho.</p>
            <p>A <strong>linha de corte</strong> é a média ponderada de todos os projetos: Σ Valor ÷ Σ Esforço.
            Hoje ela está em <strong>${fmtNum(cut.value)}</strong> (${cut.sumValor} ÷ ${cut.sumEsforco}).
            Quem está acima da linha é candidato natural às primeiras ondas; quem está abaixo precisa de um bom motivo
            (por exemplo, destravar outro projeto) e esse motivo deve ficar escrito nas observações.</p>
          </section>

          <section class="panel guia-sec" id="guia-regras">
            <h3>Regras do jogo</h3>
            <ul class="guia-rules">
              <li><strong>Capacidade por pontos.</strong> Cada projeto em andamento ocupa o seu esforço. A soma não passa de
                <strong>${cap} pontos</strong>, e nunca mais de <strong>${maxP} projetos</strong> ao mesmo tempo, mesmo pequenos.
                Estourou? Conclua ou pause algo antes de puxar outro. Os números se ajustam em ⚙️ Dados → Cadastros e capacidade.</li>
              <li><strong>Ondas trimestrais.</strong> Onda 1, 2 e 3 são os próximos trimestres; a Fila é o que ainda não tem data.
                Cada onda comporta cerca de <strong>${capO} pontos</strong> (a capacidade gira umas duas vezes por trimestre).</li>
              <li><strong>Sprints de 2 semanas.</strong> No Kanban, “A fazer na sprint” é o compromisso das próximas 2 semanas.</li>
              <li><strong>Semáforo.</strong> 🟢 no prazo · 🟡 atenção, precisa de alinhamento · 🔴 travado, precisa de decisão.</li>
              <li><strong>Situação do cadastro.</strong> <span class="badge warn">Rascunho</span> acabou de entrar ·
                <span class="badge accent">Validado</span> passou pela reunião · <span class="badge ok">Aprovado para onda</span> entrou no ciclo.
                Rascunho pode ser excluído; depois de validado, use o status Cancelado.</li>
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
                ["executivo", "📊 Painel executivo", "Resumo do dia: o que resolver, carga e agenda de 2 semanas."],
                ["triagem", "📝 Triagem", "Toda ideia nova entra aqui. Dar valor, esforço e validar."],
                ["priorizacao", "🎯 Priorização", "Matriz e ranking por V÷E, lado a lado."],
                ["ondas", "🌊 Ondas", "Em que trimestre cada projeto entra."],
                ["kanban", "📋 Kanban", "Execução da sprint. Clique no card para ver setor, projeto e atividades."],
                ["overview", "🗓️ Cronograma", "Linha do tempo de todos os projetos, por área."],
                ["decisoes", "⚖️ Decisões", "Pauta e decisões da diretoria."],
                ["historico", "🕘 Histórico", "Quem mudou o quê e quando."],
              ].map(([tab, t, d]) => `<button class="guia-map-item" data-action="go-tab" data-tab="${tab}"><strong>${t}</strong><span class="muted small">${d}</span></button>`).join("")}
            </div>
          </section>

          <section class="panel guia-sec" id="guia-roteiro">
            <h3>Roteiro das reuniões</h3>

            <h4 class="guia-h4">1ª reunião: triagem com a Maíra (uma vez, cerca de 1h30)</h4>
            <ol class="guia-steps">
              ${passo(1, "Combinar as escalas (10 min)", "Leiam juntos a seção “Como dar valor e esforço” e ajustem as descrições se algo não fizer sentido para a Altamar.")}
              ${passo(2, "Dar nota a todas as ideias (50 min)", "Na Triagem, filtro “Sem nota”. Para cada linha: primeiro o valor, depois o esforço. Sem discutir detalhes de execução, no máximo 2 minutos por ideia. Se travar, deixe “a definir” e siga.", ["triagem", "Triagem"])}
              ${passo(3, "Validar ou descartar (15 min)", "Ainda na Triagem: o que faz sentido vira “Validado”; o que não faz, exclua (rascunho) ou cancele.", ["triagem", "Triagem"])}
              ${passo(4, "Olhar a Priorização (15 min)", "Vejam quem ficou acima da linha de corte. Se algo importante ficou abaixo, revejam a nota ou anotem o motivo.", ["priorizacao", "Priorização"])}
              ${passo(5, "Montar a Onda 1", `Arraste para a Onda 1 os projetos validados de maior V÷E até perto de ${capO} pontos. Os demais vão para Onda 2, 3 ou Fila.`, ["ondas", "Ondas"])}
            </ol>

            <h4 class="guia-h4">Toda quinta (ou a cada 2 semanas): acompanhamento, 30 a 45 min</h4>
            <ol class="guia-steps">
              ${passo(1, "Painel executivo (5 min)", "Ler o “Para resolver”: atrasos, semáforos vermelhos, atividades sem R.", ["executivo", "Painel executivo"])}
              ${passo(2, "Kanban (15 min)", "Card a card do que está em andamento: o que avançou, o que travou, ajustar semáforo e prazo. Conferir a carga no topo.", ["kanban", "Kanban"])}
              ${passo(3, "Decisões (10 min)", "Resolver as pendências com a diretoria e registrar o que foi decidido.", ["decisoes", "Decisões"])}
              ${passo(4, "Ideias novas (5 min)", "Triagem, filtro “A triar”: dar nota às ideias que chegaram na semana.", ["triagem", "Triagem"])}
              ${passo(5, "Próxima sprint (5 min)", "Se sobrou capacidade, puxar o próximo projeto da onda atual para “A fazer na sprint”. Fechar com 📋 Resumo da reunião.", ["kanban", "Kanban"])}
            </ol>

            <h4 class="guia-h4">Fim de cada trimestre: replanejamento, cerca de 1h</h4>
            <ol class="guia-steps">
              ${passo(1, "Fechar a onda", "O que não terminou continua ou volta para a Fila? Basta mudar a onda ou o status; fica registrado no Histórico.", ["ondas", "Ondas"])}
              ${passo(2, "Revisar notas", "Projetos da Fila e das próximas ondas: o valor ou o esforço mudou com o que aprendemos?", ["triagem", "Triagem"])}
              ${passo(3, "Montar a próxima onda", "Mesma lógica da 1ª reunião: maior V÷E primeiro, respeitando a capacidade do trimestre.", ["priorizacao", "Priorização"])}
              ${passo(4, "Calibrar a capacidade", `Comparar o que foi entregue com os ${cap} pontos. Se entregaram mais ou menos, ajustar em ⚙️ Dados → Cadastros e capacidade.`, ["cadastros", "Cadastros"])}
            </ol>
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
