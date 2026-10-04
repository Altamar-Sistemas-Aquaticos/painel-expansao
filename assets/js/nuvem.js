/* Banco compartilhado (Supabase): login, carga, gravação com controle de versão e atualização em tempo real.
   Sem configuração (config.js com a chave vazia), nada aqui roda e o painel continua só no navegador. */
(function () {
  const A = window.Altamar;
  const { toast, esc, openModal, closeModal, confirmDialog } = A.util;
  const $ = (id) => document.getElementById(id);

  const cfg = window.ALTAMAR_CONFIG || {};
  const configurado = !!(cfg.supabaseUrl && cfg.supabaseKey);
  const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
  const PERFIL_LABEL = { admin: "Administrador", diretoria: "Diretoria", visualizacao: "Visualização" };

  let sb = null;
  let membro = null;      // { email, nome, perfil }
  let versao = null;      // versão do painel no banco que estes dados representam
  let timer = null, salvando = false, pendente = false;
  let status = "";        // texto do rodapé
  let membros = [];       // lista para o cadastro de acesso (só admin)
  let ultimoEmail = "";   // e-mail digitado/logado (para as mensagens do login)
  let retornoEmail = "";  // o que o link do e-mail trouxe no endereço (#access_token=… ou #error=…), guardado antes das rotas do painel

  const podeEscrever = () => membro && (membro.perfil === "admin" || membro.perfil === "diretoria");
  const conectado = () => !!membro;
  const setStatus = (t) => { status = t; const el = $("save-status"); if (el) el.textContent = t; };

  /* ---------- Início ---------- */
  async function iniciar() {
    if (!configurado) return;
    document.body.classList.add("nuvem");
    setStatus("Conectando ao banco…");
    try {
      await A.util.loadScript(SDK);
      // Devolve ao endereço o que o link do e-mail trouxe, para a biblioteca concluir o login.
      if (retornoEmail.includes("access_token")) history.replaceState(null, "", location.pathname + location.search + "#" + retornoEmail);
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    } catch {
      setStatus("⚠️ Sem conexão com o banco: trabalhando só neste navegador");
      return toast("Não foi possível conectar ao banco compartilhado. As alterações ficam só neste navegador por enquanto.", "error", 7000);
    }
    sb.auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY") abrirLogin("nova-senha");
    });
    const { data } = await sb.auth.getSession();
    if (retornoEmail) history.replaceState(null, "", location.pathname + location.search + "#executivo");
    const aviso = lerRetornoDoEmail();
    if (data.session) await entrou();
    else {
      setStatus("Entre com seu e-mail para ver o painel compartilhado");
      abrirLogin("entrar");
      if (aviso) $("login-msg").textContent = aviso;
    }
  }

  // Depois do login: confere se é membro, carrega o painel e liga o tempo real.
  async function entrou() {
    const { data: eu, error } = await sb.rpc("eu");
    if (error) return falha("Não consegui ler seu perfil no banco.", error);
    membro = eu && eu[0];
    if (!membro) {
      const { data: u } = await sb.auth.getUser();
      ultimoEmail = u?.user?.email || ultimoEmail;
      abrirLogin("sem-acesso");
      return;
    }
    closeModal("modal-login");
    document.body.dataset.perfil = membro.perfil;
    A.store.saveSettings({ user: membro.nome });
    await buscar({ primeiraVez: true });
    ligarTempoReal();
    if (membro.perfil === "admin") carregarMembros();
  }

  async function buscar({ primeiraVez = false } = {}) {
    const { data, error } = await sb.from("painel").select("dados, versao, atualizado_em, atualizado_por").eq("id", "altamar").maybeSingle();
    if (error) return falha("Não consegui carregar o painel do banco.", error);
    if (!data) {
      // Banco vazio: o administrador publica os dados que estão neste navegador.
      if (membro.perfil !== "admin") {
        setStatus("O painel ainda não foi publicado pelo administrador");
        return toast("O painel compartilhado ainda está vazio. Peça ao Pedro para publicá-lo.", "warn", 7000);
      }
      versao = null;
      setStatus("Banco compartilhado vazio: publique os dados");
      const doArquivo = await confirmDialog(
        "O banco compartilhado ainda está vazio. Publicar a partir do arquivo de backup (.json) que você exportou do painel?",
        { title: "Publicar o painel", okLabel: "Escolher arquivo de backup" });
      if (doArquivo) {
        // A restauração do backup grava normalmente, e a gravação publica no banco.
        $("file-json").click();
        return;
      }
      const ok = await confirmDialog(
        `Então publicar os dados que estão neste navegador (${A.store.state.data.initiatives.length} projetos, histórico e sprints)?`,
        { title: "Publicar o painel", okLabel: "Publicar estes dados" });
      if (ok) { await salvar(); toast("Painel publicado no banco compartilhado."); }
      return;
    }
    versao = data.versao;
    const origem = A.store.adotarDaNuvem(data.dados);
    setStatus(`☁️ Sincronizado · última alteração de ${data.atualizado_por || "—"} às ${horaDe(data.atualizado_em)}`);
    // Dados antigos que migraram de versão: quem pode escrever já devolve a versão nova ao banco.
    if (primeiraVez && origem === "upgraded" && podeEscrever()) agendar();
  }

  function ligarTempoReal() {
    sb.channel("painel-altamar")
      .on("postgres_changes", { event: "*", schema: "public", table: "painel" }, (payload) => {
        const v = payload.new?.versao;
        if (!v || v === versao || salvando) return;
        buscar().then(() => toast(`Painel atualizado por ${payload.new.atualizado_por || "outra pessoa"}.`, "ok", 3500));
      })
      .subscribe();
  }

  /* ---------- Gravação ---------- */
  // Chamado a cada alteração (store.commit): junta alterações próximas e envia uma vez.
  function agendar() {
    if (!sb || !membro) return;
    if (!podeEscrever()) {
      toast("Seu perfil é de visualização: a alteração não foi salva no painel compartilhado.", "warn", 5000);
      buscar(); // desfaz a alteração local, voltando ao que está no banco
      return;
    }
    setStatus("Salvando…");
    clearTimeout(timer);
    timer = setTimeout(salvar, 1200);
  }

  async function salvar() {
    if (salvando) { pendente = true; return; }
    salvando = true;
    const { data, error } = await sb.rpc("salvar_painel", { p_dados: A.store.state.data, p_versao: versao });
    salvando = false;
    if (error) {
      const msg = String(error.message || "");
      if (msg.startsWith("conflito")) {
        await buscar();
        toast("Outra pessoa salvou ao mesmo tempo. Carreguei a versão mais nova: confira sua última alteração.", "warn", 8000);
      } else if (msg.includes("somente_leitura")) {
        await buscar();
        toast("Seu perfil é de visualização: a alteração não foi salva.", "warn", 5000);
      } else {
        setStatus("⚠️ Não foi possível salvar no banco");
        toast("Não foi possível salvar no banco compartilhado. A alteração ficou neste navegador; tente de novo em instantes.", "error", 7000);
      }
    } else {
      versao = data;
      setStatus(`☁️ Salvo no banco às ${horaDe(new Date().toISOString())}`);
    }
    if (pendente) { pendente = false; salvar(); }
  }

  // Perfil Visualização: atualiza o andamento das próprias atividades (R) direto no banco, que confere a permissão.
  async function atualizarMinhaAtividade(iniId, actId, patch) {
    if (!sb || !membro) return { ok: false };
    setStatus("Salvando…");
    const { data, error } = await sb.rpc("atualizar_minha_atividade", { p_ini: iniId, p_act: actId, p_patch: patch });
    if (error) {
      const msg = String(error.message || "");
      toast(msg.includes("nao_responsavel") ? "Você só pode atualizar as atividades em que é o responsável (R)."
        : msg.includes("Could not find") || msg.includes("does not exist") ? "O banco ainda não tem a regra para atualizar atividades. Avise o administrador (script 02)."
        : "Não foi possível salvar a atividade. Tente de novo.", "error", 6000);
      await buscar();
      return { ok: false };
    }
    versao = data;
    await buscar();
    return { ok: true };
  }

  /* ---------- Login ---------- */
  const TELAS = {
    entrar: { titulo: "Entrar no painel", botao: "Entrar", senha: true },
    criar: { titulo: "Primeiro acesso: crie sua senha", botao: "Criar senha e entrar", senha: true },
    esqueci: { titulo: "Recuperar senha", botao: "Enviar link por e-mail", senha: false },
    "nova-senha": { titulo: "Defina uma nova senha", botao: "Salvar nova senha", senha: true },
    "sem-acesso": { titulo: "Acesso ainda não liberado", botao: "", senha: false },
  };
  let tela = "entrar";

  function abrirLogin(qual) {
    tela = qual;
    const t = TELAS[qual];
    $("login-titulo").textContent = t.titulo;
    $("login-erro").textContent = "";
    $("login-msg").innerHTML = qual === "sem-acesso"
      ? `O e-mail <strong>${esc(sbEmail())}</strong> entrou, mas ainda não está cadastrado como membro do painel. Peça ao Pedro para liberar o seu acesso.`
      : qual === "criar" ? "Use o seu e-mail da Altamar. Só entra quem foi cadastrado pelo administrador."
      : qual === "esqueci" ? "Enviaremos um link para você criar uma nova senha."
      : qual === "nova-senha" ? "Escolha a nova senha (mínimo de 8 caracteres)." : "";
    $("login-email-campo").classList.toggle("hidden", qual === "nova-senha" || qual === "sem-acesso");
    $("login-senha-campo").classList.toggle("hidden", !t.senha);
    $("login-enviar").classList.toggle("hidden", !t.botao);
    $("login-enviar").textContent = t.botao;
    $("login-links").innerHTML = {
      entrar: `<a href="#" data-login="criar">Primeiro acesso? Crie sua senha</a> · <a href="#" data-login="esqueci">Esqueci a senha</a>`,
      criar: `<a href="#" data-login="entrar">Já tenho senha</a>`,
      esqueci: `<a href="#" data-login="entrar">Voltar</a>`,
      "nova-senha": "",
      "sem-acesso": `<a href="#" data-login="sair">Entrar com outro e-mail</a>`,
    }[qual];
    openModal("modal-login");
  }
  const sbEmail = () => ultimoEmail;

  async function enviarLogin(e) {
    e.preventDefault();
    const email = $("login-email").value.trim().toLowerCase();
    const senha = $("login-senha").value;
    const erro = (t) => { $("login-erro").textContent = t; };
    if (tela !== "nova-senha" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro("Informe um e-mail válido.");
    if (TELAS[tela].senha && senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.");
    ultimoEmail = email;
    $("login-enviar").disabled = true;
    try {
      if (tela === "entrar") {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error && /not confirmed/i.test(error.message)) {
          $("login-erro").innerHTML = `Seu e-mail ainda não foi confirmado. <a href="#" data-login="reenviar">Reenviar o e-mail de confirmação</a>`;
          return;
        }
        if (error) return erro(/invalid/i.test(error.message) ? "E-mail ou senha incorretos. No primeiro acesso, use “Crie sua senha”." : error.message);
        await entrou();
      } else if (tela === "criar") {
        const { data, error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: enderecoDoPainel() } });
        if (error) return erro(/already/i.test(error.message) ? "Este e-mail já tem senha. Use “Já tenho senha” ou “Esqueci a senha”." : error.message);
        if (!data.session) return erro("Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre com a senha.");
        await entrou();
      } else if (tela === "esqueci") {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: enderecoDoPainel() });
        if (error) return erro(error.message);
        $("login-msg").textContent = "Pronto. Abra o link que chegou no seu e-mail (pode levar alguns minutos).";
      } else if (tela === "nova-senha") {
        const { error } = await sb.auth.updateUser({ password: senha });
        if (error) return erro(error.message);
        toast("Senha atualizada.");
        await entrou();
      }
    } finally {
      $("login-enviar").disabled = false;
    }
  }

  async function sair() {
    if (!sb) return;
    await sb.auth.signOut();
    membro = null; versao = null;
    delete document.body.dataset.perfil;
    abrirLogin("entrar");
  }

  /* ---------- Cadastro de acesso (só administrador) ---------- */
  async function carregarMembros() {
    const { data, error } = await sb.from("membros").select("email, nome, perfil, ativo").order("nome");
    if (!error) { membros = data; renderMembros(); }
  }

  function renderMembros() {
    const el = $("cad-acesso");
    if (!el) return;
    if (!membro || membro.perfil !== "admin") { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const opt = (sel) => Object.entries(PERFIL_LABEL).map(([k, l]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${l}</option>`).join("");
    el.innerHTML = `
      <div class="panel-head">
        <div>
          <h3 class="panel-title">Acesso ao painel</h3>
          <div class="muted small">Quem pode entrar e com qual perfil. Depois de cadastrada, a pessoa abre o painel e clica em “Primeiro acesso? Crie sua senha”.
          <strong>Administrador</strong>: tudo · <strong>Diretoria</strong>: altera projetos, ondas, sprint e decisões · <strong>Visualização</strong>: só vê.</div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th class="center">Ativo</th></tr></thead>
          <tbody>${membros.map((m) => `
            <tr>
              <td>${esc(m.nome)}</td>
              <td>${esc(m.email)}</td>
              <td><select class="input input-sm" data-membro="${esc(m.email)}" data-campo="perfil" ${m.email === membro.email ? "disabled title=\"Você não pode mudar o seu próprio perfil\"" : ""}>${opt(m.perfil)}</select></td>
              <td class="center"><input type="checkbox" data-membro="${esc(m.email)}" data-campo="ativo" ${m.ativo ? "checked" : ""} ${m.email === membro.email ? "disabled" : ""}></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
      <form class="cad-add" id="acesso-form" autocomplete="off">
        <input class="input input-sm" id="acesso-nome" placeholder="Nome (como aparece no painel)">
        <input class="input input-sm" id="acesso-email" placeholder="e-mail@altamar.com.br">
        <select class="input input-sm" id="acesso-perfil">${opt("visualizacao")}</select>
        <button class="btn btn-sm btn-primary" type="submit">+ Liberar acesso</button>
      </form>`;
  }

  async function salvarMembro(email, patch) {
    const { error } = await sb.from("membros").update(patch).eq("email", email);
    if (error) toast("Não foi possível alterar o acesso.", "error");
    else toast("Acesso atualizado.");
    carregarMembros();
  }

  async function novoMembro(e) {
    e.preventDefault();
    const nome = $("acesso-nome").value.trim();
    const email = $("acesso-email").value.trim().toLowerCase();
    if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Informe nome e e-mail válidos.", "error");
    const { error } = await sb.from("membros").insert({ nome, email, perfil: $("acesso-perfil").value });
    if (error) return toast(/duplicate/i.test(error.message) ? "Esse e-mail já está cadastrado." : "Não foi possível liberar o acesso.", "error");
    toast(`Acesso liberado para ${nome}. Avise para abrir o painel e criar a senha.`, "ok", 6000);
    // A pessoa também entra no cadastro de pessoas do painel (para receber papéis na RACI).
    if (!A.store.findPessoa(nome)) A.store.savePessoa({ nome, email });
    carregarMembros();
  }

  async function reenviarConfirmacao() {
    const email = ($("login-email").value || ultimoEmail).trim().toLowerCase();
    if (!email) return ($("login-erro").textContent = "Digite o seu e-mail acima.");
    const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: enderecoDoPainel() } });
    if (error) {
      $("login-erro").textContent = /rate|limit|seconds/i.test(error.message)
        ? "Muitos e-mails enviados há pouco. Espere alguns minutos e tente de novo." : error.message;
      return;
    }
    $("login-erro").textContent = "";
    $("login-msg").textContent = "Enviamos um novo e-mail de confirmação. Clique no link uma vez só; se ele disser que expirou, volte aqui e entre com e-mail e senha.";
  }

  // O link do e-mail volta para cá. Erros vêm no endereço (#error=...): mostra uma mensagem clara e limpa o endereço.
  function lerRetornoDoEmail() {
    const h = new URLSearchParams(retornoEmail);
    if (!h.get("error")) return null;
    return h.get("error_code") === "otp_expired"
      ? "Esse link já tinha sido usado ou expirou. Isso é comum em e-mails corporativos, que abrem os links para checar segurança e às vezes já confirmam a conta. Tente entrar com e-mail e senha."
      : `O link do e-mail não funcionou (${h.get("error_description") || h.get("error")}). Tente entrar com e-mail e senha ou peça um novo link.`;
  }

  /* ---------- Auxiliares ---------- */
  // Endereço completo do painel (com /painel-expansao/), para onde os links de e-mail devem voltar.
  const enderecoDoPainel = () => location.origin + location.pathname;
  const horaDe = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  function falha(msg, error) {
    console.error(msg, error);
    setStatus("⚠️ " + msg);
    toast(msg, "error", 7000);
  }

  function init() {
    if (!configurado) return;
    // Guarda o retorno do link do e-mail antes que o painel troque o endereço para a aba inicial.
    if (/access_token|error=|type=recovery/.test(location.hash)) retornoEmail = location.hash.slice(1);
    $("login-form").addEventListener("submit", enviarLogin);
    $("modal-login").addEventListener("click", (e) => {
      const a = e.target.closest("[data-login]");
      if (!a) return;
      e.preventDefault();
      if (a.dataset.login === "sair") sair();
      else if (a.dataset.login === "reenviar") reenviarConfirmacao();
      else abrirLogin(a.dataset.login);
    });
    document.addEventListener("change", (e) => {
      const el = e.target.closest("[data-membro]");
      if (!el) return;
      salvarMembro(el.dataset.membro, { [el.dataset.campo]: el.type === "checkbox" ? el.checked : el.value });
    });
    document.addEventListener("submit", (e) => { if (e.target.id === "acesso-form") novoMembro(e); });
    $("menu-sair").classList.remove("hidden");
    $("menu-sair").addEventListener("click", () => sair());
  }

  A.nuvem = {
    configurado, init, iniciar, agendar, sair, conectado, renderMembros, atualizarMinhaAtividade,
    status: () => status,
    perfil: () => membro?.perfil || null,
    perfilLabel: () => (membro ? PERFIL_LABEL[membro.perfil] : ""),
  };
})();
