const $ = (id) => document.getElementById(id);

// Injected into the page: hyperspace warp + year countdown, then reload.
// Must be self-contained — it's serialized into the tab by chrome.scripting.
function warpAnimation(dateStr) {
  if (document.getElementById('tt-warp')) return;
  const o = document.createElement('div');
  o.id = 'tt-warp';
  o.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;align-items:center;justify-content:center;overflow:hidden;';
  const style = document.createElement('style');
  style.textContent = `
    @keyframes tt-line {
      from { transform: rotate(var(--a)) translateX(2vmax) scaleX(.1); opacity: 0 }
      20% { opacity: 1 }
      to { transform: rotate(var(--a)) translateX(75vmax) scaleX(3); opacity: 0 }
    }
    @keyframes tt-pulse { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.07) } }
    #tt-warp .l { position: absolute; left: 50%; top: 50%; width: 10vmax; height: 2px;
      background: linear-gradient(90deg, transparent, #9ecbff, #fff);
      transform-origin: 0 0; animation: tt-line 1.1s linear infinite; }
    #tt-warp .y { font: 700 16vmin/1 system-ui; color: #fff; z-index: 1;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 0 30px #7db4ff, 0 0 90px #4a7dff;
      animation: tt-pulse .4s ease-in-out infinite; }
  `;
  o.appendChild(style);
  for (let i = 0; i < 70; i++) {
    const l = document.createElement('i');
    l.className = 'l';
    l.style.setProperty('--a', Math.random() * 360 + 'deg');
    l.style.animationDelay = Math.random() * 1.1 + 's';
    o.appendChild(l);
  }
  const y = document.createElement('div');
  y.className = 'y';
  o.appendChild(y);
  document.documentElement.appendChild(o);
  const target = +dateStr.slice(0, 4);
  let year = new Date().getFullYear();
  y.textContent = year;
  const total = Math.max(Math.abs(year - target), 1);
  const step = () => {
    if (year === target) {
      o.style.transition = 'background .3s';
      o.style.background = '#fff';
      setTimeout(() => location.reload(), 350);
      return;
    }
    year += target > year ? 1 : -1;
    y.textContent = year;
    setTimeout(step, Math.max(1300 / total, 50));
  };
  setTimeout(step, 250);
}

// If we're viewing an archived page, recover the original URL from the Wayback path.
const originalUrl = (url) => {
  const m = /^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\/(https?:\/\/.+)/.exec(url);
  return m ? m[1] : url;
};

const domainOf = (url) => {
  try {
    const u = new URL(originalUrl(url));
    return u.protocol.startsWith('http') ? u.hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
};

// "foo", "https://www.foo.com/bar", "foo.com/" → "foo.com"
const normalizeDomain = (raw) => {
  try {
    return new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
};

(async () => {
  let { enabled, bypass, cutoff } = await chrome.storage.local.get({ enabled: true, bypass: [], cutoff: '2019-05-10' });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = tab && domainOf(tab.url);

  const setBypass = async (next) => {
    bypass = next;
    await chrome.storage.local.set({ bypass });
    await chrome.runtime.sendMessage('rebuild');
    renderExceptions();
  };

  const renderExceptions = () => {
    const list = $('exlist');
    list.textContent = '';
    for (const d of bypass) {
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('span');
      name.textContent = d;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = `Re-freeze ${d}`;
      del.onclick = () => setBypass(bypass.filter((x) => x !== d));
      row.append(name, del);
      list.appendChild(row);
    }
  };
  renderExceptions();

  $('exform').onsubmit = (e) => {
    e.preventDefault();
    const d = normalizeDomain($('exinput').value.trim());
    if (!d || bypass.includes(d)) return;
    $('exinput').value = '';
    setBypass([...bypass, d]);
  };

  $('enabled').checked = enabled;
  $('enabled').onchange = async () => {
    await chrome.storage.local.set({ enabled: $('enabled').checked });
    await chrome.runtime.sendMessage('rebuild');
  };

  $('cutoff').value = cutoff;
  $('save').onclick = async () => {
    if (!$('cutoff').value) return;
    await chrome.storage.local.set({ cutoff: $('cutoff').value });
    await chrome.runtime.sendMessage('rebuild');
    $('save').textContent = 'Saved ✓';
    setTimeout(() => { $('save').textContent = '💾 Save'; }, 1200);
  };

  $('travel').onclick = async () => {
    const v = $('cutoff').value;
    if (!v) return;
    await chrome.storage.local.set({ cutoff: v, enabled: true });
    await chrome.runtime.sendMessage('rebuild');
    if (tab?.id != null) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: warpAnimation, args: [v] });
      } catch {
        chrome.tabs.reload(tab.id); // pages we can't script into: plain reload
      }
    }
    window.close();
  };

  if (!domain) return;
  const btn = $('bypass');
  const isBypassed = bypass.includes(domain);
  btn.hidden = false;
  btn.textContent = isBypassed ? `Re-freeze ${domain}` : `Open ${domain} live`;
  btn.onclick = async () => {
    const next = isBypassed ? bypass.filter((d) => d !== domain) : [...bypass, domain];
    await chrome.storage.local.set({ bypass: next });
    await chrome.runtime.sendMessage('rebuild'); // wait for the rule before navigating
    chrome.tabs.update(tab.id, { url: originalUrl(tab.url) });
    window.close();
  };
})();
