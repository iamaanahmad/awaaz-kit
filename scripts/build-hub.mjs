// Assembles the combined deploy output: dist/index.html (hub), dist/order/, dist/bill/.
// Run after both apps are built (apps/*/dist). Both apps share one origin (Req 1.7, 2.1).
import { cp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');

const apps = [
  { dir: 'order-awaaz', route: 'order' },
  { dir: 'bill-awaaz', route: 'bill' },
];

// Hub page: self-contained (inline CSS, SVG and JS), same Haunted/Classic themes as the apps and
// the same localStorage key. Colours mirror packages/shared-ui/src/tokens.css.
const hubHtml = `<!doctype html>
<html lang="en" data-theme="haunted">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0f0b14" />
<meta name="description" content="Speak to the spirits of your shop. Offline. Honest. No guesses." />
<title>Awaaz Kit</title>
<script>
  // Apply the saved theme before first paint (no flash).
  (function () {
    try {
      var t = localStorage.getItem('awaaz-theme') === 'classic' ? 'classic' : 'haunted';
      document.documentElement.setAttribute('data-theme', t);
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', t === 'classic' ? '#0f766e' : '#0f0b14');
    } catch (e) {}
  })();
</script>
<style>
  :root {
    color-scheme: dark;
    --surface: #0f0b14; --card: #1e1430; --raised: #2a1b45; --ink: #f3eee4; --muted: #bdb1d1;
    --border: #8f7bbf; --border-soft: #3b2a5e; --halo: #0f0b14;
    --order: #ff7a1a; --order-text: #ff7a1a; --order-ink: #1a0b00;
    --bill: #54e0c2; --bill-text: #54e0c2; --bill-ink: #04201a;
    --ghost: #f3eee4; --ghost-eye: #1e1430;
    font-family: "Noto Sans", "Noto Sans Devanagari", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  [data-theme="classic"] {
    color-scheme: light;
    --surface: #f6faf9; --card: #ffffff; --raised: #eef5f3; --ink: #1b1b1f; --muted: #52525b;
    --border: #71717a; --border-soft: #d4d4d8; --halo: #ffffff;
    --order: #e8710a; --order-text: #9a4a00; --order-ink: #1b1b1f;
    --bill: #0f766e; --bill-text: #0f766e; --bill-ink: #ffffff;
    --ghost: #ffffff; --ghost-eye: #1b1b1f;
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--surface); color: var(--ink); line-height: 1.5; padding: 1rem 1.25rem 3rem; }
  main { width: 100%; max-width: 44rem; margin: 0 auto; }
  .top { display: flex; justify-content: flex-end; padding-bottom: .5rem; }
  .toggle { display: inline-flex; align-items: center; gap: .5rem; min-height: 44px; min-width: 44px; padding: 0 .75rem; border: 1px solid var(--border); border-radius: 12px; background: transparent; color: var(--ink); font: inherit; font-weight: 700; font-size: .9rem; cursor: pointer; }
  .toggle:hover { background: var(--raised); }
  .hero { text-align: center; padding: 1rem 0 1.75rem; }
  .ghost { animation: float 3.4s cubic-bezier(0.2, 0, 0, 1) infinite; }
  .eyebrow { margin: .75rem 0 0; font-size: 1rem; font-weight: 700; color: var(--order-text); }
  h1 { font-size: 2.75rem; line-height: 1.05; letter-spacing: -0.025em; margin: .25rem 0 .75rem; }
  .lead { font-size: 1.1rem; margin: 0 auto .5rem; max-width: 34rem; color: var(--muted); }
  .tagline { margin: 0; font-weight: 700; }
  .cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); padding: 0; margin: 0; }
  a.card { display: flex; flex-direction: column; gap: .75rem; height: 100%; padding: 1.5rem; background: var(--card); border: 1px solid var(--border-soft); border-radius: 16px; text-decoration: none; color: inherit; transition: border-color 180ms cubic-bezier(0.2, 0, 0, 1); }
  a.card.order { border-top: 4px solid var(--order); }
  a.card.bill { border-top: 4px solid var(--bill); }
  a.card:hover { border-color: var(--border); }
  a:focus-visible, button:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
  .card h2 { margin: 0; font-size: 1.4rem; display: flex; align-items: center; gap: .5rem; }
  .card.order h2 { color: var(--order-text); }
  .card.bill h2 { color: var(--bill-text); }
  .card p { margin: 0; flex: 1; }
  .go { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 1rem; border-radius: 12px; font-weight: 650; }
  .order .go { background: var(--order); color: var(--order-ink); }
  .bill .go { background: var(--bill); color: var(--bill-ink); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
  footer { margin-top: 2rem; font-size: .9rem; color: var(--muted); text-align: center; }
  @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  @media (prefers-reduced-motion: reduce) { .ghost { animation: none; } * { transition-duration: .01ms !important; } }
  @media (hover: hover) { a.card:hover .go { text-decoration: underline; text-underline-offset: 4px; } }
</style>
</head>
<body>
<main>
  <div class="top">
    <button type="button" class="toggle" id="theme-toggle" aria-pressed="true">
      <span aria-hidden="true" id="theme-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></span>
      <span class="sr-only">Theme: </span>
      <span id="theme-label">Haunted</span>
    </button>
  </div>
  <header class="hero">
    <svg class="ghost" aria-hidden="true" focusable="false" width="96" height="96" viewBox="0 0 64 64">
      <path d="M32 6C19.3 6 10 15.6 10 28v26c0 2.2 2.4 3.5 4.2 2.2l4.6-3.3 5.1 3.7a3 3 0 0 0 3.5 0L32 53l4.6 3.6a3 3 0 0 0 3.5 0l5.1-3.7 4.6 3.3c1.8 1.3 4.2 0 4.2-2.2V28C54 15.6 44.7 6 32 6z" fill="var(--ghost)" stroke="var(--border)" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="25" cy="27" rx="3.6" ry="4.6" fill="var(--ghost-eye)"/>
      <ellipse cx="39" cy="27" rx="3.6" ry="4.6" fill="var(--ghost-eye)"/>
      <ellipse cx="32" cy="38" rx="3.4" ry="4" fill="var(--ghost-eye)"/>
    </svg>
    <p class="eyebrow">Happy Kiroween</p>
    <h1>Awaaz Kit</h1>
    <p class="lead">Speak in Hindi, Hinglish or English. Your shop's orders and bills are captured on this device, even offline.</p>
    <p class="tagline">Speak to the spirits of your shop. Offline. Honest. No guesses.</p>
  </header>
  <nav aria-label="Apps">
    <ul class="cards" style="list-style:none">
      <li>
        <a class="card order" href="/order/">
          <h2><svg aria-hidden="true" focusable="false" width="26" height="26" viewBox="0 0 32 32"><path d="M16 7c0-2.4 1-4 3-5" fill="none" stroke="#7ee2a0" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="9.5" cy="19" rx="6.5" ry="9" fill="#ff7a1a"/><ellipse cx="22.5" cy="19" rx="6.5" ry="9" fill="#ff7a1a"/><ellipse cx="16" cy="19" rx="6" ry="10" fill="#ff9a45"/><path d="M10.5 15l2.8 3.4h-5.6zM21.5 15l2.8 3.4h-5.6z" fill="#1a0b00"/><path d="M10 23.5l2.2 1.6 1.8-1.4 2 1.4 2-1.4 1.8 1.4 2.2-1.6" fill="none" stroke="#1a0b00" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg> Order Awaaz</h2>
          <p>Speak a customer's order, check it, and save it.</p>
          <span class="go">Open Order Awaaz &rarr;</span>
        </a>
      </li>
      <li>
        <a class="card bill" href="/bill/">
          <h2><svg aria-hidden="true" focusable="false" width="26" height="26" viewBox="0 0 64 64"><path d="M32 6C19.3 6 10 15.6 10 28v26c0 2.2 2.4 3.5 4.2 2.2l4.6-3.3 5.1 3.7a3 3 0 0 0 3.5 0L32 53l4.6 3.6a3 3 0 0 0 3.5 0l5.1-3.7 4.6 3.3c1.8 1.3 4.2 0 4.2-2.2V28C54 15.6 44.7 6 32 6z" fill="var(--ghost)" stroke="var(--border)" stroke-width="2" stroke-linejoin="round"/><ellipse cx="25" cy="27" rx="3.6" ry="4.6" fill="var(--ghost-eye)"/><ellipse cx="39" cy="27" rx="3.6" ry="4.6" fill="var(--ghost-eye)"/><ellipse cx="32" cy="38" rx="3.4" ry="4" fill="var(--ghost-eye)"/></svg> Bill Awaaz</h2>
          <p>Speak the items, get an exact total and a printable receipt.</p>
          <span class="go">Open Bill Awaaz &rarr;</span>
        </a>
      </li>
    </ul>
  </nav>
  <footer>Both apps share one catalog and one speech-model cache on this device.</footer>
</main>
<script>
  (function () {
    var root = document.documentElement;
    var btn = document.getElementById('theme-toggle');
    var label = document.getElementById('theme-label');
    var icon = document.getElementById('theme-icon');
    function paint() {
      var haunted = root.getAttribute('data-theme') !== 'classic';
      btn.setAttribute('aria-pressed', haunted ? 'true' : 'false');
      label.textContent = haunted ? 'Haunted' : 'Classic';
      icon.innerHTML = haunted ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>';
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', haunted ? '#0f0b14' : '#0f766e');
    }
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'classic' ? 'haunted' : 'classic';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('awaaz-theme', next); } catch (e) {}
      paint();
    });
    paint();
  })();
</script>
</body>
</html>
`;
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const { dir, route } of apps) {
  const src = path.join(root, 'apps', dir, 'dist');
  try {
    await access(src);
  } catch {
    console.error(`Missing ${path.relative(root, src)}. Build the apps first (pnpm build).`);
    process.exit(1);
  }
  await cp(src, path.join(out, route), { recursive: true });
}

await writeFile(path.join(out, 'index.html'), hubHtml, 'utf8');
console.log('Combined build written to dist/ (index.html, order/, bill/)');
