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
    body: 'The demo has twelve made-up clients with a season of history. Sample progress stays in this browser; no messages are sent and sample documents are never written to client folders.',
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
