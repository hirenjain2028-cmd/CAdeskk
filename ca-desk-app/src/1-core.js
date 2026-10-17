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
const UI = { q: '', filter: 'active', openItem: null, setupStep: 0, pendingExcel: null, queue: [], run: null, folderOk: false, excelOk: false, excelHandle: null, folderHandle: null, lastSeasonFiles: {}, cloudEmail: '', cloudCode: '', codeSent: false, authBusy: false };

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
