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
