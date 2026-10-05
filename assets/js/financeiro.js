/* Financeiro por projeto (confidencial): quanto se estima gastar até o projeto ficar pronto.
   Fica numa tabela própria do banco (supabase/03_financeiro.sql), que só responde a admin e diretoria
   (Pedro, Maíra e Shei). Nada disso entra no painel compartilhado nem no histórico geral. */
(function () {
  const A = window.Altamar;
  const { esc, toast } = A.util;

  let valores = new Map();    // projeto_id → { custo, observacao, atualizado_em, atualizado_por }
  let historico = [];         // linhas de financeiro_historico, mais novas primeiro
  let carregado = false;
  let faltaScript = false;    // o banco ainda não tem a tabela (script 03 não rodou)
  let canal = null;

  const cliente = () => A.nuvem?.cliente?.() || null;
  const perfilVe = () => ["admin", "diretoria"].includes(A.nuvem?.perfil?.());
  // Mostra só para quem o banco libera, e nunca quando o gestor está "vendo como" um líder.
  const pode = () => perfilVe() && A.visao.atual().tipo !== "lider";

  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const moeda = (v) => (v == null ? "—" : BRL.format(v));
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
    const [v, h] = await Promise.all([
      sb.from("financeiro").select("projeto_id, custo, observacao, atualizado_em, atualizado_por"),
      sb.from("financeiro_historico").select("projeto_id, custo_antes, custo_depois, observacao, por, em").order("em", { ascending: false }).limit(500),
    ]);
    if (v.error) {
      faltaScript = /does not exist|Could not find|relation/i.test(String(v.error.message || ""));
      carregado = true;
      A.store.emit();
      return;
    }
    faltaScript = false;
    valores = new Map(v.data.map((r) => [r.projeto_id, { ...r, custo: Number(r.custo) }]));
    historico = h.error ? [] : h.data;
    carregado = true;
    if (!canal) {
      canal = sb.channel("financeiro-altamar")
        .on("postgres_changes", { event: "*", schema: "public", table: "financeiro" }, () => carregar())
        .subscribe();
    }
    A.store.emit();
  }

  function limpar() {
    valores = new Map(); historico = []; carregado = false;
    if (canal) { try { cliente()?.removeChannel(canal); } catch {} canal = null; }
  }

  async function salvar(id, custo, observacao) {
    const sb = cliente();
    if (!sb || !pode()) return toast("Só Pedro, Maíra e Shei podem alterar o financeiro.", "warn");
    const { error } = custo == null
      ? await sb.from("financeiro").delete().eq("projeto_id", id)
      : await sb.from("financeiro").upsert({ projeto_id: id, custo, observacao: observacao || "" });
    if (error) return toast("Não foi possível salvar o valor. Tente de novo.", "error", 6000);
    toast(custo == null ? "Valor removido." : "Valor salvo.");
    await carregar();
  }

  // O projeto trocou de código (mudou de setor): o valor acompanha o novo código.
  async function renomear(antigo, novo) {
    const sb = cliente();
    if (!sb || !perfilVe() || !valores.has(antigo)) return;
    const atual = valores.get(antigo);
    const { error } = await sb.from("financeiro").upsert({ projeto_id: novo, custo: atual.custo, observacao: `${atual.observacao || ""} (código antigo ${antigo})`.trim() });
    if (!error) await sb.from("financeiro").delete().eq("projeto_id", antigo);
    await carregar();
  }

  const custo = (id) => valores.get(id)?.custo ?? null;

  // Projetos "em andamento" para a conta: abertos e já começados ou escolhidos para um ciclo.
  const emAndamento = (it) => it.status !== "Concluído" && it.status !== "Cancelado" && (it.status === "Em andamento" || !!it.ciclo);

  /* ---------- Ficha do projeto ---------- */
  function secaoFicha(it) {
    if (!pode()) return "";
    const aviso = faltaScript
      ? `<p class="fin-aviso">O banco ainda não tem a tabela do financeiro. Rode o script <code>supabase/03_financeiro.sql</code> no Supabase.</p>` : "";
    const atual = valores.get(it.id);
    const hist = historico.filter((h) => h.projeto_id === it.id);
    const quando = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
    return `
      <section class="panel fin-ficha">
        <div class="panel-head"><h3 class="panel-title">💰 Financeiro</h3>
          <span class="fin-sigilo" title="Os líderes não veem esta seção nem recebem este dado do banco">🔒 Visível só para Pedro, Maíra e Shei</span></div>
        ${aviso || (!carregado ? `<p class="muted small">Carregando…</p>` : `
        <form class="fin-form" data-fin-form="${esc(it.id)}">
          <label class="ficha-campo"><span>Gasto médio estimado até concluir</span>
            <input class="input input-sm fin-valor" name="custo" inputmode="decimal" placeholder="ex.: 120.000" value="${atual ? esc(atual.custo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })) : ""}"></label>
          <label class="ficha-campo fin-obs"><span>Observação (de onde vem o valor)</span>
            <input class="input input-sm" name="observacao" maxlength="300" placeholder="ex.: orçamento do fornecedor X, sem frete" value="${esc(atual?.observacao || "")}"></label>
          <button class="btn btn-sm btn-primary" type="submit">Salvar</button>
        </form>
        <div class="fin-resumo">
          ${atual ? `<strong>${moeda(atual.custo)}</strong> <span class="muted small">· atualizado por ${esc(atual.atualizado_por || "—")} em ${quando(atual.atualizado_em)}</span>`
            : `<span class="muted small">Ainda sem valor estimado.</span>`}
        </div>
        ${hist.length ? `<details class="fin-hist"><summary>Histórico do valor (${hist.length})</summary><ul>
          ${hist.map((h) => `<li><span class="muted small">${quando(h.em)} · ${esc(h.por || "—")}</span>
            ${h.custo_antes == null ? "" : `${moeda(Number(h.custo_antes))} → `}<strong>${h.custo_depois == null ? "removido" : moeda(Number(h.custo_depois))}</strong>
            ${h.observacao ? `<span class="muted small">· ${esc(h.observacao)}</span>` : ""}</li>`).join("")}
        </ul></details>` : ""}`)}
      </section>`;
  }

  /* ---------- Visão geral ---------- */
  function painelGeral(S) {
    if (!pode()) return "";
    if (faltaScript) return `<section class="panel fin-geral"><p class="fin-aviso">💰 Para ver o financeiro, rode o script <code>supabase/03_financeiro.sql</code> no Supabase.</p></section>`;
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
            <td>${esc(it.nome)}</td>
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
        <p class="muted small">Conta os projetos em andamento ou escolhidos para um ciclo. O valor de cada um é editado na ficha do projeto.</p>
      </details>`;
  }

  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-fin-form]");
    if (!f) return;
    e.preventDefault();
    const v = lerValor(f.elements.custo.value);
    if (Number.isNaN(v)) return toast("Valor inválido. Use, por exemplo, 120.000 ou 85.500,00.", "warn");
    salvar(f.dataset.finForm, v, f.elements.observacao.value.trim());
  });
  document.addEventListener("toggle", (e) => {
    if (e.target.matches?.("[data-fin-geral]")) try { sessionStorage.setItem("altamar_fin_aberto", e.target.open ? "1" : "0"); } catch {}
  }, true);

  A.financeiro = { carregar, limpar, renomear, pode, custo, secaoFicha, painelGeral, lerValor };
})();
