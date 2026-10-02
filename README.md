# Painel de Expansão · Altamar

Painel de gestão do Projeto de Expansão da Altamar Sistemas Aquáticos: priorização Valor × Esforço, Kanban da sprint, ondas trimestrais, decisões da diretoria e histórico de alterações.

## Como abrir

- **Mais simples:** dê dois cliques em `index.html`. Funciona offline no Chrome ou no Edge.
- **Com servidor local** (útil para compartilhar na rede ou testar): clique com o botão direito em `servidor-local.ps1` e escolha *Executar com o PowerShell*. O navegador abre em `http://localhost:8080`.
- **Hospedar na web:** é um site estático, sem build. Basta copiar a pasta inteira para GitHub Pages, Netlify, SharePoint ou outro servidor de arquivos estáticos.

## Onde ficam os dados

Os dados ficam salvos **no navegador de quem usa** (localStorage), automaticamente a cada alteração. Por isso:

- Cada computador/navegador tem a sua cópia. Para levar os dados para outro lugar, use **⚙️ Dados → Exportar backup (JSON)** e depois **Restaurar backup** no outro navegador.
- Quando há alterações sem backup há mais de 7 dias, aparece um ponto laranja no botão **⚙️ Dados**.
- A **planilha Excel continua sendo a fonte oficial.** Use **Importar da planilha** para trazer as atualizações e **Exportar para Excel** para gerar uma cópia com o ranking, as decisões e o histórico.
- Se você já usava o painel antigo (arquivo HTML único) neste navegador, os dados são migrados automaticamente na primeira abertura.

## Funcionalidades

| Aba | O que faz |
|---|---|
| Painel executivo | KPIs (WIP, progresso, riscos, decisões), iniciativas em andamento, semáforo de riscos, pauta da diretoria e progresso por onda |
| Matriz Valor × Esforço | Gráfico de dispersão com a linha de corte **recalculada automaticamente** (Σ Valor ÷ Σ Esforço) |
| Ranking | Ordenado por V ÷ E, com divisória na linha de corte, troca rápida de status, edição e exclusão |
| Kanban da sprint | Backlog → A fazer → Fazendo → Esperando → Feito. **Arraste os cards**: o status acompanha a coluna. Aviso quando o WIP passa de 5. Cada cartão mostra o **% de conclusão** e, ao ser clicado, abre o detalhamento |
| ↳ Setor | Resumo do setor (nº de iniciativas, % médio, em andamento) e iniciativas ordenadas por V ÷ E |
| ↳ Projeto | Dados da iniciativa, barra grande de % e a lista de **atividades** com % (controle deslizante), status, responsável, prazo e observações. Caminho clicável: Kanban › Setor › Projeto |
| Ondas trimestrais | Arraste iniciativas entre Onda 1, 2, 3 e Fila para replanejar |
| Decisões | Registro de pautas da diretoria, vinculadas a iniciativas, com filtro Pendentes/Decididas |
| Histórico | Quem mudou o quê e quando (antes → depois), com busca e filtro |

Outros recursos: criar, editar e excluir iniciativas (tecla **N** cria uma nova), filtros globais por área, status, onda e busca, **Resumo da reunião** pronto para WhatsApp/e-mail (inclui os avanços dos últimos 7 dias), modo reunião (fontes maiores), tema claro/escuro, impressão/PDF e uso no celular.

### % de conclusão

- O % de um projeto **nunca é digitado**: é a média das % das suas atividades, recalculada a cada alteração. Atividades **canceladas** ficam fora da média, como na planilha.
- Atividade levada a 100% sugere o status "Concluído" (você confirma). Marcar como "Concluído" leva a atividade a 100%.
- Projeto em 100% mostra "Mover para Feito" e um aviso no cartão do Kanban.
- Atividades não são apagadas: para tirar uma atividade do cálculo, use o status "Cancelado".
- As 41 atividades iniciais vieram da aba `2_Atividades` da planilha (`assets/js/activities-seed.js`). E2, E3 e E4 ainda não têm atividades.

### Importação do Excel

Aceita a planilha `Ferramentas_Gestao_Altamar.xlsx` (abas `1_Grupos` e `4_Decisoes`) ou qualquer planilha com cabeçalhos equivalentes:

- **Iniciativas:** `Grupo`/`ID`, `Nome do grupo`/`Iniciativa`, `Área`, `Responsável`, `Valor` (ou `Valor sugerido`), `Esforço`. Opcionais: `Onda`, `Status`, `Semáforo`, `Prazo`, `Observações`.
- **Decisões:** `Descrição`/`Pauta`, `Quem decide`, `Status`. Opcionais: `Data`, `Grupo`, `O que foi decidido`.
- **Atividades:** `Grupo` (ID da iniciativa) e `Atividade`. Opcionais: `% concluído`, `Status`, `Responsável`, `Prazo`, `Observações`. As atividades são casadas pelo nome dentro de cada iniciativa. Um "Não iniciado" vindo da planilha não desfaz o avanço já registrado no painel.

A exportação para Excel gera as abas Iniciativas (com o % de cada projeto), Atividades (com o % de cada atividade), Decisoes, Historico e Resumo. Esse arquivo pode ser importado de volta.

Antes de aplicar, o painel mostra uma prévia com cada alteração. As iniciativas são casadas pelo ID e as decisões pelo texto da pauta. Nada é apagado, e os campos que só existem no painel (semáforo, coluna do Kanban) são preservados. A leitura do Excel usa a biblioteca SheetJS, carregada da internet só na hora de importar ou exportar.

## Estrutura do código

```
index.html               Estrutura das telas e dos modais
assets/css/app.css       Estilos (tema claro/escuro, responsivo, impressão)
assets/js/utils.js       Utilitários: escape de HTML, toasts, modais, downloads
assets/js/data.js        Metadados (áreas, ondas, colunas) e dados iniciais
assets/js/store.js       Estado, persistência, regras de negócio, histórico, cálculos
assets/js/excel.js       Importação e exportação de Excel
assets/js/activities-seed.js  Atividades iniciais (extraídas da aba 2_Atividades)
assets/js/views/*.js     Renderização de cada aba (drilldown.js = telas de Setor e Projeto)
assets/js/forms.js       Formulários e modais (iniciativa, decisão, resumo, importação)
assets/js/app.js         Inicialização, navegação, filtros, ações e menu de dados
servidor-local.ps1       Servidor HTTP local opcional (sem instalar nada)
```

Para mudar o limite de WIP, as ondas (períodos e títulos) ou as pessoas sugeridas, edite `assets/js/data.js`.
