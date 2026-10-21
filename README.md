# tile-switcher-map

**One map, every tile provider. Press a button to switch the basemap.**

👉 **[kibubu.github.io/tile-switcher-map](https://kibubu.github.io/tile-switcher-map/)**

## What it does

- **Every known tile provider:** the full [leaflet-providers](https://github.com/leaflet-extras/leaflet-providers) catalogue, about 200 base maps and overlays: OpenStreetMap and its regional styles, CyclOSM, OpenTopoMap, CARTO, Esri, Stadia/Stamen, Thunderforest, MapTiler, Mapbox, Jawg, TomTom, HERE, Azure Maps, national maps (Germany, Austria, Switzerland, Netherlands, France, Singapore, USA), NASA imagery, historic UK maps, plus overlays for railways, seamarks, trails, ski pistes, weather and more.
- **Buttons for your favourites:** the seven classics are buttons; ☰ *All maps* opens a searchable list where ☆ turns any map into a button. Overlays go on top of the base map and can be combined. The view stays where it is; only the tiles change (maps that only cover one country move the view there).
- **Bring your own key:** providers that need an API key show 🔑. Enter the key once under *API keys…*; it stays in your browser (local storage), is only sent to that provider and is never part of a shared link.
- **Smooth zoom:** wheel and trackpad zoom glide frame by frame and stop at any fractional level, like a lens, instead of snapping to whole zoom levels.
- **Faster zooming (⚡):** optional, skips loading the levels you pass through while zooming. On by default on slow connections.
- **Tile cache:** a service worker keeps every tile you've seen (per provider group, up to 2000 each) and serves it instantly, also offline. Tiles older than a week are refreshed in the background. Nothing is prefetched. Commercial key-based services whose terms restrict storing tiles are left to the browser's normal HTTP cache.
- **Remembers** the last map, overlays and buttons, and the URL (`#map=zoom/lat/lon&p=provider&o=overlay,…`) can be shared.

## Adding a provider

Add a variant to one of the `add()` calls in [`providers.js`](providers.js) (id, label, tile URL, attribution), or a new `add()` call for a new group. The service worker reads the same file, so the tile host is cached without further changes. For a service that takes a key, add it to `TILE_KEYS` (label, query parameter, sign-up link) and set `key` on its providers; never put a key into the code, since the site is public.

## Run it locally

```bash
npm run serve
```

Then open http://127.0.0.1:8000/. Plain HTML/CSS/JS with [Leaflet](https://leafletjs.com/) 1.9.4, no build step.

On every deploy, bump `VERSION` in `sw.js` together with the `?v=` query strings in `index.html`.

## Tile usage policies

Every provider asks for visible attribution (shown bottom right for the active maps) and forbids bulk downloading, which is why tiles are only cached after you've looked at them. CARTO basemaps are free up to 75,000 map views a month for non-commercial use. Stadia Maps works without a key only on localhost and on domains registered in a Stadia account. Keyed services bill or rate-limit against your own account.

## Licence

Code: MIT. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL](https://opendatacommons.org/licenses/odbl/). Tiles © their providers, see the map's attribution.
