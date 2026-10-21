/* Map with a button per pinned tile provider and a picker for all of them (providers.js). */
(function () {
  'use strict';

  const START = { lat: 51.16, lon: 9.27, zoom: 10 };
  const PROVIDER_KEY = 'tsm-provider';
  const OVERLAYS_KEY = 'tsm-overlays';
  const PINS_KEY = 'tsm-pins';
  const KEYS_KEY = 'tsm-keys';
  const FASTZOOM_KEY = 'tsm-fastzoom';

  function load(name, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(name));
      return v ?? fallback;
    } catch { return fallback; }
  }
  function save(name, value) {
    try { localStorage.setItem(name, JSON.stringify(value)); } catch { /* ignore */ }
  }

  // ---------- Map ----------
  // Continuous ("lens") zoom: no snapping to whole zoom levels, so pinch and trackpad zoom glide
  // and stop wherever the fingers stop. Tiles of the nearest level are scaled in between.
  const map = L.map('map', {
    zoomControl: true, worldCopyJump: true,
    zoomSnap: 0,               // keep fractional zoom after pinch / wheel / fitBounds
    zoomDelta: 1,              // +/- buttons and keyboard: whole steps
    scrollWheelZoom: false,    // replaced by SmoothWheelZoom below
    fadeAnimation: false,      // tile fade-in runs a JS loop over every tile on each frame; skip it
    maxZoom: 20,
  });

  // ---------- Faster zooming ----------
  // When on, tile layers skip fetching intermediate zoom levels during zoom animations
  // (Leaflet's updateWhenZooming, read on every view change, so toggling the option is enough).
  // Defaults to on for slow connections or data saver.
  const conn = navigator.connection || {};
  let fastZoom = Boolean(conn.saveData) || ['slow-2g', '2g', '3g'].includes(conn.effectiveType);
  try {
    const saved = localStorage.getItem(FASTZOOM_KEY);
    if (saved) fastZoom = saved === 'fast';
  } catch { /* ignore */ }

  // Wheel and trackpad zoom that glides frame by frame towards a target, instead of Leaflet's
  // debounced jumps with a CSS animation in between. Each wheel event moves the target; every
  // animation frame moves the map part of the way there, keeping the point under the cursor fixed.
  const SmoothWheelZoom = L.Handler.extend({
    addHooks() { L.DomEvent.on(this._map._container, 'wheel', this._onWheel, this); },
    removeHooks() { L.DomEvent.off(this._map._container, 'wheel', this._onWheel, this); this._end(); },

    _onWheel(e) {
      L.DomEvent.preventDefault(e);
      const map = this._map;
      if (map._animatingZoom) return; // let a running button / double-click zoom finish first
      // Pixels per zoom level: trackpad pinch (sent as ctrl+wheel) reacts more strongly than a
      // mouse wheel or two-finger scroll. Line/page deltas (Firefox) are turned into pixels.
      const px = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
      const delta = -px / (e.ctrlKey ? 60 : 130);
      if (!this._active) {
        map._stop();
        this._active = true;
        this._goal = map.getZoom();
        this._last = performance.now();
        map._moveStart(true, false);
        this._frame = requestAnimationFrame(this._step.bind(this));
      }
      this._pinch = e.ctrlKey;
      this._goal = map._limitZoom(this._goal + Math.max(-2, Math.min(2, delta)));
      this._mouse = map.mouseEventToContainerPoint(e);
      this._anchor = map.containerPointToLatLng(this._mouse);
      this._lastWheel = performance.now();
    },

    _step(now) {
      const map = this._map;
      const dt = Math.min(64, now - this._last);
      this._last = now;
      const zoom = map.getZoom();
      // Time-based easing (same feel at 60 and 120 Hz): pinch follows the fingers almost directly.
      const k = 1 - Math.exp(-dt / (this._pinch ? 25 : 70));
      const diff = this._goal - zoom;
      const next = Math.abs(diff) < 0.002 ? this._goal : zoom + diff * k;
      if (next !== zoom) {
        const offset = this._mouse.subtract(map.getSize().divideBy(2));
        const center = map.unproject(map.project(this._anchor, next).subtract(offset), next);
        // pinch: tile layers just scale during the gesture; with "faster zooming" off they also
        // load the levels they pass through.
        map._move(center, next, { pinch: fastZoom, round: false });
      }
      if (next === this._goal && now - this._lastWheel > 80) this._end();
      else this._frame = requestAnimationFrame(this._step.bind(this));
    },

    _end() {
      if (!this._active) return;
      cancelAnimationFrame(this._frame);
      this._active = false;
      this._map._moveEnd(true);
    },
  });
  map.addHandler('smoothWheelZoom', SmoothWheelZoom);
  map.smoothWheelZoom.enable();

  // ---------- Shareable links (#map=zoom/lat/lon&p=provider&o=overlay,overlay) ----------
  function parseHash() {
    const out = {};
    const params = new URLSearchParams(location.hash.slice(1));
    const m = (params.get('map') || '').split('/').map(Number);
    if (m.length === 3 && m.every(Number.isFinite)) {
      out.zoom = Math.min(20, Math.max(1, m[0]));
      out.lat = m[1];
      out.lon = m[2];
    }
    if (params.get('p')) out.provider = params.get('p');
    if (params.has('o')) out.overlays = params.get('o').split(',').filter(Boolean);
    return out;
  }
  let hashTimer = null;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const c = map.getCenter().wrap();
      let h = `#map=${+map.getZoom().toFixed(2)}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}&p=${current}`;
      if (overlays.size) h += `&o=${[...overlays].join(',')}`;
      if (h !== location.hash) history.replaceState(null, '', h);
    }, 300);
  }

  const hash = parseHash();
  if (hash.zoom != null) map.setView([hash.lat, hash.lon], hash.zoom);
  else map.setView([START.lat, START.lon], START.zoom);

  // ---------- API keys ----------
  // Bring your own key: kept in this browser only (localStorage) and sent only to the service it
  // belongs to, appended to its tile URLs. Never put into the shareable link.
  let keys = load(KEYS_KEY, {});
  const byId = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));
  const keyOptional = (k) => Boolean(k.optional && (!k.keylessHosts || k.keylessHosts.includes(location.hostname)));
  const missingKey = (p) => Boolean(p.key && !keyOptional(TILE_KEYS[p.key]) && !keys[p.key]);
  function withKey(p, url) {
    const key = p.key && keys[p.key];
    if (!key) return url;
    return `${url}${url.includes('?') ? '&' : '?'}${TILE_KEYS[p.key].param}=${encodeURIComponent(key)}`;
  }

  // ---------- Tile layers ----------
  // Built on first use. crossOrigin: tiles are fetched with CORS so the service worker can keep
  // them for offline use (no-CORS responses can't be inspected and count several MB each against
  // the storage quota). If a provider turns out not to send CORS headers, its layers fall back to
  // plain image loads, which still land in the browser's HTTP cache.
  const layers = {};
  function getLayer(id) {
    return layers[id] || (layers[id] = buildLayer(byId[id], true));
  }
  function buildLayer(p, cors) {
    const group = L.layerGroup(p.layers.map(({ url, ...opts }) => L.tileLayer(withKey(p, url), {
      maxZoom: 20, crossOrigin: cors, updateWhenZooming: !fastZoom, zIndex: p.overlay ? 10 : 1, ...opts,
    })));
    watchTiles(p, group, cors);
    return group;
  }
  function watchTiles(p, group, cors) {
    let loaded = 0, failed = 0;
    group.eachLayer((l) => {
      l.on('tileload', () => { loaded++; });
      l.on('tileerror', () => {
        if (++failed !== 4 || loaded > 0) return;
        if (cors) {
          // Every tile so far failed: most likely a missing Access-Control-Allow-Origin header.
          console.warn(`${p.id}: tiles fail with CORS, loading them without`);
          replaceLayer(p.id, buildLayer(p, false));
        } else {
          toast(`${p.label}: tiles don't load.${p.key ? ` Check your ${TILE_KEYS[p.key].label} key.` : ''}`,
            p.key ? ['Keys…', () => openKeys(p.key)] : null);
        }
      });
    });
  }
  function replaceLayer(id, layer) {
    const old = layers[id];
    layers[id] = layer;
    if (old && map.hasLayer(old)) { map.removeLayer(old); layer.addTo(map); }
  }

  // ---------- Base map and overlays ----------
  let current = DEFAULT_PINS[0];
  const savedBase = load(PROVIDER_KEY, null);
  if (byId[savedBase] && !byId[savedBase].overlay) current = savedBase;
  if (byId[hash.provider] && !byId[hash.provider].overlay) current = hash.provider;
  if (missingKey(byId[current])) current = DEFAULT_PINS[0];

  const overlays = new Set();
  const wantedOverlays = hash.overlays || load(OVERLAYS_KEY, []);

  let pins = load(PINS_KEY, DEFAULT_PINS).filter((id) => byId[id]);

  /* Moves the map into the provider's area when it has tiles only there. */
  function showArea(p) {
    const minZoom = p.minZoom || 0;
    if (p.bounds) {
      const b = L.latLngBounds(p.bounds);
      if (!b.contains(map.getCenter())) { map.setView(b.getCenter(), Math.max(map.getBoundsZoom(b), minZoom)); return; }
    }
    if (map.getZoom() < minZoom) map.setZoom(minZoom);
  }

  function setBase(id, { move = false } = {}) {
    const p = byId[id];
    if (!p || p.overlay) return;
    if (missingKey(p)) { openKeys(p.key, () => setBase(id, { move })); return; }
    if (layers[current] && map.hasLayer(layers[current])) map.removeLayer(layers[current]);
    current = id;
    getLayer(id).addTo(map);
    document.body.classList.toggle('dark-tiles', Boolean(p.dark));
    if (move) showArea(p);
    save(PROVIDER_KEY, id);
    writeHash();
    render();
  }

  function setOverlay(id, on, { move = false } = {}) {
    const p = byId[id];
    if (!p || !p.overlay) return;
    if (on && missingKey(p)) { openKeys(p.key, () => setOverlay(id, true, { move })); return; }
    if (on) {
      overlays.add(id);
      getLayer(id).addTo(map);
      if (move) showArea(p);
    } else {
      overlays.delete(id);
      if (layers[id]) map.removeLayer(layers[id]);
    }
    save(OVERLAYS_KEY, [...overlays]);
    writeHash();
    render();
  }

  function pick(id) {
    const p = byId[id];
    if (p.overlay) setOverlay(id, !overlays.has(id), { move: true });
    else setBase(id, { move: true });
  }

  function togglePin(id) {
    pins = pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id];
    save(PINS_KEY, pins);
    render();
  }

  const isOn = (id) => id === current || overlays.has(id);

  // ---------- Pinned buttons ----------
  let bar = null;
  const ProviderControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      bar = L.DomUtil.create('div', 'leaflet-control providers');
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Maps');
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.disableScrollPropagation(bar);
      return bar;
    },
  });
  map.addControl(new ProviderControl());

  function renderBar() {
    bar.textContent = '';
    for (const id of pins) {
      const p = byId[id];
      const btn = L.DomUtil.create('button', 'provider-btn', bar);
      btn.type = 'button';
      btn.title = p.overlay ? `${p.label} (overlay)` : p.label;
      btn.innerHTML = `<span class="icon" aria-hidden="true">${p.icon}</span><span class="label"></span>`;
      btn.querySelector('.label').textContent = p.label;
      btn.classList.toggle('overlay', Boolean(p.overlay));
      btn.classList.toggle('active', isOn(id));
      btn.setAttribute('aria-pressed', String(isOn(id)));
      btn.addEventListener('click', () => pick(id));
    }
    const more = L.DomUtil.create('button', 'provider-btn more-btn', bar);
    more.type = 'button';
    more.title = 'All maps and overlays';
    more.setAttribute('aria-expanded', String(!catalog.hidden));
    more.innerHTML = `<span class="icon" aria-hidden="true">☰</span><span class="label">All maps (${PROVIDERS.length})</span>`;
    more.addEventListener('click', () => toggleCatalog());
    // On phones the buttons are a sideways-scrolling row: keep the active one visible.
    bar.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---------- Picker with every provider ----------
  const catalog = document.createElement('div');
  catalog.className = 'catalog';
  catalog.hidden = true;
  catalog.setAttribute('role', 'dialog');
  catalog.setAttribute('aria-label', 'All maps');
  catalog.innerHTML = `
    <div class="catalog-head">
      <input type="search" placeholder="Search ${PROVIDERS.length} maps and overlays" aria-label="Search maps">
      <button type="button" class="close-btn" aria-label="Close">✕</button>
    </div>
    <div class="catalog-list"></div>
    <div class="catalog-foot">
      <button type="button" class="keys-btn">🔑 API keys…</button>
      <span>☆ shows a map as a button</span>
    </div>`;
  document.body.append(catalog);
  const search = catalog.querySelector('input');
  const list = catalog.querySelector('.catalog-list');
  catalog.querySelector('.close-btn').addEventListener('click', () => toggleCatalog(false));
  catalog.querySelector('.keys-btn').addEventListener('click', () => openKeys());
  search.addEventListener('input', renderCatalog);
  catalog.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleCatalog(false); });

  function toggleCatalog(show = catalog.hidden) {
    catalog.hidden = !show;
    renderBar();
    if (show) {
      renderCatalog();
      search.focus();
      list.querySelector('.pick.active')?.scrollIntoView({ block: 'center' });
    }
  }

  function renderCatalog() {
    if (catalog.hidden) return;
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (p) => {
      const text = `${p.label} ${p.group} ${p.key ? TILE_KEYS[p.key].label : ''}`.toLowerCase();
      return words.every((w) => text.includes(w));
    };
    list.textContent = '';
    for (const [title, overlay] of [['Base maps', false], ['Overlays', true]]) {
      const shown = PROVIDERS.filter((p) => Boolean(p.overlay) === overlay && matches(p));
      if (!shown.length) continue;
      const h = document.createElement('h2');
      h.textContent = title;
      list.append(h);
      const groups = new Map();
      for (const p of shown) {
        if (!groups.has(p.group)) groups.set(p.group, []);
        groups.get(p.group).push(p);
      }
      for (const [group, items] of groups) {
        const section = document.createElement('section');
        const keyed = items[0].key && items.every((p) => p.key === items[0].key) ? TILE_KEYS[items[0].key] : null;
        section.innerHTML = `<h3></h3><ul></ul>`;
        section.querySelector('h3').textContent = group;
        if (keyed) {
          const tag = document.createElement('span');
          tag.className = 'key-tag';
          tag.textContent = keys[items[0].key] ? '🔑 key set' : keyOptional(keyed) ? '🔑 key optional' : '🔑 needs key';
          section.querySelector('h3').append(' ', tag);
        }
        const ul = section.querySelector('ul');
        for (const p of items) ul.append(catalogItem(p, keyed));
        list.append(section);
      }
    }
    if (!list.children.length) list.innerHTML = '<p class="empty">No map matches.</p>';
  }

  function catalogItem(p, groupKeyed) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pick';
    btn.classList.toggle('active', isOn(p.id));
    btn.classList.toggle('locked', missingKey(p));
    btn.setAttribute('aria-pressed', String(isOn(p.id)));
    btn.innerHTML = `<span class="icon" aria-hidden="true">${p.overlay ? (isOn(p.id) ? '☑' : '☐') : p.icon}</span><span class="label"></span>`;
    btn.querySelector('.label').textContent = p.label;
    if (p.key && !groupKeyed && missingKey(p)) btn.querySelector('.label').append(' 🔑');
    if (missingKey(p)) btn.title = `Needs a ${TILE_KEYS[p.key].label} key`;
    btn.addEventListener('click', () => pick(p.id));
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'pin';
    const pinned = pins.includes(p.id);
    pin.textContent = pinned ? '★' : '☆';
    pin.setAttribute('aria-pressed', String(pinned));
    pin.setAttribute('aria-label', `Show ${p.label} as a button`);
    pin.title = pinned ? 'Remove the button' : 'Show as a button';
    pin.addEventListener('click', () => togglePin(p.id));
    li.append(btn, pin);
    return li;
  }

  function render() {
    renderBar();
    renderCatalog();
  }

  // ---------- Key dialog ----------
  const dialog = document.createElement('dialog');
  dialog.className = 'keys';
  dialog.innerHTML = `
    <form method="dialog">
      <h2>API keys</h2>
      <p class="hint">Some providers need your own key. Keys stay in this browser (local storage)
        and are only sent to their provider, with each tile request. They're not part of shared links.
        Anyone using this browser can read them, so use keys limited to this site where the provider allows it.</p>
      <div class="key-rows"></div>
      <label class="show"><input type="checkbox"> Show keys</label>
      <div class="actions">
        <button type="button" class="cancel">Cancel</button>
        <button type="submit" value="save" class="primary">Save</button>
      </div>
    </form>`;
  document.body.append(dialog);
  const rows = dialog.querySelector('.key-rows');
  for (const [id, k] of Object.entries(TILE_KEYS)) {
    const count = PROVIDERS.filter((p) => p.key === id).length;
    const row = document.createElement('div');
    row.className = 'key-row';
    row.dataset.key = id;
    row.innerHTML = `
      <label><span class="name"></span> <small></small>
        <input type="password" name="${id}" autocomplete="off" spellcheck="false"></label>
      <a target="_blank" rel="noopener noreferrer">Get a key ↗</a>
      <p class="note"></p>`;
    row.querySelector('.name').textContent = k.label;
    row.querySelector('small').textContent = `${count} map${count === 1 ? '' : 's'}${keyOptional(k) ? ', optional' : ''}`;
    row.querySelector('a').href = k.signup;
    row.querySelector('.note').textContent = k.optional || '';
    rows.append(row);
  }
  // A plain button, so Enter in a key field submits (saves) instead of cancelling.
  dialog.querySelector('.cancel').addEventListener('click', () => dialog.close('cancel'));
  dialog.querySelector('.show input').addEventListener('change', (e) => {
    for (const input of rows.querySelectorAll('input')) input.type = e.target.checked ? 'text' : 'password';
  });

  let afterKeys = null;
  function openKeys(focus, then = null) {
    afterKeys = then;
    for (const input of rows.querySelectorAll('input')) input.value = keys[input.name] || '';
    for (const row of rows.children) row.classList.toggle('wanted', row.dataset.key === focus);
    dialog.showModal();
    const target = focus && rows.querySelector(`input[name="${focus}"]`);
    if (target) { target.scrollIntoView({ block: 'center' }); target.focus(); }
  }

  dialog.addEventListener('close', () => {
    const then = afterKeys;
    afterKeys = null;
    if (dialog.returnValue !== 'save') return;
    const changed = new Set();
    const next = {};
    for (const input of rows.querySelectorAll('input')) {
      const v = input.value.trim();
      if (v) next[input.name] = v;
      if ((keys[input.name] || '') !== v) changed.add(input.name);
    }
    keys = next;
    save(KEYS_KEY, keys);
    // Rebuild the layers that use a changed key; the visible ones are swapped in place.
    for (const p of PROVIDERS) {
      if (!p.key || !changed.has(p.key) || !layers[p.id]) continue;
      const shown = map.hasLayer(layers[p.id]);
      if (shown && missingKey(p)) {
        if (p.overlay) setOverlay(p.id, false);
        else setBase(DEFAULT_PINS[0]);
        delete layers[p.id];
      } else if (shown) {
        replaceLayer(p.id, buildLayer(p, true));
      } else {
        delete layers[p.id];
      }
    }
    render();
    then?.();
  });

  // ---------- Messages ----------
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.hidden = true;
  document.body.append(toastEl);
  let toastTimer = null;
  function toast(text, action) {
    toastEl.textContent = text;
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action[0];
      btn.addEventListener('click', () => { toastEl.hidden = true; action[1](); });
      toastEl.append(' ', btn);
    }
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 8000);
  }

  // ---------- Faster zooming toggle ----------
  const FastZoomControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const btn = L.DomUtil.create('button', 'fastzoom-btn', wrap);
      btn.type = 'button';
      btn.textContent = '⚡';
      const render = () => {
        btn.title = fastZoom ? 'Faster zooming: on (skips tiles while zooming)' : 'Faster zooming: off';
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-pressed', String(fastZoom));
        btn.classList.toggle('active', fastZoom);
      };
      btn.addEventListener('click', () => {
        fastZoom = !fastZoom;
        for (const group of Object.values(layers)) group.eachLayer((l) => { l.options.updateWhenZooming = !fastZoom; });
        try { localStorage.setItem(FASTZOOM_KEY, fastZoom ? 'fast' : 'all'); } catch { /* ignore */ }
        render();
      });
      render();
      L.DomEvent.disableClickPropagation(wrap);
      return wrap;
    },
  });
  map.addControl(new FastZoomControl());

  setBase(current);
  for (const id of wantedOverlays) if (byId[id]?.overlay && !missingKey(byId[id])) setOverlay(id, true);
  map.on('moveend', writeHash);
  window.addEventListener('hashchange', () => {
    const h = parseHash();
    if (h.zoom != null) map.setView([h.lat, h.lon], h.zoom, { animate: false });
    if (h.provider && h.provider !== current) setBase(h.provider);
    if (h.overlays) {
      for (const id of [...overlays]) if (!h.overlays.includes(id)) setOverlay(id, false);
      for (const id of h.overlays) if (!overlays.has(id)) setOverlay(id, true);
    }
  });

  // sw.js caches the app and every map tile seen, so the map opens without signal.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('service worker:', err));
  }
})();
