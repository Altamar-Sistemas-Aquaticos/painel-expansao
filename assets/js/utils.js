/* Utilitários genéricos: escape, formatação, toasts, modais e downloads. */
(function () {
  const A = (window.Altamar = window.Altamar || {});

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

  // Normaliza texto para comparações: sem acento, minúsculo, só letras/números.
  const norm = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const fmtNum = (n, d = 2) =>
    Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = () => {
    const d = new Date();
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  const fmtTime = (iso) => {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fmtDay = (iso) =>
    new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const fmtDateTime = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  // Converte número de série de data do Excel (ex.: 46310) para dd/mm/aaaa.
  function excelSerialToStr(serial) {
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const initials = (name) =>
    String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";

  /* ---------- Toasts ---------- */
  function toast(message, type = "ok", ms = 3200) {
    const host = document.getElementById("toasts");
    if (!host) return;
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.setAttribute("role", "status");
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 260);
    }, ms);
  }

  /* ---------- Modais ---------- */
  let lastFocus = null;
  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    lastFocus = document.activeElement;
    m.classList.add("open");
    const first = m.querySelector("[autofocus], input:not([type=hidden]), select, textarea, button");
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove("open");
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  }
  function closeTopModal() {
    const open = [...document.querySelectorAll(".modal-backdrop.open")];
    if (open.length) closeModal(open[open.length - 1].id);
    return open.length > 0;
  }

  // Confirmação assíncrona com modal próprio (substitui window.confirm).
  function confirmDialog(message, { title = "Confirmar", okLabel = "Confirmar", danger = false } = {}) {
    return new Promise((resolve) => {
      document.getElementById("confirm-title").textContent = title;
      document.getElementById("confirm-message").textContent = message;
      const ok = document.getElementById("confirm-ok");
      ok.textContent = okLabel;
      ok.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
      const cancel = document.getElementById("confirm-cancel");
      const modal = document.getElementById("modal-confirm");
      const done = (val) => {
        ok.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        modal.removeEventListener("modal:dismiss", onCancel);
        closeModal("modal-confirm");
        resolve(val);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      ok.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      modal.addEventListener("modal:dismiss", onCancel);
      openModal("modal-confirm");
      setTimeout(() => ok.focus(), 40);
    });
  }

  // Pergunta com uma resposta em texto (ex.: motivo de uma escolha). Resolve com o texto, ou null se cancelar.
  function pedirTexto(message, { title = "Informe", okLabel = "Confirmar", placeholder = "", obrigatorio = true } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById("modal-texto");
      const input = document.getElementById("texto-input");
      const ok = document.getElementById("texto-ok");
      const cancel = document.getElementById("texto-cancel");
      document.getElementById("texto-title").textContent = title;
      document.getElementById("texto-message").textContent = message;
      input.value = ""; input.placeholder = placeholder;
      ok.textContent = okLabel;
      const done = (val) => {
        ok.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        modal.removeEventListener("modal:dismiss", onCancel);
        input.removeEventListener("keydown", onKey);
        closeModal("modal-texto");
        resolve(val);
      };
      const onOk = () => {
        const v = input.value.trim();
        if (obrigatorio && !v) { input.focus(); input.classList.add("invalid"); return; }
        done(v);
      };
      const onCancel = () => done(null);
      const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onOk(); } };
      ok.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      modal.addEventListener("modal:dismiss", onCancel);
      input.addEventListener("keydown", onKey);
      input.classList.remove("invalid");
      openModal("modal-texto");
      setTimeout(() => input.focus(), 40);
    });
  }
  /* ---------- Arquivos ---------- */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const loadedScripts = {};
  function loadScript(src) {
    if (!loadedScripts[src]) {
      loadedScripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => {
          delete loadedScripts[src];
          reject(new Error("Falha ao carregar " + src));
        };
        document.head.appendChild(s);
      });
    }
    return loadedScripts[src];
  }

  A.util = {
    esc, norm, fmtNum, todayStr, fmtTime, fmtDay, fmtDateTime, excelSerialToStr,
    clone, uid, initials, toast, openModal, closeModal, closeTopModal, confirmDialog, pedirTexto,
    downloadBlob, loadScript,
  };
})();
