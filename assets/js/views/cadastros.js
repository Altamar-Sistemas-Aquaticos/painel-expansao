/* Cadastros: áreas do portfólio e pessoas que podem receber papéis na matriz RACI. */
(function () {
  const A = window.Altamar;
  const { esc, toast, confirmDialog } = A.util;

  let showInactive = false;
  let lastSig = "";

  function areasPanel(S) {
    const rows = S.areas().map((a) => {
      const uso = S.state.data.initiatives.filter((i) => i.area === a.key).length;
      const k = `data-cad="area" data-key="${esc(a.key)}"`;
      return `
        <tr>
          <td><input type="color" class="cad-color" value="${esc(a.cor)}" ${k} data-field="cor" aria-label="Cor da área ${esc(a.key)}"></td>
          <td><input class="input input-sm" value="${esc(a.key)}" ${k} data-field="key" aria-label="Nome da área"></td>
          <td><input class="input input-sm cad-code" value="${esc(a.code)}" maxlength="3" ${k} data-field="code" ${uso ? "readonly title=\"O código não pode mudar: já há projetos com IDs desta área\"" : ""} aria-label="Código da área"></td>
          <td class="num">${uso}</td>
          <td class="center"><button class="btn btn-xs btn-danger-ghost icon-btn" data-cad-del="area" data-key="${esc(a.key)}" ${uso ? "disabled title=\"Área com projetos\"" : ""} aria-label="Excluir área ${esc(a.key)}">✕</button></td>
        </tr>`;
    }).join("");
    return `
      <div class="panel-head">
        <div>
          <h3 class="panel-title">Áreas</h3>
          <div class="muted small">O código vira o prefixo do ID dos projetos (ex.: Vendas → V9).</div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Cor</th><th>Área</th><th>Código</th><th class="num">Projetos</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <form class="cad-add" id="cad-area-form">
        <input type="color" class="cad-color" id="cad-area-cor" value="${esc(S.nextAreaColor())}" aria-label="Cor da nova área">
        <input class="input input-sm" id="cad-area-nome" placeholder="Nova área (ex.: Financeiro)" autocomplete="off" aria-label="Nome da nova área">
        <input class="input input-sm cad-code" id="cad-area-code" placeholder="Cód." maxlength="3" autocomplete="off" aria-label="Código da nova área">
        <button class="btn btn-sm btn-primary" type="submit">+ Adicionar área</button>
      </form>`;
  }

  function pessoasPanel(S) {
    const list = S.pessoas().filter((p) => showInactive || p.ativo);
    const inativas = S.pessoas().filter((p) => !p.ativo).length;
    const areaOpts = (sel) => `<option value="">—</option>` + S.areas().map((a) => `<option ${a.key === sel ? "selected" : ""}>${esc(a.key)}</option>`).join("");
    const rows = list.map((p) => {
      const uso = S.pessoaUso(p.nome);
      const k = `data-cad="pessoa" data-key="${esc(p.nome)}"`;
      return `
        <tr class="${p.ativo ? "" : "muted"}">
          <td><span class="avatar" style="width:26px;height:26px">${esc(A.util.initials(p.nome))}</span></td>
          <td><input class="input input-sm" value="${esc(p.nome)}" ${k} data-field="nome" aria-label="Nome"></td>
          <td><input class="input input-sm" value="${esc(p.funcao)}" placeholder="Função" ${k} data-field="funcao" aria-label="Função de ${esc(p.nome)}"></td>
          <td><input class="input input-sm" type="email" value="${esc(p.email)}" placeholder="nome@altamar.com.br" ${k} data-field="email" aria-label="E-mail de ${esc(p.nome)}"></td>
          <td><select class="input input-sm" ${k} data-field="area" aria-label="Área de ${esc(p.nome)}">${areaOpts(p.area)}</select></td>
          <td class="center"><input type="checkbox" ${p.ativo ? "checked" : ""} ${k} data-field="ativo" aria-label="${esc(p.nome)} ativa"></td>
          <td class="num" title="Projetos e atividades em que aparece">${uso}</td>
          <td class="center"><button class="btn btn-xs btn-danger-ghost icon-btn" data-cad-del="pessoa" data-key="${esc(p.nome)}" ${uso ? "disabled title=\"Aparece em projetos: desative em vez de excluir\"" : ""} aria-label="Excluir ${esc(p.nome)}">✕</button></td>
        </tr>`;
    }).join("");
    return `
      <div class="panel-head">
        <div>
          <h3 class="panel-title">Pessoas</h3>
          <div class="muted small">Quem pode ser responsável por projetos e receber papéis R, A, C ou I. Pessoas inativas saem das listas, mas continuam no histórico.</div>
        </div>
        ${inativas ? `<label class="checkbox small"><input type="checkbox" id="cad-show-inactive" ${showInactive ? "checked" : ""}> Mostrar inativas (${inativas})</label>` : ""}
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th></th><th>Nome</th><th>Função</th><th>E-mail (convites)</th><th>Área</th><th class="center">Ativa</th><th class="num">Uso</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="8" class="muted">Nenhuma pessoa cadastrada.</td></tr>`}</tbody>
        </table>
      </div>
      <form class="cad-add" id="cad-pessoa-form">
        <input class="input input-sm" id="cad-pessoa-nome" placeholder="Nome (ex.: Bia)" autocomplete="off" aria-label="Nome da nova pessoa">
        <input class="input input-sm" id="cad-pessoa-funcao" placeholder="Função (ex.: Financeiro)" autocomplete="off" aria-label="Função">
        <input class="input input-sm" id="cad-pessoa-email" type="email" placeholder="E-mail (opcional)" autocomplete="off" aria-label="E-mail">
        <select class="input input-sm" id="cad-pessoa-area" aria-label="Área">${areaOpts("")}</select>
        <button class="btn btn-sm btn-primary" type="submit">+ Adicionar pessoa</button>
      </form>`;
  }

  function capacidadePanel(S) {
    const { min, max } = S.calc.sprintLimites();
    const si = A.sprintInfo(S);
    return `
      <div class="panel-head">
        <div>
          <h3 class="panel-title">Capacidade de execução</h3>
          <div class="muted small">Sprints de 4 semanas (3 por onda). ${si.sp ? `Hoje: <strong>${esc(si.rotulo)}</strong> com ${si.total} atividade(s).` : ""}
          Calibre depois de 2 ou 3 sprints, comparando com o que foi entregue.</div>
        </div>
      </div>
      <div class="cap-form">
        <div class="field">
          <label for="cap-min">Mínimo de atividades por sprint</label>
          <input type="number" min="1" max="50" id="cap-min" class="input input-sm" value="${min}" data-cap="sprintMin">
        </div>
        <div class="field">
          <label for="cap-max">Máximo de atividades por sprint</label>
          <input type="number" min="1" max="50" id="cap-max" class="input input-sm" value="${max}" data-cap="sprintMax">
        </div>
        <div class="muted small">Projetos por onda: <strong>${S.calc.projetosPorOnda()}</strong> (soma das vagas dos eixos, abaixo).</div>
      </div>`;
  }

  function eixosPanel(S) {
    const rows = S.eixos().map((e) => {
      const k = `data-cad="eixo" data-key="${esc(e.key)}"`;
      const uso = S.eixoUso(e.key);
      return `
        <tr>
          <td><input class="input input-sm cad-ico" value="${esc(e.icone)}" maxlength="4" ${k} data-field="icone" aria-label="Ícone do eixo ${esc(e.key)}"></td>
          <td><input class="input input-sm" value="${esc(e.key)}" ${k} data-field="key" aria-label="Nome do eixo"></td>
          <td><input class="input input-sm" value="${esc(e.descricao)}" ${k} data-field="descricao" aria-label="O que o eixo melhora"></td>
          <td><input type="number" min="0" max="20" class="input input-sm cad-vagas" value="${e.vagas}" ${k} data-field="vagas" aria-label="Vagas por onda"></td>
          <td class="num">${uso}</td>
          <td class="center"><button class="btn btn-xs btn-danger-ghost icon-btn" data-cad-del="eixo" data-key="${esc(e.key)}" ${uso ? "disabled title=\"Eixo com projetos\"" : ""} aria-label="Excluir eixo ${esc(e.key)}">✕</button></td>
        </tr>`;
    }).join("");
    return `
      <div class="panel-head">
        <div>
          <h3 class="panel-title">Eixos e vagas por onda</h3>
          <div class="muted small">O eixo diz o que o projeto melhora na Altamar. Cada onda reserva vagas por eixo, e o V÷E compara projetos só dentro do mesmo eixo.</div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Ícone</th><th>Eixo</th><th>O que melhora</th><th class="num">Vagas</th><th class="num">Projetos</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <form class="cad-add" id="cad-eixo-form">
        <input class="input input-sm cad-ico" id="cad-eixo-ico" placeholder="🎯" maxlength="4" aria-label="Ícone do novo eixo">
        <input class="input input-sm" id="cad-eixo-nome" placeholder="Novo eixo" autocomplete="off" aria-label="Nome do novo eixo">
        <input type="number" min="0" max="20" class="input input-sm cad-vagas" id="cad-eixo-vagas" value="1" aria-label="Vagas por onda">
        <button class="btn btn-sm btn-primary" type="submit">+ Adicionar eixo</button>
      </form>`;
  }

  A.views.cadastros = function (S) {
    const sig = JSON.stringify([S.state.data.config, showInactive, S.state.data.initiatives.length, S.sprintItems().length, S.sprintAtual()?.id]);
    const editing = document.activeElement?.closest?.("#view-cadastros");
    if (sig === lastSig && editing) return; // não redesenha sob quem está digitando
    lastSig = sig;
    document.getElementById("cad-capacidade").innerHTML = capacidadePanel(S);
    document.getElementById("cad-eixos").innerHTML = eixosPanel(S);
    A.nuvem?.renderMembros();
    document.getElementById("cad-areas").innerHTML = areasPanel(S);
    document.getElementById("cad-pessoas").innerHTML = pessoasPanel(S);
  };

  function rerender() { lastSig = ""; A.views.cadastros(A.store); }

  function init() {
    const S = A.store;
    const root = document.getElementById("view-cadastros");

    root.addEventListener("change", (e) => {
      const el = e.target;
      if (el.id === "cad-show-inactive") { showInactive = el.checked; return rerender(); }
      if (el.dataset.cap) {
        const r = S.saveConfig({ [el.dataset.cap]: el.value });
        if (!r.ok) toast(r.error, "error");
        else if (!r.unchanged) toast("Capacidade atualizada.");
        return rerender();
      }
      if (!el.dataset.cad) return;
      const value = el.type === "checkbox" ? el.checked : el.value;
      const r = el.dataset.cad === "area"
        ? S.saveArea({ [el.dataset.field]: el.dataset.field === "code" ? String(value).toUpperCase() : value }, el.dataset.key)
        : el.dataset.cad === "eixo" ? S.saveEixo({ [el.dataset.field]: value }, el.dataset.key)
        : S.savePessoa({ [el.dataset.field]: value }, el.dataset.key);
      if (!r.ok) { toast(r.error, "error", 5000); rerender(); return; }
      if (!r.unchanged) toast("Cadastro atualizado.");
    });

    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-cad-del]");
      if (!b || b.disabled) return;
      const tipo = b.dataset.cadDel, key = b.dataset.key;
      const ok = await confirmDialog(`Excluir ${tipo === "area" ? "a área" : tipo === "eixo" ? "o eixo" : ""} “${key}” dos cadastros?`, { title: "Excluir cadastro", okLabel: "Excluir", danger: true });
      if (!ok) return;
      const r = tipo === "area" ? S.deleteArea(key) : tipo === "eixo" ? S.deleteEixo(key) : S.deletePessoa(key);
      if (!r.ok) return toast(r.error, "error", 5000);
      toast(`“${key}” excluído.`, "warn");
    });

    // Sugere o código da área enquanto o nome é digitado.
    root.addEventListener("input", (e) => {
      if (e.target.id === "cad-area-nome") {
        const code = document.getElementById("cad-area-code");
        if (!code.dataset.touched) code.value = e.target.value.trim() ? S.suggestAreaCode(e.target.value) : "";
      }
      if (e.target.id === "cad-area-code") e.target.dataset.touched = "1";
    });

    root.addEventListener("submit", (e) => {
      e.preventDefault();
      if (e.target.id === "cad-eixo-form") {
        const r = S.saveEixo({
          key: document.getElementById("cad-eixo-nome").value,
          icone: document.getElementById("cad-eixo-ico").value,
          vagas: document.getElementById("cad-eixo-vagas").value,
        });
        if (!r.ok) return toast(r.error, "error", 5000);
        toast(`Eixo ${r.item.key} criado com ${r.item.vagas} vaga(s) por onda.`);
        rerender();
      }
      if (e.target.id === "cad-area-form") {
        const r = S.saveArea({
          key: document.getElementById("cad-area-nome").value,
          code: document.getElementById("cad-area-code").value.toUpperCase(),
          cor: document.getElementById("cad-area-cor").value,
        });
        if (!r.ok) return toast(r.error, "error", 5000);
        toast(`Área ${r.item.key} criada. Novos projetos dela terão ID ${r.item.code}1, ${r.item.code}2…`);
        rerender();
        document.getElementById("cad-area-nome")?.focus();
      }
      if (e.target.id === "cad-pessoa-form") {
        const r = S.savePessoa({
          nome: document.getElementById("cad-pessoa-nome").value,
          funcao: document.getElementById("cad-pessoa-funcao").value,
          email: document.getElementById("cad-pessoa-email").value,
          area: document.getElementById("cad-pessoa-area").value,
        });
        if (!r.ok) return toast(r.error, "error", 5000);
        toast(`${r.item.nome} cadastrado(a).`);
        rerender();
        document.getElementById("cad-pessoa-nome")?.focus();
      }
    });
  }

  A.cadastros = { init };
})();
