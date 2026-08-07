// Keeps live YouTube usable (videos still play) but only shows pre-cutoff
// content: search queries get a before: operator, feed/suggestion tiles newer
// than the cutoff are hidden, and Shorts (which didn't exist in 2019) vanish.
// Kept tiles get their date label rewritten as if today were the cutoff date
// ("לפני 10 שנים" becomes "לפני 3 שנים").
// Defaults; the real cutoff comes from chrome.storage (user-set in the popup).
let CUTOFF = new Date('2019-05-10');
let CUTOFF_QUERY = 'before:2019-05-10';

const UNIT_MS = {
  second: 1e3,
  minute: 6e4,
  hour: 36e5,
  day: 864e5,
  week: 6048e5,
  month: 2629746e3,
  year: 31556952e3,
};

// Hebrew unit words → [unit, implied count]. Dual forms ("שנתיים" = 2 years)
// carry their own count; includes YouTube's abbreviations ("שע׳") in both
// geresh and apostrophe spellings.
const HEB = {
  'שנייה': ['second', 1], 'שניות': ['second', 1], 'שנ׳': ['second', 1], "שנ'": ['second', 1],
  'דקה': ['minute', 1], 'דקות': ['minute', 1], 'דק׳': ['minute', 1], "דק'": ['minute', 1],
  'שעה': ['hour', 1], 'שעות': ['hour', 1], 'שע׳': ['hour', 1], "שע'": ['hour', 1],
  'יום': ['day', 1], 'ימים': ['day', 1],
  'שבוע': ['week', 1], 'שבועות': ['week', 1], 'שב׳': ['week', 1], "שב'": ['week', 1],
  'חודש': ['month', 1], 'חודשים': ['month', 1], 'חוד׳': ['month', 1], "חוד'": ['month', 1],
  'שנה': ['year', 1], 'שנים': ['year', 1],
  'שעתיים': ['hour', 2], 'יומיים': ['day', 2], 'שבועיים': ['week', 2], 'חודשיים': ['month', 2], 'שנתיים': ['year', 2],
};
// Longest-first alternation so "שבועיים" wins over its prefix "שבוע"; matching
// by alternation (not \S+) survives badge text glued on with no space ("ימיםחדש").
// Digit counts are capped at 3: real relative dates never exceed that, and the
// cap keeps the watch page's odometer digit-stacks ("123456789012...") unmatched.
const HEB_RE = new RegExp(
  `לפני\\s+(?:(\\d{1,3})\\s+)?(${Object.keys(HEB).sort((a, b) => b.length - a.length).join('|')})`, 'u'
);
const EN_RE = /(\d{1,3})\s+(second|minute|hour|day|week|month|year)s?\s+ago/;

// Absolute dates ("4 ביוני 2012" / "Jun 4, 2012") — the watch page's tooltip
// carries these even when the visible label is an unparseable odometer.
const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// Month may be abbreviated with a geresh ("בינו׳ 2011"), so capture loosely and
// resolve by prefix against the full month list.
const HEB_ABS_RE = /(\d{1,2})\s+ב([א-ת]{3,7}[׳']?)\s+(\d{4})/u;
const EN_ABS_RE = /([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),?\s+(\d{4})/;

function parseAbsoluteDate(text) {
  let m = HEB_ABS_RE.exec(text);
  if (m) {
    const mi = HEB_MONTHS.findIndex((f) => f.startsWith(m[2].replace(/[׳']/g, '')));
    if (mi >= 0) return { m0: m[0], heb: true, date: new Date(+m[3], mi, +m[1]) };
  }
  m = EN_ABS_RE.exec(text);
  if (m) {
    const mi = EN_MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return { m0: m[0], heb: false, date: new Date(+m[3], mi, +m[2]) };
  }
  return null;
}

// YouTube sprinkles invisible bidi control marks through Hebrew text; strip them
// all before matching so they can't glue onto words or split numbers.
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

// "3 years ago" / "לפני 3 שנים" → approximate Date; null if no relative date.
// ponytail: ±months of slack near the cutoff — exact upload dates aren't in the DOM.
function parseRelativeDate(text, now = Date.now()) {
  const en = EN_RE.exec(text);
  if (en) return new Date(now - en[1] * UNIT_MS[en[2]]);
  const he = HEB_RE.exec(text);
  if (!he) return null;
  const [unit, impliedCount] = HEB[he[2]];
  return new Date(now - (he[1] || impliedCount) * UNIT_MS[unit]);
}

function isTooNew(text, now = Date.now()) {
  const clean = text.replace(BIDI, '');
  if (/\d[\d,.]*\s+(watching|צופים)/.test(clean)) return true; // live stream: no upload date, hide
  const d = parseRelativeDate(clean, now);
  return d !== null && d > CUTOFF;
}

// deltaMs before the cutoff → "3 years ago" / "לפני 3 שנים".
const HEB_FORMS = {
  year: ['שנה', 'שנתיים', 'שנים'],
  month: ['חודש', 'חודשיים', 'חודשים'],
  week: ['שבוע', 'שבועיים', 'שבועות'],
  day: ['יום', 'יומיים', 'ימים'],
  hour: ['שעה', 'שעתיים', 'שעות'],
  minute: ['דקה', null, 'דקות'],
};
function agoText(deltaMs, hebrew) {
  for (const unit of ['year', 'month', 'week', 'day', 'hour', 'minute']) {
    // floor like YouTube itself; the 5% grace keeps calendar-exact spans
    // (730 days = "2 years") from flooring down against the astronomical year
    const n = Math.floor(deltaMs / UNIT_MS[unit] + 0.05);
    if (n < 1) continue;
    if (!hebrew) return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    const [one, two, many] = HEB_FORMS[unit];
    return n === 1 ? `לפני ${one}` : n === 2 && two ? `לפני ${two}` : `לפני ${n} ${many}`;
  }
  return hebrew ? 'לפני רגע' : 'just now';
}

// First text node in the tile carrying a relative date, with its parsed value.
function findDateMatch(tile, now = Date.now()) {
  const walker = document.createTreeWalker(tile, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const clean = node.data.replace(BIDI, '');
    let m = EN_RE.exec(clean);
    if (m) return { node, m, clean, heb: false, unitMs: UNIT_MS[m[2]], date: new Date(now - m[1] * UNIT_MS[m[2]]) };
    m = HEB_RE.exec(clean);
    if (m) {
      const [unit, implied] = HEB[m[2]];
      return { node, m, clean, heb: true, unitMs: UNIT_MS[unit], date: new Date(now - (m[1] || implied) * UNIT_MS[unit]) };
    }
  }
  return null;
}

if (typeof chrome !== 'undefined' && chrome.storage) {
  const TILES = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'yt-lockup-view-model',
  ].join(', ');

  const bypassed = (bypass, host) => bypass.some((d) => host === d || host.endsWith('.' + d));

  chrome.storage.local.get({ enabled: true, bypass: [], cutoff: '2019-05-10' }, ({ enabled, bypass, cutoff }) => {
    if (!enabled || bypassed(bypass, location.hostname)) return;
    CUTOFF = new Date(cutoff);
    CUTOFF_QUERY = `before:${cutoff}`;

    const style = document.createElement('style');
    style.textContent = `
      ytd-reel-shelf-renderer,
      ytd-rich-shelf-renderer[is-shorts],
      ytd-rich-section-renderer:has([is-shorts]),
      ytd-guide-entry-renderer:has(a[title="Shorts"]),
      ytd-mini-guide-entry-renderer:has([aria-label="Shorts"]) { display: none !important; }
      #snap-2019-feed { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; padding: 24px; }
      #snap-2019-feed a { text-decoration: none; color: var(--yt-spec-text-primary, #f1f1f1); font-family: Roboto, Arial, sans-serif; }
      #snap-2019-feed .t { position: relative; }
      #snap-2019-feed img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 8px; display: block; }
      #snap-2019-feed .t span { position: absolute; bottom: 6px; inset-inline-end: 6px; background: rgba(0,0,0,.8); color: #fff; font-size: 12px; padding: 1px 4px; border-radius: 4px; }
      #snap-2019-feed b { display: block; font-size: 14px; font-weight: 500; line-height: 1.3; margin: 8px 0 4px; }
      #snap-2019-feed .m { font-size: 12px; color: var(--yt-spec-text-secondary, #aaa); }
    `;
    document.documentElement.appendChild(style);

    const fixSearch = () => {
      const url = new URL(location.href);
      const q = url.searchParams.get('search_query');
      if (url.pathname !== '/results' || !q || /\bbefore:/.test(q)) return;
      url.searchParams.set('search_query', `${q} ${CUTOFF_QUERY}`);
      location.replace(url.href);
    };
    fixSearch();
    window.addEventListener('yt-navigate-finish', fixSearch); // YouTube is a SPA

    // Exact upload dates: relative labels lose up to a whole unit ("7 years ago"
    // spans a full year), which is fatal near the cutoff. For tiles within one
    // unit of it we fetch the video's watch page once and read the exact
    // uploadDate from its metadata; cached in chrome.storage so every video is
    // fetched at most once ever. ponytail: the cache grows unbounded — tiny
    // strings, prune if it ever matters.
    const vidDates = new Map(); // id -> Date | null (no date found) | 'pending'
    let cacheTimer;
    chrome.storage.local.get({ vidDates: {} }, ({ vidDates: stored }) => {
      for (const [id, d] of Object.entries(stored)) vidDates.set(id, d ? new Date(d) : null);
      scheduleScan();
    });
    const saveCache = () => {
      clearTimeout(cacheTimer);
      cacheTimer = setTimeout(() => {
        const out = {};
        for (const [id, d] of vidDates) if (d !== 'pending') out[id] = d ? d.toISOString().slice(0, 10) : '';
        chrome.storage.local.set({ vidDates: out });
      }, 2000);
    };
    const fetchExactDate = (id) => {
      if (vidDates.has(id)) return;
      vidDates.set(id, 'pending');
      fetch(`/watch?v=${id}`)
        .then((r) => r.text())
        .then((t) => {
          const m = t.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/) || t.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/);
          vidDates.set(id, m ? new Date(m[1]) : null);
          saveCache();
          scheduleScan();
        })
        .catch(() => vidDates.delete(id)); // transient failure: retry on a later scan
    };
    const tileVideoId = (root) => {
      const a = root.matches('a[href*="v="]') ? root : root.querySelector('a[href*="/watch"]');
      try { return a ? new URL(a.href).searchParams.get('v') : null; } catch { return null; }
    };

    // Rewrite root's date label to the time-travel clock; hideable roots (tiles,
    // comments) are hidden entirely when the date is past the cutoff.
    const processDated = (root, hideable, hideUndated, useExact) => {
      const found = findDateMatch(root);
      // undated: usually a playlist/channel (keep), but player-wall tiles are
      // hidden — their only undated kinds are live streams and 2026 mixes
      if (!found) { if (hideable) root.style.display = hideUndated ? 'none' : ''; return; }
      const parent = found.node.parentElement;
      const id = useExact ? tileVideoId(root) : null;
      const exact = id ? vidDates.get(id) : undefined;
      // Our own rewritten label — never re-parse it as a real date. An exact
      // date arriving later re-opens the decision.
      if (!(exact instanceof Date) && parent && parent.dataset.snap && found.clean.includes(parent.dataset.snap)) {
        if (hideable) root.style.display = '';
        return;
      }
      // YouTube floors relative labels, so assume mid-interval until exact known
      const date = exact instanceof Date ? exact : new Date(found.date.getTime() - 0.5 * found.unitMs);
      if (id && !vidDates.has(id) && found.unitMs >= UNIT_MS.week && Math.abs(date - CUTOFF) <= found.unitMs) {
        fetchExactDate(id);
      }
      if (hideable && date > CUTOFF) {
        root.style.display = 'none';
        if (parent) delete parent.dataset.snap;
        return;
      }
      const fake = agoText(CUTOFF - date, found.heb);
      if (!(parent && parent.dataset.snap === fake && found.clean.includes(fake))) {
        found.node.data = found.clean.replace(found.m[0], fake);
        if (parent) parent.dataset.snap = fake;
      }
      if (hideable) root.style.display = '';
    };

    const scan = () => {
      for (const tile of document.querySelectorAll(TILES)) {
        if (tile.parentElement?.closest(TILES)) continue; // outermost tile only; hiding it hides its children
        const text = (tile.textContent || '').replace(BIDI, '');
        if (tile.querySelector('a[href^="/shorts/"]') || /\d[\d,.]*\s+(watching|צופים)/.test(text)) {
          tile.style.display = 'none';
          continue;
        }
        processDated(tile, true, false, true);
      }
      // In-player suggestions (pause/end-screen video wall)
      for (const a of document.querySelectorAll('a.ytp-suggestion-set, a.ytp-videowall-still')) {
        processDated(a, true, true, true);
      }
      // Watch page: the visible date is an odometer digit-stack, so parse the
      // absolute date from the element's tooltip text and replace the label.
      for (const el of document.querySelectorAll('ytd-watch-info-text, ytd-watch-metadata #info-strings')) {
        const abs = parseAbsoluteDate((el.textContent || '').replace(BIDI, ''));
        // ponytail: a direct-linked post-cutoff video keeps its real date line
        if (!abs || abs.date > CUTOFF) continue;
        const fake = agoText(CUTOFF - abs.date, abs.heb);
        // The info area has two possible date displays: a plain-text span and an
        // odometer #date-text. Rewrite whichever plain span exists; #date-text is
        // used only when no plain span carries the date, and blanked otherwise so
        // the date never shows twice. Writes are value-guarded so the idempotent
        // pass doesn't retrigger the mutation observer.
        const dt = el.querySelector('#date-text');
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        let sweptAny = false;
        while ((node = w.nextNode())) {
          if (dt && dt.contains(node)) continue;
          const clean = node.data.replace(BIDI, '');
          const m = EN_RE.exec(clean) || HEB_RE.exec(clean);
          if (!m) continue;
          sweptAny = true;
          const next = clean.replace(m[0], fake);
          if (node.data !== next) node.data = next;
        }
        if (dt) {
          if (sweptAny) {
            if (dt.textContent !== '') { dt.textContent = ''; delete dt.dataset.snapSrc; }
          } else if (dt.dataset.snapSrc !== abs.m0) {
            dt.textContent = fake;
            dt.dataset.snapSrc = abs.m0;
          }
        }
      }
      // Comments: a post-cutoff top comment hides its whole thread (shell and
      // replies button included); reply comments inside surviving threads are
      // filtered individually. Document order guarantees threads process first.
      // ponytail: reply-count labels aren't recomputed after filtering.
      for (const el of document.querySelectorAll('ytd-comment-thread-renderer, ytd-comment-view-model, ytd-comment-renderer')) {
        processDated(el, true);
      }
    };
    // --- "Fresh from 2019" home feed -------------------------------------
    // The real recommender only rarely surfaces 2018-19 videos, so we build a
    // feed ourselves: search YouTube for the user's subscription channels
    // restricted to the year before the cutoff, and inject the results as a
    // grid above whatever old tiles survive.
    const collectVR = (o, out) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { for (const v of o) collectVR(v, out); return; }
      if (o.videoRenderer) out.push(o.videoRenderer);
      else for (const v of Object.values(o)) collectVR(v, out);
    };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const shuffle = (a) => a.sort(() => Math.random() - 0.5);

    let feedCards = null;
    const buildFeed = async () => {
      if (feedCards) return feedCards;
      const subs = [...document.querySelectorAll('ytd-guide-entry-renderer a[href^="/@"]')]
        .map((a) => (a.getAttribute('title') || a.textContent || '').trim())
        .filter(Boolean);
      const queries = shuffle(subs.length ? subs : ['music', 'movie trailer', 'documentary', 'gaming', 'science']).slice(0, 4);
      const found = [];
      for (const q of queries) {
        try {
          const before = CUTOFF.toISOString().slice(0, 10);
          const afterD = new Date(CUTOFF);
          afterD.setFullYear(afterD.getFullYear() - 1);
          const res = await fetch(`/results?search_query=${encodeURIComponent(`${q} after:${afterD.toISOString().slice(0, 10)} before:${before}`)}`);
          const m = (await res.text()).match(/var ytInitialData = (\{.+?\});<\/script>/s);
          if (m) collectVR(JSON.parse(m[1]), found);
        } catch { /* ponytail: a failed search just means fewer cards */ }
      }
      const seen = new Set();
      const cards = [];
      for (const v of found) {
        const pub = v.publishedTimeText && v.publishedTimeText.simpleText;
        if (!v.videoId || seen.has(v.videoId) || !pub) continue;
        const d = parseRelativeDate(pub.replace(BIDI, ''));
        if (!d || d > CUTOFF) continue;
        seen.add(v.videoId);
        cards.push({
          id: v.videoId,
          title: ((v.title && v.title.runs) || []).map((r) => r.text).join(''),
          channel: v.ownerText && v.ownerText.runs ? v.ownerText.runs[0].text : '',
          views: (v.shortViewCountText && v.shortViewCountText.simpleText) || (v.viewCountText && v.viewCountText.simpleText) || '',
          len: (v.lengthText && v.lengthText.simpleText) || '',
          ago: agoText(CUTOFF - d, /לפני/.test(pub)),
        });
      }
      feedCards = shuffle(cards).slice(0, 24);
      return feedCards;
    };

    let injecting = false;
    const injectFeed = async () => {
      if (location.pathname !== '/' || injecting || document.getElementById('snap-2019-feed')) return;
      const host = document.querySelector('ytd-rich-grid-renderer');
      if (!host) return;
      injecting = true;
      try {
        const cards = await buildFeed();
        if (!cards.length || location.pathname !== '/' || document.getElementById('snap-2019-feed')) return;
        const wrap = document.createElement('div');
        wrap.id = 'snap-2019-feed';
        wrap.innerHTML = cards.map((c) => `
          <a href="/watch?v=${c.id}">
            <div class="t"><img loading="lazy" src="https://i.ytimg.com/vi/${c.id}/hqdefault.jpg">${c.len ? `<span>${esc(c.len)}</span>` : ''}</div>
            <b>${esc(c.title)}</b>
            <div class="m">${esc(c.channel)}</div>
            <div class="m">${esc(c.views)}${c.views ? ' • ' : ''}${c.ago}</div>
          </a>`).join('');
        host.parentElement.insertBefore(wrap, host);
      } finally {
        injecting = false;
      }
    };
    window.addEventListener('yt-navigate-finish', injectFeed);

    // ponytail: full rescan per mutation batch, debounced; fine at page scale.
    // characterData matters: YouTube recycles tiles by rewriting text in place.
    let timer;
    const scheduleScan = () => {
      clearTimeout(timer);
      timer = setTimeout(scan, 100);
    };
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(() => { scan(); injectFeed(); }, 1500); // safety net + feed (re)injection
  });
}

if (typeof module !== 'undefined') module.exports = { parseRelativeDate, parseAbsoluteDate, isTooNew, agoText };
