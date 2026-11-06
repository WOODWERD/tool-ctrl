// Shared by the app and the guide: theme switch, All tools menu and offline support.
const THEME = 'toolctrl.theme';
const load = () => { try { return localStorage.getItem(THEME); } catch { return null; } };

function setTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else { t = 'auto'; delete document.documentElement.dataset.theme; }
  try { localStorage.setItem(THEME, t); } catch { /* storage unavailable */ }
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
}
document.querySelectorAll('[data-theme-set]').forEach((b) => { b.onclick = () => setTheme(b.dataset.themeSet); });
setTheme(load() || 'auto');

// The menu works with no script; this only closes it 
const menu = document.getElementById('toolkit');
document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });

// Guide menu: mark the section you're reading (WOODWERD Digital, Guide menu).
const guideNav = document.querySelector('.guide nav');
if (guideNav) {
  const pairs = [...guideNav.querySelectorAll('a[href^="#"]')].map((a) => [a, document.getElementById(a.hash.slice(1))]).filter(([, s]) => s);
  let held = false;
  const mark = (a) => pairs.forEach(([l]) => (l === a ? l.setAttribute('aria-current', 'location') : l.removeAttribute('aria-current')));
  const follow = () => {
    if (held || !pairs.length) return;
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    let cur = pairs[0][0];
    for (const [a, s] of pairs) if (s.getBoundingClientRect().top <= innerHeight / 3) cur = a;
    mark(atEnd ? pairs[pairs.length - 1][0] : cur);
  };
  pairs.forEach(([a]) => a.addEventListener('click', () => { mark(a); held = true; }));
  ['wheel', 'touchstart', 'keydown'].forEach((t) => addEventListener(t, () => { held = false; }, { passive: true }));
  let tick = 0;
  addEventListener('scroll', () => { if (!tick) tick = requestAnimationFrame(() => { tick = 0; follow(); }); }, { passive: true });
  addEventListener('load', follow);
  follow();
}

if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
