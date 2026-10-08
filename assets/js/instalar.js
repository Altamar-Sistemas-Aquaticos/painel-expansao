/* Aplicativo: registra o service worker e oferece "Instalar o aplicativo" (computador e celular).
   No iPhone não existe botão automático: mostramos o passo a passo do Safari. */
(function () {
  const A = window.Altamar;
  let pedido = null; // evento do navegador que permite instalar com um clique

  const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const iphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const android = () => /android/i.test(navigator.userAgent);

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pedido = e;
    atualizarMenu();
  });
  window.addEventListener("appinstalled", () => {
    pedido = null;
    atualizarMenu();
    A.util.toast("Aplicativo instalado. Ele aparece na área de trabalho (ou na tela inicial) como “Painel Altamar”.", "ok", 7000);
  });

  function atualizarMenu() {
    const b = document.getElementById("menu-instalar");
    if (b) b.classList.toggle("hidden", instalado());
  }

  async function instalar() {
    document.getElementById("data-menu")?.classList.add("hidden");
    if (pedido) {
      pedido.prompt();
      await pedido.userChoice.catch(() => null);
      pedido = null;
      return;
    }
    const passos = iphone()
      ? "No iPhone/iPad: abra o painel no Safari, toque em Compartilhar (o quadrado com a seta para cima) e escolha “Adicionar à Tela de Início”."
      : android()
        ? "No Android: no Chrome, toque nos três pontinhos (⋮) e escolha “Instalar app” ou “Adicionar à tela inicial”."
        : "No computador: no Chrome ou no Edge, clique no ícone de instalar no fim da barra de endereço (um monitor com uma seta) ou, no menu do navegador, em “Instalar Painel Altamar”.";
    await A.util.confirmDialog(`${passos} Depois disso, o painel abre pelo ícone da Altamar, em janela própria, sem procurar link.`,
      { title: "📲 Instalar o aplicativo", okLabel: "Entendi" });
  }

  document.addEventListener("click", (e) => { if (e.target.closest("#menu-instalar")) instalar(); });
  document.addEventListener("DOMContentLoaded", atualizarMenu);

  A.instalar = { instalar, instalado };
})();
