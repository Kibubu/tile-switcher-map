/* Map with one button per tile provider (providers.js). */
(function () {
  'use strict';

  const START = { lat: 51.16, lon: 9.27, zoom: 10 };
  const PROVIDER_KEY = 'tsm-provider';
  const FASTZOOM_KEY = 'tsm-fastzoom';

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

  // ---------- Shareable links (#map=zoom/lat/lon&p=provider) ----------
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
    return out;
  }
  let hashTimer = null;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const c = map.getCenter().wrap();
      const h = `#map=${+map.getZoom().toFixed(2)}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}&p=${current}`;
      if (h !== location.hash) history.replaceState(null, '', h);
    }, 300);
  }

  const hash = parseHash();
  if (hash.zoom != null) map.setView([hash.lat, hash.lon], hash.zoom);
  else map.setView([START.lat, START.lon], START.zoom);

  // ---------- Providers ----------
  // crossOrigin: tiles are fetched with CORS so the service worker can keep them for offline use
  // (no-CORS responses can't be inspected and count several MB each against the storage quota).
  // If a provider turns out not to send CORS headers, its layers fall back to plain image loads,
  // which still land in the browser's HTTP cache.
  const layers = {};
  function buildLayer(p, cors) {
    const group = L.layerGroup(p.layers.map(({ url, ...opts }) => L.tileLayer(url, {
      maxZoom: 20, crossOrigin: cors, updateWhenZooming: !fastZoom, ...opts,
    })));
    if (cors) watchCors(p, group);
    return group;
  }
  function watchCors(p, group) {
    let loaded = 0, failed = 0;
    group.eachLayer((l) => {
      l.on('tileload', () => { loaded++; });
      l.on('tileerror', () => {
        if (++failed < 4 || loaded > 0) return;
        // Every tile so far failed: most likely a missing Access-Control-Allow-Origin header.
        console.warn(`${p.id}: tiles fail with CORS, loading them without`);
        const plain = buildLayer(p, false);
        layers[p.id] = plain;
        if (map.hasLayer(group)) { map.removeLayer(group); plain.addTo(map); }
      });
    });
  }
  for (const p of PROVIDERS) layers[p.id] = buildLayer(p, true);
  const byId = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

  let current = PROVIDERS[0].id;
  try { if (byId[localStorage.getItem(PROVIDER_KEY)]) current = localStorage.getItem(PROVIDER_KEY); } catch { /* ignore */ }
  if (byId[hash.provider]) current = hash.provider;

  const buttons = {};
  function setProvider(id) {
    if (!byId[id]) return;
    if (map.hasLayer(layers[current])) map.removeLayer(layers[current]);
    current = id;
    layers[id].addTo(map);
    document.body.classList.toggle('dark-tiles', Boolean(byId[id].dark));
    for (const [bid, btn] of Object.entries(buttons)) {
      btn.classList.toggle('active', bid === id);
      btn.setAttribute('aria-pressed', String(bid === id));
    }
    // On phones the buttons are a sideways-scrolling row: keep the active one visible.
    buttons[id]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    try { localStorage.setItem(PROVIDER_KEY, id); } catch { /* ignore */ }
    writeHash();
  }

  const ProviderControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const bar = L.DomUtil.create('div', 'leaflet-control providers');
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Tile provider');
      for (const p of PROVIDERS) {
        const btn = L.DomUtil.create('button', 'provider-btn', bar);
        btn.type = 'button';
        btn.title = p.label;
        btn.innerHTML = `<span class="icon" aria-hidden="true">${p.icon}</span><span class="label">${p.label}</span>`;
        btn.addEventListener('click', () => setProvider(p.id));
        buttons[p.id] = btn;
      }
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.disableScrollPropagation(bar);
      return bar;
    },
  });
  map.addControl(new ProviderControl());

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

  setProvider(current);
  map.on('moveend', writeHash);
  window.addEventListener('hashchange', () => {
    const h = parseHash();
    if (h.zoom != null) map.setView([h.lat, h.lon], h.zoom, { animate: false });
    if (h.provider && h.provider !== current) setProvider(h.provider);
  });

  // sw.js caches the app and every map tile seen, so the map opens without signal.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('service worker:', err));
  }
})();
