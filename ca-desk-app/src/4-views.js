/* CA Desk: screens */

const ICON = {
  today: '<path d="M4 6h16M4 12h10M4 18h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  clients: '<circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="2"/><path d="M3.5 19c.8-3.2 3-4.8 5.5-4.8s4.7 1.6 5.5 4.8M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.6c1.6.6 2.6 2 3 4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  docs: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 11v6M9 14h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  settings: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
};
const svg = (k, s = 22) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" aria-hidden="true">' + ICON[k] + '</svg>';
const explain = (t) => isDemoMode() ? '<p class="explain"><b>What this does:</b> ' + esc(t) + '</p>' : '';
const LOGO = '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" style="color:var(--accent)"><rect x="3" y="3" width="22" height="22" rx="6" stroke="currentColor" stroke-width="2"/><path d="M9 14.5l3.2 3.2L19 11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function route() {
  const h = (location.hash || '#/today').slice(2).split('/');
  return { name: h[0] || 'today', id: h[1] ? decodeURIComponent(h[1]) : '' };
}

function render() {
  const app = $('#app'); if (!app) return;
  let r = route();
  // #/welcome always shows the opening page, whatever was chosen before on this device
  if (r.name === 'welcome') { UI.setupStep = 0; UI.lastImport = null; UI.pendingExcel = null; history.replaceState(null, '', '#/setup'); r = { name: 'setup', id: '' }; }
  if (r.name === 'setup') { app.innerHTML = viewSetup(); return; }
  if (r.name === 'tour') { UI.tourStep = 0; app.innerHTML = viewTour(); const t = $('#tour'); if (t) { t.scrollTop = 0; t.focus({ preventScroll: true }); } return; }
  let body = '';
  if (r.name === 'clients') body = viewClients();
  else if (r.name === 'client') body = viewClient(r.id);
  else if (r.name === 'docs') body = viewDocs();
  else if (r.name === 'settings') body = viewSettings();
  else body = viewToday();
  app.innerHTML = shell(r, body);
  if (r.name === 'client') fillLastSeasonFiles(r.id);
}

function shell(r, body) {
  const plan = todayPlan();
  const todo = plan.nudge.length + plan.stuck.length;
  const link = (name, href, label, count) => '<a class="navlink" href="' + href + '"' + (r.name === name || (name === 'clients' && r.name === 'client') ? ' aria-current="page"' : '') + '>' + svg(name) + '<span>' + label + '</span>' + (count ? '<span class="count">' + count + '</span>' : '') + '</a>';
  const tab = (name, href, label, dot) => '<a href="' + href + '"' + (r.name === name || (name === 'clients' && r.name === 'client') ? ' aria-current="page"' : '') + '>' + svg(name) + '<span>' + label + '</span>' + (dot ? '<span class="dot" aria-hidden="true"></span>' : '') + '</a>';
  return '<div class="shell">' +
    '<aside class="side"><a class="logo" href="#/today">' + LOGO + 'CA Desk</a>' +
    link('today', '#/today', 'Today', todo) + link('clients', '#/clients', 'Clients') + link('docs', '#/docs', 'Add documents', UI.queue.length) + link('settings', '#/settings', 'Settings') +
    '<div class="side-foot" id="syncstate">' + esc(syncText()) + '</div></aside>' +
    '<main class="main" id="main">' + banners() + '<p id="lastaction" class="lastaction" role="status">' + lastActionHTML() + '</p>' + body + '</main>' +
    '<nav class="tabs" aria-label="Main">' + tab('today', '#/today', 'Today', todo) + tab('clients', '#/clients', 'Clients') + tab('docs', '#/docs', 'Documents', UI.queue.length) + tab('settings', '#/settings', 'Settings') + '</nav>' +
    '</div>';
}

function banners() {
  const s = DB.settings; let out = '';
  if (s.demo) out += '<div class="banner info"><span>This is the demo. Nothing here is a real client and no messages are sent.</span><a class="btn btn-sm btn-primary" href="#/setup" data-act="real-setup">Upload my client list</a></div>';
  if ((UI.excelHandle && !UI.excelOk) || (UI.folderHandle && !UI.folderOk)) out += '<div class="banner warn"><span>Your browser needs a click to reconnect ' + [UI.excelHandle && !UI.excelOk && 'your Excel', UI.folderHandle && !UI.folderOk && 'your Clients folder'].filter(Boolean).join(' and ') + '.</span><button class="btn btn-sm" data-act="reconnect">Reconnect</button></div>';
  if (s.syncError) out += '<div class="banner warn"><span>' + esc(s.syncError) + '</span><a class="btn btn-sm" href="#/settings">Open settings</a></div>';
  if (Cloud.cfg && !Cloud.session) out += '<div class="banner"><span>You are signed out. Changes are saved on this device only.</span><a class="btn btn-sm" href="#/settings">Sign in</a></div>';
  return out;
}

// ---------- Today ----------
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function missingText(u) {
  const names = u.parts.flatMap(p => p.avail.map(i => i.name));
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? shown + ' and ' + (names.length - 3) + ' more' : shown;
}
function unitNames(u) {
  if (u.clients.length === 1) return '<a href="#/client/' + esc(u.clients[0].id) + '">' + esc(u.clients[0].name) + '</a>';
  return u.clients.map(c => '<a href="#/client/' + esc(c.id) + '">' + esc(c.name) + '</a>').join(', ') + ' <span class="chip">Same number</span>';
}
function unitChips(u) {
  const out = [];
  u.parts.forEach(p => { if (!p.avail.length) return; const ch = dueChip(p.eng); out.push('<span class="chip ' + ch.cls + '">' + esc(SERVICE_LABEL[p.eng.service] + ': ' + ch.text) + '</span>'); });
  out.push(statusChips(u));
  if (!u.phone && !u.demo) out.push('<span class="chip risk">No valid WhatsApp number</span>');
  return out.filter(Boolean).join(' ');
}
function statusChips(u) {
  const out = [];
  const ln = latestNudge(u.clients.map(c => c.id));
  if (ln && ln.via === 'api' && ln.waStatus) out.push('<span class="chip ' + (ln.waStatus === 'failed' ? 'risk' : ln.waStatus === 'read' ? 'ok' : '') + '"' + (ln.waError ? ' title="' + esc(ln.waError) + '"' : '') + '>' + esc(WA_STATUS[ln.waStatus] + ' ' + ago(ln.waStatusAt || ln.at) + (ln.sim ? ' (simulated)' : '')) + '</span>');
  else if (u.lastNudge) out.push('<span class="chip">Nudged ' + esc(ago(u.lastNudge)) + '</span>');
  const rep = repliesFrom(u.phone)[0];
  if (rep && (!u.lastNudge || rep.at > u.lastNudge)) out.push('<span class="chip ok" title="' + esc(rep.text || 'Sent a file') + '">Replied ' + esc(ago(rep.at)) + '</span>');
  return out.join(' ');
}
function viewToday() {
  const s = DB.settings;
  if (!Object.keys(DB.clients).length) return '<div class="hello"><h1>' + greeting() + '</h1></div><div class="section"><div class="empty">No clients yet. <a href="#/setup">Set up with your Excel</a> or load sample data from Settings.</div></div>';
  const plan = todayPlan();
  const d = new Date();
  const dueWeek = plan.dueSoon.filter(x => x.n >= 0 && x.n <= 7).length + plan.nudge.concat(plan.stuck).filter(u => u.top && u.top.due.date && daysFromToday(u.top.due.date) >= 0 && daysFromToday(u.top.due.date) <= 7).length;
  const bits = [plan.nudge.length && plural(plan.nudge.length, 'client') + ' to nudge', plan.stuck.length && plural(plan.stuck.length, 'call') + ' only you can make', dueWeek && plural(dueWeek, 'return') + ' due this week'].filter(Boolean);
  let h = '<div class="hello"><p class="muted">' + d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) + '</p><h1>' + greeting() + (s.caName ? ', ' + esc(s.caName.replace(/^CA\s+/i, '').split(' ')[0]) : '') + '</h1>' +
    '<p class="summary">' + (bits.length ? esc(bits.join(', ')) + '.' : 'Nothing needs you right now.') + '</p></div>' + guideCard();
  if (plan.nudge.length) {
    h += waReady()
      ? '<div class="run"><p><b>' + plural(plan.nudge.length, 'reminder') + ' ready.</b> <span class="muted">They go from your WhatsApp Business number. You see the list before anything is sent.</span></p><button class="btn btn-wa btn-big" data-act="api-start">Send all (' + plan.nudge.length + ')</button></div>'
      : '<div class="run"><p><b>' + plural(plan.nudge.length, 'nudge') + ' ready.</b> <span class="muted">' + (s.demo ? 'Press Start to see how a reminder works once WhatsApp is connected. This is the demo, so nothing is sent.' : 'Each one opens WhatsApp with the message written. You tap send, come back, and the next one opens.' + (waApi() ? ' <a href="#/settings">Finish connecting WhatsApp Business</a> to send them all at once.' : '')) + '</span></p><button class="btn btn-wa btn-big" data-act="run-start">Start nudging (' + plan.nudge.length + ')</button></div>';
  }
  if (plan.stuck.length) {
    h += '<section class="section"><div class="section-head"><h2>Call these</h2><span class="muted small">Messages are not working</span></div>' + explain('These clients ignored three WhatsApp reminders since they last sent anything, so a phone call will work better. "Call" opens your phone dialer. "Log a call" records that you phoned them: it goes into their contact history, takes them off this list and pauses reminders to them for 48 hours. "Message anyway" sends one more reminder.') + '<div class="panel">';
    plan.stuck.forEach((u, i) => {
      h += '<div class="unit"><div class="rank">' + (i + 1) + '</div><div class="body"><div class="who">' + unitNames(u) + '</div><div class="what">Missing: ' + esc(missingText(u)) + '</div><div class="row">' + unitChips(u) + '</div><div class="why">' + esc(u.reason) + '</div></div><div class="acts">' +
        (u.phone && !u.demo ? '<a class="btn btn-sm btn-primary" href="tel:+' + esc(u.phone) + '">Call</a>' : '') +
        '<button class="btn btn-sm" title="Record that you phoned this client. Adds it to their contact history, takes them off Call these and pauses reminders to them for 48 hours." data-act="log-call" data-ids="' + esc(u.clients.map(c => c.id).join(',')) + '">Log a call</button><button class="btn btn-sm btn-ghost" data-act="nudge-one" data-key="' + esc(u.key) + '">Message anyway</button></div></div>';
    });
    h += '</div></section>';
  }
  h += '<section class="section"><div class="section-head"><h2>Nudge today</h2><span class="muted small">Most urgent first</span></div>' + explain('Clients who still owe documents, ranked by how close the deadline is, how many documents are pending and how late they were last season. The reason is written under each name. Press Nudge to see the reminder for that client. Clients reminded in the last 48 hours move to "Waiting for a reply" so nobody is nagged twice in a day.');
  if (plan.nudge.length) {
    h += '<div class="panel">';
    plan.nudge.forEach((u, i) => {
      h += '<div class="unit"><div class="rank">' + (i + 1) + '</div><div class="body"><div class="who">' + unitNames(u) + '</div><div class="what">Missing: ' + esc(missingText(u)) + '</div><div class="row">' + unitChips(u) + '</div>' + (u.reason ? '<div class="why">' + esc(u.reason) + '</div>' : '') + '</div><div class="acts"><button class="btn btn-sm btn-wa" data-act="' + (waReady() ? 'api-one' : 'nudge-one') + '" data-key="' + esc(u.key) + '"' + (!u.phone && !u.demo ? ' disabled' : '') + '>' + (waReady() ? 'Send' : 'Nudge') + '</button></div></div>';
    });
    h += '</div>';
  } else h += '<div class="empty">Nobody to nudge right now. Clients nudged in the last 48 hours wait before the next reminder.</div>';
  h += '</section>';
  if (plan.waiting.length) {
    h += '<section class="section"><div class="section-head"><h2>Waiting for a reply</h2><span class="muted small">Nudged in the last 48 hours</span></div>' + explain('Reminded or called in the last 48 hours. If nothing arrives by then, they come back to "Nudge today".') + '<div class="panel">';
    plan.waiting.forEach(u => { h += '<div class="duerow"><span class="n">' + unitNames(u) + '</span><span class="muted small">' + esc(missingText(u)) + '</span>' + (statusChips(u) || '<span class="chip">Nudged ' + esc(ago(u.lastNudge || u.lastCall)) + '</span>') + '</div>'; });
    h += '</div></section>';
  }
  if (plan.dueSoon.length) {
    h += '<section class="section"><div class="section-head"><h2>Due soon</h2><span class="muted small">Next 14 days, and late returns</span></div>' + explain('Every return due in the next 14 days, plus returns already late, with the stage each one is at. Click a row to open that client.') + '<div class="panel">';
    plan.dueSoon.forEach(x => { const ch = dueChip(x.e), st = engStatus(x.e); h += '<a class="duerow" href="#/client/' + esc(x.c.id) + '"><span class="n">' + esc(x.c.name) + ' <span class="muted small">' + esc(engTitle(x.e)) + '</span></span><span class="chip ' + st.cls + '">' + esc(st.text) + '</span><span class="chip ' + ch.cls + '">' + esc(ch.text) + '</span></a>'; });
    h += '</div></section>';
  }
  const pk = Object.keys(plan.portal);
  if (pk.length) {
    h += '<section class="section"><div class="section-head"><h2>Download from the portal</h2><span class="muted small">Things you fetch yourself. Never sent to clients.</span></div>' + explain('Documents you download yourself from the income tax or GST portal, like AIS, 26AS and GSTR-2B, grouped so you can fetch them in one sitting. They are never included in client reminders. Click a group to see whose are pending.') + '<div class="panel">';
    pk.sort((a, b) => plan.portal[b].length - plan.portal[a].length).forEach(k => {
      h += '<details class="portal"><summary><span>' + esc(k) + '</span><span class="chip">' + plan.portal[k].length + '</span></summary><ul>' + plan.portal[k].map(x => '<li><a href="#/client/' + esc(x.c.id) + '">' + esc(x.c.name) + '</a></li>').join('') + '</ul></details>';
    });
    h += '</div></section>';
  }
  return h;
}

// ---------- Clients ----------
function clientSummary(c) {
  const engs = currentEngs(c.id);
  let got = 0, total = 0; engs.forEach(e => { const p = progress(e); got += p.got; total += p.total; });
  const open = engs.filter(e => e.status !== 'filed').sort((a, b) => (engDue(a).urgency || '9').localeCompare(engDue(b).urgency || '9'))[0];
  return { engs, got, total, open };
}
function filteredClients() {
  const q = UI.q.trim().toLowerCase();
  let list = Object.values(DB.clients);
  const f = UI.filter;
  list = list.filter(c => f === 'archived' ? c.archived : !c.archived);
  if (f === 'pending') list = list.filter(c => currentEngs(c.id).some(e => e.status === 'collecting' && e.items.some(i => i.type === 'CLIENT' && isAsk(i))));
  if (f === 'complete') list = list.filter(c => { const e = currentEngs(c.id); return e.length && e.every(x => x.status !== 'collecting' || !x.items.some(isAsk)); });
  if (f === 'number') list = list.filter(c => !c.phone && !c.demo);
  if (q) list = list.filter(c => (c.name + ' ' + (c.code || '') + ' ' + (c.phoneRaw || '') + ' ' + (c.panLast4 || '')).toLowerCase().includes(q));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}
function clientListHTML() {
  const list = filteredClients();
  if (!list.length) return '<div class="empty">' + (UI.q ? 'No client matches "' + esc(UI.q) + '".' : UI.filter === 'archived' ? 'No archived clients. Clients removed from your Excel show up here.' : 'No clients here.') + '</div>';
  return '<div class="panel">' + list.map(c => {
    const s = clientSummary(c); const pct = s.total ? Math.round(s.got / s.total * 100) : 0;
    const st = s.open ? engStatus(s.open) : null; const ch = s.open ? dueChip(s.open) : null;
    return '<a class="crow" href="#/client/' + esc(c.id) + '"><div class="n"><b>' + esc(c.name) + '</b><span class="muted small">' + esc([c.code, ENTITY_LABEL[c.entity], (c.services || []).map(x => SERVICE_LABEL[x]).join(', ')].filter(Boolean).join(', ')) + '</span></div>' +
      '<div class="p"><div class="bar"><span style="width:' + pct + '%"></span></div><span>' + s.got + ' of ' + s.total + ' received</span></div>' +
      '<div class="row">' + (st ? '<span class="chip ' + st.cls + '">' + esc(st.text) + '</span>' : '') + (ch && s.open.status !== 'filed' ? '<span class="chip ' + ch.cls + '">' + esc(ch.text) + '</span>' : '') + (!c.phone && !c.demo ? '<span class="chip risk">Check number</span>' : '') + (c.archived ? '<span class="chip">Archived</span>' : '') + '</div></a>';
  }).join('') + '</div>';
}
function viewClients() {
  const filters = [['active', 'All'], ['pending', 'Awaiting docs'], ['complete', 'Docs complete'], ['number', 'Number issues'], ['archived', 'Archived']];
  return '<div class="spread"><h1>Clients</h1><span class="muted small">' + (DB.settings.lastSynced ? 'Excel synced ' + esc(ago(DB.settings.lastSynced)) : DB.settings.demo ? 'Sample data' : 'No Excel connected') + '</span></div>' +
    '<div class="toolbar"><label class="hidden" for="q">Search clients</label><input class="input" id="q" type="search" placeholder="Search by name, code, number" value="' + esc(UI.q) + '" data-input="q" autocomplete="off">' +
    '<div class="seg" role="group" aria-label="Filter">' + filters.map(f => '<button type="button" aria-pressed="' + (UI.filter === f[0]) + '" data-act="filter" data-v="' + f[0] + '">' + f[1] + '</button>').join('') + '</div></div>' +
    explain('Every client from your Excel, with how many documents are in and what stage they are at. Search by name, code or number, or filter: "Awaiting docs" (something pending from the client), "Docs complete", "Number issues" (no valid WhatsApp number in the Excel) and "Archived" (removed from the Excel, history kept). Click a client to open their page.') +
    '<div id="clist">' + clientListHTML() + '</div>';
}

// ---------- Client page ----------
function itemSub(c, e, i) {
  const out = [];
  if (i.type === 'PORTAL') out.push('<small>You download this from the portal</small>');
  if (i.optional && i.status === 'pending') out.push('<small>Only if it applies. Left out of reminders until you mark it needed.</small>');
  if (i.status === 'pending' && i.availableFrom && i.availableFrom > todayISO()) out.push('<small>Available from ' + esc(fmtShort(i.availableFrom)) + '. Not asked before then.</small>');
  const late = i.status === 'pending' && lateLastSeason(c, i.key);
  if (late) out.push('<small class="mem">Came ' + late.days + ' days late last season</small>');
  if (i.fileName) out.push('<small>Saved as ' + esc(i.fileName) + '</small>');
  if (i.custom) out.push('<small>Added by you</small>');
  return out.join('');
}
function engCard(c, e) {
  const p = progress(e); const pct = p.total ? Math.round(p.got / p.total * 100) : 0;
  const ch = dueChip(e), st = engStatus(e);
  let h = '<section class="panel eng"><div class="eng-head"><div class="spread"><h2>' + esc(engTitle(e)) + '</h2><div class="row"><span class="chip ' + ch.cls + '">' + esc(ch.text) + '</span><span class="chip ' + st.cls + '">' + esc(st.text) + '</span></div></div>';
  if (e.service === 'ITR') {
    h += '<div class="row" role="group" aria-label="Income sources">' + SOURCES.map(s => '<button type="button" class="chip" aria-pressed="' + !!(e.sources || {})[s.k] + '" data-act="source" data-eng="' + e.id + '" data-k="' + s.k + '">' + s.label + '</button>').join('') + '</div>' +
      '<div class="row"><span class="label">Tax regime</span><div class="seg" role="group" aria-label="Tax regime">' + ['new', 'old'].map(r => '<button type="button" aria-pressed="' + (e.regime === r) + '" data-act="regime" data-eng="' + e.id + '" data-v="' + r + '">' + (r === 'new' ? 'New' : 'Old') + '</button>').join('') + '</div><span class="muted small">Likely form: ' + likelyForm(e) + '</span></div>';
  }
  h += '<div class="row"><div class="bar" style="flex:1 1 160px"><span style="width:' + pct + '%"></span></div><span class="small">' + p.got + ' of ' + p.total + ' received</span></div>' +
    '<div class="row"><label class="label" for="st-' + e.id + '">Stage</label><select class="input" style="width:auto" id="st-' + e.id + '" data-change="eng-status" data-eng="' + e.id + '">' +
    [['collecting', 'Collecting documents'], ['prep', 'In preparation'], ['filed', 'Filed']].map(o => '<option value="' + o[0] + '"' + (e.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
    (e.items.some(i => i.draft) ? '<span class="chip memory">Draft checklist: review it once</span>' : '') +
    (e.service === 'ITR' ? '<a class="small muted" href="' + ITR_OFFICIAL + '" target="_blank" rel="noopener">Based on the Income Tax Department list</a>' : '') + '</div></div>';
  h += '<ul class="items">' + e.items.map(i => {
    const open = UI.openItem === i.id;
    const stText = i.status === 'received' ? 'Received' + (i.receivedAt ? ' ' + fmtShort(i.receivedAt) : '') : i.status === 'na' ? 'Not needed' : i.optional ? 'If needed' : 'Pending';
    return '<li><div class="item ' + (i.status === 'na' ? 'na' : '') + '"><input type="checkbox" aria-label="' + esc(i.name) + ' received" data-change="item-check" data-eng="' + e.id + '" data-item="' + i.id + '"' + (i.status === 'received' ? ' checked' : '') + (i.status === 'na' ? ' disabled' : '') + '>' +
      '<div class="nm"><span' + (GLOSS[i.key] ? ' title="' + esc(GLOSS[i.key]) + '"' : '') + '>' + esc(i.name) + '</span>' + (GLOSS[i.key] ? '<small>' + esc(GLOSS[i.key]) + '</small>' : '') + itemSub(c, e, i) + '</div><span class="st ' + i.status + '">' + esc(stText) + '</span>' +
      '<button class="more" type="button" aria-expanded="' + open + '" aria-label="More for ' + esc(i.name) + '" data-act="item-menu" data-item="' + i.id + '">⋯</button></div>' +
      (open ? '<div class="itemmenu">' + (i.optional && i.status === 'pending' ? '<button class="btn btn-sm btn-primary" data-act="item-ask" data-eng="' + e.id + '" data-item="' + i.id + '">Needed: ask the client</button>' : '') + '<button class="btn btn-sm" data-act="item-na" data-eng="' + e.id + '" data-item="' + i.id + '">' + (i.status === 'na' ? 'Needed after all' : 'Not needed') + '</button><button class="btn btn-sm" data-act="item-rename" data-eng="' + e.id + '" data-item="' + i.id + '">Rename</button>' +
        '<button class="btn btn-sm" data-act="item-type" data-eng="' + e.id + '" data-item="' + i.id + '">' + (i.type === 'PORTAL' ? 'Client sends this' : 'I download this') + '</button>' +
        (i.custom ? '<button class="btn btn-sm" data-act="item-remove" data-eng="' + e.id + '" data-item="' + i.id + '">Remove</button>' : '') + '</div>' : '') + '</li>';
  }).join('') + '</ul>' +
    '<form class="additem" data-submit="add-item" data-eng="' + e.id + '"><label class="hidden" for="add-' + e.id + '">Add a document</label><input class="input" id="add-' + e.id + '" name="name" placeholder="Add a document, e.g. Partnership deed" autocomplete="off">' +
    '<label class="row small muted"><input type="checkbox" name="portal"> I download this</label><button class="btn" type="submit">Add</button></form></section>';
  return h;
}
function viewClient(id) {
  const c = DB.clients[id];
  if (!c) return '<a class="back" href="#/clients">‹ Clients</a><div class="empty">This client no longer exists.</div>';
  const engs = currentEngs(c.id);
  const unit = buildUnits().find(u => u.clients.some(x => x.id === c.id));
  const allIn = engs.some(e => e.status === 'collecting' && e.items.length && !e.items.some(i => i.type === 'CLIENT' && isAsk(i)));
  const fromExcel = c.source === 'excel';
  let h = '<a class="back" href="#/clients">‹ Clients</a><div class="chead"><div class="stack" style="gap:6px"><h1>' + esc(c.name) + '</h1><div class="row small muted">' +
    [c.code && '<span>' + esc(c.code) + '</span>', '<span>' + ENTITY_LABEL[c.entity] + '</span>', c.phone ? '<span>+' + esc(c.phone.slice(0, 2) + ' ' + c.phone.slice(2)) + '</span>' : '<span class="chip risk">Number "' + esc(c.phoneRaw || 'missing') + '" is not a valid mobile</span>', c.panLast4 && '<span>PAN ••••••' + esc(c.panLast4) + '</span>', c.archived && '<span class="chip">Archived</span>'].filter(Boolean).join('') + '</div></div>' +
    '<div class="row">' + (unit && unit.availCount ? '<button class="btn btn-wa" data-act="' + (waReady() ? 'api-one' : 'nudge-one') + '" data-key="' + esc(unit.key) + '"' + (!unit.phone && !unit.demo ? ' disabled' : '') + '>' + (waReady() ? 'Send reminder' : 'Nudge on WhatsApp') + '</button>' : '') +
    (allIn ? '<button class="btn" data-act="thanks" data-id="' + c.id + '">Send thank-you</button>' : '') +
    (c.phone && !c.demo ? '<a class="btn" href="tel:+' + esc(c.phone) + '">Call</a>' : '') + '<button class="btn btn-ghost" title="Record that you phoned this client. Adds it to their contact history, takes them off Call these and pauses reminders to them for 48 hours." data-act="log-call" data-ids="' + c.id + '">Log a call</button></div></div>' + explain('Nudge shows the WhatsApp reminder for this client. Send thank-you appears once everything is in. Call opens your phone dialer. Log a call records that you phoned: it goes into the contact history below and pauses reminders for 48 hours.') +
    (fromExcel ? '<p class="small muted">Name, number, PAN and services come from your Excel. Edit them there and they update here.</p>' : '') +
    (c.archived ? '<div class="banner"><span>Archived because this client is no longer in your Excel. History is kept.</span><button class="btn btn-sm" data-act="restore" data-id="' + c.id + '">Restore</button></div>' : '');
  h += '<div class="grid2"><div class="stack">' + explain('One checklist per service. For ITR, the income-source buttons and the tax regime decide which documents are listed. Tick a document when it arrives. "⋯" next to a document lets you mark it not needed, rename it, or switch it between "client sends this" and "I download this". Add anything else at the bottom of each list. "Stage" moves the return to In preparation or Filed.') + (engs.length ? engs.map(e => engCard(c, e)).join('') : '<div class="empty">No services for this season. Add ITR, Tax audit, GST or TDS in the Services column of your Excel.</div>') + '</div>';
  // memory
  const ls = lastSeason(c); const now = nudgesFor(c.id, CURRENT_AY).filter(n => n.channel === 'whatsapp');
  const lastBits = []; if (ls.has) { lastBits.push(ls.nudges ? 'Needed ' + plural(ls.nudges, 'nudge') + '.' : 'Sent everything without chasing.'); ls.late.slice(0, 3).forEach(l => lastBits.push(l.name + ' came ' + l.days + ' days late.')); }
  h += '<div class="stack">' + explain('What CA Desk has learned about this client from the dates of reminders and documents. Mark a client slow and they are nudged earlier. Notes are for anything you want to remember next time.') + '<section class="panel panel-pad stack"><h2>What CA Desk remembers</h2><dl class="kv"><dt>This season</dt><dd>' + (now.length ? plural(now.length, 'nudge') + ', last ' + esc(ago(now[0].at)) : 'Not nudged yet') + '</dd><dt>Last season</dt><dd>' + (ls.has ? esc(lastBits.join(' ')) : 'No history yet. It builds from this season.') + '</dd></dl>' +
    '<div class="stack" style="gap:6px"><span class="label">How quickly they send documents</span><div class="seg" role="group" aria-label="Speed">' + [['fast', 'Fast'], ['normal', 'Normal'], ['slow', 'Slow']].map(s => '<button type="button" aria-pressed="' + (c.speed === s[0]) + '" data-act="speed" data-id="' + c.id + '" data-v="' + s[0] + '">' + s[1] + '</button>').join('') + '</div><span class="small muted">Slow clients are nudged earlier.</span></div>' +
    (c.lang ? '<p class="small muted">Messages in ' + esc(c.lang === 'hinglish' ? 'Hinglish' : c.lang === 'hindi' ? 'Hindi' : 'English') + ', from your Excel.</p>' :
      '<div class="field"><label for="lang-' + c.id + '">Message language</label><select class="input" id="lang-' + c.id + '" data-change="lang" data-id="' + c.id + '">' + [['hinglish', 'Hinglish'], ['english', 'English'], ['hindi', 'Hindi']].map(l => '<option value="' + l[0] + '"' + (clientLang(c) === l[0] ? ' selected' : '') + '>' + l[1] + '</option>').join('') + '</select></div>') +
    '<div class="field"><label for="notes-' + c.id + '">Notes</label><textarea class="input" id="notes-' + c.id + '" data-change="notes" data-id="' + c.id + '" placeholder="Anything to remember about this client">' + esc(c.notes || '') + '</textarea></div></section>';
  // last season
  h += '<section class="panel panel-pad stack"><h2>Last season</h2>';
  if (ls.has) h += ls.engs.map(e => '<div><h3>' + esc(engTitle(e)) + '</h3><ul class="hist">' + e.items.filter(i => i.status === 'received').map(i => '<li><span>' + esc(i.name) + '</span><span class="muted">' + esc(fmtShort(i.receivedAt)) + '</span></li>').join('') + '</ul></div>').join('');
  h += '<div id="lsfiles">' + (UI.folderHandle && c.folder ? '<p class="small muted">Reading your ' + esc(yearFolderName(PREV_AY)) + ' folder…</p>' : (!ls.has ? '<p class="muted small">Connect your Clients folder in Settings to see last season\'s files here.</p>' : '')) + '</div></section>';
  // history
  const hist = nudgesFor(c.id).map(n => ({ at: n.at, label: (n.channel === 'call' ? 'Call' : n.channel === 'thanks' ? 'Thank-you message' : 'WhatsApp reminder') + (n.ay === PREV_AY ? ' (last season)' : '') + (n.via === 'api' && n.waStatus ? ', ' + WA_STATUS[n.waStatus].toLowerCase() + (n.waError ? ': ' + n.waError : '') : '') + (n.sim ? ' (simulated)' : '') }))
    .concat(repliesFrom(c.phone).map(m => ({ at: m.at, label: m.file ? 'Sent a file: ' + m.file.name : 'Replied: "' + (m.text || '').slice(0, 80) + '"' })))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14);
  h += '<section class="panel panel-pad stack"><h2>Contact history</h2>' + (hist.length ? '<ul class="hist">' + hist.map(n => '<li><span>' + esc(n.label) + '</span><span class="muted">' + esc(fmtDate(n.at.slice(0, 10))) + '</span></li>').join('') + '</ul>' : '<p class="muted small">No reminders, calls or replies yet.</p>') + '</section></div></div>';
  return h;
}
async function fillLastSeasonFiles(id) {
  const c = DB.clients[id]; const el = $('#lsfiles'); if (!c || !el || !UI.folderHandle || !c.folder) return;
  const files = await loadLastSeasonFiles(c);
  if (!$('#lsfiles') || route().id !== id) return;
  if (files === null) { el.innerHTML = '<p class="small muted">Reconnect your Clients folder to see last season\'s files.</p>'; return; }
  el.innerHTML = files.length ? '<h3>Files in ' + esc(c.folder) + ' / ' + esc(yearFolderName(PREV_AY)) + '</h3><ul class="hist">' + files.slice(0, 40).map(f => '<li><span>' + esc(f.name) + '</span><span class="muted">' + esc(fmtShort(isoOf(new Date(f.modified)))) + '</span></li>').join('') + '</ul>' : '<p class="small muted">No ' + esc(yearFolderName(PREV_AY)) + ' folder found for this client.</p>';
}

// ---------- Documents ----------
function itemOptions(q) {
  if (!q.clientId) return '<option value="">Pick a client first</option>';
  let h = '<option value="">Pick a document</option>';
  currentEngs(q.clientId).forEach(e => {
    h += '<optgroup label="' + esc(engTitle(e)) + '">' + e.items.filter(i => i.status !== 'na').map(i => '<option value="' + e.id + '|' + i.id + '"' + (q.itemId === i.id ? ' selected' : '') + '>' + esc(i.name) + (i.status === 'received' ? ' (already received)' : '') + '</option>').join('') +
      '<option value="new|' + e.id + '">Something else (add to this list)</option></optgroup>';
  });
  return h;
}
function viewDocs() {
  const canFolder = fsaSupported();
  let h = '<h1>Add documents</h1><p class="muted" style="margin-top:8px;max-width:40em">Drop in what clients sent. CA Desk suggests the client and the document, you confirm, and it is ticked and filed.</p>';
  h += explain('Drop in documents clients sent, or add the sample ones. For each file CA Desk suggests the client (from the PAN printed on it, the sender\'s number or the client\'s name) and which document it is, and warns about the wrong year or a document already received. Check the suggestion, change it if needed, then "Tick and file" marks it received and saves it in that client\'s folder.');
  h += '<div class="section" style="margin-top:20px">';
  if (UI.folderHandle && UI.folderOk) h += '<p class="small">Filing into your <b>' + esc(DB.settings.folderName || UI.folderHandle.name) + '</b> folder, in ' + esc(yearFolderName(CURRENT_AY)) + ' subfolders.</p>';
  else if (UI.folderHandle) h += '<div class="banner warn"><span>Reconnect your Clients folder to file automatically.</span><button class="btn btn-sm" data-act="reconnect">Reconnect</button></div>';
  else if (canFolder) h += '<div class="banner"><span>Connect your Clients folder and every document lands in the right client folder by itself.</span><button class="btn btn-sm btn-primary" data-act="connect-folder">Connect folder</button></div>';
  else h += '<p class="small muted">' + (Cloud.on ? 'On this device, files wait in your account until you open CA Desk on your office computer, then they file themselves.' : 'On this device, files are downloaded after you tick them. Filing into folders works in Chrome or Edge on a computer.') + '</p>';
  const broken = Object.values(DB.inbox || {}).filter(m => m.loadError || (m.fileError && !m.file));
  broken.forEach(m => { h += '<div class="banner warn"><span>A file from ' + esc((activeClients().find(c => c.phone === m.phone) || {}).name || '+' + m.phone) + ' on WhatsApp could not be downloaded (' + esc(m.fileError || m.loadError) + '). Ask them to send it again.</span><button class="btn btn-sm" data-act="inbox-dismiss" data-id="' + esc(m.id) + '">Dismiss</button></div>'; });
  const ho = Object.keys(DB.handoffs).length;
  if (ho) h += '<div class="banner info"><span>' + plural(ho, 'file') + ' from your phone ' + (ho === 1 ? 'is' : 'are') + ' waiting for your computer.</span>' + (UI.folderHandle && UI.folderOk ? '<button class="btn btn-sm btn-primary" data-act="handoffs">Save to my folders</button>' : '') + '</div>';
  if (isDemoMode()) h += '<div class="banner info"><span>No files to hand? Add sample documents: PDFs for two family members, one from the wrong year and a phone photo.</span><button class="btn btn-sm btn-primary" data-act="sample-docs">Add sample documents</button></div>';
  h += '<label class="drop" id="drop"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="color:var(--accent)">' + ICON.docs + '</svg><b>Drop files here</b><span class="muted small">PDFs, photos, Excel. Or share them straight from WhatsApp on Android.</span><span class="btn btn-primary">Choose files</span><input type="file" multiple class="hidden" data-change="pick-files" accept=".pdf,image/*,.xlsx,.xls,.csv,.doc,.docx,.zip"></label></div>';
  if (UI.queue.length) {
    h += '<section class="section"><div class="section-head"><h2>Check and file</h2><span class="muted small">' + plural(UI.queue.length, 'file') + '</span></div>';
    UI.queue.forEach(q => {
      const clients = activeClients().sort((a, b) => a.name.localeCompare(b.name));
      h += '<section class="panel qcard"><div class="spread"><b style="word-break:break-all">' + esc(q.name) + '</b><span class="row">' + (q.inboxId ? '<span class="chip ok">From WhatsApp</span>' : '') + '<span class="muted small">' + Math.max(1, Math.round(q.size / 1024)) + ' KB</span></span></div>' +
        '<div class="reason">' + esc(q.reason) + '</div>' + (q.warn ? '<div class="warnline">' + esc(q.warn) + '</div>' : '') + (q.note ? '<div class="small muted">' + esc(q.note) + '</div>' : '') +
        '<div class="qgrid"><div class="field"><label for="qc-' + q.id + '">Client</label><select class="input" id="qc-' + q.id + '" data-change="q-client" data-q="' + q.id + '"><option value="">Pick a client</option>' + clients.map(c => '<option value="' + c.id + '"' + (q.clientId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="qi-' + q.id + '">Document</label><select class="input" id="qi-' + q.id + '" data-change="q-item" data-q="' + q.id + '">' + itemOptions(q) + '</select></div></div>' +
        '<div class="row"><button class="btn btn-primary" data-act="q-file" data-q="' + q.id + '"' + (q.itemId ? '' : ' disabled') + '>Tick and file</button><button class="btn btn-ghost" data-act="q-drop" data-q="' + q.id + '">Remove from list</button></div></section>';
    });
    h += '</section>';
  }
  return h;
}

// ---------- Excel mapping (setup + settings) ----------
function mappingEditor() {
  const p = UI.pendingExcel; if (!p) return '';
  const wb = p.wb;
  let h = '<section class="panel panel-pad stack"><h2>Match your columns</h2><p class="muted small">Found ' + plural(wb.data.length, 'row') + ' in "' + esc(wb.fileName) + '". Match the columns once and CA Desk remembers them.</p>';
  if (wb.sheets.length > 1) h += '<div class="field"><label for="sheet">Sheet</label><select class="input" id="sheet" data-change="sheet">' + wb.sheets.map(s => '<option' + (s === wb.sheetName ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>';
  h += FIELDS.map(f => '<div class="maprow"><label for="map-' + f.k + '">' + esc(f.label) + (f.req ? ' (required)' : '') + '</label><select class="input" id="map-' + f.k + '" data-change="map" data-k="' + f.k + '"><option value="">' + (f.req ? 'Pick a column' : 'Not in my Excel') + '</option>' + wb.headers.filter(Boolean).map(hd => '<option' + (p.map[f.k] === hd ? ' selected' : '') + '>' + esc(hd) + '</option>').join('') + '</select></div>').join('');
  const miss = FIELDS.filter(f => f.req && !p.map[f.k]);
  h += (miss.length ? '<p class="small" style="color:var(--risk-ink)">Still needed: ' + esc(miss.map(f => f.label).join(', ')) + '</p>' : '') +
    (DB.settings.demo ? '<p class="small muted">Importing removes the sample clients.</p>' : '') + '<div class="row"><button class="btn btn-primary" data-act="import-excel"' + (miss.length ? ' disabled' : '') + '>Import ' + plural(wb.data.length, 'client') + '</button><button class="btn btn-ghost" data-act="cancel-excel">Cancel</button></div></section>';
  return h;
}
function importSummary() {
  const r = UI.lastImport; if (!r) return '';
  return '<div class="banner ' + (r.errors.length ? 'warn' : 'info') + '" style="flex-direction:column;align-items:flex-start"><b>Imported: ' + r.added + ' added, ' + r.updated + ' updated' + (r.archived ? ', ' + r.archived + ' archived' : '') + '.</b>' + (r.errors.length ? '<span>' + plural(r.errors.length, 'row') + ' skipped:</span><ul style="margin:0;padding-left:18px">' + r.errors.slice(0, 8).map(e => '<li>' + esc(e) + '</li>').join('') + (r.errors.length > 8 ? '<li>and ' + (r.errors.length - 8) + ' more</li>' : '') + '</ul>' : '') + '</div>';
}
function excelButtons() {
  return '<div class="row">' + '<button class="btn" data-act="sample-list">Use the sample client list</button>' + (fsaSupported() ? '<button class="btn btn-primary" data-act="connect-excel">' + (UI.excelHandle ? 'Choose a different Excel' : 'Connect your Excel file') + '</button>' : '') +
    '<label class="btn">Upload latest Excel<input type="file" class="hidden" accept=".xlsx,.xls,.csv" data-change="upload-excel"></label><button class="btn btn-ghost" data-act="template">Download template</button></div>';
}
function folderMatches() {
  const dirs = UI.folderDirs || [];
  const list = activeClients().sort((a, b) => (!!a.folder - !!b.folder) || a.name.localeCompare(b.name));
  const unmatched = list.filter(c => !c.folder).length;
  return '<details' + (unmatched ? ' open' : '') + '><summary class="row" style="cursor:pointer;min-height:40px"><b>Folder matches</b><span class="chip ' + (unmatched ? 'risk' : 'ok') + '">' + (unmatched ? unmatched + ' not matched' : 'All matched') + '</span></summary><div class="stack" style="margin-top:10px">' +
    list.map(c => '<div class="maprow"><span>' + esc(c.name) + '</span><select class="input" data-change="folder-pick" data-id="' + c.id + '" aria-label="Folder for ' + esc(c.name) + '"><option value="">Create a new folder when needed</option>' + dirs.map(d => '<option' + (c.folder === d ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select></div>').join('') + '</div></details>';
}
function yearFormatPicker() {
  const f = DB.settings.yearFmt || { prefix: 'AY ', basis: 'AY', sep: '-', long: false };
  return '<div class="row"><span class="label">Year folders</span><div class="seg" role="group" aria-label="Year folder basis">' + ['AY', 'FY'].map(b => '<button type="button" aria-pressed="' + (f.basis === b) + '" data-act="year-basis" data-v="' + b + '">' + (b === 'AY' ? 'Assessment year' : 'Financial year') + '</button>').join('') + '</div><span class="small muted">This season files go into "' + esc(yearFolderName(CURRENT_AY)) + '"</span></div>';
}

// ---------- Settings ----------
function viewSettings() {
  const s = DB.settings;
  let h = '<h1>Settings</h1>' + explain('Settings are for real use: your name on messages, your Excel and Clients folder, due dates, message wording, WhatsApp connection and your account. In the demo you can look around; changes stay on this device.') + '<div class="sgrid">';
  h += '<section class="panel panel-pad stack"><h2>Your details</h2><div class="qgrid"><div class="field"><label for="s-name">Your name</label><input class="input" id="s-name" value="' + esc(s.caName) + '" data-change="setting" data-k="caName" placeholder="CA Sunil Agarwal"></div><div class="field"><label for="s-firm">Firm name</label><input class="input" id="s-firm" value="' + esc(s.firm) + '" data-change="setting" data-k="firm" placeholder="Agarwal & Associates"></div></div><p class="small muted">Messages are signed "' + esc(signature()) + '".</p></section>';
  h += '<section class="panel panel-pad stack"><h2>Client Excel</h2><p class="small muted">Your Excel stays the master list. CA Desk reads it every time you open the app on this computer and never writes to it.</p>' +
    (s.excelName ? '<p class="small">Connected: <b>' + esc(s.excelName) + '</b>' + (s.sheetName ? ', sheet ' + esc(s.sheetName) : '') + (s.lastSynced ? '. Synced ' + esc(ago(s.lastSynced)) + '.' : '') + '</p>' : '') +
    excelButtons() + (UI.excelHandle && s.mapping ? '<div class="row"><button class="btn btn-sm" data-act="sync-excel">Sync now</button><button class="btn btn-sm btn-ghost" data-act="remap">Change column matching</button></div>' : '') + importSummary() + mappingEditor() + '</section>';
  h += '<section class="panel panel-pad stack"><h2>Clients folder</h2><p class="small muted">The folder on this computer that holds one folder per client. Works in Chrome or Edge.</p>' +
    (UI.folderHandle ? '<p class="small">Connected: <b>' + esc(s.folderName || UI.folderHandle.name) + '</b>' + (UI.folderOk ? '' : ' (needs a click to reconnect)') + '</p>' : '') +
    (fsaSupported() ? '<div class="row"><button class="btn ' + (UI.folderHandle ? '' : 'btn-primary') + '" data-act="connect-folder">' + (UI.folderHandle ? 'Choose a different folder' : 'Connect Clients folder') + '</button>' + (UI.folderHandle && UI.folderOk ? '<button class="btn btn-ghost" data-act="rematch">Match folders again</button>' : '') + '</div>' : '<p class="small">Open CA Desk in Chrome or Edge on your office computer to connect folders.</p>') +
    (UI.folderHandle ? yearFormatPicker() + (UI.folderDirs ? folderMatches() : '') : '') + '</section>';
  h += '<section class="panel panel-pad stack"><h2>Due dates</h2><p class="small muted">Check these against the latest CBDT and CBIC notifications. Change a date here and every client updates.</p><div class="scroll"><table class="table"><thead><tr><th>What</th><th>Date</th><th>Checked</th><th>Source</th></tr></thead><tbody>' +
    DB.dueDates.map((d, i) => '<tr><td>' + esc(d.label) + '</td><td>' + (d.day != null ? '<input class="input" style="width:90px" type="number" min="1" max="28" value="' + d.day + '" data-change="due-day" data-i="' + i + '" aria-label="Day for ' + esc(d.label) + '">' : '<input class="input" style="width:170px" type="date" value="' + esc(d.date) + '" data-change="due-date" data-i="' + i + '" aria-label="Date for ' + esc(d.label) + '">') + '</td><td><input type="checkbox" ' + (d.verified ? 'checked' : '') + ' data-change="due-verified" data-i="' + i + '" aria-label="Checked"></td><td>' + (d.source ? '<a href="' + esc(d.source) + '" target="_blank" rel="noopener" class="small">Open</a>' : '<span class="small muted">Not set</span>') + '</td></tr>').join('') + '</tbody></table></div></section>';
  const T = s.templates || DEFAULT_TEMPLATES;
  const tl = [['hinglish', 'Reminder, Hinglish'], ['english', 'Reminder, English'], ['hindi', 'Reminder, Hindi'], ['thanks_hinglish', 'Thank-you, Hinglish'], ['thanks_english', 'Thank-you, English'], ['thanks_hindi', 'Thank-you, Hindi']];
  h += '<section class="panel panel-pad stack"><h2>Messages</h2><p class="small muted">{name} is the client, {list} the pending documents, {due} the last date, {signature} your name and firm.</p>' +
    tl.map(t => '<div class="field"><label for="tpl-' + t[0] + '">' + t[1] + '</label><textarea class="input" id="tpl-' + t[0] + '" rows="6" data-change="tpl" data-k="' + t[0] + '">' + esc(T[t[0]] || DEFAULT_TEMPLATES[t[0]]) + '</textarea></div>').join('') +
    '<div><button class="btn btn-ghost" data-act="tpl-reset">Restore default messages</button></div></section>';
  h += waSection();
  h += cloudSection();
  h += '<section class="panel panel-pad stack"><h2>Data</h2><div class="row"><button class="btn" data-act="export">Export status to Excel</button><a class="btn" href="#/welcome">Go to the opening page</a><button class="btn" data-act="sample">Load sample data</button>' + (isDemoMode() && DB.settings.guideHidden ? '<button class="btn" data-act="guide-show">Show the "Try this" guide</button>' : '') + '<button class="btn btn-ghost" data-act="erase">Erase everything on this device</button></div><p class="small muted">Full PANs are never saved. CA Desk keeps only the last 4 characters and reads full PANs from your Excel while it is open. Documents are written straight to your folder; no copy is kept.</p></section>';
  h += '<section class="panel panel-pad stack"><h2>Activity</h2>' + (DB.log.length ? '<ul class="hist">' + DB.log.slice(0, 30).map(l => '<li><span>' + esc(l.text) + '</span><span class="muted small">' + esc(ago(l.at)) + '</span></li>').join('') + '</ul>' : '<p class="small muted">Nothing yet.</p>') + '</section>';
  return h + '</div>';
}
function cloudSection() {
  let h = '<section class="panel panel-pad stack"><h2>Account and sync</h2>';
  if (!Cloud.cfg) {
    h += '<p class="small muted">Right now everything is saved on this device. Connect your Supabase project to sign in, keep data on a server and use CA Desk on your phone and computer together. Setup steps are in the README.</p>' +
      '<div class="field"><label for="c-url">Project URL</label><input class="input" id="c-url" placeholder="https://xxxx.supabase.co" autocomplete="off"></div><div class="field"><label for="c-key">Anon public key</label><input class="input" id="c-key" placeholder="eyJ…" autocomplete="off"></div><div><button class="btn btn-primary" data-act="cloud-connect">Connect</button></div>';
  } else if (!Cloud.session) {
    h += '<p class="small muted">Sign in with your email. You will get a one-time code. You stay signed in on this device.</p>' +
      '<div class="field"><label for="c-email">Email</label><input class="input" id="c-email" type="email" autocomplete="email" value="' + esc(UI.cloudEmail) + '"></div>' +
      (UI.codeSent ? '<div class="field"><label for="c-code">Code from the email</label><input class="input" id="c-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></div><div class="row"><button class="btn btn-primary" data-act="cloud-verify">Sign in</button><button class="btn btn-ghost" data-act="cloud-send">Send a new code</button></div>' : '<div class="row"><button class="btn btn-primary" data-act="cloud-send">Send code</button><button class="btn btn-ghost" data-act="cloud-forget">Disconnect project</button></div>');
  } else {
    h += '<p class="small">Signed in as <b>' + esc(Cloud.session.user.email || '') + '</b>. ' + esc(syncText()) + '.</p><div class="row"><button class="btn" data-act="cloud-sync">Sync now</button><button class="btn btn-ghost" data-act="cloud-signout">Sign out</button></div>';
  }
  return h + '</section>';
}

// ---------- Setup ----------
function viewSetup() {
  const st = UI.setupStep;
  const bar = '<div class="steps" aria-hidden="true">' + [1, 2, 3, 4].map(i => '<span class="' + (st >= i ? 'on' : '') + '"></span>').join('') + '</div>';
  let h = '<div class="main"><div class="setup"><a class="logo" href="#/today" style="padding-left:0">' + LOGO + 'CA Desk</a>' + (st ? bar : '');
  if (st === 0) {
    h += '<p class="banner info" style="margin-bottom:20px"><span>Evaluating CA Desk? Choose Try the demo. It works without files, accounts or a phone, and nothing is sent.</span></p><h1>Your filing season, remembered.</h1><p class="muted" style="margin:10px 0 24px">CA Desk reads your client Excel, tracks every document, writes the WhatsApp reminders and files what comes in. Setup takes about ten minutes.</p><div class="stack">' +
      '<button class="choice" data-act="setup-go"><b>Upload my client list</b><span class="muted">Your Excel of clients. Reminders go to your real clients on WhatsApp.</span></button>' +
      '<button class="choice" data-act="setup-sample"><b>Try the demo</b><span class="muted">Twelve made-up clients. See how everything works; nothing is sent. Switch to your own list any time.</span></button></div>';
  } else if (st === 1) {
    h += '<h1>Who is sending the reminders?</h1><p class="muted" style="margin:10px 0 20px">This goes at the end of every WhatsApp message.</p><div class="stack"><div class="field"><label for="w-name">Your name</label><input class="input" id="w-name" value="' + esc(DB.settings.caName) + '" placeholder="CA Sunil Agarwal" data-change="setting" data-k="caName"></div><div class="field"><label for="w-firm">Firm name</label><input class="input" id="w-firm" value="' + esc(DB.settings.firm) + '" placeholder="Agarwal & Associates" data-change="setting" data-k="firm"></div><div class="row"><button class="btn btn-primary" data-act="setup-next">Continue</button></div></div>';
  } else if (st === 2) {
    h += '<h1>Connect your client Excel</h1><p class="muted" style="margin:10px 0 20px">It stays your master list. Keep editing it as you do now; CA Desk picks up changes every time you open it on this computer.</p><div class="stack">' + (UI.lastImport ? importSummary() + '<div class="row"><button class="btn btn-primary" data-act="setup-next">Continue</button></div>' : excelButtons() + (fsaSupported() ? '' : '<p class="small muted">Live sync needs Chrome or Edge on a computer. Here you can upload the file; upload it again whenever it changes.</p>') + mappingEditor()) + '</div>';
  } else if (st === 3) {
    h += '<h1>Connect your Clients folder</h1><p class="muted" style="margin:10px 0 20px">The folder with one folder per client. Documents you tick get saved into the right client and year folder. Last year\'s files show up on each client\'s page.</p><div class="stack">';
    if (!fsaSupported()) h += '<p>Folder filing works in Chrome or Edge on your office computer. You can connect it there later from Settings.</p><div class="row"><button class="btn btn-primary" data-act="setup-next">Continue</button></div>';
    else if (!UI.folderHandle) h += '<div class="row"><button class="btn btn-primary" data-act="connect-folder">Connect Clients folder</button><button class="btn btn-ghost" data-act="setup-next">Skip for now</button></div>';
    else h += '<p class="small">Connected: <b>' + esc(UI.folderHandle.name) + '</b></p>' + yearFormatPicker() + (UI.folderDirs ? folderMatches() : '') + '<div class="row"><button class="btn btn-primary" data-act="setup-next">Continue</button></div>';
    h += '</div>';
  } else {
    const list = activeClients().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
    h += '<h1>Who is usually slow?</h1><p class="muted" style="margin:10px 0 20px">Optional. Slow clients get nudged earlier. You can change this on any client\'s page later.</p><div class="panel">' +
      list.map(c => '<div class="duerow"><span class="n">' + esc(c.name) + '</span><div class="seg" role="group" aria-label="Speed for ' + esc(c.name) + '">' + [['fast', 'Fast'], ['normal', 'Normal'], ['slow', 'Slow']].map(s => '<button type="button" aria-pressed="' + (c.speed === s[0]) + '" data-act="speed" data-id="' + c.id + '" data-v="' + s[0] + '">' + s[1] + '</button>').join('') + '</div></div>').join('') +
      '</div><div class="row" style="margin-top:18px"><button class="btn btn-primary btn-big" data-act="setup-done">Open today\'s list</button></div>';
  }
  return h + '</div></div>';
}

// ---------- modal ----------
function renderModal() {
  const root = $('#modal-root'); if (!root) return;
  if (!UI.run) { root.innerHTML = ''; return; }
  const u = runUnit();
  if (!u) { root.innerHTML = ''; return; }
  const names = u.clients.length > 1 ? u.clients.map(c => c.name).join(', ') : u.clients[0].name;
  const noNum = !u.phone && !u.demo;
  root.innerHTML = '<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><span class="small muted">Nudge ' + (UI.run.i + 1) + ' of ' + UI.run.keys.length + '</span>' +
    '<h2 id="mt">' + (noNum ? 'No WhatsApp number for ' + esc(names) : u.demo ? 'Reminder for ' + esc(names) : 'Sent to ' + esc(names) + '?') + '</h2>' +
    '<p class="small muted">' + (noNum ? 'Fix the number in your Excel. Skipping this one.' : u.demo ? 'Sample client, so WhatsApp was not opened and nothing was sent. In real use WhatsApp opens with this message ready; you tap send there, come back, and confirm.' : 'WhatsApp opened with this message. Tap send there, then come back.') + '</p>' +
    '<div class="bubble">' + esc(UI.run.msg) + '</div>' +
    '<div class="row">' + (noNum ? '' : '<button class="btn btn-wa" data-act="run-yes">' + (u.demo ? 'Mark as sent' : 'Yes, sent') + '</button>') + '<button class="btn" data-act="run-skip">Skip</button></div>' +
    '<div class="row">' + (noNum || u.demo ? '' : '<button class="btn btn-ghost btn-sm" data-act="run-reopen">Open WhatsApp again</button>') + '<button class="btn btn-ghost btn-sm" data-act="run-stop">Stop</button></div></div></div>';
  const b = root.querySelector('[data-act="run-yes"]') || root.querySelector('[data-act="run-skip"]'); if (b) b.focus();
}
function closeModal() { const r = $('#modal-root'); if (r) r.innerHTML = ''; }

// ---------- WhatsApp settings ----------
const WA_TEMPLATES = {
  english: 'Hello {{1}}, for your {{2}} we are still waiting on these documents: {{3}}. The last date is {{4}}. Please send them on this WhatsApp number; a clear photo works too. Regards, {{5}}. Thank you.',
  hinglish: 'Namaste {{1}}, aapke {{2}} ke liye ye documents abhi pending hain: {{3}}. Last date {{4}} hai. Kripya isi WhatsApp number par bhej dijiye, photo bhi chalega. Regards, {{5}}. Dhanyavaad.',
  hindi: 'नमस्ते {{1}}, आपके {{2}} के लिए ये दस्तावेज़ अभी बाकी हैं: {{3}}। आखिरी तारीख़ {{4}} है। कृपया इसी WhatsApp नंबर पर भेज दें, फ़ोटो भी चलेगी। सादर, {{5}}। धन्यवाद।'
};
function waSection() {
  const wa = DB.settings.wa || { mode: 'tap', tpl: {} };
  if (isDemoMode()) return '<section class="panel panel-pad stack"><h2>WhatsApp</h2><p class="small muted">In the demo, nothing is sent. Pressing Nudge shows a short picture walkthrough of how reminders, ticks and documents work once your WhatsApp is connected.</p><div><button class="btn" data-act="run-start">See how it works</button></div><p class="small muted">To send for real, upload your own client list first, then connect WhatsApp here.</p></section>';
  let h = '<section class="panel panel-pad stack"><h2>WhatsApp</h2><div class="seg" role="group" aria-label="How reminders are sent">' +
    [['tap', 'One by one from my phone'], ['api', 'All at once through WhatsApp Business']].map(m => '<button type="button" aria-pressed="' + (wa.mode === m[0]) + '" data-act="wa-mode" data-v="' + m[0] + '">' + m[1] + '</button>').join('') + '</div>';
  if (wa.mode !== 'api') return h + '<p class="small muted">Each reminder opens WhatsApp on your phone or computer with the message written, and you tap send. Works with any WhatsApp, no setup. Switch to WhatsApp Business to send the whole list at once, see delivered and read ticks, and receive documents straight into CA Desk.</p></section>';
  const done = (ok) => '<span class="chip ' + (ok ? 'ok' : '') + '">' + (ok ? 'Done' : 'To do') + '</span>';
  const steps = [
    [true, 'Move your number to the WhatsApp Business app and connect it in Interakt', 'Done outside CA Desk. Steps 1 and 2 in the README.', null],
    [Cloud.on, 'Sign in to your CA Desk account', 'Under Account and sync below. Your data and the WhatsApp connection live there.', null],
    [waHasTemplates(), 'Enter your approved template names', 'Below. Meta has to approve each template before it can be used.', null],
    [!!wa.testOk, 'Send a test to yourself', 'Below, once you are signed in.', null],
    [!!(DB.walog && DB.walog.length), 'Interakt is sending updates to CA Desk', 'Set up the webhook in Interakt (README step 4). Shows as done after the first update arrives.', null]
  ];
  h += (waReady() ? '<div class="banner info"><span>Connected. "Send all" is on the Today screen.</span></div>' : '<div class="banner warn"><span>Until every step below is done, reminders go one by one from your phone. Nothing is sent automatically.</span></div>') +
    '<ol style="margin:0;padding-left:20px" class="stack">' + steps.slice(1).map(st => '<li><div class="spread"><b>' + st[1] + '</b>' + done(st[0]) + '</div><span class="small muted">' + st[2] + '</span></li>').join('') + '</ol>';
  [['hinglish', 'Hinglish'], ['english', 'English'], ['hindi', 'Hindi']].forEach(([k, label]) => {
    const t = (wa.tpl || {})[k] || {};
    h += '<div class="stack" style="gap:8px;padding-top:6px;border-top:1px solid var(--line2)"><b>' + label + ' reminder</b><div class="qgrid"><div class="field"><label for="wt-' + k + '">Template name in Interakt</label><input class="input" id="wt-' + k + '" value="' + esc(t.name || '') + '" placeholder="cadesk_reminder_' + k + '" data-change="wa-tpl" data-lang="' + k + '" data-f="name" autocomplete="off"></div>' +
      '<div class="field"><label for="wl-' + k + '">Template language code</label><input class="input" id="wl-' + k + '" value="' + esc(t.lang || (k === 'hindi' ? 'hi' : 'en')) + '" data-change="wa-tpl" data-lang="' + k + '" data-f="lang" autocomplete="off"></div></div>' +
      '<details><summary class="small" style="cursor:pointer">Wording to submit for approval</summary><div class="bubble" style="margin-top:8px">' + esc(WA_TEMPLATES[k]) + '</div><p class="small muted" style="margin-top:6px">{{1}} name, {{2}} what it is for, {{3}} the documents, {{4}} last date, {{5}} your name and firm.</p></details></div>';
  });
  h += '<div class="stack" style="gap:8px;padding-top:6px;border-top:1px solid var(--line2)"><b>Send a test to yourself</b><div class="row"><label class="hidden" for="wa-test">Your mobile number</label><input class="input" style="flex:1 1 200px;width:auto" id="wa-test" inputmode="tel" placeholder="Your mobile number" value="' + esc(UI.waTest || '') + '"><button class="btn" data-act="wa-test"' + (Cloud.on ? '' : ' disabled') + '>Send test</button></div>' + (Cloud.on ? '' : '<span class="small muted">Sign in first.</span>') + '</div>';
  const log = DB.walog || [];
  h += '<div class="stack" style="gap:6px;padding-top:6px;border-top:1px solid var(--line2)"><b>Messages from Interakt</b>' + (log.length ? '<p class="small muted">Last one ' + esc(ago(log[0].at)) + ' (' + esc(log[0].type || 'unknown') + '). ' + log.length + ' recent events.</p><details><summary class="small" style="cursor:pointer">Show the raw events (for troubleshooting)</summary><div class="bubble" style="margin-top:8px;max-height:260px">' + esc(log.slice(0, 5).map(l => l.at + '  ' + l.type + '\n' + l.body).join('\n\n')) + '</div></details>' : '<p class="small muted">Nothing received yet.</p>') + '</div>';
  return h + '</section>';
}

// ---------- send-all modal ----------
function renderApiModal() {
  const root = $('#modal-root'); const r = UI.apiRun; if (!root || !r) return;
  const units = r.units || [];
  let h = '<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="am-t">';
  if (r.state === 'confirm') {
    const first = units[0]; const p = first ? nudgeParams(first) : null;
    h += '<span class="small muted">From your WhatsApp Business number, through Interakt</span><h2 id="am-t">Send ' + plural(units.length, 'reminder') + '?</h2>' +
      '<ul class="hist">' + units.map(u => '<li><span>' + esc(u.clients.map(c => c.name).join(', ')) + '</span><span class="muted small">' + plural(u.availCount, 'document') + '</span></li>').join('') + '</ul>' +
      (p ? '<details><summary class="small" style="cursor:pointer">What goes into the first one</summary><div class="bubble" style="margin-top:8px">' + esc('Name: ' + p.params[0] + '\nFor: ' + p.params[1] + '\nDocuments: ' + p.params[2] + '\nLast date: ' + p.params[3] + '\nSigned: ' + p.params[4] + '\nTemplate: ' + (p.template || 'not set')) + '</div></details>' : '') +
      '<div class="row"><button class="btn btn-wa" data-act="api-send">Send ' + units.length + '</button><button class="btn btn-ghost" data-act="api-close">Cancel</button></div>';
  } else if (r.state === 'sending') {
    h += '<h2 id="am-t">Sending ' + Math.min(r.i + 1, units.length) + ' of ' + units.length + '…</h2><div class="bar"><span style="width:' + Math.round(r.i / Math.max(1, units.length) * 100) + '%"></span></div><p class="small muted">Keep this screen open until it finishes.</p>';
  } else {
    const ok = r.results.filter(x => x.ok).length, bad = r.results.filter(x => !x.ok);
    h += '<h2 id="am-t">' + (bad.length ? ok + ' sent, ' + bad.length + ' not sent' : plural(ok, 'reminder') + ' sent') + '</h2>' +
      (ok ? '<p class="small muted">' + 'Delivered and read ticks appear on the Today list as WhatsApp reports them.' + '</p>' : '') +
      (bad.length ? '<ul class="hist">' + bad.map(x => '<li><span><b>' + esc(x.name) + '</b><br><span class="small" style="color:var(--risk-ink)">' + esc(x.error) + '</span></span>' + (x.canTap ? '<button class="btn btn-sm" data-act="api-tap" data-key="' + esc(x.key) + '">Open in WhatsApp</button>' : '') + '</li>').join('') + '</ul>' : '') +
      '<div class="row"><button class="btn btn-primary" data-act="api-close">Done</button></div>';
  }
  root.innerHTML = h + '</div></div>';
  const b = root.querySelector('.btn-wa, .btn-primary'); if (b) b.focus();
}
