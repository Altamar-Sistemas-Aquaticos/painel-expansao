/* Visão: quem está olhando o painel (gestor, diretoria ou líder de setor) e o que cada um vê.
   O gestor pode "ver como" outra pessoa para conferir a tela dela; as alterações continuam sendo dele. */
(function () {
  const A = window.Altamar;
  const { esc } = A.util;
  const $ = (id) => document.getElementById(id);

  const CHAVE = "altamar_ver_como";
  // Abas que o líder de setor enxerga (projeto e setor são telas que abrem a partir do Kanban).
  const ABAS_LIDER = ["programa", "kanban", "tarefas", "guia", "projeto", "setor"];
  const ROTULO = { gestor: "Gestor do programa", diretoria: "Diretoria", lider: "Líder de setor" };

  let simulada = null;
  try { simulada = JSON.parse(sessionStorage.getItem(CHAVE) || "null"); } catch {}

  const setoresDe = (nome) => A.store.areas().filter((a) => a.lider && a.lider === nome).map((a) => a.key);

  // Papel de verdade, vindo do login. Sem o banco compartilhado, quem usa é o gestor.
  function real() {
    const nome = A.store.state.settings.user || "";
    const perfil = A.nuvem?.perfil();
    if (!A.nuvem?.configurado || !perfil || perfil === "admin") return { tipo: "gestor", nome };
    if (perfil === "diretoria") return { tipo: "diretoria", nome };
    return { tipo: "lider", nome, setores: setoresDe(nome) };
  }

  function atual() {
    const r = real();
    if (r.tipo !== "gestor" || !simulada) return r;
    if (simulada.tipo === "diretoria") return { tipo: "diretoria", nome: "Diretoria", simulando: true };
    if (simulada.tipo === "lider") return { tipo: "lider", nome: simulada.nome, setores: setoresDe(simulada.nome), simulando: true };
    return r;
  }

  const podeVerAba = (aba) => atual().tipo !== "lider" || ABAS_LIDER.includes(aba);
  const abaInicial = () => (atual().tipo === "lider" ? "kanban" : "executivo");
  // Líder vê só os projetos dos próprios setores.
  const veProjeto = (it) => { const v = atual(); return v.tipo !== "lider" || v.setores.includes(it.area); };

  // Líderes cadastrados (menos o próprio gestor, cuja visão já é a de gestor).
  function lideres() {
    const eu = real().nome;
    const mapa = new Map();
    A.store.areas().forEach((a) => {
      if (!a.lider || a.lider === eu) return;
      mapa.set(a.lider, [...(mapa.get(a.lider) || []), a.key]);
    });
    return [...mapa.entries()];
  }

  function simular(valor) {
    simulada = !valor || valor === "gestor" ? null
      : valor === "diretoria" ? { tipo: "diretoria" }
      : { tipo: "lider", nome: valor.replace(/^lider:/, "") };
    try { simulada ? sessionStorage.setItem(CHAVE, JSON.stringify(simulada)) : sessionStorage.removeItem(CHAVE); } catch {}
    aplicar();
    A.store.emit();
    location.hash = abaInicial();
  }

  function aplicar() {
    const r = real();
    const v = atual();
    document.body.dataset.visao = v.tipo;

    // Seletor "Ver como…": só para o gestor.
    const sel = $("ver-como");
    if (sel) {
      sel.classList.toggle("hidden", r.tipo !== "gestor");
      const valor = !simulada ? "gestor" : simulada.tipo === "diretoria" ? "diretoria" : `lider:${simulada.nome}`;
      sel.innerHTML = `
        <option value="gestor">👁 Ver como: eu (gestor)</option>
        <option value="diretoria">👁 Diretoria (Maíra e Shei)</option>
        ${lideres().map(([nome, setores]) => `<option value="lider:${esc(nome)}">👁 Líder: ${esc(nome)} · ${esc(setores.join(", "))}</option>`).join("")}`;
      sel.value = valor;
    }

    // Faixa de aviso enquanto o gestor está "vendo como" outra pessoa.
    const faixa = $("visao-banner");
    if (faixa) {
      faixa.classList.toggle("hidden", !v.simulando);
      if (v.simulando) {
        const quem = v.tipo === "diretoria" ? "a <strong>Diretoria</strong>"
          : `<strong>${esc(v.nome)}</strong> (líder de ${esc(v.setores.join(", ") || "nenhum setor")})`;
        faixa.innerHTML = `👁 Você está vendo o painel como ${quem}. As alterações continuam sendo feitas em seu nome.
          <button class="btn btn-xs btn-outline" data-visao-voltar>Voltar à minha visão</button>`;
      }
    }
  }

  function init() {
    $("ver-como")?.addEventListener("change", (e) => simular(e.target.value));
    document.addEventListener("click", (e) => { if (e.target.closest("[data-visao-voltar]")) simular("gestor"); });
    aplicar();
  }

  A.visao = { init, aplicar, atual, real, podeVerAba, abaInicial, veProjeto, setoresDe, ROTULO };
})();
