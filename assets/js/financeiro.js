/* Financeiro por projeto (confidencial): os gastos estimados até o projeto ficar pronto, em várias linhas
   (ex.: equipamento, frete, instalação); o total é a soma. Fica em tabelas próprias do banco
   (supabase/03_financeiro.sql e 06_financeiro_itens.sql), que só respondem a admin e diretoria
   (Pedro, Maíra e Shei). Nada disso entra no painel compartilhado nem no histórico geral. */
(function () {
  const A = window.Altamar;
  const { esc, toast } = A.util;

  let itens = new Map();      // projeto_id → [{ id, descricao, valor, observacao, atualizado_em, atualizado_por }]
  let antigos = new Map();    // valor único do script 03 (usado só se o 06 ainda não rodou)
  let historico = [];         // linhas de financeiro_historico, mais novas primeiro
  let carregado = false;
  let faltaScript = "";       // "03" ou "06" quando o banco ainda não tem a tabela
  let canal = null;

  const cliente = () => A.nuvem?.cliente?.() || null;
  const perfilVe = () => ["admin", "diretoria"].includes(A.nuvem?.perfil?.());
  // Mostra só para quem o banco libera, e nunca quando o gestor está "vendo como" um líder.
  const pode = () => perfilVe() && A.visao.atual().tipo !== "lider";

  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
  const moeda = (v) => (v == null ? "—" : BRL.format(v));
  const semTabela = (err) => /does not exist|Could not find|relation/i.test(String(err?.message || ""));
  // Aceita "120.000", "120000,50", "R$ 1.234,56", "120 mil".
  function lerValor(txt) {
    let s = String(txt || "").trim().toLowerCase().replace(/r\$|\s/g, "");
    if (!s) return null;
    let mult = 1;
    if (/mil$/.test(s)) { mult = 1000; s = s.replace(/mil$/, ""); }
    s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * mult * 100) / 100 : NaN;
  }

  async function carregar() {
    const sb = cliente();
    if (!sb || !perfilVe()) return;
    const [i, v, h] = await Promise.all([
      sb.from("financeiro_itens").select("id, projeto_id, descricao, valor, observacao, criado_em, atualizado_em, atualizado_por").order("criado_em"),
      sb.from("financeiro").select("projeto_id, custo, observacao"),
      sb.from("financeiro_historico").select("projeto_id, custo_antes, custo_depois, observacao, por, em").order("em", { ascending: false }).limit(800),
    ]);
    faltaScript = semTabela(v.error) ? "03" : semTabela(i.error) ? "06" : "";
    itens = new Map();
    if (!i.error) i.data.forEach((r) => { (itens.get(r.projeto_id) || itens.set(r.projeto_id, []).get(r.projeto_id)).push({ ...r, valor: Number(r.valor) }); });
    antigos = new Map(v.error ? [] : v.data.map((r) => [r.projeto_id, Number(r.custo)]));
    historico = h.error ? [] : h.data;
    carregado = true;
    if (!canal && !faltaScript) {
      canal = sb.channel("financeiro-altamar")
        .on("postgres_changes", { event: "*", schema: "public", table: "financeiro_itens" }, () => carregar())
        .subscribe();
    }
    A.store.emit();
  }

  function limpar() {
    itens = new Map(); antigos = new Map(); historico = []; carregado = false;
    if (canal) { try { cliente()?.removeChannel(canal); } catch {} canal = null; }
  }

  async function executar(promessa, ok) {
    if (!pode()) { toast("Só Pedro, Maíra e Shei podem alterar o financeiro.", "warn"); return false; }
    const { error } = await promessa;
    if (error) { toast("Não foi possível salvar no financeiro. Tente de novo.", "error", 6000); return false; }
    if (ok) toast(ok);
    await carregar();
    return true;
  }
  const tabela = () => cliente().from("financeiro_itens");

  // O projeto trocou de código (mudou de setor): os gastos acompanham o novo código.
  async function renomear(antigo, novo) {
    const sb = cliente();
    if (!sb || !perfilVe() || !itens.has(antigo)) return;
    await sb.from("financeiro_itens").update({ projeto_id: novo }).eq("projeto_id", antigo);
    await carregar();
  }

  // Total estimado do projeto (soma das linhas). null = nenhum gasto lançado.
  function custo(id) {
    const l = itens.get(id);
    if (l?.length) return l.reduce((t, x) => t + x.valor, 0);
    return faltaScript === "06" && antigos.has(id) ? antigos.get(id) : null;
  }

  // Projetos "em andamento" para a conta: abertos e já começados ou escolhidos para um ciclo.
  const emAndamento = (it) => it.status !== "Concluído" && it.status !== "Cancelado" && (it.status === "Em andamento" || !!it.ciclo);
  const quando = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  /* ---------- Página do projeto ---------- */
  function secaoFicha(it) {
    if (!pode()) return "";
    const cab = `<div class="panel-head"><h3 class="panel-title">💰 Financeiro</h3>
      <span class="fin-sigilo" title="Os líderes não veem esta seção nem recebem este dado do banco">🔒 Visível só para Pedro, Maíra e Shei</span></div>`;
    if (faltaScript === "03") return `<section class="panel fin-ficha">${cab}<p class="fin-aviso">O banco ainda não tem o financeiro. Rode os scripts <code>03_financeiro.sql</code> e <code>06_financeiro_itens.sql</code> no Supabase.</p></section>`;
    if (faltaScript === "06") return `<section class="panel fin-ficha">${cab}<p class="fin-aviso">Para lançar vários gastos por projeto, rode o script <code>06_financeiro_itens.sql</code> no Supabase.${antigos.has(it.id) ? ` Valor atual: <strong>${moeda(antigos.get(it.id))}</strong>.` : ""}</p></section>`;
    if (!carregado) return `<section class="panel fin-ficha">${cab}<p class="muted small">Carregando…</p></section>`;
    const linhas = itens.get(it.id) || [];
    const total = linhas.reduce((t, x) => t + x.valor, 0);
    const hist = historico.filter((h) => h.projeto_id === it.id);
    return `
      <section class="panel fin-ficha">
        ${cab}
        <table class="data fin-itens">
          <thead><tr><th>Gasto</th><th class="num">Valor estimado</th><th>Observação</th><th></th></tr></thead>
          <tbody>
            ${linhas.map((x) => `
              <tr title="${esc(`Atualizado por ${x.atualizado_por || "—"} em ${quando(x.atualizado_em)}`)}">
                <td><input class="fin-cel" data-fin-item="${esc(x.id)}" data-fin-campo="descricao" value="${esc(x.descricao)}" aria-label="Gasto"></td>
                <td class="num"><input class="fin-cel num" data-fin-item="${esc(x.id)}" data-fin-campo="valor" inputmode="decimal" value="${esc(x.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}" aria-label="Valor"></td>
                <td><input class="fin-cel" data-fin-item="${esc(x.id)}" data-fin-campo="observacao" value="${esc(x.observacao || "")}" placeholder="—" aria-label="Observação"></td>
                <td class="no-print"><button class="raci-x" data-fin-del="${esc(x.id)}" title="Remover esta linha" aria-label="Remover">✕</button></td>
              </tr>`).join("") || `<tr><td colspan="4" class="muted small">Nenhum gasto lançado ainda.</td></tr>`}
          </tbody>
          <tfoot><tr><th>Total estimado para concluir</th><th class="num">${moeda(total)}</th><th colspan="2"></th></tr></tfoot>
        </table>
        <form class="fin-add no-print" data-fin-add="${esc(it.id)}" autocomplete="off">
          <input class="input input-sm" name="descricao" placeholder="Gasto (ex.: equipamento, frete, instalação)" required>
          <input class="input input-sm fin-valor" name="valor" inputmode="decimal" placeholder="Valor (ex.: 12.500)" required>
          <input class="input input-sm" name="observacao" placeholder="Observação (opcional)">
          <button class="btn btn-sm btn-primary" type="submit">+ Adicionar gasto</button>
        </form>
        ${hist.length ? `<details class="fin-hist"><summary>Histórico do financeiro (${hist.length})</summary><ul>
          ${hist.map((h) => `<li><span class="muted small">${quando(h.em)} · ${esc(h.por || "—")}</span>
            ${h.observacao ? `${esc(h.observacao)}: ` : ""}${h.custo_antes == null ? "" : `${moeda(Number(h.custo_antes))} → `}<strong>${h.custo_depois == null ? "removido" : moeda(Number(h.custo_depois))}</strong></li>`).join("")}
        </ul></details>` : ""}
      </section>`;
  }

  /* ---------- Visão geral ---------- */
  function painelGeral(S) {
    if (!pode()) return "";
    if (faltaScript === "03") return `<section class="panel fin-geral"><p class="fin-aviso">💰 Para ver o financeiro, rode os scripts <code>03_financeiro.sql</code> e <code>06_financeiro_itens.sql</code> no Supabase.</p></section>`;
    const lista = S.state.data.initiatives.filter(emAndamento);
    const setores = S.areas().map((a) => {
      const projs = lista.filter((it) => it.area === a.key);
      if (!projs.length) return "";
      const soma = projs.reduce((t, it) => t + (custo(it.id) || 0), 0);
      return `
        <tbody class="fin-setor" style="--ac:${a.cor}">
          <tr class="fin-setor-head"><th colspan="2">${esc(a.key)}</th><th class="num">${moeda(soma)}</th></tr>
          ${projs.map((it) => `<tr>
            <td><a class="pr-id" style="--ac:${a.cor}" href="${A.drill.projectHref(it.id)}" data-nav>${esc(it.id)}</a></td>
            <td>${esc(it.nome)}${(itens.get(it.id) || []).length > 1 ? ` <span class="muted small">· ${(itens.get(it.id) || []).length} gastos</span>` : ""}</td>
            <td class="num">${custo(it.id) == null ? `<span class="muted small">sem valor</span>` : moeda(custo(it.id))}</td></tr>`).join("")}
        </tbody>`;
    }).join("");
    const total = lista.reduce((t, it) => t + (custo(it.id) || 0), 0);
    const semValor = lista.filter((it) => custo(it.id) == null).length;
    return `
      <details class="panel fin-geral" ${sessionStorage.getItem("altamar_fin_aberto") === "1" ? "open" : ""} data-fin-geral>
        <summary>
          <span>💰 Financeiro · projetos em andamento</span>
          <strong>${moeda(total)}</strong>
          <span class="muted small">para concluir ${lista.length} projeto${lista.length === 1 ? "" : "s"}${semValor ? ` · ${semValor} sem valor` : ""}</span>
          <span class="fin-sigilo">🔒 Pedro, Maíra e Shei</span>
        </summary>
        ${lista.length ? `<table class="data fin-tabela"><thead><tr><th>ID</th><th>Projeto</th><th class="num">Estimado para concluir</th></tr></thead>${setores}
          <tfoot><tr><th colspan="2">Total do programa</th><th class="num">${moeda(total)}</th></tr></tfoot></table>`
          : `<p class="muted small">Nenhum projeto em andamento ou no ciclo.</p>`}
        <p class="muted small">Conta os projetos em andamento ou escolhidos para um ciclo. Os gastos de cada um são lançados na página do projeto.</p>
      </details>`;
  }

  /* ---------- Eventos ---------- */
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-fin-add]");
    if (!f) return;
    e.preventDefault();
    const descricao = f.elements.descricao.value.trim();
    const valor = lerValor(f.elements.valor.value);
    if (!descricao) return toast("Diga qual é o gasto (ex.: frete).", "warn");
    if (valor == null || Number.isNaN(valor)) return toast("Valor inválido. Use, por exemplo, 12.500 ou 8.500,00.", "warn");
    executar(tabela().insert({ projeto_id: f.dataset.finAdd, descricao, valor, observacao: f.elements.observacao.value.trim() }), "Gasto adicionado.");
  });
  // Edição direto na tabela: muda o campo ao sair dele.
  document.addEventListener("change", (e) => {
    const el = e.target.closest?.("[data-fin-item]");
    if (!el) return;
    const campo = el.dataset.finCampo;
    let valor = el.value.trim();
    if (campo === "valor") {
      valor = lerValor(valor);
      if (valor == null || Number.isNaN(valor)) { toast("Valor inválido.", "warn"); return A.store.emit(); }
    }
    if (campo === "descricao" && !valor) { toast("O gasto precisa de um nome.", "warn"); return A.store.emit(); }
    executar(tabela().update({ [campo]: valor }).eq("id", el.dataset.finItem), "Financeiro atualizado.");
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest?.("[data-fin-del]");
    if (!b) return;
    if (!(await A.util.confirmDialog("Remover esta linha do financeiro? A remoção fica no histórico do financeiro.", { title: "Remover gasto", okLabel: "Remover", danger: true }))) return;
    executar(tabela().delete().eq("id", b.dataset.finDel), "Linha removida.");
  });
  document.addEventListener("toggle", (e) => {
    if (e.target.matches?.("[data-fin-geral]")) try { sessionStorage.setItem("altamar_fin_aberto", e.target.open ? "1" : "0"); } catch {}
  }, true);

  A.financeiro = { carregar, limpar, renomear, pode, custo, secaoFicha, painelGeral, lerValor };
})();
