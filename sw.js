/* Service worker do Painel Altamar: permite instalar o painel como aplicativo.
   Sempre busca a versão mais nova na internet (os dados vêm do banco compartilhado);
   só usa a cópia guardada da tela inicial se estiver sem conexão. */
const CACHE = "painel-altamar-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Só a página do painel (navegação) tem cópia de reserva; banco, Google e demais pedidos passam direto.
  if (req.mode !== "navigate") return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put("./", copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match("./").then((r) => r || caches.match("./index.html")))
  );
});
