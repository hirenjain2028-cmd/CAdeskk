/* CA Desk: events and startup */

const findItem = (engId, itemId) => { const e = DB.engagements[engId]; return { e, i: e && e.items.find(x => x.id === itemId) }; };
function removeSampleData() {
  const demoIds = new Set(Object.values(DB.clients).filter(c => c.demo).map(c => c.id));
  if (!demoIds.size) return;
  demoIds.forEach(id => { delete DB.clients[id]; Object.keys(PAN_INDEX).forEach(p => { if (PAN_INDEX[p] === id) delete PAN_INDEX[p]; }); });
  Object.values(DB.engagements).forEach(e => { if (demoIds.has(e.clientId)) delete DB.engagements[e.id]; });
  Object.values(DB.nudges).forEach(n => { if (n.clientIds.some(id => demoIds.has(id))) delete DB.nudges[n.id]; });
  DB.settings.demo = false;
  logEvent('Sample data removed');
}
async function useWorkbook(wb, viaHandle) {
  const m = DB.settings.mapping;
  if (m && FIELDS.every(f => !f.req || (m[f.k] && wb.headers.includes(m[f.k])))) {
    removeSampleData();
    try { UI.lastImport = mergeExcel(wb, m); toast('Excel synced'); } catch (e) { toast(e.message, 6000); }
    UI.pendingExcel = null;
  } else {
    UI.pendingExcel = { wb, map: Object.assign(guessMapping(wb.headers), {}), viaHandle };
    if (m) Object.keys(m).forEach(k => { if (wb.headers.includes(m[k])) UI.pendingExcel.map[k] = m[k]; });
  }
  render();
}


// In-app dialogs. Browser pop-ups (confirm/prompt) are blocked in some embedded views, so never use them.
function dialog(o) {
  return new Promise((resolve) => {
    const root = $('#modal-root'); if (!root) return resolve(null);
    root.innerHTML = '<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h2 id="dlg-t">' + esc(o.title) + '</h2>' +
      (o.body ? '<p class="muted">' + esc(o.body) + '</p>' : '') + (o.bubble ? '<div class="bubble">' + esc(o.bubble) + '</div>' : '') +
      (o.input != null ? '<label class="hidden" for="dlg-in">' + esc(o.title) + '</label><input class="input" id="dlg-in" value="' + esc(o.input) + '" autocomplete="off">' : '') +
      '<div class="row"><button class="btn ' + (o.danger ? '' : 'btn-primary') + '" data-dlg="ok"' + (o.danger ? ' style="color:var(--risk-ink);border-color:var(--risk)"' : '') + '>' + esc(o.ok || 'OK') + '</button>' + (o.noCancel ? '' : '<button class="btn btn-ghost" data-dlg="cancel">Cancel</button>') + '</div></div></div>';
    const inp = $('#dlg-in');
    const done = (ok) => { const v = inp ? inp.value.trim() : true; root.innerHTML = ''; document.removeEventListener('keydown', key, true); resolve(ok ? (o.input != null ? (v || null) : true) : null); };
    const key = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); done(false); } if (ev.key === 'Enter' && inp && document.activeElement === inp) { ev.preventDefault(); done(true); } };
    document.addEventListener('keydown', key, true);
    root.querySelector('[data-dlg="ok"]').addEventListener('click', () => done(true));
    const cb = root.querySelector('[data-dlg="cancel"]'); if (cb) cb.addEventListener('click', () => done(false));
    root.querySelector('.modal-back').addEventListener('click', (ev) => { if (ev.target.classList.contains('modal-back')) done(false); });
    (inp || root.querySelector('[data-dlg="ok"]')).focus(); if (inp) inp.select();
  });
}
const askConfirm = (title, body, ok, danger) => dialog({ title, body, ok, danger });
const askText = (title, value, ok) => dialog({ title, input: value || '', ok: ok || 'Save' });

function apiOpen(keys) {
  const plan = todayPlan();
  const pool = [...plan.nudge, ...plan.stuck, ...plan.waiting];
  const units = keys ? pool.filter(u => keys.includes(u.key)) : plan.nudge;
  if (!units.length) return toast('Nobody to remind right now');
  UI.apiRun = { units, state: 'confirm', i: 0, results: [] }; renderApiModal();
}
async function apiSendAll() {
  const r = UI.apiRun; if (!r) return;
  r.state = 'sending'; renderApiModal();
  for (r.i = 0; r.i < r.units.length; r.i++) {
    renderApiModal();
    const u = r.units[r.i]; const name = u.clients.map(c => c.name).join(', ');
    try { await sendUnitApi(u); r.results.push({ key: u.key, name, ok: true }); }
    catch (e) { r.results.push({ key: u.key, name, ok: false, error: e.message, canTap: !!(u.phone || u.demo) }); }
  }
  r.state = 'done'; renderApiModal(); render();
}

const ACT = {
  'run-start': () => isDemoMode() ? openWalkthrough() : startRun(),
  'api-start': () => isDemoMode() ? openWalkthrough() : waReady() ? apiOpen() : (location.hash = '#/settings'),
  'api-one': (el) => isDemoMode() ? openWalkthrough(el.dataset.key) : waReady() ? apiOpen([el.dataset.key]) : startRun([el.dataset.key]),
  'walk-next': () => { UI.walk.i = Math.min(WALK_STEPS - 1, UI.walk.i + 1); renderWalk(); },
  'walk-back': () => { UI.walk.i = Math.max(0, UI.walk.i - 1); renderWalk(); },
  'walk-close': () => { UI.walk = null; closeModal(); },
  'walk-real': () => { UI.walk = null; closeModal(); UI.setupStep = 1; UI.lastImport = null; location.hash = '#/setup'; render(); },
  'api-send': () => apiSendAll(),
  'api-close': () => { if (UI.apiRun && UI.apiRun.state === 'sending') return; UI.apiRun = null; closeModal(); render(); },
  'sample-list': () => { UI.pendingExcel = { wb: sampleWorkbook(), map: guessMapping(SAMPLE_HEADERS), sample: true }; UI.lastImport = null; UI.setupStep = 2; location.hash = '#/setup'; render(); },
  'sample-docs': async () => { const files = sampleDocuments(); await addFiles(files); toast(plural(files.length, 'sample document') + ' added. Check the suggestions, then tick and file.'); render(); },
  'guide-hide': () => { DB.settings.guideHidden = true; save(); render(); },
  'guide-show': () => { DB.settings.guideHidden = false; save(); location.hash = '#/today'; render(); },
  'api-tap': (el) => { const u = (UI.apiRun && UI.apiRun.units || []).find(x => x.key === el.dataset.key); if (!u) return; if (u.demo) { el.textContent = 'Sample client'; el.disabled = true; return; } window.open(waLink(u.phone, nudgeMessage(u), u.demo), '_blank', 'noopener'); const id = uid(); DB.nudges[id] = { id, phone: u.phone, clientIds: u.clients.map(c => c.id), items: u.parts.flatMap(p => p.avail.map(i => i.name)), at: new Date().toISOString(), ay: CURRENT_AY, channel: 'whatsapp' }; save(); el.textContent = 'Opened'; el.disabled = true; },
  'wa-mode': (el) => { DB.settings.wa = Object.assign({ tpl: {} }, DB.settings.wa, { mode: el.dataset.v }); save(); render(); },
  'wa-test': async (el) => {
    const raw = ($('#wa-test') || {}).value || ''; UI.waTest = raw; const ph = normalizePhone(raw);
    if (!ph.valid) return toast('Enter your own 10-digit mobile number');
    const t = (DB.settings.wa.tpl || {}).hinglish || {}; const lang = t.name ? 'hinglish' : ['english', 'hindi'].find(k => (DB.settings.wa.tpl[k] || {}).name);
    const tt = lang ? DB.settings.wa.tpl[lang] : null;
    if (!tt || !tt.name) return toast('Add at least one template name first');
    el.disabled = true; el.textContent = 'Sending…';
    try { await apiSend(ph.value, { template: tt.name.trim(), languageCode: tt.lang || 'en', params: ['Test', 'ITR', 'Form 16, AIS', fmtDate(addDays(todayISO(), 7)), signature()] }, [], []); DB.settings.wa.testOk = new Date().toISOString(); save(); toast('Test sent. Check WhatsApp on ' + raw, 4000); render(); }
    catch (e) { toast('Not sent: ' + e.message, 7000); }
    el.disabled = false; el.textContent = 'Send test';
  },
  'inbox-dismiss': async (el) => { await discardInbox(el.dataset.id); render(); },
  'nudge-one': (el) => isDemoMode() ? openWalkthrough(el.dataset.key) : startRun([el.dataset.key]),
  'run-yes': () => confirmSent(true),
  'run-skip': () => confirmSent(false),
  'run-reopen': () => { const u = runUnit(); if (u) window.open(waLink(u.phone, UI.run.msg, u.demo), '_blank', 'noopener'); },
  'run-stop': () => endRun(),
  'log-call': (el) => logCall(el.dataset.ids.split(',')),
  'thanks': (el) => sendThanks(el.dataset.id),
  'filter': (el) => { UI.filter = el.dataset.v; render(); },
  'source': (el) => { const e = DB.engagements[el.dataset.eng]; e.sources = Object.assign({}, e.sources, { [el.dataset.k]: !e.sources[el.dataset.k] }); buildItems(e); save(); render(); },
  'regime': (el) => { const e = DB.engagements[el.dataset.eng]; e.regime = el.dataset.v; buildItems(e); save(); render(); },
  'item-menu': (el) => { UI.openItem = UI.openItem === el.dataset.item ? null : el.dataset.item; render(); },
  'item-ask': (el) => { const { i } = findItem(el.dataset.eng, el.dataset.item); i.optional = false; i.asked = true; UI.openItem = null; save(); render(); },
  'item-na': (el) => { const { i } = findItem(el.dataset.eng, el.dataset.item); i.status = i.status === 'na' ? 'pending' : 'na'; UI.openItem = null; save(); render(); },
  'item-type': (el) => { const { i } = findItem(el.dataset.eng, el.dataset.item); i.type = i.type === 'PORTAL' ? 'CLIENT' : 'PORTAL'; UI.openItem = null; save(); render(); },
  'item-rename': async (el) => { const { i } = findItem(el.dataset.eng, el.dataset.item); const n = await askText('Rename this document', i.name, 'Rename'); if (n) { i.name = n; i.renamed = true; save(); } UI.openItem = null; render(); },
  'item-remove': (el) => { const { e } = findItem(el.dataset.eng, el.dataset.item); e.items = e.items.filter(x => x.id !== el.dataset.item); UI.openItem = null; save(); render(); },
  'speed': (el) => { const c = DB.clients[el.dataset.id]; c.speed = el.dataset.v; save(); render(); },
  'restore': (el) => { const c = DB.clients[el.dataset.id]; c.archived = false; logEvent('Restored ' + c.name); save(); render(); toast('Restored. It is archived again at the next sync unless it is back in your Excel.', 4500); },
  'reconnect': async () => {
    if (UI.excelHandle) UI.excelOk = await permOk(UI.excelHandle, 'read', true);
    if (UI.folderHandle) UI.folderOk = await permOk(UI.folderHandle, 'readwrite', true);
    if (UI.excelOk) await syncExcel(true, false);
    if (UI.folderOk) { await matchFolders().catch(() => {}); await processHandoffs(); }
    render();
  },
  'connect-excel': async () => { const wb = await connectExcel(); if (wb) await useWorkbook(wb, true); },
  'sync-excel': async () => { const r = await syncExcel(true, true); if (r && r.error) toast(r.error, 6000); else if (r) { UI.lastImport = r; toast('Excel synced'); } render(); },
  'remap': async () => { if (!UI.excelHandle) return; try { const wb = await readWorkbook(await UI.excelHandle.getFile()); UI.pendingExcel = { wb, map: Object.assign({}, DB.settings.mapping || guessMapping(wb.headers)) }; render(); } catch (e) { toast(fsaError(e) || e.message); } },
  'cancel-excel': () => { UI.pendingExcel = null; render(); },
  'import-excel': () => {
    const p = UI.pendingExcel; if (!p) return;
    removeSampleData();
    DB.settings.mapping = Object.assign({}, p.map);
    try { UI.lastImport = mergeExcel(p.wb, DB.settings.mapping); if (p.sample) { markSampleImport(); save(); } UI.pendingExcel = null; toast(plural(UI.lastImport.added + UI.lastImport.updated, 'client') + ' imported' + (p.sample ? ' from the sample list' : '')); }
    catch (e) { toast(e.message, 6000); }
    render();
  },
  'template': () => downloadTemplate(),
  'export': () => exportExcel(),
  'connect-folder': async () => { if (await connectFolder()) { await processHandoffs(); toast('Folder connected'); } render(); },
  'rematch': async () => { await matchFolders(); toast('Folders matched again'); render(); },
  'year-basis': (el) => { const f = Object.assign({ prefix: 'AY ', basis: 'AY', sep: '-', long: false }, DB.settings.yearFmt || {}); f.basis = el.dataset.v; f.prefix = f.prefix.replace(/[af]\.?\s*y\.?/i, el.dataset.v) || (el.dataset.v + ' '); if (!/[af]\.?\s*y/i.test(f.prefix)) f.prefix = el.dataset.v + ' '; DB.settings.yearFmt = f; DB.settings.yearFmtConfirmed = true; save(); render(); },
  'handoffs': async () => { await processHandoffs(); render(); },
  'q-file': (el) => fileQueued(el.dataset.q),
  'q-drop': async (el) => { const q = UI.queue.find(x => x.id === el.dataset.q); if (q && q.inboxId) { if (!(await askConfirm('Delete this file?', 'It was sent on WhatsApp. Removing it here deletes the copy CA Desk received. The chat in WhatsApp is not touched.', 'Delete', true))) return; await discardInbox(q.inboxId); } UI.queue = UI.queue.filter(x => x.id !== el.dataset.q); render(); },
  'tpl-reset': async () => { if (await askConfirm('Restore the default messages?', 'Your edited wording will be replaced.', 'Restore defaults')) { DB.settings.templates = Object.assign({}, DEFAULT_TEMPLATES); save(); render(); toast('Default messages restored'); } },
  'sample': async () => { if (Object.keys(DB.clients).length && !(await askConfirm('Load sample data?', 'This replaces everything saved on this device with twelve made-up clients.', 'Load sample data', true))) return; loadSampleData(); location.hash = '#/today'; render(); },
  'erase': async () => { if (!(await askConfirm('Erase everything on this device?', 'All clients, ticks and history saved in CA Desk on this device are deleted. Your Excel and folders are not touched.', 'Erase everything', true))) return; DB = emptyDB(); Object.keys(PAN_INDEX).forEach(k => delete PAN_INDEX[k]); UI.excelHandle = UI.folderHandle = null; await IDB.del('excelHandle'); await IDB.del('folderHandle'); await flush(); UI.setupStep = 0; location.hash = '#/setup'; render(); },
  'real-setup': (el, ev) => { ev.preventDefault(); UI.setupStep = 1; UI.lastImport = null; location.hash = '#/setup'; render(); },
  'setup-go': () => { UI.setupStep = 1; render(); },
  'setup-sample': async () => { if (Object.values(DB.clients).some(c => !c.demo) && !(await askConfirm('Switch to the demo?', 'This replaces the clients saved on this device with made-up ones. Your Excel file is not touched.', 'Switch to the demo', true))) return; loadSampleData(); UI.tourStep = 0; location.hash = '#/tour'; render(); },
  'tour-done': (el, ev) => { if (ev) ev.preventDefault(); if (!Object.keys(DB.clients).length) loadSampleData(); location.hash = '#/today'; },
  'setup-next': () => { UI.setupStep = Math.min(4, UI.setupStep + 1); if (UI.setupStep === 3 && UI.folderHandle && UI.folderOk) matchFolders().then(render); render(); },
  'setup-done': () => { DB.settings.setupDone = true; save(); UI.setupStep = 0; location.hash = '#/today'; },
  'cloud-connect': async () => { const url = $('#c-url').value, key = $('#c-key').value; if (!/^https:\/\//.test(url.trim()) || key.trim().length < 20) return toast('Paste the project URL and the anon public key from Supabase'); if (!window.supabase) return toast('The sign-in library did not load. Check your internet connection.'); await Cloud.configure(url, key); render(); },
  'cloud-forget': async () => { await Cloud.forget(); render(); },
  'cloud-send': async (el) => { const email = ($('#c-email') || {}).value || UI.cloudEmail; if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter your email address'); UI.cloudEmail = email.trim(); if (el) { el.disabled = true; el.textContent = 'Sending…'; } try { await Cloud.sendCode(UI.cloudEmail); UI.codeSent = true; toast('Email sent to ' + UI.cloudEmail); } catch (e) { toast(authMessage(e), 7000); } render(); },
  'cloud-verify': async () => { const code = ($('#c-code') || {}).value || ''; if (!/^\d{6,10}$/.test(code.trim())) return toast('Enter the code from the email'); try { await Cloud.verify(UI.cloudEmail, code.trim()); UI.codeSent = false; } catch (e) { toast(authMessage(e), 7000); } render(); },
  'cloud-sync': async () => { await Cloud.refresh(); render(); toast(Cloud.status === 'offline' ? 'Could not reach the server' : 'Synced'); },
  'cloud-signout': async () => { await Cloud.signOut(); render(); }
};

const CHANGE = {
  'item-check': (el) => { const { e, i } = findItem(el.dataset.eng, el.dataset.item); const c = DB.clients[e.clientId]; if (el.checked) { i.status = 'received'; i.receivedAt = todayISO(); logEvent(i.name + ' received from ' + c.name); } else { i.status = 'pending'; i.receivedAt = null; } save(); render(); },
  'eng-status': (el) => { const e = DB.engagements[el.dataset.eng]; e.status = el.value; logEvent(engTitle(e) + ' for ' + DB.clients[e.clientId].name + ': ' + el.options[el.selectedIndex].text); save(); render(); },
  'notes': (el) => { DB.clients[el.dataset.id].notes = el.value; save(); toast('Note saved'); },
  'lang': (el) => { DB.clients[el.dataset.id].langApp = el.value; save(); },
  'setting': (el) => { DB.settings[el.dataset.k] = el.value.trim(); save(); },
  'tpl': (el) => { DB.settings.templates = Object.assign({}, DB.settings.templates || DEFAULT_TEMPLATES, { [el.dataset.k]: el.value }); save(); toast('Message saved'); },
  'due-date': (el) => { if (el.value) { DB.dueDates[+el.dataset.i].date = el.value; save(); render(); } },
  'due-day': (el) => { const n = Math.max(1, Math.min(28, parseInt(el.value, 10) || 1)); DB.dueDates[+el.dataset.i].day = n; save(); render(); },
  'due-verified': (el) => { DB.dueDates[+el.dataset.i].verified = el.checked; save(); },
  'map': (el) => { UI.pendingExcel.map[el.dataset.k] = el.value; render(); },
  'sheet': async (el) => { DB.settings.sheetName = el.value; const p = UI.pendingExcel; try { const f = UI.excelHandle && p.viaHandle ? await UI.excelHandle.getFile() : p.file; if (f) { const wb = await readWorkbook(f); UI.pendingExcel = { wb, map: guessMapping(wb.headers), viaHandle: p.viaHandle, file: p.file }; } } catch (e) { toast(e.message); } render(); },
  'upload-excel': async (el) => { const f = el.files && el.files[0]; if (!f) return; try { const wb = await readWorkbook(f); await useWorkbook(wb, false); if (UI.pendingExcel) UI.pendingExcel.file = f; } catch (e) { toast(e.message, 6000); } },
  'wa-tpl': (el) => { const wa = DB.settings.wa = Object.assign({ mode: 'api', tpl: {} }, DB.settings.wa); wa.tpl = Object.assign({}, wa.tpl); wa.tpl[el.dataset.lang] = Object.assign({}, wa.tpl[el.dataset.lang], { [el.dataset.f]: el.value.trim() }); save(); toast('Saved'); },
  'folder-pick': (el) => { DB.clients[el.dataset.id].folder = el.value; save(); },
  'pick-files': (el) => { addFiles(el.files); el.value = ''; },
  'q-client': (el) => { const q = UI.queue.find(x => x.id === el.dataset.q); q.clientId = el.value; q.engId = ''; q.itemId = ''; const e = currentEngs(q.clientId).find(x => x.items.some(i => isAsk(i) && i.type === 'CLIENT')); if (e) { q.engId = e.id; const sc = e.items.filter(i => i.status === 'pending').map(i => ({ i, s: scoreItem(i, q.name.replace(/[_.-]+/g, ' ')) })).sort((a, b) => b.s - a.s)[0]; q.itemId = sc ? sc.i.id : ''; } render(); },
  'q-item': async (el) => {
    const q = UI.queue.find(x => x.id === el.dataset.q); const [a, b] = el.value.split('|');
    if (a === 'new') { const n = await askText('What is this document?', q.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '), 'Add to checklist'); if (n) { const e = DB.engagements[b]; const it = { id: uid(), key: 'custom', name: n, type: 'CLIENT', availableFrom: null, status: 'pending', receivedAt: null, fileName: null, custom: true }; e.items.push(it); q.engId = e.id; q.itemId = it.id; save(); } }
    else { q.engId = a || ''; q.itemId = b || ''; }
    render();
  }
};

function bind() {
  document.addEventListener('click', (ev) => { const el = ev.target.closest('[data-act]'); if (!el || el.disabled) return; const fn = ACT[el.dataset.act]; if (fn) { if (el.tagName === 'BUTTON') ev.preventDefault(); fn(el, ev); } });
  document.addEventListener('change', (ev) => { const el = ev.target.closest('[data-change]'); if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el, ev); });
  document.addEventListener('input', (ev) => { const el = ev.target; if (el.dataset && el.dataset.input === 'q') { UI.q = el.value; const box = $('#clist'); if (box) box.innerHTML = clientListHTML(); } });
  document.addEventListener('submit', (ev) => {
    const f = ev.target; if (f.dataset.submit !== 'add-item') return; ev.preventDefault();
    const name = f.elements.name.value.trim(); if (!name) return f.elements.name.focus();
    const e = DB.engagements[f.dataset.eng];
    e.items.push({ id: uid(), key: 'custom', name, type: f.elements.portal.checked ? 'PORTAL' : 'CLIENT', availableFrom: null, status: 'pending', receivedAt: null, fileName: null, custom: true });
    save(); render(); const again = $('#add-' + e.id); if (again) again.focus();
  });
  // the tour scrolls inside its own column; scroll events don't bubble, so listen in the capture phase
  document.addEventListener('scroll', (ev) => { if (ev.target && ev.target.id === 'tour') requestAnimationFrame(tourOnScroll); }, { passive: true, capture: true });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && UI.run) endRun(); if (ev.key === 'Escape' && UI.apiRun && UI.apiRun.state !== 'sending') ACT['api-close'](); if (ev.key === 'Escape' && UI.walk) ACT['walk-close'](); });
  // drag and drop anywhere
  let depth = 0;
  document.addEventListener('dragenter', (ev) => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) { depth++; const d = $('#drop'); if (d) d.classList.add('over'); } });
  document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) { const d = $('#drop'); if (d) d.classList.remove('over'); } });
  document.addEventListener('dragover', (ev) => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) ev.preventDefault(); });
  document.addEventListener('drop', (ev) => { if (!ev.dataTransfer || !ev.dataTransfer.files.length) return; ev.preventDefault(); depth = 0; addFiles(ev.dataTransfer.files); });
  // coming back to the app: pick up Excel edits and phone changes
  let lastBack = 0;
  const onBack = async () => {
    if (document.visibilityState !== 'visible' || UI.run) return;
    if (Date.now() - lastBack < 20000) return; lastBack = Date.now();
    let changed = false;
    if (Cloud.on) { await Cloud.refresh(); await loadInbox(); changed = true; }
    if (UI.excelHandle && UI.excelOk) { const r = await syncExcel(false, false); if (r) changed = true; }
    if (UI.folderOk && Object.keys(DB.handoffs).length) { await processHandoffs(); changed = true; }
    if (changed && !document.activeElement.matches('input,textarea,select') && !UI.apiRun) render();
  };
  // while open and signed in, check for WhatsApp replies and documents every minute
  setInterval(async () => {
    if (document.visibilityState !== 'visible' || !Cloud.on || !waApi() || UI.run || UI.apiRun || $('#modal-root').innerHTML) return;
    await Cloud.refresh(); const n = await loadInbox();
    const r = route().name;
    if ((n || r === 'today') && !document.activeElement.matches('input,textarea,select')) render();
  }, 60000);
  document.addEventListener('visibilitychange', onBack);
  window.addEventListener('focus', onBack);
  window.addEventListener('hashchange', () => { UI.openItem = null; render(); window.scrollTo(0, 0); });
}

async function init() {
  // Coming back from the sign-in link in the email: the address ends with the sign-in details (or an error)
  const h0 = location.hash || '';
  if (/access_token=|refresh_token=|error_description=/.test(h0)) {
    UI.authReturn = h0;
    const err = /error_description=([^&]+)/.exec(h0);
    if (err) { UI.authReturn = null; setTimeout(() => toast(authMessage(decodeURIComponent(err[1].replace(/\+/g, ' '))), 8000), 300); }
  }
  try { const saved = await IDB.get('db'); if (saved && saved.v) DB = Object.assign(emptyDB(), saved, { settings: Object.assign(emptyDB().settings, saved.settings) }); } catch (e) { console.warn(e); }
  DB.settings.templates = Object.assign({}, DEFAULT_TEMPLATES, DB.settings.templates || {});
  DEFAULT_DUES.forEach(d => { if (!DB.dueDates.some(x => x.key === d.key)) DB.dueDates.push(Object.assign({}, d)); });
  Object.values(DB.clients).forEach(c => { if (c.demo && c.demoPan) PAN_INDEX[c.demoPan] = c.id; });
  bind();
  render();
  await Cloud.init();
  if (/access_token=|refresh_token=|error_description=/.test(location.hash || '')) { history.replaceState(null, '', location.pathname + location.search + '#/settings'); render(); if (Cloud.on) toast('Signed in as ' + (Cloud.session.user.email || 'you')); }
  if (Cloud.on) { await Cloud.refresh(); Object.values(DB.clients).forEach(c => { if (c.demo && c.demoPan) PAN_INDEX[c.demoPan] = c.id; }); }
  DB.settings.wa = Object.assign({ mode: 'tap', tpl: { hinglish: { name: '', lang: 'en' }, english: { name: '', lang: 'en' }, hindi: { name: '', lang: 'hi' } } }, DB.settings.wa || {});
  if (!DB.inbox) DB.inbox = {};
  try {
    UI.excelHandle = (await IDB.get('excelHandle')) || null;
    UI.folderHandle = (await IDB.get('folderHandle')) || null;
    UI.excelOk = UI.excelHandle ? await permOk(UI.excelHandle, 'read', false) : false;
    UI.folderOk = UI.folderHandle ? await permOk(UI.folderHandle, 'readwrite', false) : false;
  } catch (e) { console.warn(e); }
  activeClients().forEach(ensureEngagements);
  if (UI.excelOk) await syncExcel(true, false);
  if (UI.folderOk) { try { UI.folderDirs = await listDirs(UI.folderHandle); } catch (e) { /* ignore */ } await processHandoffs(); }
  await expireHandoffs();
  await loadInbox();
  try {
    const shared = await IDB.get('shared');
    if (shared && shared.length) { await IDB.del('shared'); await addFiles(shared.map(s => new File([s.blob], s.name, { type: s.type }))); }
  } catch (e) { console.warn(e); }
  if (!DB.settings.setupDone && !Object.keys(DB.clients).length && !['setup', 'welcome'].includes(route().name)) location.hash = '#/setup';
  save();
  render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && window.top === window.self) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  }
}
document.addEventListener('DOMContentLoaded', init);
