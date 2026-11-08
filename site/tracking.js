// Anonymous play data for the game library (GitHub Pages hub only; build-site.mjs inlines this file).
// Games never touch the network: they queue events in localStorage ("kit-games:events") and only while the
// visitor said yes ("kit-games:consent" = "granted"). This script asks once (all or nothing), sends the queue
// to PostHog whenever the browser is online and wipes everything when the answer is no. See docs/tracking.md.
(function () {
  'use strict';
  var HOST = 'https://eu.i.posthog.com/batch/';
  var TOKEN = 'phc_lwXaBAcdtlazpEFag8a95TOYpCXZeUoj1bnzYHY4cQY'; // public project token (write-only)
  var P = 'kit-games:';
  var sending = false;

  function get(k) { try { return localStorage.getItem(P + k); } catch (e) { return null; } }
  function set(k, v) { try { if (v === null) localStorage.removeItem(P + k); else localStorage.setItem(P + k, v); } catch (e) {} }
  function queue() { try { var q = JSON.parse(get('events') || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; } }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.random() * 256; });
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    return Array.prototype.map.call(b, function (x, i) { return ([4, 6, 8, 10].indexOf(i) >= 0 ? '-' : '') + (x + 256).toString(16).slice(1); }).join('');
  }

  // ---- sending -----------------------------------------------------------------------------
  function flush() {
    if (get('consent') !== 'granted' || sending || !navigator.onLine) return;
    var q = queue();
    if (!q.length) return;
    var batch = q.slice(0, 50), id = get('anon-id');
    if (!id) { id = uuid(); set('anon-id', id); }
    sending = true;
    fetch(HOST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        api_key: TOKEN,
        batch: batch.map(function (e) {
          var p = e.properties || {};
          p.$process_person_profile = false; // anonymous: no person profile
          p.$geoip_disable = true;
          p.$lib = 'blackout-games';
          return { event: e.event, uuid: uuid(), distinct_id: id, properties: p, timestamp: e.timestamp };
        }),
      }),
    }).then(function (r) {
      // A rejected batch (4xx) would block the queue forever, so drop it; network and 5xx errors retry later.
      if (!r.ok && !(r.status >= 400 && r.status < 500)) throw new Error(String(r.status));
      sending = false;
      if (get('consent') !== 'granted') return;
      var rest = queue().slice(batch.length);
      set('events', JSON.stringify(rest));
      if (rest.length) flush();
    }).catch(function () { sending = false; });
  }

  // ---- consent -----------------------------------------------------------------------------
  function decide(yes) {
    set('consent', yes ? 'granted' : 'denied');
    if (!yes) { set('events', null); set('anon-id', null); }
    var b = document.getElementById('tk-back'); if (b) b.remove();
    renderToggle();
    if (yes) flush();
  }

  var css = document.createElement('style');
  css.textContent =
    '.tk-back{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:var(--space-4,16px);background:rgba(0,0,0,.6)}' +
    '.tk-card{max-width:30rem;width:100%;max-height:100%;overflow-y:auto;background:var(--color-surface,#222);color:var(--color-text,#eee);border:1px solid var(--color-accent,#d4a24c);border-radius:var(--radius-md,8px);padding:var(--space-6,24px);box-shadow:0 12px 40px rgba(0,0,0,.45)}' +
    '.tk-k{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--color-accent,#d4a24c)}' +
    '.tk-card h2{font-family:var(--font-heading,inherit);font-size:30px;font-weight:600;line-height:1.1;margin:6px 0 12px;text-transform:none;letter-spacing:0;color:inherit}' +
    '.tk-card p,.tk-card li{font-size:14px;line-height:1.6;margin:0 0 10px}' +
    '.tk-card ul{margin:0 0 14px;padding-left:1.1rem}' +
    '.tk-act{display:flex;flex-wrap:wrap;gap:var(--space-2,8px);margin-top:var(--space-4,16px)}' +
    '.tk-act button{flex:1 1 12rem;cursor:pointer;font-family:var(--font-heading,inherit);font-weight:600;font-size:17px;padding:10px 20px;border-radius:var(--radius-md,8px);border:1px solid var(--color-accent,#d4a24c)}' +
    '.tk-yes{background:var(--color-accent,#d4a24c);color:#1a1917}' +
    '.tk-no{background:transparent;color:var(--color-text,#eee);border-color:var(--color-divider,#555)!important}' +
    '.tk-card .tk-fine{font-size:12px;color:var(--color-neutral-700,#999);margin:12px 0 0}' +
    '.tk-toggle{align-self:flex-start;background:none;border:0;padding:0;font:inherit;font-size:12px;color:var(--color-neutral-700,#999);text-decoration:underline;cursor:pointer}';
  document.head.appendChild(css);

  function ask() {
    if (document.getElementById('tk-back')) return;
    var d = document.createElement('div');
    d.id = 'tk-back'; d.className = 'tk-back'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'tk-h');
    d.innerHTML =
      '<div class="tk-card"><span class="tk-k">Help build these games</span>' +
      '<h2 id="tk-h">Share anonymous play data?</h2>' +
      '<p>These games are still being built, and the most useful thing for their development is to <b>understand how the levels are actually played</b>: which are too easy, which are too hard, where players get stuck.</p>' +
      '<ul><li><b>Collected:</b> which level, how it ended (cleared, lost, given up), how long it took, how many moves and helpers were used.</li>' +
      '<li><b>Not collected:</b> no name, no account, no cookies, no tracking across sites. Only a random ID that cannot be linked to you.</li></ul>' +
      '<p>It also works offline: data is kept on this device and sent once you are online.</p>' +
      '<div class="tk-act"><button class="tk-yes" type="button">Yes, help improve the games</button><button class="tk-no" type="button">No thanks</button></div>' + '</div>';
    d.querySelector('.tk-yes').onclick = function () { decide(true); };
    d.querySelector('.tk-no').onclick = function () { decide(false); };
    document.body.appendChild(d);
    d.querySelector('.tk-yes').focus();
  }

  function renderToggle() {
    var foot = document.querySelector('.g-side-foot');
    if (!foot) return;
    var b = document.getElementById('tk-toggle');
    if (!b) { b = document.createElement('button'); b.id = 'tk-toggle'; b.type = 'button'; b.className = 'tk-toggle'; foot.appendChild(b); }
    var on = get('consent') === 'granted';
    b.textContent = 'Anonymous play data: ' + (on ? 'on' : 'off') + ' (change)';
    b.onclick = ask;
  }

  renderToggle();
  if (get('consent') === null) ask();
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) flush(); });
  setInterval(flush, 30000);
  flush();
})();
