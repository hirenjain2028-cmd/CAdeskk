/* CA Desk: core (utilities, storage, templates, domain logic) */
'use strict';

// ---------- utilities ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayISO = () => isoOf(new Date());
const parseISO = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoOf(d); };
const daysFromToday = (s) => Math.round((parseISO(s) - parseISO(todayISO())) / 86400000);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (s) => { if (!s) return ''; const d = parseISO(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
const fmtShort = (s) => { if (!s) return ''; const d = parseISO(s); return d.getDate() + ' ' + MONTHS[d.getMonth()]; };
const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;
const ago = (iso) => {
  if (!iso) return '';
  const h = hoursSince(iso);
  if (h < 1) { const m = Math.max(1, Math.round(h * 60)); return m + (m === 1 ? ' minute ago' : ' minutes ago'); }
  if (h < 24) { const r = Math.round(h); return r + (r === 1 ? ' hour ago' : ' hours ago'); }
  const d = Math.round(h / 24); return d === 1 ? 'yesterday' : d + ' days ago';
};
const dueText = (days) => days < 0 ? (-days === 1 ? '1 day late' : -days + ' days late') : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : 'Due in ' + days + ' days';
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
// Short pop-up message, also kept on screen as "Last action" so it can't be missed.
function toast(msg, ms = 4500) {
  const el = $('#toast'); if (!el) return;
  el.innerHTML = '<div class="t">' + esc(msg) + '</div>';
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.innerHTML = ''; }, ms);
  if (!/…$/.test(msg)) { UI.lastAction = { msg, at: new Date().toISOString() }; const la = $('#lastaction'); if (la) la.innerHTML = lastActionHTML(); }
}
const lastActionHTML = () => UI.lastAction ? '<b>Last action:</b> ' + esc(UI.lastAction.msg) + ' <span class="muted">(' + esc(ago(UI.lastAction.at)) + ')</span>' : '';
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const shortName = (c) => firstName(c.name) + (c.entity === 'huf' ? ' HUF' : '');

// ---------- IndexedDB key-value ----------
const IDB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('No IndexedDB'));
      const r = indexedDB.open('cadesk', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
      r.onsuccess = () => { this._db = r.result; res(r.result); };
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
  async del(k) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
};

// ---------- constants ----------
const CURRENT_AY = '2026-27';       // income of FY 2025-26
const PREV_AY = '2025-26';
const ayToFy = (ay) => { const y = Number(ay.slice(0, 4)) - 1; return y + '-' + String(y + 1).slice(2); };
const SERVICE_LABEL = { ITR: 'ITR', TAX_AUDIT: 'Tax audit', GST: 'GST', TDS: 'TDS' };
const SOURCES = [
  { k: 'salary', label: 'Salary' }, { k: 'cg', label: 'Capital gains' }, { k: 'hp', label: 'House property' },
  { k: 'biz', label: 'Business / profession' }, { k: 'foreign', label: 'Foreign assets' }
];
const ITR_OFFICIAL = 'https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/itr-2/itr-2-faqs';

// Checklist templates. type CLIENT = client must send; PORTAL = the CA downloads it.
function templateFor(e) {
  const out = [];
  const add = (key, name, type = 'CLIENT', extra = {}) => out.push(Object.assign({ key, name, type }, extra));
  if (e.service === 'ITR') {
    const s = e.sources || {};
    const startYear = Number(e.ay.slice(0, 4));
    add('26as', 'Form 26AS', 'PORTAL');
    add('ais', 'AIS / TIS', 'PORTAL');
    add('prev_itr', "Last year's ITR and computation", 'PORTAL');
    add('bank', 'Bank statements and interest certificates');
    add('16a', 'Form 16A (TDS on interest)', 'CLIENT', { optional: true });
    if (s.salary) add('f16', 'Form 16', 'CLIENT', { availableFrom: startYear + '-06-15' });
    if (s.salary && e.regime === 'old') add('hra', 'Rent receipts for HRA, if not given to the employer', 'CLIENT', { optional: true });
    if (e.regime === 'old') add('deductions', 'Deduction proofs (80C / 80D / 80G)');
    if (s.cg) { add('cg_broker', 'Capital gains statement from broker'); add('cg_mf', 'Mutual fund capital gains statement (CAMS / KFintech)'); add('cg_property', 'Sale and purchase deeds, if property was sold', 'CLIENT', { optional: true }); }
    if (s.hp) { add('hp_rent', 'Rent agreement and municipal tax receipts'); add('hp_loan', 'Home loan interest certificate'); }
    if (s.biz) { add('biz_books', 'P&L and balance sheet, or Tally backup'); add('biz_bank', 'All business bank statements'); add('biz_gst', 'GST returns for the year', 'PORTAL'); add('biz_adv', 'Advance tax challans', 'PORTAL'); add('biz_fno', 'F&O / intraday P&L, if trading', 'CLIENT', { optional: true }); }
    if (s.foreign) { add('fa_stmt', 'Foreign bank and brokerage statements'); add('fa_rsu', 'RSU / ESOP statements'); }
  } else if (e.service === 'TAX_AUDIT') {
    const d = { draft: true };
    add('ta_books', 'Finalised books or Tally backup', 'CLIENT', d);
    add('ta_bank', 'All bank statements for the year', 'CLIENT', d);
    add('ta_far', 'Fixed asset register with purchase bills', 'CLIENT', d);
    add('ta_stock', 'Closing stock statement', 'CLIENT', d);
    add('ta_loans', 'Loan statements and confirmations', 'CLIENT', d);
    add('ta_msme', 'MSME supplier list with payment dates', 'CLIENT', d);
    add('ta_pf', 'PF / ESI payment dates', 'CLIENT', d);
    add('ta_gst', 'GST returns for the year', 'PORTAL', d);
    add('ta_tds', 'TDS returns and challans', 'PORTAL', d);
  } else if (e.service === 'GST') {
    const [y, m] = e.period.split('-').map(Number);
    const avail = (m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1)) + '-01';
    const d = { draft: true, availableFrom: avail };
    add('g_b2b', 'B2B sales invoices with buyer GSTIN', 'CLIENT', d);
    add('g_b2c', 'B2C sales summary', 'CLIENT', d);
    add('g_cdn', 'Credit and debit notes', 'CLIENT', d);
    add('g_pur', 'Purchase and expense invoices', 'CLIENT', d);
    add('g_2b', 'GSTR-2B', 'PORTAL', d);
  }
  return out;
}

// Keyword rules for recognising documents (file name + PDF text)
const DOC_RULES = [
  { key: '16a', re: /form\s*(no\.?\s*)?16\s*a\b|form[-_ ]?16a/i },
  { key: 'f16', re: /form\s*(no\.?\s*)?16(?![\da-z])|form[-_]16(?![\da-z])/i },
  { key: '26as', re: /26\s*as/i },
  { key: 'ais', re: /annual information statement|\bais\b|\btis\b|taxpayer information summary/i },
  { key: 'prev_itr', re: /itr-?v\b|acknowledg(e)?ment/i },
  { key: 'cg_mf', re: /\bcams\b|kfin|karvy|mutual fund|consolidated account statement/i },
  { key: 'cg_broker', re: /capital\s*gain|tax\s*p\s*&?\s*l|realised|realized|zerodha|groww|upstox/i },
  { key: 'hp_loan', re: /home\s*loan|housing\s*loan|loan interest|interest certificate.*loan/i },
  { key: 'hra', re: /rent\s*receipt/i },
  { key: 'hp_rent', re: /rent\s*agreement|municipal|property tax/i },
  { key: 'deductions', re: /\b80\s*[cdg]\b|\blic\b|\bppf\b|\belss\b|premium|donation/i },
  { key: 'biz_books', re: /balance\s*sheet|profit\s*(and|&)\s*loss|trial\s*balance|tally/i },
  { key: 'biz_fno', re: /\bf\s*&\s*o\b|futures|intraday/i },
  { key: 'fa_rsu', re: /\brsu\b|\besop\b|stock award/i },
  { key: 'fa_stmt', re: /foreign|overseas|\busd\b/i },
  { key: 'ta_stock', re: /closing stock|stock statement|inventory/i },
  { key: 'ta_far', re: /fixed asset|\bfar\b|depreciation/i },
  { key: 'ta_msme', re: /msme|udyam/i },
  { key: 'ta_loans', re: /loan (statement|confirmation)|confirmation/i },
  { key: 'ta_pf', re: /\bpf\b|\besi\b|provident/i },
  { key: 'ta_books', re: /balance\s*sheet|trial\s*balance|tally|books/i },
  { key: 'g_cdn', re: /credit\s*note|debit\s*note/i },
  { key: 'g_pur', re: /purchase|expense/i },
  { key: 'g_b2b', re: /\bb2b\b|sales\s*invoice|tax\s*invoice/i },
  { key: 'g_b2c', re: /\bb2c\b|sales\s*summary/i },
  { key: 'bank', re: /bank|statement|passbook|interest\s*certificate|\bfd\b|fixed deposit/i },
  { key: 'biz_bank', re: /bank|statement/i },
  { key: 'ta_bank', re: /bank|statement/i }
];

const DEFAULT_DUES = [
  { key: 'ITR_NONBIZ', label: 'ITR, no business income (ITR-1 / ITR-2)', date: '2026-07-31', source: 'https://cleartax.in/s/itr2', verified: false },
  { key: 'ITR_BIZ', label: 'ITR-3 / ITR-4, non-audit', date: '2026-08-31', source: 'https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/itr%204-faqs', verified: true },
  { key: 'AUDIT_REPORT', label: 'Tax audit report', date: '2026-09-30', source: 'https://www.incometax.gov.in/iec/foportal/help/individual-business-profession', verified: true },
  { key: 'ITR_AUDIT', label: 'ITR, audit cases', date: '2026-10-31', source: 'https://www.incometax.gov.in/iec/foportal/help/individual-business-profession', verified: true },
  { key: 'BELATED', label: 'Belated or revised return', date: '2026-12-31', source: '', verified: false },
  { key: 'GSTR1_DAY', label: 'GSTR-1 (monthly), day of the next month', day: 11, source: '', verified: false },
  { key: 'GSTR3B_DAY', label: 'GSTR-3B (monthly), day of the next month', day: 20, source: '', verified: false }
];

const DEFAULT_TEMPLATES = {
  hinglish: 'Namaste {name},\n\nYe documents abhi pending hain:\n{list}\n\nLast date: {due}. Jaldi bhej dijiye, WhatsApp pe photo bhi chalega.\n\n{signature}',
  english: 'Hello {name},\n\nWe are still waiting on these documents:\n{list}\n\nThe last date is {due}. A clear photo on WhatsApp works too.\n\n{signature}',
  hindi: 'नमस्ते {name},\n\nये दस्तावेज़ अभी बाकी हैं:\n{list}\n\nआखिरी तारीख़: {due}। कृपया जल्दी भेज दें, WhatsApp पर फ़ोटो भी चलेगी।\n\n{signature}',
  thanks_hinglish: 'Namaste {name},\n\nSaare documents mil gaye, dhanyavaad. Aage ka kaam hum dekh lenge.\n\n{signature}',
  thanks_english: 'Hello {name},\n\nWe have received everything we need from you, thank you. We will take it from here.\n\n{signature}',
  thanks_hindi: 'नमस्ते {name},\n\nसारे दस्तावेज़ मिल गए, धन्यवाद। आगे का काम हम देख लेंगे।\n\n{signature}'
};

// ---------- state ----------
function emptyDB() {
  return {
    v: 1,
    settings: { wa: { mode: 'tap', tpl: { hinglish: { name: '', lang: 'en' }, english: { name: '', lang: 'en' }, hindi: { name: '', lang: 'hi' } } }, caName: '', firm: '', setupDone: false, mapping: null, sheetName: '', excelName: '', excelModified: 0, lastSynced: null, syncError: '', yearFmt: null, folderName: '', templates: Object.assign({}, DEFAULT_TEMPLATES), demo: false },
    clients: {}, engagements: {}, nudges: {}, handoffs: {}, inbox: {}, walog: null, dueDates: DEFAULT_DUES.map(d => Object.assign({}, d)), log: []
  };
}
let DB = emptyDB();
const PAN_INDEX = {};          // full PAN -> client id. Memory only, rebuilt from the Excel; never saved.
const UI = { q: '', filter: 'active', openItem: null, setupStep: 0, pendingExcel: null, queue: [], run: null, folderOk: false, excelOk: false, excelHandle: null, folderHandle: null, lastSeasonFiles: {}, cloudEmail: '', codeSent: false };

function logEvent(text) { DB.log.unshift({ at: new Date().toISOString(), text }); if (DB.log.length > 300) DB.log.length = 300; }

const activeClients = () => Object.values(DB.clients).filter(c => !c.archived);
const clientEngs = (cid) => Object.values(DB.engagements).filter(e => e.clientId === cid);
const isCurrent = (e) => e.service === 'GST' ? e.period >= gstPeriodFor(todayISO(), -1) : e.ay === CURRENT_AY;
const currentEngs = (cid) => clientEngs(cid).filter(isCurrent).sort((a, b) => (a.service + (a.period || '')).localeCompare(b.service + (b.period || '')));
const prevEng = (cid, service) => clientEngs(cid).find(e => e.service === service && e.ay === PREV_AY && service !== 'GST');
const dueRow = (k) => DB.dueDates.find(d => d.key === k) || DEFAULT_DUES.find(d => d.key === k);

// GST period being collected: up to the 20th we are still on last month's return
function gstPeriodFor(iso, shift = 0) {
  const d = parseISO(iso); let y = d.getFullYear(), m = d.getMonth() + 1;
  if (d.getDate() <= 20) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  m += shift; while (m <= 0) { m += 12; y -= 1; } while (m > 12) { m -= 12; y += 1; }
  return y + '-' + pad(m);
}
const periodLabel = (p) => { const [y, m] = p.split('-').map(Number); return MONTHS_LONG[m - 1] + ' ' + y; };
function engTitle(e) {
  if (e.service === 'ITR') return 'ITR, AY ' + e.ay;
  if (e.service === 'TAX_AUDIT') return 'Tax audit, FY ' + ayToFy(e.ay);
  if (e.service === 'GST') return 'GST, ' + periodLabel(e.period);
  if (e.service === 'TDS') return 'TDS, AY ' + e.ay;
  return e.service;
}
function likelyForm(e) {
  const s = e.sources || {};
  if (s.biz) return 'ITR-3 or ITR-4';
  if (s.cg || s.foreign) return 'ITR-2';
  return 'ITR-1 or ITR-2';
}

// Due date for an engagement. urgency = the date that drives ranking.
function engDue(e) {
  if (e.dueOverride) return { date: e.dueOverride, label: 'Your date', urgency: e.dueOverride };
  if (e.service === 'ITR') {
    const audit = clientEngs(e.clientId).some(x => x.service === 'TAX_AUDIT' && x.ay === e.ay);
    const r = dueRow(audit ? 'ITR_AUDIT' : (e.sources && e.sources.biz ? 'ITR_BIZ' : 'ITR_NONBIZ'));
    const out = { date: r.date, label: r.label, urgency: r.date };
    if (e.status !== 'filed' && daysFromToday(r.date) < 0) { out.belated = dueRow('BELATED').date; out.urgency = out.belated; }
    return out;
  }
  if (e.service === 'TAX_AUDIT') { const r = dueRow('AUDIT_REPORT'); return { date: r.date, label: r.label, urgency: r.date }; }
  if (e.service === 'GST') {
    const [y, m] = e.period.split('-').map(Number); const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    const d1 = ny + '-' + pad(nm) + '-' + pad(dueRow('GSTR1_DAY').day || 11);
    const d3 = ny + '-' + pad(nm) + '-' + pad(dueRow('GSTR3B_DAY').day || 20);
    return { date: d1, label: 'GSTR-1 ' + fmtShort(d1) + ', GSTR-3B ' + fmtShort(d3), urgency: d1 };
  }
  return { date: null, label: 'No due date set', urgency: null };
}
function dueChip(e) {
  const d = engDue(e);
  if (!d.date) return { text: 'No due date', cls: '' };
  if (e.status === 'filed') return { text: 'Filed', cls: 'ok' };
  if (d.belated) return { text: 'Belated, last date ' + fmtShort(d.belated), cls: 'risk' };
  const n = daysFromToday(d.date);
  return { text: n < 0 ? dueText(n) : (n <= 14 ? dueText(n) : 'Due ' + fmtShort(d.date)), cls: n <= 7 ? 'risk' : '' };
}

// Status shown for an engagement
function engStatus(e) {
  if (e.status === 'filed') return { text: 'Filed', cls: 'ok' };
  if (e.status === 'prep') return { text: 'In preparation', cls: 'accent' };
  const c = e.items.filter(i => i.type === 'CLIENT' && isAsk(i)).length;
  const p = e.items.filter(i => i.type === 'PORTAL' && isAsk(i)).length;
  if (c) return { text: 'Awaiting docs', cls: 'risk' };
  if (p) return { text: 'Download ' + p + ' from portal', cls: '' };
  return { text: 'Docs complete', cls: 'ok' };
}
const isAsk = (i) => i.status === 'pending' && !i.optional;
const progress = (e) => { const live = e.items.filter(i => i.status !== 'na' && !(i.optional && i.status === 'pending')); const got = live.filter(i => i.status === 'received').length; return { got, total: live.length }; };

// Build or rebuild an engagement's checklist, keeping what's already been ticked
function buildItems(e) {
  const existing = e.items || [];
  const byKey = new Map(existing.filter(i => !i.custom).map(i => [i.key, i]));
  const tpl = templateFor(e);
  const items = tpl.map(t => {
    const old = byKey.get(t.key);
    if (old) return Object.assign({}, old, { type: t.type, availableFrom: t.availableFrom || null, draft: !!t.draft, name: old.renamed ? old.name : t.name, optional: old.asked ? false : !!t.optional });
    return { id: uid(), key: t.key, name: t.name, type: t.type, availableFrom: t.availableFrom || null, draft: !!t.draft, optional: !!t.optional, status: 'pending', receivedAt: null, fileName: null, custom: false };
  });
  existing.filter(i => !i.custom && !tpl.some(t => t.key === i.key) && i.status === 'received').forEach(i => items.push(i));
  existing.filter(i => i.custom).forEach(i => items.push(i));
  e.items = items;
  return e;
}

function defaultSources(c) {
  if (c.income && Object.values(c.income).some(Boolean)) return Object.assign({}, c.income);
  if (c.entity === 'company' || c.entity === 'firm') return { biz: true };
  if (c.entity === 'huf') return { hp: true };
  return { salary: true };
}

function createEngagement(c, service, period) {
  const e = { id: uid(), clientId: c.id, service, ay: CURRENT_AY, period: period || null, status: 'collecting', regime: 'new', sources: {}, items: [], createdAt: new Date().toISOString() };
  const prev = prevEng(c.id, service);
  if (service === 'ITR') { e.sources = prev ? Object.assign({}, prev.sources) : defaultSources(c); e.regime = prev ? prev.regime : 'new'; }
  buildItems(e);
  if (prev) prev.items.filter(i => i.custom && i.status === 'received').forEach(i => e.items.push({ id: uid(), key: 'custom', name: i.name, type: i.type, availableFrom: null, status: 'pending', receivedAt: null, fileName: null, custom: true }));
  DB.engagements[e.id] = e;
  return e;
}

// Make sure every active client has this season's engagements for their services
function ensureEngagements(c) {
  const engs = clientEngs(c.id);
  (c.services || []).forEach(s => {
    if (s === 'GST') {
      const p = gstPeriodFor(todayISO());
      if (!engs.some(e => e.service === 'GST' && e.period === p)) createEngagement(c, 'GST', p);
    } else if (!engs.some(e => e.service === s && e.ay === CURRENT_AY)) createEngagement(c, s);
  });
}

// ---------- normalisers ----------
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  const valid = /^91[6-9]\d{9}$/.test(d);
  return { value: valid ? d : '', valid, raw: String(raw || '').trim() };
}
function parseServices(text) {
  const out = new Set();
  String(text || '').split(/[,;/+\n]|\band\b/i).map(s => s.trim().toLowerCase()).filter(Boolean).forEach(s => {
    if (/audit/.test(s)) out.add('TAX_AUDIT');
    else if (/gst/.test(s)) out.add('GST');
    else if (/tds/.test(s)) out.add('TDS');
    else if (/itr|income\s*tax|return|\bit\b/.test(s)) out.add('ITR');
  });
  return [...out];
}
function parseIncome(text) {
  const t = String(text || '').toLowerCase(); if (!t.trim()) return null;
  return { salary: /salar/.test(t), cg: /capital|share|mutual|stock/.test(t), hp: /house|rent|property/.test(t), biz: /business|profession|freelanc|consult/.test(t), foreign: /foreign|overseas|rsu|esop/.test(t) };
}
function normEntity(text, name) {
  const t = (String(text || '') + ' ' + String(name || '')).toLowerCase();
  if (/huf/.test(t)) return 'huf';
  if (/pvt|private|limited|\bltd\b|company/.test(t)) return 'company';
  if (/llp|firm|partnership|traders|enterprises|associates|& sons|and sons|industries/.test(t)) return 'firm';
  return 'individual';
}
function normLang(text) { const t = String(text || '').toLowerCase(); if (/hindi|हिंदी/.test(t) && !/hinglish/.test(t)) return 'hindi'; if (/english/.test(t)) return 'english'; if (/hinglish/.test(t)) return 'hinglish'; return ''; }
const ENTITY_LABEL = { individual: 'Individual', huf: 'HUF', firm: 'Firm', company: 'Company' };
const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
const clientLang = (c) => c.lang || c.langApp || 'hinglish';

// ---------- memory: what the app has observed ----------
function nudgesFor(cid, ay) { return Object.values(DB.nudges).filter(n => n.clientIds.includes(cid) && (!ay || n.ay === ay)).sort((a, b) => b.at.localeCompare(a.at)); }
function lastSeason(c) {
  const engs = clientEngs(c.id).filter(e => e.ay === PREV_AY && e.service !== 'GST');
  const late = [];
  engs.forEach(e => { const due = e.dueOverride; if (!due) return; e.items.forEach(i => { if (i.status === 'received' && i.receivedAt && i.receivedAt > due) late.push({ key: i.key, name: i.name, days: daysBetween(due, i.receivedAt) }); }); });
  const nudges = nudgesFor(c.id, PREV_AY).filter(n => n.channel === 'whatsapp').length;
  return { engs, late, nudges, has: engs.length > 0 };
}
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const lateLastSeason = (c, key) => lastSeason(c).late.find(l => l.key === key);

// ---------- today: units (a phone number = one conversation) ----------
function buildUnits() {
  const today = todayISO();
  const units = {};
  activeClients().forEach(c => {
    currentEngs(c.id).filter(e => e.status === 'collecting').forEach(e => {
      const pending = e.items.filter(i => i.type === 'CLIENT' && isAsk(i));
      if (!pending.length) return;
      const avail = pending.filter(i => !i.availableFrom || i.availableFrom <= today);
      const later = pending.filter(i => i.availableFrom && i.availableFrom > today);
      const key = c.phone ? 'p:' + c.phone : 'c:' + c.id;
      const u = units[key] || (units[key] = { key, phone: c.phone || '', demo: !!c.demo, clients: [], parts: [] });
      if (!u.clients.includes(c)) u.clients.push(c);
      u.parts.push({ client: c, eng: e, avail, later, due: engDue(e) });
    });
  });
  return Object.values(units).map(u => scoreUnit(u));
}

function scoreUnit(u) {
  const ids = u.clients.map(c => c.id);
  const nudges = Object.values(DB.nudges).filter(n => n.ay !== PREV_AY && n.waStatus !== 'failed' && n.clientIds.some(id => ids.includes(id))).sort((a, b) => b.at.localeCompare(a.at));
  const lastWa = nudges.find(n => n.channel === 'whatsapp');
  const lastProgress = u.parts.flatMap(p => p.eng.items).filter(i => i.receivedAt).map(i => i.receivedAt).sort().pop() || '';
  const sinceProgress = nudges.filter(n => n.at.slice(0, 10) > lastProgress);
  const waSince = sinceProgress.filter(n => n.channel === 'whatsapp').length;
  const calledSince = sinceProgress.some(n => n.channel === 'call');
  u.availCount = u.parts.reduce((s, p) => s + p.avail.length, 0);
  u.laterCount = u.parts.reduce((s, p) => s + p.later.length, 0);
  u.lastNudge = lastWa ? lastWa.at : null;
  u.lastCall = (nudges.find(n => n.channel === 'call') || {}).at || null;
  u.waSince = waSince;
  u.stuck = u.availCount > 0 && waSince >= 3 && !calledSince;
  u.recent = !!(lastWa && hoursSince(lastWa.at) < 48) || !!(u.lastCall && hoursSince(u.lastCall) < 48);
  let best = -1e9, why = [];
  u.parts.forEach(p => {
    if (!p.due.urgency) { best = Math.max(best, 5 + p.avail.length * 3); return; }
    const days = daysFromToday(p.due.urgency);
    let s = days < 0 ? 90 + Math.min(-days, 30) : Math.max(0, 70 - days * 2);
    if (p.due.belated) s = Math.max(10, 40 - Math.floor(days / 7));
    s += p.avail.length * 3;
    const c = p.client;
    if (c.speed === 'slow') s += 15; else if (c.speed === 'fast') s -= 5;
    const ls = lastSeason(c);
    s += Math.min(ls.late.length, 3) * 4 + (ls.nudges >= 3 ? 6 : 0);
    if (s > best) { best = s; u.top = p; }
  });
  u.score = best;
  // reason, in plain words
  const p = u.top;
  if (p) {
    const d = p.due;
    if (d.belated) why.push('Belated return, last date ' + fmtShort(d.belated));
    else if (d.urgency) why.push(dueText(daysFromToday(d.urgency)) + ' (' + SERVICE_LABEL[p.eng.service] + ')');
    const ls = lastSeason(p.client);
    const lateHere = p.avail.map(i => ls.late.find(l => l.key === i.key)).filter(Boolean)[0];
    if (lateHere) why.push(lateHere.name + ' came ' + lateHere.days + ' days late last season');
    else if (ls.nudges >= 3) why.push('Needed ' + ls.nudges + ' nudges last season');
    else if (p.client.speed === 'slow') why.push('Usually slow to send');
  }
  if (u.stuck) why = [plural(waSince, 'nudge') + ' since anything came in. A call will work better.'];
  u.reason = why.join('. ');
  return u;
}

function todayPlan() {
  const units = buildUnits();
  const stuck = units.filter(u => u.stuck).sort((a, b) => b.score - a.score);
  const nudge = units.filter(u => !u.stuck && u.availCount > 0 && !u.recent).sort((a, b) => b.score - a.score);
  const inPlay = new Set([...stuck, ...nudge].flatMap(u => u.parts.map(p => p.eng.id)));
  const dueSoon = [];
  activeClients().forEach(c => currentEngs(c.id).forEach(e => {
    if (e.status === 'filed' || inPlay.has(e.id)) return;
    const d = engDue(e); if (!d.urgency) return;
    const n = daysFromToday(d.date);
    if (n <= 14 || d.belated) dueSoon.push({ c, e, n, d });
  }));
  dueSoon.sort((a, b) => a.n - b.n);
  const portal = {};
  activeClients().forEach(c => currentEngs(c.id).filter(e => e.status === 'collecting').forEach(e => e.items.filter(i => i.type === 'PORTAL' && isAsk(i)).forEach(i => { (portal[i.name] = portal[i.name] || []).push({ c, e, i }); })));
  return { stuck, nudge, dueSoon, portal, waiting: units.filter(u => !u.stuck && u.availCount > 0 && u.recent) };
}

// ---------- messages ----------
function greetName(u, lang) {
  const c = u.clients.find(x => x.entity === 'individual') || u.clients[0];
  let name = (u.clients.length > 1 && c.secName) ? c.secName : (c.entity === 'individual' ? (lang === 'english' ? c.name : firstName(c.name)) : c.name);
  if (lang !== 'english' && c.entity === 'individual') name = firstName(name) + ' ji';
  return name;
}
function signature() { const s = DB.settings; return [s.caName, s.firm].filter(Boolean).join(', ') || 'Your CA'; }
function fill(tpl, map) { return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m)); }
function nudgeMessage(u) {
  const lang = clientLang(u.clients[0]);
  const multi = u.parts.length > 1;
  const lines = [];
  u.parts.filter(p => p.avail.length).forEach(p => {
    if (multi) lines.push((lines.length ? '\n' : '') + p.client.name + ', ' + SERVICE_LABEL[p.eng.service] + ':');
    p.avail.forEach((i, n) => lines.push((n + 1) + '. ' + i.name));
  });
  const dues = u.parts.filter(p => p.avail.length && p.due.urgency).map(p => p.due.belated || p.due.date).sort();
  const t = DB.settings.templates || DEFAULT_TEMPLATES;
  return fill(t[lang] || DEFAULT_TEMPLATES[lang], { name: greetName(u, lang), list: lines.join('\n'), due: dues[0] ? fmtDate(dues[0]) : 'as soon as possible', signature: signature() });
}
function thanksMessage(c) {
  const lang = clientLang(c); const t = DB.settings.templates || DEFAULT_TEMPLATES;
  return fill(t['thanks_' + lang] || DEFAULT_TEMPLATES['thanks_' + lang], { name: greetName({ clients: [c] }, lang), signature: signature() });
}
// Values for an approved WhatsApp template: {{1}} name, {{2}} what for, {{3}} documents, {{4}} last date, {{5}} signature
function nudgeParams(u) {
  const lang = clientLang(u.clients[0]);
  const parts = u.parts.filter(p => p.avail.length);
  const multi = parts.length > 1;
  const what = multi ? (lang === 'hindi' ? 'रिटर्न' : 'returns') : (SERVICE_LABEL[parts[0].eng.service] === 'GST' ? 'GST return' : SERVICE_LABEL[parts[0].eng.service]);
  const list = parts.map(p => (multi ? shortName(p.client) + ': ' : '') + p.avail.map(i => i.name).join(', ')).join('; ');
  const dues = parts.filter(p => p.due.urgency).map(p => p.due.belated || p.due.date).sort();
  const t = ((DB.settings.wa || {}).tpl || {})[lang] || {};
  return { lang, template: (t.name || '').trim(), languageCode: t.lang || (lang === 'hindi' ? 'hi' : 'en'), params: [greetName(u, lang), what, list, dues[0] ? fmtDate(dues[0]) : 'as soon as possible', signature()] };
}
const waApi = () => !!(DB.settings.wa && DB.settings.wa.mode === 'api');
const waHasTemplates = () => ['hinglish', 'english', 'hindi'].some(k => (((DB.settings.wa || {}).tpl || {})[k] || {}).name);
// "Send all" only exists for a real client list with WhatsApp fully connected
const waReady = () => waApi() && !DB.settings.demo && typeof Cloud !== 'undefined' && Cloud.on && waHasTemplates();
const WA_STATUS = { sending: 'Sending', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Failed' };
const waLink = (phone, text, demo) => 'https://wa.me/' + (demo || !phone ? '' : phone) + '?text=' + encodeURIComponent(text);
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
/* CA Desk: sample data and the nudge run */

function loadSampleData() {
  DB = emptyDB();
  Object.assign(DB.settings, { caName: 'CA Sunil Agarwal', firm: 'Agarwal & Associates', setupDone: true, demo: true });
  const t = todayISO();
  const nowIso = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const mk = (o) => { const c = Object.assign({ id: uid(), code: '', entity: 'individual', phone: '', phoneValid: true, phoneRaw: '', services: ['ITR'], panLast4: '', lang: '', speed: 'normal', notes: '', source: 'demo', demo: true, archived: false, folder: '', secName: '', secPhone: '' }, o); if (o.demoPan) { c.panLast4 = o.demoPan.slice(-4); PAN_INDEX[o.demoPan] = c.id; } DB.clients[c.id] = c; return c; };
  const fam = '919800000001';
  const rakesh = mk({ code: 'C001', name: 'Rakesh Mehta', phone: fam, phoneRaw: '98000 00001', demoPan: 'ABCPM1234K', speed: 'slow', secName: 'Rakesh ji', income: { salary: true, cg: true }, notes: 'Handles the whole family\'s papers.' });
  const sunita = mk({ code: 'C002', name: 'Sunita Mehta', phone: fam, phoneRaw: '98000 00001', demoPan: 'ABCPM5678L', income: { salary: true, hp: true } });
  const huf = mk({ code: 'C003', name: 'Rakesh Mehta HUF', entity: 'huf', phone: fam, phoneRaw: '98000 00001', demoPan: 'AAAHR1234M', income: { hp: true } });
  const sethi = mk({ code: 'C004', name: 'Sethi Auto Parts Pvt Ltd', entity: 'company', phone: '919800000004', phoneRaw: '98000 00004', services: ['TAX_AUDIT', 'ITR'], demoPan: 'AAACS1234F', lang: 'english', speed: 'slow', secName: 'Mr Arora' });
  const kavita = mk({ code: 'C005', name: 'Kavita Traders', entity: 'firm', phone: '919800000005', phoneRaw: '98000 00005', services: ['GST'] });
  const rao = mk({ code: 'C006', name: 'Dr. Anjali Rao', phone: '919800000006', phoneRaw: '98000 00006', demoPan: 'BCDPR4321Q', lang: 'english', income: { biz: true } });
  const imran = mk({ code: 'C007', name: 'Imran Qureshi', phone: '919800000007', phoneRaw: '98000 00007', demoPan: 'CDEPQ8765R', speed: 'fast', income: { salary: true } });
  const bansal = mk({ code: 'C008', name: 'Bansal Textiles LLP', entity: 'firm', phone: '919800000008', phoneRaw: '98000 00008', services: ['GST'] });
  const neha = mk({ code: 'C009', name: 'Neha Joshi', phone: '919800000009', phoneRaw: '98000 00009', demoPan: 'DEFPJ2468S', speed: 'fast', income: { salary: true, cg: true, foreign: true } });
  const arjun = mk({ code: 'C010', name: 'Arjun Malhotra', phone: '919800000010', phoneRaw: '98000 00010', demoPan: 'EFGPM1357T', income: { salary: true } });
  const priya = mk({ code: 'C011', name: 'Priya Nair', phone: '919800000011', phoneRaw: '98000 00011', demoPan: 'FGHPN9753U', lang: 'english', income: { salary: true, hp: true } });
  const gupta = mk({ code: 'C012', name: 'Gupta & Sons', entity: 'firm', phone: '919800000012', phoneRaw: '98000 00012', phoneValid: true, services: ['TAX_AUDIT', 'ITR'], demoPan: 'AAAFG1234H', income: { biz: true } });

  // last season (AY 2025-26), used for memory
  const past = (c, service, due, recv) => {
    const e = { id: uid(), clientId: c.id, service, ay: PREV_AY, period: null, status: 'filed', regime: 'new', sources: Object.assign({}, c.income || (service === 'ITR' && (c.entity === 'company' || c.entity === 'firm') ? { biz: true } : { salary: true })), items: [], dueOverride: due, createdAt: nowIso(24 * 400) };
    buildItems(e);
    e.items.forEach(i => { i.status = 'received'; i.receivedAt = recv[i.key] || addDays(due, -20); });
    DB.engagements[e.id] = e; return e;
  };
  past(rakesh, 'ITR', '2025-09-15', { cg_broker: '2025-09-27', cg_mf: '2025-09-20' });
  past(sunita, 'ITR', '2025-09-15', {});
  past(sethi, 'TAX_AUDIT', '2025-09-30', { ta_stock: '2025-10-04', ta_msme: '2025-10-02' });
  past(rao, 'ITR', '2025-10-31', { bank: '2025-11-08' });
  past(imran, 'ITR', '2025-09-15', {});
  past(neha, 'ITR', '2025-09-15', {});
  const pastNudge = (c, n, h) => { for (let k = 0; k < n; k++) { const id = uid(); DB.nudges[id] = { id, phone: c.phone, clientIds: [c.id], items: [], at: nowIso(h + 24 * 30 * k + 24 * 365), ay: PREV_AY, channel: 'whatsapp' }; } };
  pastNudge(rakesh, 3, 0); pastNudge(sethi, 4, 0); pastNudge(rao, 2, 0);

  // this season
  [rakesh, sunita, huf, sethi, kavita, rao, imran, bansal, neha, arjun, priya, gupta].forEach(c => ensureEngagements(c));
  const recv = (c, service, keys, daysAgo = 10) => { const e = clientEngs(c.id).find(x => x.service === service && isCurrent(x)); e.items.forEach(i => { if (keys === 'all' || keys.includes(i.key)) { i.status = 'received'; i.receivedAt = addDays(t, -daysAgo); } }); return e; };
  recv(rakesh, 'ITR', ['26as', 'ais', 'prev_itr', 'f16', '16a'], 12);
  recv(sunita, 'ITR', ['26as', 'ais', 'prev_itr', 'bank'], 9);
  recv(huf, 'ITR', ['26as', 'prev_itr'], 9);
  recv(sethi, 'TAX_AUDIT', ['ta_books', 'ta_bank', 'ta_pf', 'ta_tds'], 20);
  recv(sethi, 'ITR', ['26as', 'ais', 'prev_itr'], 20);
  recv(rao, 'ITR', ['26as', 'ais', 'prev_itr', '16a', 'biz_books'], 15);
  recv(imran, 'ITR', ['26as', 'ais', 'prev_itr', 'bank', '16a'], 6);
  const nehaE = recv(neha, 'ITR', 'all', 4); nehaE.status = 'prep';
  const arjunE = recv(arjun, 'ITR', 'all', 60); arjunE.status = 'filed';
  recv(priya, 'ITR', ['26as', 'ais', 'prev_itr', 'f16', 'bank', '16a', 'hp_rent'], 3);
  recv(gupta, 'TAX_AUDIT', ['ta_books', 'ta_bank', 'ta_far', 'ta_stock', 'ta_loans', 'ta_msme', 'ta_pf'], 8);
  recv(gupta, 'ITR', ['prev_itr', 'biz_books', 'biz_bank', 'bank', '16a'], 8);
  // Kavita: last month's GST still open (overdue)
  const prevP = gstPeriodFor(t, -1);
  const kOld = createEngagement(kavita, 'GST', prevP); kOld.items.forEach(i => { if (['g_b2b', 'g_b2c', 'g_cdn'].includes(i.key)) { i.status = 'received'; i.receivedAt = addDays(t, -12); } });
  // this season's nudges
  const nudge = (cs, h, channel = 'whatsapp') => { const id = uid(); DB.nudges[id] = { id, phone: cs[0].phone, clientIds: cs.map(c => c.id), items: [], at: nowIso(h), ay: CURRENT_AY, channel }; };
  nudge([rakesh, sunita, huf], 24 * 4);
  nudge([sethi], 24 * 9); nudge([sethi], 24 * 6); nudge([sethi], 24 * 3);
  nudge([kavita], 24 * 5);
  nudge([imran], 24 * 1);
  nudge([priya], 24 * 2);
  logEvent('Sample data loaded');
  save();
}

// ---------- nudge run ----------
function startRun(keys) {
  const plan = todayPlan();
  const units = keys ? [...plan.nudge, ...plan.stuck, ...plan.waiting].filter(u => keys.includes(u.key)) : plan.nudge;
  if (!units.length) return toast('Nobody to nudge right now');
  UI.run = { keys: units.map(u => u.key), i: 0, sent: 0 };
  openCurrent();
}
function runUnit() {
  if (!UI.run) return null;
  const key = UI.run.keys[UI.run.i];
  return buildUnits().find(u => u.key === key) || null;
}
function openCurrent() {
  const u = runUnit();
  if (!u) return endRun();
  const msg = nudgeMessage(u);
  UI.run.msg = msg; UI.run.opened = true;
  if (u.phone && !u.demo) window.open(waLink(u.phone, msg, false), '_blank', 'noopener');
  renderModal();
}
function confirmSent(yes) {
  const u = runUnit();
  if (u && yes) {
    const id = uid();
    DB.nudges[id] = { id, phone: u.phone, clientIds: u.clients.map(c => c.id), items: u.parts.flatMap(p => p.avail.map(i => i.name)), at: new Date().toISOString(), ay: CURRENT_AY, channel: 'whatsapp' };
    logEvent('Nudged ' + u.clients.map(c => c.name).join(', '));
    UI.run.sent++; save();
  }
  UI.run.i++;
  if (UI.run.i >= UI.run.keys.length) return endRun();
  openCurrent();
}
function endRun() {
  const n = UI.run ? UI.run.sent : 0;
  UI.run = null; closeModal(); render();
  if (n) toast(plural(n, 'nudge') + ' sent and logged');
}
function logCall(cids) {
  const c = DB.clients[cids[0]]; if (!c) return;
  const id = uid();
  DB.nudges[id] = { id, phone: c.phone, clientIds: cids, items: [], at: new Date().toISOString(), ay: CURRENT_AY, channel: 'call' };
  logEvent('Called ' + c.name); save(); render(); toast('Call logged for ' + c.name);
}
function sendThanks(cid) {
  const c = DB.clients[cid]; if (!c) return;
  if (c.demo) { dialog({ title: 'Thank-you for ' + c.name, bubble: thanksMessage(c), body: 'Sample client, so WhatsApp was not opened. In real use this message opens in WhatsApp, ready to send.', ok: 'Done', noCancel: true }); }
  else window.open(waLink(c.phone, thanksMessage(c), false), '_blank', 'noopener');
  const id = uid(); DB.nudges[id] = { id, phone: c.phone, clientIds: [c.id], items: [], at: new Date().toISOString(), ay: CURRENT_AY, channel: 'thanks' };
  logEvent('Thank-you sent to ' + c.name); save();
}
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
  const raw = location.hash || '#/today';
  const h = (/^#\//.test(raw) ? raw : '#/today').slice(2).split('/');
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
  if (Cloud.cfg && !Cloud.session && s.everSignedIn && !s.demo) out += '<div class="banner"><span>You are signed out. Changes are saved on this device only.</span><a class="btn btn-sm" href="#/settings">Sign in</a></div>';
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
    h += '<p class="small muted">Sign in with your email to keep your data on the server and use CA Desk on your phone and computer together. You stay signed in on this device.' + (isDemoMode() ? ' You are in the demo, so signing in is not needed to try anything.' : '') + '</p>' +
      '<div class="field"><label for="c-email">Email</label><input class="input" id="c-email" type="email" autocomplete="email" value="' + esc(UI.cloudEmail) + '"></div>' +
      (UI.codeSent ? '<div class="banner info"><span>We emailed ' + esc(UI.cloudEmail) + '. Type the code from the email below, or open the link in the email on this device.</span></div><div class="field"><label for="c-code">Code from the email</label><input class="input" id="c-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></div><div class="row"><button class="btn btn-primary" data-act="cloud-verify">Sign in</button><button class="btn btn-ghost" data-act="cloud-send">Send a new code</button></div>' : '<div class="row"><button class="btn btn-primary" data-act="cloud-send">Send code</button>' + (Cloud.cfg && !Cloud.cfg.builtIn ? '<button class="btn btn-ghost" data-act="cloud-forget">Disconnect project</button>' : '') + '</div>');
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
/* CA Desk: demo mode (sample data only). Lets anyone, including an automated tester,
   go through every flow without files, folders, phones or accounts. */

const isDemoMode = () => !!DB.settings.demo;
const panOf = (c) => c.demoPan || Object.keys(PAN_INDEX).find(p => PAN_INDEX[p] === c.id) || '';

// ---------- sample client list (runs through the real Excel import) ----------
const SAMPLE_HEADERS = ['Client code', 'Client name', 'WhatsApp number', 'Services', 'PAN', 'Entity type', 'Preferred language', 'Income sources', 'Secondary contact name', 'Secondary contact number', 'Folder name'];
const SAMPLE_ROWS = [
  ['C001', 'Rakesh Mehta', '98765 01001', 'ITR', 'ABCPM1234K', 'Individual', 'Hinglish', 'Salary, capital gains', '', '', 'Rakesh Mehta'],
  ['C002', 'Sunita Mehta', '+91-98765-01001', 'ITR', 'ABCPM5678L', 'Individual', 'Hinglish', 'Salary, house property', 'Rakesh Mehta (husband)', '98765 01001', 'Sunita Mehta'],
  ['C003', 'Rakesh Mehta HUF', '098765 01001', 'ITR', 'AAAHR1234M', 'HUF', 'Hinglish', 'House property', 'Rakesh Mehta (karta)', '98765 01001', 'Rakesh Mehta HUF'],
  ['C004', 'Sethi Auto Parts Pvt Ltd', '98765 01004', 'Tax audit, ITR, GST', 'AAACS1234F', 'Company', 'English', 'Business', 'Mr Arora (accountant)', '98765 01104', 'Sethi Auto'],
  ['C005', 'Kavita Traders', '98765 01005', 'GST', 'AAAFK2345G', 'Firm', 'Hindi', 'Business', '', '', 'Kavita Traders'],
  ['C006', 'Dr. Anjali Rao', '9876501006', 'ITR', 'BCDPR4321Q', 'Individual', 'English', 'Profession', '', '', 'Dr Anjali Rao'],
  ['C007', 'Imran Qureshi', '98765 01007', 'ITR', 'CDEPQ8765R', 'Individual', 'Hinglish', 'Salary', '', '', 'Imran Qureshi'],
  ['C008', 'Bansal Textiles LLP', '98765 01008', 'GST, TDS', 'AAAFB3456H', 'LLP', 'Hinglish', 'Business', 'Mr Gupta (accounts)', '98765 01108', 'Bansal Textiles'],
  ['C009', 'Neha Joshi', '98765 01009', 'ITR', 'DEFPJ2468S', 'Individual', 'English', 'Salary, capital gains, foreign RSU', '', '', 'Neha Joshi'],
  ['C010', 'Arjun Malhotra', '+919876501010', 'ITR', 'EFGPM1357T', 'Individual', 'English', 'Salary', '', '', 'Arjun Malhotra'],
  ['C011', 'Priya Nair', '98765 01011', 'ITR', 'FGHPN9753U', 'Individual', 'English', 'Salary, house property', '', '', 'Priya Nair'],
  ['C012', 'Gupta & Sons', '98765 01012', 'Tax audit, ITR', 'AAAFG1234H', 'Firm', 'Hinglish', 'Business', '', '', 'Gupta and Sons'],
  ['C013', 'Suresh Agarwal', '98765 01013', 'ITR', 'GHIPA2468V', '', 'Hindi', 'Salary, capital gains, house property', '', '', 'Suresh Agarwal'],
  ['C014', 'Meera Krishnan', '98765 01014', 'ITR', 'HIJPK1122W', 'Individual', '', 'Salary', '', '', 'Meera Krishnan'],
  ['C015', 'Shree Balaji Enterprises', '98765 01015', 'GST, ITR', 'AAAFS5566X', '', 'Hinglish', 'Business', 'Ramesh ji (owner)', '98765 01115', 'Shree Balaji Enterprises'],
  ['C016', 'Vikram Singh Rathore', '98765 01016', 'ITR', 'IJKPR3344Y', 'Individual', 'Hinglish', 'Salary, capital gains', '', '', 'Vikram Rathore'],
  ['C017', 'Pooja Bhatia', '98765 01017', 'ITR', 'JKLPB7788Z', 'Individual', 'English', 'Profession', '', '', 'Pooja Bhatia'],
  ['C018', 'Om Prakash Sharma', '0129 2234567', 'ITR', 'KLMPS9900A', 'Individual', 'Hindi', 'House property', '', '', 'Om Prakash Sharma'],
  ['C019', 'Nexa Software Solutions Pvt Ltd', '98765 01019', 'Tax audit, ITR, GST, TDS', 'AAACN4455B', 'Company', 'English', 'Business', 'Ms Kapoor (finance)', '98765 01119', 'Nexa Software'],
  ['C020', 'Harpreet Kaur', '98765 01020', 'ITR', 'LMNPK6677C', 'Individual', 'Hinglish', 'Salary, foreign assets', '', '', 'Harpreet Kaur'],
  ['C021', 'Ravi Kumar', '98765 01021', 'ITR', '', 'Individual', 'Hinglish', 'Salary', '', '', 'Ravi Kumar'],
  ['C022', 'Deepak Jain HUF', '98765 01022', 'ITR', 'AAAHD8899D', 'HUF', 'Hindi', 'House property, capital gains', 'Deepak Jain (karta)', '98765 01022', 'Deepak Jain HUF'],
  ['C023', 'Ananya Iyer', '98765 01023', 'ITR', 'MNOPI1212E', 'Individual', 'English', 'Salary, capital gains', '', '', 'Ananya Iyer'],
  ['C024', 'Mittal Hardware Store', '98765 01024', 'GST', 'AAAFM3434F', 'Firm', 'Hinglish', 'Business', '', '', 'Mittal Hardware'],
  ['C025', 'Sanjay Chopra', '98765 01025', 'Income tax return', 'NOPPC5656G', 'Individual', 'Hinglish', 'Salary, house property', '', '', 'Sanjay Chopra']
];
function sampleWorkbook() {
  return { headers: SAMPLE_HEADERS.slice(), data: SAMPLE_ROWS.map(r => r.slice()), sheetName: 'Clients', sheets: ['Clients'], fileName: 'Sample client list.xlsx', modified: Date.now() };
}
// After importing the sample list: mark it as sample data, so WhatsApp never opens on its made-up numbers
function markSampleImport() {
  const pans = {}; SAMPLE_ROWS.forEach(r => { if (r[4]) pans[r[0]] = r[4]; });
  const codes = new Set(SAMPLE_ROWS.map(r => r[0]));
  Object.values(DB.clients).forEach(c => { if (codes.has(c.code)) { c.demo = true; if (pans[c.code]) { c.demoPan = pans[c.code]; PAN_INDEX[pans[c.code]] = c.id; } } });
  DB.settings.demo = true; DB.settings.setupDone = true;
}

// ---------- sample documents ----------
function makePdf(lines) {
  const enc = (t) => String(t).replace(/[^\x20-\x7e]/g, ' ').replace(/([\\()])/g, '\\$1');
  const body = 'BT /F1 11 Tf 56 780 Td 17 TL ' + lines.map((l, i) => (i ? 'T* ' : '') + '(' + enc(l) + ') Tj').join(' ') + ' ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream'
  ];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
  return bytes;
}
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const b64ToBytes = (b64) => { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
const byPan = (pan) => Object.values(DB.clients).find(c => !c.archived && (c.demoPan === pan || PAN_INDEX[pan] === c.id));

function docFor(c, key) {
  const pan = panOf(c) || 'ABCDE1234F';
  const n = c.name.toUpperCase();
  if (key === 'f16') return { name: 'Form16_' + firstName(c.name) + '.pdf', lines: ['FORM NO. 16', '[See rule 31(1)(a)]', 'Certificate under section 203 of the Income-tax Act, 1961', 'Name of the Employee: ' + n, 'PAN of the Employee: ' + pan, 'Assessment Year: ' + CURRENT_AY, 'Sample document created by CA Desk'] };
  if (key === 'cg_broker') return { name: 'Tax P&L ' + firstName(c.name) + ' FY' + ayToFy(CURRENT_AY) + '.pdf', lines: ['Tax P&L Statement: Capital Gains', 'Client name: ' + n, 'Client PAN: ' + pan, 'Financial Year: ' + ayToFy(CURRENT_AY), 'Short term capital gain: Rs 18,450', 'Long term capital gain: Rs 92,300', 'Sample document created by CA Desk'] };
  if (key === 'bank') return { name: 'Interest certificate ' + firstName(c.name) + '.pdf', lines: ['Interest Certificate', 'Account holder: ' + n, 'PAN: ' + pan, 'Financial Year: ' + ayToFy(CURRENT_AY), 'Savings interest: Rs 6,214', 'Sample document created by CA Desk'] };
  return null;
}
function sampleDocuments() {
  const files = [];
  const add = (d) => { if (d) files.push(new File([makePdf(d.lines)], d.name, { type: 'application/pdf' })); };
  // one document each for things still pending, so every suggestion can be filed
  const pendingKey = (c, keys) => keys.find(k => currentEngs(c.id).some(e => e.items.some(i => i.key === k && i.status === 'pending')));
  [['ABCPM1234K', ['cg_broker', 'bank', 'f16']], ['ABCPM5678L', ['f16', 'bank']]].forEach(([pan, keys]) => { const c = byPan(pan); const k = c && pendingKey(c, keys); if (k) add(docFor(c, k)); });
  const imran = byPan('CDEPQ8765R');
  if (imran) add({ name: 'Form16_Imran_old.pdf', lines: ['FORM NO. 16', 'Name of the Employee: IMRAN QURESHI', 'PAN of the Employee: CDEPQ8765R', 'Assessment Year: ' + PREV_AY, 'Sample document created by CA Desk'] });
  files.push(new File([b64ToBytes(PNG_1PX)], 'IMG-' + todayISO().replace(/-/g, '') + '-WA0012.png', { type: 'image/png' }));
  return files;
}

// ---------- guide card on Today ----------
function guideCard() {
  if (!isDemoMode() || DB.settings.guideHidden) return '';
  const rakesh = byPan('ABCPM1234K');
  const step = (title, text, action) => '<li class="stack" style="gap:4px;padding:10px 0;border-bottom:1px solid var(--line2)"><b>' + title + '</b><span class="small muted">' + text + '</span><span>' + action + '</span></li>';
  return '<section class="panel panel-pad stack" style="margin-top:20px" aria-labelledby="guide-t"><div class="spread"><h2 id="guide-t">Try this</h2><button class="btn btn-ghost btn-sm" data-act="guide-hide">Hide this</button></div>' +
    '<p class="small muted">This is the demo, with made-up clients. Messages are not sent and nothing is written to your disk.</p><ol style="margin:0;padding-left:20px">' +
    step('Take the tour', 'A two-minute, scroll-through explanation of every part of CA Desk.', '<a class="btn btn-sm" href="#/tour">Take the tour</a>') +
    step('See how a WhatsApp reminder works', 'Press Nudge on any client. A short picture walkthrough shows what happens once your WhatsApp is connected: sent, delivered, read, the document coming back and being filed.', '<button class="btn btn-sm btn-wa" data-act="run-start">Start nudging</button>') +
    (rakesh ? step('See a family that shares one number', 'Three clients, one phone. They get one combined reminder.', '<a class="btn btn-sm" href="#/client/' + esc(rakesh.id) + '">Open ' + esc(rakesh.name) + '</a>') : '') +
    step('Receive documents', 'Adds PDFs for Rakesh and Sunita (same phone, told apart by PAN), one from the wrong year and a phone photo with no text.', '<button class="btn btn-sm" data-act="sample-docs">Add sample documents</button>') +
    step('Import a client list from Excel', 'Runs the real import (column matching, phone clean-up, error report) on a sample list of 25 clients.', '<button class="btn btn-sm" data-act="sample-list">Import sample list</button>') +
    '</ol></section>';
}

// ---------- demo: picture walkthrough of the connected WhatsApp flow ----------
function openWalkthrough(key) {
  const units = buildUnits();
  const plan = todayPlan();
  const u = (key && units.find(x => x.key === key)) || plan.nudge[0] || plan.stuck[0] || units.find(x => x.availCount) || null;
  if (!u) return toast('Every sample client has sent everything. Load the sample data again to see the walkthrough.');
  UI.walk = { u, i: 0 }; renderWalk();
}
const WALK_STEPS = 5;
function walkArt(u, i) {
  const c = u.clients[0];
  const part = u.parts.find(p => p.avail.length) || u.parts[0];
  const doc = part && part.avail[0];
  const sender = DB.settings.firm || DB.settings.caName || 'Your CA';
  const who = u.clients.length > 1 ? u.clients.map(x => shortName(x)).join(', ') : c.name;
  const msg = nudgeMessage(u);
  const short = msg.length > 260 ? msg.slice(0, 257) + '…' : msg;
  const phone = (inner) => '<div class="phone" aria-hidden="true"><div class="phone-head">' + esc(sender) + '<span>WhatsApp</span></div><div class="chat">' + inner + '</div></div>';
  const out = (t, ticks) => '<div class="b-out">' + esc(t) + '<span class="ticks' + (ticks === 'read' ? ' read' : '') + '">' + (ticks === 'sent' ? '✓' : '✓✓') + '</span></div>';
  const fileName = doc ? safeName(doc.name).split(' ').slice(0, 2).join('_') + '.pdf' : 'Document.pdf';
  if (i === 0) return '<div class="mini"><div class="mini-h">' + esc(who) + '</div>' + u.parts.filter(p => p.avail.length).slice(0, 2).map(p => '<div class="small muted" style="margin-top:6px">' + esc(p.client.name + ', ' + SERVICE_LABEL[p.eng.service]) + '</div>' + p.avail.slice(0, 3).map(it => '<div class="mini-row"><span>' + esc(it.name) + '</span><span class="chip risk">Pending</span></div>').join('')).join('') + '<div class="mini-row" style="border:0"><span class="chip ' + dueChip(part.eng).cls + '">' + esc(dueChip(part.eng).text) + '</span><span class="chip accent">Message ready</span></div></div>';
  if (i === 1) return phone(out(short, 'sent'));
  if (i === 2) return '<div class="row" style="align-items:flex-start;justify-content:center;gap:18px">' + phone(out(short.split('\n').slice(0, 3).join('\n') + '…', 'read')) + '<div class="mini" style="max-width:240px"><div class="mini-h">Today, in CA Desk</div><div class="mini-row"><span>' + esc(who) + '</span></div><div class="row" style="margin-top:8px"><span class="chip">Delivered 9:02</span><span class="chip ok">Read 9:14</span></div></div></div>';
  if (i === 3) return phone(out(short.split('\n').slice(0, 2).join('\n') + '…', 'read') + '<div class="b-in"><span class="pdf">PDF</span> ' + esc(fileName) + '</div><div class="b-in">' + esc(clientLang(c) === 'english' ? 'Sending it now, thanks.' : 'Ji, bhej diya.') + '</div>');
  return '<div class="mini"><div class="mini-h">Add documents, in CA Desk</div><div class="mini-row"><span><span class="pdf">PDF</span> ' + esc(fileName) + '</span><span class="chip ok">From WhatsApp</span></div><div class="small" style="color:var(--memory-ink);margin:8px 0">Matched by the PAN on the document and the sender\'s number</div><div class="mini-row"><span>Client</span><b>' + esc(part.client.name) + '</b></div><div class="mini-row"><span>Document</span><b>' + esc(doc ? doc.name : 'Document') + '</b></div><div class="mini-row" style="border:0"><span class="chip ok">Ticked and saved</span><span class="small muted">Clients / ' + esc(part.client.folder || part.client.name) + ' / ' + esc(yearFolderName(part.eng.ay)) + '</span></div></div>';
}
function walkText(u, i) {
  const c = u.clients[0]; const part = u.parts.find(p => p.avail.length) || u.parts[0];
  const n = u.availCount; const doc = part && part.avail[0];
  return [
    ['CA Desk writes the reminder', 'Every morning CA Desk picks who needs a nudge and lists only what that client still owes. ' + (u.clients.length > 1 ? 'These three share one phone, so they get one message covering all of them.' : c.name + ' owes ' + plural(n, 'document') + '.')],
    ['It goes out from your WhatsApp number', 'With WhatsApp connected, you press Send all once and every reminder goes out from your WhatsApp Business number, the one clients already know. You can still send one by one from your phone if you prefer.'],
    ['You see it delivered and read', 'The ticks come back into CA Desk, so you know who has seen the reminder without opening WhatsApp. Clients who ignore three reminders move to a "Call these" list.'],
    ['The client sends the document on WhatsApp', 'When ' + firstName(part.client.name) + ' replies with a PDF or a photo, it lands in CA Desk by itself. No downloading, no forwarding to the office computer.'],
    ['CA Desk matches it and files it', 'It reads the PAN on the document and the sender\'s number to find the right client and document' + (doc ? ' (' + doc.name + ')' : '') + '. You confirm with one tap, the checklist updates and the file is saved in that client\'s folder.']
  ][i];
}
function renderWalk() {
  const root = $('#modal-root'); const w = UI.walk; if (!root || !w) return;
  const [title, text] = walkText(w.u, w.i); const last = w.i === WALK_STEPS - 1;
  root.innerHTML = '<div class="modal-back"><div class="modal walk" role="dialog" aria-modal="true" aria-labelledby="wk-t">' +
    '<div class="spread"><span class="small muted">How it works once WhatsApp is connected: step ' + (w.i + 1) + ' of ' + WALK_STEPS + '</span><button class="btn btn-ghost btn-sm" data-act="walk-close">Close</button></div>' +
    '<div class="steps" aria-hidden="true" style="margin:0">' + Array.from({ length: WALK_STEPS }, (_, k) => '<span class="' + (k <= w.i ? 'on' : '') + '"></span>').join('') + '</div>' +
    '<div class="walk-grid"><div class="walk-text"><h2 id="wk-t">' + esc(title) + '</h2><p>' + esc(text) + '</p>' +
    (last ? '<p class="small">This is the demo, so nothing was sent. To use it with your own clients, upload your client list, then connect WhatsApp in Settings.</p>' : '') + '</div>' +
    '<div class="walk-pic"><span class="label">Picture: what you would see</span><div class="walk-art">' + walkArt(w.u, w.i) + '</div></div></div>' +
    '<div class="row">' + (w.i ? '<button class="btn" data-act="walk-back">Back</button>' : '') + (last ? '<button class="btn btn-primary" data-act="walk-real">Upload my client list</button><button class="btn" data-act="walk-close">Back to the demo</button>' : '<button class="btn btn-primary" data-act="walk-next">Next</button>') + '</div></div></div>';
  const btn = root.querySelector('[data-act="walk-next"], [data-act="walk-real"]'); if (btn) btn.focus();
}

const GLOSS = {
  ais: 'Annual Information Statement: the tax department\'s record of a person\'s income and transactions. Downloaded from the income tax portal.',
  '26as': 'Tax credit statement showing tax deducted (TDS) and taxes paid against a PAN. Downloaded from the income tax portal.',
  prev_itr: 'Last year\'s filed return, used to carry forward losses and keep figures consistent.',
  f16: 'Certificate from the employer showing salary paid and tax deducted.',
  '16a': 'Certificate of tax deducted on non-salary income such as bank interest.',
  g_2b: 'Auto-generated statement of input tax credit available, from the GST portal.'
};
/* CA Desk: scroll tour. The page is a snap-scrolling column of invisible full-screen slots;
   a pinned stage on top swaps text, picture and background as each slot snaps into place.
   One scroll gesture = one step. No inner scrolling: every step's text fits its card. */

const phoneArt = (text, ticks) => '<div class="phone"><div class="phone-head">Agarwal & Associates<span>WhatsApp</span></div><div class="chat"><div class="b-out">' + esc(text) + '<span class="ticks' + (ticks === 'read' ? ' read' : '') + '">' + (ticks === 'read' ? '✓✓' : '✓') + '</span></div></div></div>';
const TOUR = [
  {
    title: 'Meet CA Desk',
    body: 'A filing-season assistant for chartered accountants in India. It tracks which documents every client still owes, reminds them on WhatsApp, and files what comes back in the right folder.',
    more: ['Built for ITR, tax audit, GST and TDS work.'],
    art: () => '<div class="t-hero">' + LOGO.replace('width="28" height="28"', 'width="88" height="88"') + '<div class="t-word">CA Desk</div><div class="row" style="justify-content:center"><span class="chip">Track</span><span class="chip">Remind</span><span class="chip">File</span></div></div>'
  },
  {
    title: 'The problem it solves',
    body: 'From July to October a CA chases hundreds of documents across hundreds of WhatsApp chats, and keeps track of it all in their head.',
    more: ['Reminders are typed one by one.', 'PDFs get lost between chats and folders.'],
    art: () => '<div class="t-notes">' + ['Did Sharma send Form 16?', 'Remind the Mehtas again?', 'Which folder is the AIS in?', 'Sethi audit due Monday', 'Kavita: purchase bills??', 'Is this last year\'s copy?'].map((t, i) => '<span class="t-note" style="--r:' + ((i % 2 ? 1 : -1) * (2 + i)) + 'deg">' + esc(t) + '</span>').join('') + '</div>'
  },
  {
    title: 'It works with what you already use',
    body: 'Your Excel stays the client list, your folders stay on your computer, and reminders go from your own WhatsApp. Nothing to replace or re-learn.',
    more: ['Edits in your Excel show up automatically.', 'Nothing is ever written back to your Excel.'],
    art: () => '<div class="t-flow"><div class="t-box">Your Excel<small>client list</small></div><div class="t-box">Your folders<small>on your computer</small></div><div class="t-box">Your WhatsApp<small>your number</small></div><div class="t-arrow" aria-hidden="true">↓</div><div class="t-box t-center">CA Desk<small>tracks, reminds, files</small></div></div>'
  },
  {
    title: 'Every morning: who to remind first',
    body: 'The Today screen ranks clients by how close the deadline is, how many documents are pending and how late they were last season, with the reason written under each name.',
    more: ['Nobody is reminded twice within 48 hours.', 'Returns due in the next 14 days are listed separately.'],
    art: () => '<div class="mini"><div class="mini-h">Nudge today</div>' + [['Kavita Traders', 'GST: 34 days late', 'Usually needs a phone call'], ['Mehta family (3 clients)', 'ITR: last date 31 Dec', 'Capital gains came 12 days late last season'], ['Dr. Anjali Rao', 'ITR: last date 31 Dec', 'Needed 2 reminders last season']].map((r, i) => '<div class="mini-row t-col"><b>' + (i + 1) + '. ' + r[0] + '</b><span class="chip risk">' + r[1] + '</span><span class="small t-why">' + r[2] + '</span></div>').join('') + '</div>'
  },
  {
    title: 'A checklist for every return',
    body: 'Each client gets a document checklist per return, built from their income sources and tax regime, following the Income Tax Department\'s published lists.',
    more: ['Things you download yourself, like AIS, never go into reminders.', 'Add, rename or skip any document.'],
    art: () => '<div class="mini"><div class="mini-h">Rakesh Mehta, ITR</div><div class="row" style="margin:8px 0"><span class="chip accent">Salary</span><span class="chip accent">Capital gains</span><span class="chip">New regime</span></div>' + [['Form 16', 'Received 3 Oct', 'ok'], ['Capital gains statement', 'Pending', 'risk'], ['Bank interest certificates', 'Pending', 'risk'], ['AIS / TIS', 'You download this', '']].map(r => '<div class="mini-row"><span>' + r[0] + '</span><span class="chip ' + r[2] + '">' + r[1] + '</span></div>').join('') + '<div class="mini-row" style="border:0"><div class="bar" style="flex:1"><span style="width:55%"></span></div><span class="small">6 of 11 received</span></div></div>'
  },
  {
    title: 'One tap writes the reminder',
    body: 'Press Nudge and the WhatsApp message is written for that client, in Hinglish, English or Hindi, listing only what they still owe and the last date.',
    more: ['A family sharing one phone gets a single message.', 'With WhatsApp Business connected, send the whole list at once and see read ticks.'],
    art: () => phoneArt('Namaste Rakesh ji,\n\nYe documents abhi pending hain:\nRakesh: Capital gains statement\nSunita: Form 16\n\nLast date: 31 Dec 2026.', 'read')
  },
  {
    title: 'When messages don\'t work, call',
    body: 'If a client ignores three reminders, they move to "Call these" at the top of the day. After you phone them, "Log a call" records it and pauses reminders for 48 hours.',
    more: ['The call is saved in the client\'s history.', 'If nothing arrives after 48 hours, reminders start again.'],
    art: () => '<div class="mini"><div class="mini-h">Call these</div><div class="mini-row t-col"><b>Sethi Auto Parts Pvt Ltd</b><span class="small t-why">3 reminders since anything came in</span><div class="row"><span class="btn btn-sm btn-primary">Call</span><span class="btn btn-sm">Log a call</span></div></div><div class="mini-row" style="border:0"><span class="small muted">After "Log a call"</span><span class="chip">Paused for 48 hours</span></div></div>'
  },
  {
    title: 'Documents match and file themselves',
    body: 'When a document arrives, CA Desk works out whose it is from the PAN printed on it, the sender\'s number or the name. You confirm with one tap, and it is ticked and saved in that client\'s folder.',
    more: ['It warns when a client sends last year\'s copy.'],
    art: () => '<div class="stack" style="width:100%;max-width:400px;gap:10px"><div class="mini"><div class="mini-h"><span class="pdf">PDF</span> Form16_Sunita.pdf</div><div class="small t-why" style="margin:6px 0">Matched by the PAN on the document</div><div class="mini-row"><span>Client</span><b>Sunita Mehta</b></div><div class="mini-row" style="border:0"><span>Document</span><b>Form 16</b></div></div><div class="mini t-tree"><div>Clients / Sunita Mehta / AY 2026-27</div><div style="padding-left:18px"><b>Form 16.pdf</b> <span class="chip ok">just filed</span></div></div></div>'
  },
  {
    title: 'It remembers, season after season',
    body: 'Every reminder and document is dated, so CA Desk learns who is slow and what they send late, and starts next season from what each client sent this season.',
    more: ['Slow clients are reminded earlier.'],
    art: () => '<div class="mini"><div class="mini-h">What CA Desk remembers</div><div class="mini-row"><span>This season</span><span>2 reminders</span></div><div class="mini-row"><span>Last season</span><span>Needed 3 reminders</span></div><div class="mini-row"><span>Came late</span><span>Capital gains, 12 days</span></div><div class="row" style="margin-top:10px"><span class="chip">Fast</span><span class="chip">Normal</span><span class="chip accent">Slow</span></div></div>'
  },
  {
    title: 'Private, and honest about limits',
    body: 'Only the last four characters of a PAN are stored, Aadhaar is never asked for, and documents go only to your own folder.',
    more: ['It does not file returns or compute tax.', 'Nothing is sent without your approval.'],
    art: () => '<div class="mini">' + [['PAN', '••••••234K'], ['Aadhaar', 'Never stored'], ['Documents', 'Your folder only'], ['WhatsApp key', 'Never in the browser']].map(r => '<div class="mini-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('') + '</div>'
  },
  {
    title: 'Now try it yourself',
    body: 'The demo has twelve made-up clients with a season of history. Nothing is sent and nothing is saved to your disk.',
    more: [],
    cta: true,
    art: () => '<div class="t-hero"><div class="mini" style="max-width:340px"><div class="mini-h">Today</div><div class="mini-row"><span>5 clients to nudge</span><span class="chip accent">Start</span></div><div class="mini-row"><span>1 call to make</span><span class="chip">Call</span></div><div class="mini-row" style="border:0"><span>3 returns due this week</span><span class="chip risk">Due</span></div></div></div>'
  }
];
const TOUR_TONES = 6;

function viewTour() {
  const n = TOUR.length;
  return '<div class="tour" id="tour" tabindex="-1" aria-label="CA Desk tour. Scroll to move through it.">' +
    '<div class="tour-stage tone-0" id="tour-stage">' +
    '<header class="tour-top"><span class="logo" style="padding:0">' + LOGO + 'CA Desk</span><button class="btn btn-sm" data-act="tour-done">Skip to the demo app</button></header>' +
    '<div class="tour-body">' +
    '<div class="tour-text">' + TOUR.map((t, k) => '<article class="tour-panel' + (k === 0 ? ' on' : ' below') + '" data-i="' + k + '" aria-hidden="' + (k !== 0) + '"><span class="tour-num">' + (k + 1) + ' of ' + n + '</span><h2>' + esc(t.title) + '</h2><p>' + esc(t.body) + '</p>' + (t.more && t.more.length ? '<ul>' + t.more.map(m => '<li>' + esc(m) + '</li>').join('') + '</ul>' : '') + (t.cta ? '<div class="row" style="margin-top:16px"><button class="btn btn-big btn-primary" data-act="tour-done">Open the demo app</button><a class="btn" href="#/welcome">Back to the opening page</a></div>' : '') + '</article>').join('') + '</div>' +
    '<div class="tour-visual" aria-hidden="true">' + TOUR.map((t, k) => '<div class="tour-art' + (k === 0 ? ' on' : ' below') + '" data-i="' + k + '">' + t.art() + '</div>').join('') + '</div>' +
    '</div>' +
    '<footer class="tour-foot"><div class="tour-progress" aria-hidden="true"><span id="tour-bar" style="width:' + (100 / n) + '%"></span></div><span class="tour-hint" id="tour-hint">Scroll to continue</span></footer>' +
    '</div>' +
    TOUR.map((_, k) => '<section class="tour-slot" data-i="' + k + '" aria-hidden="true"></section>').join('') +
    '</div>';
}
function applyTourStep(i) {
  const stage = $('#tour-stage'); if (!stage) return;
  const n = TOUR.length; UI.tourStep = i;
  stage.className = 'tour-stage tone-' + (i % TOUR_TONES);
  stage.querySelectorAll('.tour-panel, .tour-art').forEach(p => {
    const k = +p.dataset.i;
    p.classList.toggle('on', k === i); p.classList.toggle('above', k < i); p.classList.toggle('below', k > i);
    if (p.classList.contains('tour-panel')) p.setAttribute('aria-hidden', String(k !== i));
  });
  $('#tour-bar').style.width = ((i + 1) / n * 100) + '%';
  const hint = $('#tour-hint'); if (hint) hint.textContent = i === n - 1 ? 'You have reached the end' : i === 0 ? 'Scroll to continue' : '';
}
function tourOnScroll() {
  const el = $('#tour'); if (!el) return;
  const h = el.clientHeight || window.innerHeight;
  const i = Math.max(0, Math.min(TOUR.length - 1, Math.round(el.scrollTop / h)));
  if (i !== UI.tourStep) applyTourStep(i);
}
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
