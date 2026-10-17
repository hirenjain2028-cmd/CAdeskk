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
    '<p class="small muted">This is the demo, with made-up clients. Sample progress stays in this browser. Messages are not sent, and sample documents are not written to client folders.</p><ol style="margin:0;padding-left:20px">' +
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
