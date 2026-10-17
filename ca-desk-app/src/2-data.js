/* CA Desk: persistence, cloud sync, Excel, folders, documents */

// ---------- persistence (local always, cloud when signed in) ----------
const Cloud = {
  cfg: null, sb: null, session: null, pushed: new Map(), status: 'local', lastSync: null, busy: false,
  get on() { return !!(this.sb && this.session); },
  async init() {
    const saved = (await IDB.get('cloudcfg').catch(() => null)) || null;
    const builtIn = window.CADESK_SUPABASE && window.CADESK_SUPABASE.url && window.CADESK_SUPABASE.key ? { url: window.CADESK_SUPABASE.url, key: window.CADESK_SUPABASE.key, builtIn: true } : null;
    this.cfg = saved || builtIn;
    if (!this.cfg || !this.cfg.url || !this.cfg.key || !window.supabase) { this.status = 'local'; return; }
    try {
      this.sb = window.supabase.createClient(this.cfg.url, this.cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cadesk-auth' } });
      const { data } = await this.sb.auth.getSession();
      this.session = data.session;
      if (this.session && UI.authReturn) { UI.authReturn = null; this.firstSync().catch(e => toast(authMessage(e), 7000)); }
      this.sb.auth.onAuthStateChange((ev, s) => {
        const was = this.session; this.session = s;
        if (ev === 'SIGNED_IN' && !was && s && !this.syncing) this.firstSync().catch(e => toast(authMessage(e), 7000));
        if (ev !== 'TOKEN_REFRESHED') render();
      });
      this.status = this.session ? 'ready' : 'signedout';
    } catch (e) { console.warn(e); this.status = 'error'; }
  },
  async configure(url, key) {
    this.cfg = { url: url.trim().replace(/\/$/, ''), key: key.trim() };
    await IDB.set('cloudcfg', this.cfg);
    await this.init();
  },
  async forget() { if (this.sb) await this.sb.auth.signOut().catch(() => {}); this.cfg = null; this.sb = null; this.session = null; this.status = 'local'; await IDB.del('cloudcfg'); await this.init(); },
  // The email may contain a code, a link, or both, depending on the email template: both are handled.
  async sendCode(email) { const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } }); if (error) throw error; },
  async verify(email, token) { const { data, error } = await this.sb.auth.verifyOtp({ email, token, type: 'email' }); if (error) throw error; this.session = data.session; await this.firstSync(); },
  async signOut() { await this.sb.auth.signOut(); this.session = null; this.status = 'signedout'; this.pushed.clear(); },
  records() {
    const out = [];
    const { settings } = DB;
    out.push({ id: 'settings', kind: 'settings', data: settings });
    Object.values(DB.clients).forEach(c => out.push({ id: 'client:' + c.id, kind: 'client', data: c }));
    Object.values(DB.engagements).forEach(e => out.push({ id: 'eng:' + e.id, kind: 'eng', data: e }));
    Object.values(DB.nudges).forEach(n => out.push({ id: 'nudge:' + n.id, kind: 'nudge', data: n }));
    Object.values(DB.handoffs).forEach(h => out.push({ id: 'handoff:' + h.id, kind: 'handoff', data: h }));
    Object.values(DB.inbox || {}).forEach(m => out.push({ id: 'inbox:' + m.id, kind: 'inbox', data: m }));
    if (DB.walog) out.push({ id: 'walog', kind: 'walog', data: { list: DB.walog } });
    out.push({ id: 'dues', kind: 'dues', data: { list: DB.dueDates } });
    out.push({ id: 'log', kind: 'log', data: { list: DB.log.slice(0, 200) } });
    return out;
  },
  fromRecords(rows) {
    const db = emptyDB();
    rows.forEach(r => {
      const d = r.data;
      if (r.kind === 'settings') db.settings = Object.assign(db.settings, d);
      else if (r.kind === 'client') db.clients[d.id] = d;
      else if (r.kind === 'eng') db.engagements[d.id] = d;
      else if (r.kind === 'nudge') db.nudges[d.id] = d;
      else if (r.kind === 'handoff') db.handoffs[d.id] = d;
      else if (r.kind === 'inbox') db.inbox[d.id] = d;
      else if (r.kind === 'walog') db.walog = d.list;
      else if (r.kind === 'dues') db.dueDates = d.list;
      else if (r.kind === 'log') db.log = d.list;
    });
    return db;
  },
  async pullAll() {
    const rows = []; let from = 0;
    for (;;) {
      const { data, error } = await this.sb.from('records').select('id,kind,data').range(from, from + 999);
      if (error) throw error;
      rows.push(...data); if (data.length < 1000) break; from += 1000;
    }
    return rows;
  },
  async firstSync() {
    if (this.syncing) return; this.syncing = true;
    try { await this._firstSync(); DB.settings.everSignedIn = true; save(); } finally { this.syncing = false; }
  },
  async _firstSync() {
    const rows = await this.pullAll();
    if (!rows.length) { this.pushed.clear(); await this.push(true); toast('This device\'s data is now saved to your account'); }
    else { DB = this.fromRecords(rows); this.pushed = new Map(rows.map(r => [r.id, JSON.stringify(r.data)])); await IDB.set('db', DB); toast('Signed in. Your data is loaded.'); }
    this.status = 'ready'; this.lastSync = new Date().toISOString(); render();
  },
  async push(all) {
    if (!this.on) return;
    const recs = this.records();
    const now = new Set(recs.map(r => r.id));
    const changed = recs.filter(r => all || this.pushed.get(r.id) !== JSON.stringify(r.data));
    const gone = [...this.pushed.keys()].filter(id => !now.has(id));
    const uidv = this.session.user.id;
    for (let i = 0; i < changed.length; i += 200) {
      const chunk = changed.slice(i, i + 200).map(r => ({ user_id: uidv, id: r.id, kind: r.kind, data: r.data, updated_at: new Date().toISOString() }));
      const { error } = await this.sb.from('records').upsert(chunk, { onConflict: 'user_id,id' });
      if (error) throw error;
    }
    if (gone.length) { const { error } = await this.sb.from('records').delete().in('id', gone); if (error) throw error; }
    changed.forEach(r => this.pushed.set(r.id, JSON.stringify(r.data)));
    gone.forEach(id => this.pushed.delete(id));
    this.lastSync = new Date().toISOString();
  },
  async refresh() {
    if (!this.on || this.busy) return;
    this.busy = true;
    try { await flush(); const rows = await this.pullAll(); if (rows.length) { DB = this.fromRecords(rows); this.pushed = new Map(rows.map(r => [r.id, JSON.stringify(r.data)])); await IDB.set('db', DB); } this.lastSync = new Date().toISOString(); this.status = 'ready'; }
    catch (e) { console.warn(e); this.status = 'offline'; }
    finally { this.busy = false; }
  }
};

async function flush() {
  try { await IDB.set('db', DB); } catch (e) { console.warn('local save failed', e); }
  if (Cloud.on) { try { await Cloud.push(); Cloud.status = 'ready'; } catch (e) { console.warn(e); Cloud.status = 'offline'; } }
}
const save = debounce(() => { flush().then(() => { if ($('#syncstate')) $('#syncstate').textContent = syncText(); }); }, 500);
function syncText() {
  if (Cloud.on) return Cloud.status === 'offline' ? 'Offline. Will retry.' : 'Saved to your account' + (Cloud.lastSync ? ', ' + ago(Cloud.lastSync) : '');
  if (Cloud.cfg && !Cloud.session && DB.settings.everSignedIn) return 'Signed out. Saved on this device.';
  return 'Saved on this device only';
}

// ---------- Excel ----------
const FIELDS = [
  { k: 'code', label: 'Client code', req: true, re: /code|client\s*id|^id$|file\s*no|client\s*no/i },
  { k: 'phone', label: 'WhatsApp number', req: true, re: /whats\s*app|mobile|phone|contact\s*no|cell/i, not: /secondary|alternate/i },
  { k: 'services', label: 'Services', req: true, re: /service|work|assignment/i },
  { k: 'pan', label: 'PAN', re: /\bpan\b/i },
  { k: 'entity', label: 'Entity type', re: /entity|constitution|status|type/i },
  { k: 'lang', label: 'Preferred language', re: /lang/i },
  { k: 'income', label: 'Income sources', re: /income|source/i },
  { k: 'secName', label: 'Secondary contact name', re: /(secondary|alternate|contact\s*person).*(name)?|contact\s*person/i, not: /no|number|phone|mobile/i },
  { k: 'secPhone', label: 'Secondary contact number', re: /(secondary|alternate).*(no|number|phone|mobile)/i },
  { k: 'folder', label: 'Folder name', re: /folder/i },
  { k: 'name', label: 'Client name', req: true, re: /name/i, not: /secondary|alternate|folder|contact\s*person|father/i }
];
const fieldLabel = (k) => (FIELDS.find(f => f.k === k) || {}).label || k;

function guessMapping(headers) {
  const used = new Set(); const map = {};
  FIELDS.forEach(f => {
    const h = headers.find(h => h && !used.has(h) && f.re.test(h) && !(f.not && f.not.test(h)));
    if (h) { map[f.k] = h; used.add(h); }
  });
  return map;
}

async function readWorkbook(file) {
  if (!window.XLSX) throw new Error('The Excel reader did not load. Check your internet connection and reload.');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = (DB.settings.sheetName && wb.SheetNames.includes(DB.settings.sheetName)) ? DB.settings.sheetName : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' });
  const hi = rows.findIndex(r => r.filter(x => String(x).trim()).length >= 3);
  if (hi < 0) throw new Error('No header row found. The first row with at least three filled cells is used as the header.');
  const headers = rows[hi].map(h => String(h).trim());
  const data = rows.slice(hi + 1).filter(r => r.some(x => String(x).trim()));
  return { headers, data, sheetName, sheets: wb.SheetNames, fileName: file.name, modified: file.lastModified || Date.now() };
}

// Apply an Excel read using the saved mapping. Returns a summary.
function mergeExcel(wb, mapping) {
  const missing = FIELDS.filter(f => f.req && (!mapping[f.k] || !wb.headers.includes(mapping[f.k])));
  if (missing.length) {
    const names = missing.map(f => mapping[f.k] ? '"' + mapping[f.k] + '"' : f.label);
    throw new Error('Sync stopped: ' + names.join(', ') + (missing.length > 1 ? ' are' : ' is') + ' missing from your Excel. Fix the column name or update the mapping in Settings.');
  }
  const col = (k) => mapping[k] ? wb.headers.indexOf(mapping[k]) : -1;
  const get = (row, k) => { const i = col(k); return i < 0 ? '' : String(row[i] == null ? '' : row[i]).trim(); };
  const seen = new Set(); const errors = []; let added = 0, updated = 0, restored = 0, archived = 0;
  const codes = {};
  wb.data.forEach(r => { const c = get(r, 'code'); if (c) codes[c] = (codes[c] || 0) + 1; });
  wb.data.forEach((r, idx) => {
    const rowNo = idx + 2;
    const code = get(r, 'code'), name = get(r, 'name'), phoneRaw = get(r, 'phone'), svc = get(r, 'services');
    if (!code || !name || !svc) { errors.push('Row ' + rowNo + ': missing ' + [!code && 'client code', !name && 'name', !svc && 'services'].filter(Boolean).join(', ')); return; }
    if (codes[code] > 1) { errors.push('Row ' + rowNo + ': client code ' + code + ' appears more than once'); return; }
    const services = parseServices(svc);
    if (!services.length) errors.push('Row ' + rowNo + ': services "' + svc + '" not recognised (use ITR, Tax audit, GST, TDS)');
    const ph = normalizePhone(phoneRaw); const sp = normalizePhone(get(r, 'secPhone'));
    const pan = get(r, 'pan').toUpperCase().replace(/\s/g, '');
    const data = {
      code, name, entity: normEntity(get(r, 'entity'), name), phone: ph.value, phoneValid: ph.valid, phoneRaw: ph.raw,
      services, panLast4: PAN_RE.test(pan) ? pan.slice(-4) : '', lang: normLang(get(r, 'lang')), income: parseIncome(get(r, 'income')),
      secName: get(r, 'secName'), secPhone: sp.value, folderHint: get(r, 'folder')
    };
    let c = Object.values(DB.clients).find(x => x.code === code && !x.demo);
    if (c) {
      const before = JSON.stringify([c.name, c.entity, c.phone, c.services, c.panLast4, c.lang, c.secName, c.secPhone, c.folderHint]);
      Object.assign(c, data);
      if (c.archived) { c.archived = false; c.archivedAt = null; restored++; }
      if (before !== JSON.stringify([c.name, c.entity, c.phone, c.services, c.panLast4, c.lang, c.secName, c.secPhone, c.folderHint])) updated++;
    } else {
      c = Object.assign({ id: uid(), speed: 'normal', notes: '', source: 'excel', archived: false, createdAt: new Date().toISOString(), folder: '' }, data);
      DB.clients[c.id] = c; added++;
    }
    if (PAN_RE.test(pan)) PAN_INDEX[pan] = c.id;
    seen.add(c.id);
    ensureEngagements(c);
  });
  Object.values(DB.clients).forEach(c => { if (c.source === 'excel' && !c.archived && !seen.has(c.id)) { c.archived = true; c.archivedAt = new Date().toISOString(); archived++; } });
  const s = DB.settings;
  s.lastSynced = new Date().toISOString(); s.syncError = ''; s.excelName = wb.fileName; s.excelModified = wb.modified; s.sheetName = wb.sheetName;
  const parts = [added && added + ' added', updated && updated + ' updated', restored && restored + ' restored', archived && archived + ' archived'].filter(Boolean);
  logEvent('Excel synced: ' + (parts.join(', ') || 'no changes') + (errors.length ? ', ' + plural(errors.length, 'row') + ' skipped' : ''));
  save();
  return { added, updated, restored, archived, errors };
}

const fsaSupported = () => typeof window.showOpenFilePicker === 'function' && typeof window.showDirectoryPicker === 'function';
async function permOk(handle, mode, ask) {
  if (!handle || !handle.queryPermission) return false;
  try {
    const o = { mode };
    if ((await handle.queryPermission(o)) === 'granted') return true;
    if (ask && (await handle.requestPermission(o)) === 'granted') return true;
  } catch (e) { console.warn(e); }
  return false;
}
function fsaError(e) {
  if (e && e.name === 'AbortError') return null;
  if (e && e.name === 'SecurityError') return 'Your browser blocked file access here. Open CA Desk in its own Chrome or Edge tab, not inside a preview.';
  return (e && e.message) || 'Something went wrong while opening the file.';
}

async function connectExcel() {
  try {
    const [h] = await window.showOpenFilePicker({ types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'], 'text/csv': ['.csv'] } }] });
    UI.excelHandle = h; UI.excelOk = true; await IDB.set('excelHandle', h);
    const wb = await readWorkbook(await h.getFile());
    return wb;
  } catch (e) { const m = fsaError(e); if (m) toast(m, 5000); return null; }
}

// Re-read the connected Excel if it changed (or always when forced)
async function syncExcel(force, ask) {
  if (!UI.excelHandle || !DB.settings.mapping) return null;
  if (!(await permOk(UI.excelHandle, 'read', ask))) { UI.excelOk = false; return null; }
  UI.excelOk = true;
  try {
    const f = await UI.excelHandle.getFile();
    if (!force && f.lastModified === DB.settings.excelModified && Object.keys(PAN_INDEX).length) return null;
    const wb = await readWorkbook(f);
    const r = mergeExcel(wb, DB.settings.mapping);
    return r;
  } catch (e) { DB.settings.syncError = e.message; logEvent(e.message); save(); return { error: e.message }; }
}

function downloadTemplate() {
  if (!window.XLSX) return toast('The Excel library did not load. Check your internet connection.');
  const rows = [['Client code', 'Client name', 'WhatsApp number', 'Services', 'PAN', 'Entity type', 'Preferred language', 'Income sources', 'Secondary contact name', 'Secondary contact number', 'Folder name'],
    ['C001', 'Rakesh Mehta', '98765 43210', 'ITR', 'ABCPM1234K', 'Individual', 'Hinglish', 'Salary, capital gains', '', '', 'Rakesh Mehta'],
    ['C002', 'Sethi Auto Parts Pvt Ltd', '+91 98100 00000', 'Tax audit, ITR, GST', 'AAACS1234F', 'Company', 'English', 'Business', 'Mr Arora (accountant)', '98110 00000', 'Sethi Auto Parts']];
  const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Clients');
  XLSX.writeFile(wb, 'CA Desk client list template.xlsx');
}

function exportExcel() {
  if (!window.XLSX) return toast('The Excel library did not load. Check your internet connection.');
  const rows = [['Client code', 'Client name', 'WhatsApp number', 'Services', 'Engagement', 'Status', 'Received', 'Pending from client', 'Pending from portal', 'Due date', 'Last nudged', 'Speed', 'Notes']];
  Object.values(DB.clients).filter(c => !c.archived).forEach(c => {
    const engs = currentEngs(c.id);
    const base = [c.code || '', c.name, c.phoneRaw || c.phone, (c.services || []).map(s => SERVICE_LABEL[s]).join(', ')];
    const last = (nudgesFor(c.id)[0] || {}).at;
    if (!engs.length) rows.push(base.concat(['', '', '', '', '', '', last ? last.slice(0, 10) : '', c.speed, c.notes || '']));
    engs.forEach(e => { const p = progress(e); rows.push(base.concat([engTitle(e), engStatus(e).text, p.got + ' of ' + p.total,
      e.items.filter(i => i.type === 'CLIENT' && isAsk(i)).map(i => i.name).join('; '),
      e.items.filter(i => i.type === 'PORTAL' && isAsk(i)).map(i => i.name).join('; '),
      engDue(e).date || '', last ? last.slice(0, 10) : '', c.speed, c.notes || ''])); });
  });
  const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Status');
  XLSX.writeFile(wb, 'CA Desk status ' + todayISO() + '.xlsx');
  logEvent('Exported status to Excel');
}

// ---------- folders ----------
const normName = (s) => String(s || '').toLowerCase().replace(/private limited|pvt\.?\s*ltd\.?|limited|\bltd\b|\bllp\b|&|\band\b|[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && w.length > 1);
function nameScore(a, b) {
  const A = new Set(normName(a)), B = new Set(normName(b)); if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
  return inter / Math.max(A.size, B.size);
}
async function listDirs(dir) { const out = []; for await (const [name, h] of dir.entries()) if (h.kind === 'directory') out.push(name); return out.sort((a, b) => a.localeCompare(b)); }
async function listFiles(dir) { const out = []; for await (const [name, h] of dir.entries()) if (h.kind === 'file') { const f = await h.getFile(); out.push({ name, modified: f.lastModified, size: f.size }); } return out.sort((a, b) => b.modified - a.modified); }

function parseYearFolder(name) {
  const m = String(name).match(/^(.*?)(20\d\d)\s*([-–_])\s*(\d{2}|\d{4})\s*$/);
  if (!m) return null;
  const prefix = m[1];
  return { prefix, basis: /f\.?\s*y/i.test(prefix) ? 'FY' : 'AY', sep: m[3], long: m[4].length === 4, explicit: /[af]\.?\s*y/i.test(prefix) };
}
function yearFolderName(ay, fmt) {
  fmt = fmt || DB.settings.yearFmt || { prefix: 'AY ', basis: 'AY', sep: '-', long: false };
  const y = fmt.basis === 'FY' ? Number(ay.slice(0, 4)) - 1 : Number(ay.slice(0, 4));
  return fmt.prefix + y + fmt.sep + (fmt.long ? String(y + 1) : String(y + 1).slice(2));
}

async function connectFolder() {
  try {
    const h = await window.showDirectoryPicker({ mode: 'readwrite' });
    UI.folderHandle = h; UI.folderOk = true; await IDB.set('folderHandle', h);
    DB.settings.folderName = h.name;
    await matchFolders();
    logEvent('Connected the "' + h.name + '" folder');
    save();
    return true;
  } catch (e) { const m = fsaError(e); if (m) toast(m, 5000); return false; }
}

// Match client folders by name and learn the year-folder pattern
async function matchFolders() {
  const root = UI.folderHandle; if (!root) return;
  const dirs = await listDirs(root);
  UI.folderDirs = dirs;
  const counts = {};
  for (const d of dirs.slice(0, 40)) {
    try { const sub = await listDirs(await root.getDirectoryHandle(d)); sub.forEach(n => { const p = parseYearFolder(n); if (p) { const k = JSON.stringify(p); counts[k] = (counts[k] || 0) + 1; } }); } catch (e) { /* skip */ }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best && !DB.settings.yearFmtConfirmed) DB.settings.yearFmt = JSON.parse(best[0]);
  activeClients().forEach(c => {
    if (c.folder && dirs.includes(c.folder)) return;
    if (c.folderHint && dirs.includes(c.folderHint)) { c.folder = c.folderHint; return; }
    let top = null, score = 0;
    dirs.forEach(d => { let s = nameScore(c.name, d); if (c.code && d.toLowerCase().includes(String(c.code).toLowerCase())) s += 0.5; if (s > score) { score = s; top = d; } });
    c.folder = score >= 0.6 ? top : '';
  });
  save();
}

async function clientDir(c, create) {
  const root = UI.folderHandle; if (!root) throw new Error('No folder connected');
  const name = c.folder || c.name.replace(/[\\/:*?"<>|]/g, ' ').trim();
  const dir = await root.getDirectoryHandle(name, { create });
  if (!c.folder) { c.folder = name; save(); }
  return dir;
}
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
async function uniqueFile(dir, base, ext) {
  for (let n = 1; n < 100; n++) {
    const name = base + (n > 1 ? ' (' + n + ')' : '') + ext;
    try { await dir.getFileHandle(name); } catch (e) { return name; }
  }
  return base + ' ' + Date.now() + ext;
}
async function writeToFolder(c, e, item, blob, origName) {
  const cdir = await clientDir(c, true);
  const ay = e.service === 'GST' ? null : e.ay;
  let ydir = ay ? await cdir.getDirectoryHandle(yearFolderName(ay), { create: true }) : await cdir.getDirectoryHandle(yearFolderName(CURRENT_AY), { create: true });
  if (e.service === 'GST') ydir = await ydir.getDirectoryHandle('GST ' + periodLabel(e.period), { create: true });
  const ext = (String(origName).match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
  const name = await uniqueFile(ydir, safeName(item.name), ext);
  const fh = await ydir.getFileHandle(name, { create: true });
  const w = await fh.createWritable(); await w.write(blob); await w.close();
  return name;
}
async function loadLastSeasonFiles(c) {
  if (!UI.folderHandle || !UI.folderOk || !c.folder) return null;
  try {
    const cdir = await UI.folderHandle.getDirectoryHandle(c.folder);
    const ydir = await cdir.getDirectoryHandle(yearFolderName(PREV_AY));
    return await listFiles(ydir);
  } catch (e) { return []; }
}

// ---------- documents ----------
async function pdfText(file) {
  if (!window.pdfjsLib) return { text: '', note: '' };
  try {
    if (!pdfText._init) { pdfjsLib.GlobalWorkerOptions.workerSrc = window.CADESK_PDF_WORKER || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; pdfText._init = true; }
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let text = '';
    for (let p = 1; p <= Math.min(doc.numPages, 3); p++) { const pg = await doc.getPage(p); const tc = await pg.getTextContent(); text += ' ' + tc.items.map(i => i.str).join(' '); }
    return { text, note: text.trim() ? '' : 'This PDF has no readable text (likely a scan), so it was matched by name only.' };
  } catch (e) {
    if (e && e.name === 'PasswordException') return { text: '', note: 'Password-protected PDF, so it was matched by name only. It will be saved as it is.' };
    return { text: '', note: '' };
  }
}

function scoreItem(item, hay) {
  let s = 0;
  DOC_RULES.forEach((r, i) => { if (r.key === item.key && r.re.test(hay)) s = Math.max(s, 100 - i); });
  if (item.custom || !s) { const words = normName(item.name).filter(w => w.length > 3); const hits = words.filter(w => hay.toLowerCase().includes(w)).length; if (hits) s = Math.max(s, 20 + hits * 10); }
  return s;
}

async function analyzeFile(file, hint) {
  hint = hint || {};
  const q = { id: uid(), file, name: file.name, size: file.size, clientId: '', engId: '', itemId: '', reason: '', warn: '', note: '', inboxId: hint.inboxId || '', inboxPath: hint.path || '', from: hint.phone || '' };
  const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
  let text = '';
  if (isPdf) { const r = await pdfText(file); text = r.text; q.note = r.note; }
  const hay = file.name.replace(/[_.-]+/g, ' ') + ' ' + text;
  // 1. PAN printed on the document
  const pans = [...new Set((text.toUpperCase().match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g) || []))];
  const byPan = pans.map(p => PAN_INDEX[p]).find(id => id && DB.clients[id] && !DB.clients[id].archived);
  let candidates = [];
  const byPhone = hint.phone ? activeClients().filter(c => c.phone === hint.phone).map(c => c.id) : [];
  if (byPan) { candidates = [byPan]; q.reason = 'Matched by the PAN printed on the document' + (byPhone.includes(byPan) ? ' and the sender\'s number' : ''); }
  else if (byPhone.length) { candidates = byPhone; q.reason = byPhone.length === 1 ? 'Sent from ' + DB.clients[byPhone[0]].name + '\'s WhatsApp' : 'Sent from the number shared by ' + byPhone.map(id => shortName(DB.clients[id])).join(', '); }
  else if (hint.phone) q.reason = 'Sent from +' + hint.phone + ', which is not in your client list. ';
  // What kind of document is it? (only clear-cut types)
  const TYPE_LABEL = { '16a': 'a Form 16A', f16: 'a Form 16', '26as': 'a Form 26AS', ais: 'an AIS', cg_broker: 'a capital gains statement', cg_mf: 'a mutual fund statement', hp_loan: 'a home loan certificate', biz_books: 'a set of accounts' };
  const typeKey = (DOC_RULES.find(r => TYPE_LABEL[r.key] && r.re.test(hay)) || {}).key || '';
  // share of a client's name found in the document
  const hayWords = new Set(normName(hay.slice(0, 2000)));
  const nameIn = (name) => { const w = normName(name).filter(x => x.length > 1); return w.length ? w.filter(x => hayWords.has(x)).length / w.length : 0; };
  let how = byPan ? 'pan' : byPhone.length ? 'phone' : '';
  // 2. The client's full name printed in the document or file name
  if (!candidates.length) {
    const full = activeClients().filter(c => nameIn(c.name) >= 0.99).sort((a, b) => normName(b.name).length - normName(a.name).length);
    if (full.length) { candidates = [full[0].id]; how = 'name'; q.reason = (q.reason || '') + 'Client name found in the document'; }
  }
  // 3. Someone nudged in the last 30 minutes (good for photos with no readable text)
  if (!candidates.length && !hint.phone) {
    const recent = Object.values(DB.nudges).filter(n => n.channel === 'whatsapp' && hoursSince(n.at) < 0.5).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (recent) { candidates = recent.clientIds.filter(id => DB.clients[id]); how = 'recent'; q.reason = 'You nudged ' + DB.clients[candidates[0]].name.split(' ')[0] + ' ' + ago(recent.at); }
  }
  // 4. Part of a client's name
  if (!candidates.length) {
    let best = null, bs = 0;
    activeClients().forEach(c => { const sc = nameIn(c.name); if (sc > bs) { bs = sc; best = c; } });
    if (best && bs >= 0.5) { candidates = [best.id]; how = 'partname'; q.reason = (q.reason || '') + 'Part of ' + best.name + '\'s name is in the document'; }
  }
  // pick the item: best keyword match among candidates' pending items
  let top = null, ts = 0;
  candidates.forEach(cid => currentEngs(cid).forEach(e => e.items.filter(i => i.status === 'pending').forEach(i => { const sc = scoreItem(i, hay) + (i.type === 'CLIENT' ? 1 : 0); if (sc > ts) { ts = sc; top = { cid, e, i }; } })));
  // A clear document type that the guessed client doesn't need means the guess is wrong: ask instead
  const typeMiss = typeKey && (!top || top.i.key !== typeKey);
  if (typeMiss && (how === 'recent' || how === 'partname')) {
    q.reason = 'Looks like ' + TYPE_LABEL[typeKey] + ', but ' + DB.clients[candidates[0]].name + ' has none pending, so it is probably for someone else. Pick the client.';
    candidates = []; top = null;
  }
  // Clear type, right client, but that document isn't pending: say so instead of guessing another item
  if (typeMiss && candidates.length) {
    let dup = null; candidates.forEach(cid => currentEngs(cid).forEach(e => e.items.forEach(i => { if (!dup && i.key === typeKey && i.status === 'received') dup = { cid, e, i }; })));
    if (dup) { q.clientId = dup.cid; q.engId = dup.e.id; q.itemId = dup.i.id; q.warn = DB.clients[dup.cid].name + '\'s ' + dup.i.name + ' was already received' + (dup.i.receivedAt ? ' on ' + fmtShort(dup.i.receivedAt) : '') + '. Filing this saves a second copy.'; q.reason += '. Looks like ' + dup.i.name; }
    else { q.clientId = candidates[0]; q.reason += '. Looks like ' + TYPE_LABEL[typeKey] + ', which is not on ' + DB.clients[candidates[0]].name + '\'s checklist. Pick the document, or choose "Something else" to add it.'; }
    candidates = []; top = null;
  }
  if (!top && candidates.length) { const cid = candidates[0]; const e = currentEngs(cid).find(x => x.items.some(i => i.status === 'pending' && i.type === 'CLIENT')); if (e) top = { cid, e, i: e.items.find(i => i.status === 'pending' && i.type === 'CLIENT') }; }
  if (top) { q.clientId = top.cid; q.engId = top.e.id; q.itemId = top.i.id; if (ts > 1 && candidates.length) q.reason += (q.reason ? '. ' : '') + 'Looks like ' + top.i.name; }
  else if (candidates.length) q.clientId = candidates[0];
  if (!q.reason || /not in your client list\. $/.test(q.reason)) q.reason = (q.reason || 'No match found. ') + 'Pick the client and document.';
  // assessment year check
  const m = text.match(/assessment\s*year\s*[:\-]?\s*(20\d\d)\s*[-–]\s*(\d{2,4})/i) || null;
  const f = !m && text.match(/financial\s*year\s*[:\-]?\s*(20\d\d)\s*[-–]\s*(\d{2,4})/i);
  let ay = m ? m[1] + '-' + m[2].slice(-2) : f ? (Number(f[1]) + 1) + '-' + String(Number(f[1]) + 2).slice(-2) : '';
  if (ay && ay !== CURRENT_AY) q.warn = 'This document says AY ' + ay + '. You are collecting for AY ' + CURRENT_AY + '. Check it is the right year.';
  return q;
}

async function addFiles(files) {
  const list = [...files].filter(f => f && f.size);
  if (!list.length) return;
  toast('Reading ' + plural(list.length, 'file') + '…');
  for (const f of list) UI.queue.push(await analyzeFile(f));
  if (location.hash !== '#/docs') location.hash = '#/docs'; else render();
}

async function fileQueued(qid) {
  const q = UI.queue.find(x => x.id === qid); if (!q) return;
  const c = DB.clients[q.clientId]; const e = DB.engagements[q.engId];
  const item = e && e.items.find(i => i.id === q.itemId);
  if (!c || !e || !item) return toast('Pick the client and the document first');
  let where = '';
  try {
    if (c.demo) {
      const ext = (String(q.name).match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
      item.fileName = safeName(item.name) + ext;
      where = 'Saved to Clients / ' + (c.folder || c.name) + ' / ' + (e.service === 'GST' ? yearFolderName(CURRENT_AY) + ' / GST ' + periodLabel(e.period) : yearFolderName(e.ay)) + ' / ' + item.fileName + ' (simulated for sample data: nothing written to disk)';
    } else if (UI.folderHandle && (UI.folderOk || await permOk(UI.folderHandle, 'readwrite', true))) {
      UI.folderOk = true;
      const name = await writeToFolder(c, e, item, q.file, q.name);
      item.fileName = name; where = 'Saved to ' + (c.folder || c.name) + ' / ' + (e.service === 'GST' ? 'GST ' + periodLabel(e.period) : yearFolderName(e.ay));
      if (q.inboxPath && Cloud.on) await Cloud.sb.storage.from('handoff').remove([q.inboxPath]).catch(() => {});
    } else if (Cloud.on && q.inboxPath) {
      const id = uid();
      DB.handoffs[id] = { id, path: q.inboxPath, clientId: c.id, engId: e.id, itemId: item.id, name: q.name, at: new Date().toISOString() };
      item.fileName = q.name; where = 'It files itself next time you open CA Desk on your office computer.';
    } else if (Cloud.on) {
      const id = uid(); const path = Cloud.session.user.id + '/' + id + '-' + safeName(q.name);
      const { error } = await Cloud.sb.storage.from('handoff').upload(path, q.file, { contentType: q.file.type || 'application/octet-stream' });
      if (error) throw error;
      DB.handoffs[id] = { id, path, clientId: c.id, engId: e.id, itemId: item.id, name: q.name, at: new Date().toISOString() };
      item.fileName = q.name; where = 'Waiting for your computer. It files itself next time you open CA Desk there.';
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(q.file); a.download = safeName(c.name + ' - ' + item.name) + ((q.name.match(/\.[a-z0-9]+$/i) || [''])[0]);
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      item.fileName = q.name; where = 'Downloaded. Connect your Clients folder on the office PC to file automatically.';
    }
  } catch (err) { console.warn(err); return toast('Could not save the file: ' + (err.message || err), 5000); }
  item.status = 'received'; item.receivedAt = todayISO();
  logEvent(item.name + ' received from ' + c.name + (q.inboxId ? ' on WhatsApp' : ''));
  if (q.inboxId && DB.inbox[q.inboxId]) delete DB.inbox[q.inboxId];
  UI.queue = UI.queue.filter(x => x.id !== qid);
  save(); render(); toast(item.name + ' ticked for ' + c.name.split(' ')[0] + '. ' + where, 4200);
}

// Files sent from the phone, filed on the PC
async function processHandoffs() {
  if (!Cloud.on || !UI.folderHandle || !UI.folderOk) return 0;
  let n = 0;
  for (const h of Object.values(DB.handoffs)) {
    const c = DB.clients[h.clientId], e = DB.engagements[h.engId], item = e && e.items.find(i => i.id === h.itemId);
    try {
      if (c && e && item) {
        const { data, error } = await Cloud.sb.storage.from('handoff').download(h.path);
        if (error) throw error;
        item.fileName = await writeToFolder(c, e, item, data, h.name); n++;
      }
      await Cloud.sb.storage.from('handoff').remove([h.path]);
      delete DB.handoffs[h.id];
    } catch (err) { console.warn('handoff', err); }
  }
  if (n) { logEvent(plural(n, 'file') + ' from your phone saved to your folders'); toast(plural(n, 'file') + ' from your phone saved to your folders'); save(); }
  return n;
}
async function expireHandoffs() {
  if (!Cloud.on) return;
  const staleInbox = Object.values(DB.inbox || {}).filter(m => m.file && hoursSince(m.at) > 24 * 14 && !UI.queue.some(q => q.inboxId === m.id));
  if (staleInbox.length) { await Cloud.sb.storage.from('handoff').remove(staleInbox.map(m => m.file.path)).catch(() => {}); staleInbox.forEach(m => delete DB.inbox[m.id]); logEvent(plural(staleInbox.length, 'WhatsApp file') + ' not filed in 14 days were deleted'); save(); }
  const old = Object.values(DB.handoffs).filter(h => hoursSince(h.at) > 24 * 7);
  if (!old.length) return;
  await Cloud.sb.storage.from('handoff').remove(old.map(h => h.path)).catch(() => {});
  old.forEach(h => delete DB.handoffs[h.id]);
  logEvent(plural(old.length, 'unsaved phone file') + ' deleted after 7 days'); save();
}

// ---------- WhatsApp through Interakt (server function wa-send) ----------
async function apiSend(phone, params, clientIds, items) {
  if (!Cloud.on) throw new Error('Sign in under Settings → Account and sync first');
  const id = uid();
  // save the reminder first, so delivery updates from WhatsApp can find it
  DB.nudges[id] = { id, phone, clientIds, items, at: new Date().toISOString(), ay: CURRENT_AY, channel: clientIds.length ? 'whatsapp' : 'test', via: 'api', waStatus: 'sending' };
  await flush();
  const { data, error } = await Cloud.sb.functions.invoke('wa-send', { body: Object.assign({ phone, callbackData: id }, params) });
  let err = '';
  if (error) { err = error.message || 'Send failed'; try { const j = await error.context.json(); err = j.error || err; } catch (e) { /* keep message */ } }
  else if (!data || !data.ok) err = (data && data.error) || 'Send failed';
  const n = DB.nudges[id];
  if (err) { if (n) { n.waStatus = 'failed'; n.waError = err; } save(); throw new Error(err); }
  if (n && n.waStatus === 'sending') n.waStatus = 'sent';
  if (n) n.waId = data.id || null;
  save();
  return id;
}
async function sendUnitApi(u) {
  if (u.demo) throw new Error('Sample client, so there is no real number to send to');
  if (!u.phone) throw new Error('No valid WhatsApp number');
  const p = nudgeParams(u);
  if (!p.template) throw new Error('Add your approved template name for ' + (p.lang === 'hinglish' ? 'Hinglish' : p.lang === 'hindi' ? 'Hindi' : 'English') + ' in Settings → WhatsApp');
  await apiSend(u.phone, { template: p.template, languageCode: p.languageCode, params: p.params }, u.clients.map(c => c.id), u.parts.flatMap(x => x.avail.map(i => i.name)));
  logEvent('Sent reminder to ' + u.clients.map(c => c.name).join(', ') + ' through WhatsApp');
}
const latestNudge = (ids) => Object.values(DB.nudges).filter(n => n.channel === 'whatsapp' && n.clientIds.some(id => ids.includes(id))).sort((a, b) => b.at.localeCompare(a.at))[0];

// Files clients sent on WhatsApp: bring them into the "Check and file" list
async function loadInbox() {
  if (!Cloud.on || UI.inboxBusy) return 0;
  UI.inboxBusy = true; let n = 0;
  try {
    for (const m of Object.values(DB.inbox || {})) {
      if (!m.file || UI.queue.some(q => q.inboxId === m.id)) continue;
      let data = null, error = null;
      if (m.file.b64) data = new Blob([b64ToBytes(m.file.b64)], { type: m.file.mime || '' });
      else if (Cloud.on) ({ data, error } = await Cloud.sb.storage.from('handoff').download(m.file.path));
      if (error || !data) { m.loadError = (error && error.message) || 'Could not download'; continue; }
      const f = new File([data], m.file.name, { type: m.file.mime || data.type || '' });
      UI.queue.push(await analyzeFile(f, { phone: m.phone, inboxId: m.id, path: m.file.path })); n++;
    }
    // text replies older than 30 days are not needed
    Object.values(DB.inbox || {}).forEach(m => { if (!m.file && hoursSince(m.at) > 24 * 30) delete DB.inbox[m.id]; });
  } finally { UI.inboxBusy = false; }
  if (n) toast(plural(n, 'document') + ' arrived on WhatsApp');
  return n;
}
async function discardInbox(id) {
  const m = DB.inbox[id]; if (!m) return;
  if (m.file && Cloud.on) await Cloud.sb.storage.from('handoff').remove([m.file.path]).catch(() => {});
  delete DB.inbox[id]; save();
}
const repliesFrom = (phone) => phone ? Object.values(DB.inbox || {}).filter(m => m.phone === phone).sort((a, b) => b.at.localeCompare(a.at)) : [];

// Supabase sign-in errors in plain words
function authMessage(e) {
  const m = String((e && (e.message || e.error_description)) || e || '');
  if (/rate limit|too many|429/i.test(m)) return 'Too many sign-in emails in the last hour. Wait a while and try again.';
  if (/not authorized|not allowed|signups not allowed/i.test(m)) return 'Sign-in emails can\'t be sent to this address yet. The email service for this app still needs to be set up.';
  if (/expired|invalid/i.test(m)) return 'That code or link has expired or was already used. Send a new one.';
  if (/sending|smtp|mail/i.test(m)) return 'The sign-in email could not be sent. The email service for this app needs checking.';
  if (/fetch|network|failed to/i.test(m)) return 'Could not reach the server. Check your internet connection.';
  return m || 'Something went wrong while signing in.';
}
