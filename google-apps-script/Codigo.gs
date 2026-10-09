/**
 * Ponte entre o Painel de Expansão Altamar e o Google Agenda.
 *
 * Como instalar (uma vez):
 *  1. Cole este arquivo no Apps Script (script.google.com) e salve.
 *  2. Execute a função `configurar` e autorize. O registro mostra a SENHA DA PONTE.
 *  3. Implantar → Nova implantação → Tipo "App da Web" → Executar como: "Eu";
 *     Quem pode acessar: "Qualquer pessoa" → Implantar. Copie a URL do app da Web.
 *  4. No painel: ⚙️ Dados → Conectar Google Agenda → cole a URL e a senha.
 *
 * O que faz:
 *  - sync: cria/atualiza/remove na agenda "Painel Altamar" os prazos, entregas e compromissos do painel.
 *  - list: devolve os compromissos da sua agenda principal num intervalo de datas.
 * Toda chamada precisa da senha; sem ela, nada é lido nem gravado.
 */

const NOME_AGENDA = "Painel Altamar";
const TAG = "painelId";                // identifica, no Google, qual item do painel gerou o evento
const LEMBRETE_DIA_INTEIRO_MIN = 900;  // dia anterior às 9h (15h antes da meia-noite do dia do prazo)
const LEMBRETE_COM_HORARIO_MIN = 30;

/* ---------- Instalação ---------- */
function configurar() {
  const props = PropertiesService.getScriptProperties();
  let senha = props.getProperty("SENHA");
  if (!senha) {
    senha = Utilities.getUuid().replace(/-/g, "").slice(0, 24);
    props.setProperty("SENHA", senha);
  }
  const agenda = obterAgenda_();
  Logger.log("Agenda do painel: " + agenda.getName());
  Logger.log("SENHA DA PONTE (cole no painel): " + senha);
}

/* ---------- Entrada HTTP ---------- */
function doGet(e) {
  return responder_(e.parameter || {});
}

function doPost(e) {
  let corpo = {};
  try { corpo = JSON.parse((e.postData && e.postData.contents) || "{}"); } catch (err) { corpo = {}; }
  return responder_(corpo);
}

function responder_(req) {
  let saida;
  try {
    const senha = PropertiesService.getScriptProperties().getProperty("SENHA");
    if (!senha || req.token !== senha) throw new Error("Senha da ponte inválida.");
    switch (req.action) {
      case "ping":
        saida = { ok: true, conta: Session.getEffectiveUser().getEmail(), agenda: obterAgenda_().getName() };
        break;
      case "list":
        saida = { ok: true, eventos: listar_(req.from, req.to) };
        break;
      case "sync":
        saida = { ok: true, resultado: sincronizar_(req.events || [], req.from, req.to) };
        break;
      default:
        throw new Error("Ação desconhecida: " + req.action);
    }
  } catch (err) {
    saida = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(saida)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Agenda do painel ---------- */
function obterAgenda_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("AGENDA_ID");
  let agenda = id ? CalendarApp.getCalendarById(id) : null;
  if (!agenda) {
    const existentes = CalendarApp.getOwnedCalendarsByName(NOME_AGENDA);
    agenda = existentes.length ? existentes[0] : CalendarApp.createCalendar(NOME_AGENDA, {
      summary: "Prazos, entregas e compromissos do Painel de Expansão Altamar",
      color: CalendarApp.Color.TEAL,
    });
    props.setProperty("AGENDA_ID", agenda.getId());
  }
  return agenda;
}

function data_(iso) {
  // "2026-10-09" → data local à meia-noite; "2026-10-09T14:00" → data e hora locais
  const p = String(iso).split(/[-T:]/).map(Number);
  return new Date(p[0], p[1] - 1, p[2], p[3] || 0, p[4] || 0);
}

/**
 * Sincroniza a lista enviada pelo painel com a agenda "Painel Altamar" dentro da janela [from, to]:
 * cria o que falta, atualiza o que mudou e remove o que o painel não envia mais.
 * Cada evento: { id, title, description, allDay, date | start, end, guests: [emails], sendInvites, location }
 */
function sincronizar_(eventos, from, to) {
  const agenda = obterAgenda_();
  const inicio = data_(from), fim = data_(to);
  const existentes = {};
  agenda.getEvents(inicio, fim).forEach(function (ev) {
    const tag = ev.getTag(TAG);
    if (tag) existentes[tag] = ev;
  });

  let criados = 0, atualizados = 0, removidos = 0;
  const vistos = {};
  eventos.forEach(function (e) {
    vistos[e.id] = true;
    const opcoes = { description: e.description || "", location: e.location || "" };
    const convidados = (e.guests || []).filter(String).join(",");
    let ev = existentes[e.id];
    const assinatura = JSON.stringify([e.title, e.description, e.allDay, e.date, e.start, e.end, convidados, e.location]);

    if (ev && ev.getTag("assinatura") === assinatura) return; // nada mudou

    // Atualiza no próprio evento (apagar e recriar faria o Google reenviar convites aos participantes).
    if (ev && ev.isAllDayEvent() === !!e.allDay) {
      ev.setTitle(e.title);
      ev.setDescription(e.description || "");
      ev.setLocation(e.location || "");
      if (e.allDay) ev.setAllDayDate(data_(e.date));
      else ev.setTime(data_(e.start), data_(e.end));
      const atuais = ev.getGuestList().map(function (g) { return g.getEmail().toLowerCase(); });
      const novos = (e.guests || []).map(function (g) { return String(g).toLowerCase(); });
      novos.forEach(function (g) { if (atuais.indexOf(g) < 0) ev.addGuest(g); });
      atuais.forEach(function (g) { if (novos.indexOf(g) < 0) ev.removeGuest(g); });
      ev.setTag("assinatura", assinatura);
      atualizados++;
      return;
    }
    if (ev) { ev.deleteEvent(); ev = null; atualizados++; } else { criados++; }

    if (convidados) { opcoes.guests = convidados; opcoes.sendInvites = !!e.sendInvites; }
    if (e.allDay) {
      ev = agenda.createAllDayEvent(e.title, data_(e.date), opcoes);
      ev.removeAllReminders();
      ev.addPopupReminder(LEMBRETE_DIA_INTEIRO_MIN);
    } else {
      ev = agenda.createEvent(e.title, data_(e.start), data_(e.end), opcoes);
      ev.removeAllReminders();
      ev.addPopupReminder(LEMBRETE_COM_HORARIO_MIN);
    }
    ev.setTag(TAG, e.id);
    ev.setTag("assinatura", assinatura);
  });

  Object.keys(existentes).forEach(function (id) {
    if (!vistos[id]) { existentes[id].deleteEvent(); removidos++; }
  });
  return { criados: criados, atualizados: atualizados, removidos: removidos, total: eventos.length };
}

/* ---------- Seus compromissos ---------- */
// Lê todas as agendas marcadas como visíveis no Google Agenda (não só a principal),
// para que convites e agendas compartilhadas também apareçam no painel.
function listar_(from, to) {
  const painelId = obterAgenda_().getId();
  const vistos = {};
  const out = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    if (cal.getId() === painelId || cal.isHidden() || !cal.isSelected()) return;
    cal.getEvents(data_(from), data_(to)).forEach(function (ev) {
      const chave = ev.getId() + "|" + ev.getStartTime().getTime();
      if (vistos[chave]) return;
      vistos[chave] = true;
      out.push({
        id: ev.getId(),
        title: ev.getTitle(),
        allDay: ev.isAllDayEvent(),
        start: ev.getStartTime().toISOString(),
        end: ev.getEndTime().toISOString(),
        location: ev.getLocation(),
        agenda: cal.getName(),
      });
    });
  });
  return out;
}
