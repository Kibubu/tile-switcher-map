# tile-switcher-map

**One map, many tile providers. Press a button to switch the basemap.**

👉 **[kibubu.github.io/tile-switcher-map](https://kibubu.github.io/tile-switcher-map/)**

## What it does

- **One button per provider:** OpenStreetMap, Humanitarian (HOT), CyclOSM, OpenTopoMap, CARTO Light, CARTO Dark and Esri satellite imagery. The view stays where it is; only the tiles change.
- **Smooth zoom:** wheel and trackpad zoom glide frame by frame and stop at any fractional level, like a lens, instead of snapping to whole zoom levels.
- **Faster zooming (⚡):** optional, skips loading the levels you pass through while zooming. On by default on slow connections.
- **Tile cache:** a service worker keeps every tile you've seen (per provider, up to 2000 each) and serves it instantly, also offline. Tiles older than a week are refreshed in the background. Nothing is prefetched.
- **Remembers** the last provider, and the URL (`#map=zoom/lat/lon&p=provider`) can be shared.

## Adding a provider

Add an entry to [`providers.js`](providers.js) (id, label, icon, tile URL, attribution) and its tile host to `TILE_HOSTS` in [`sw.js`](sw.js) so its tiles are cached. Providers that need an API key (Thunderforest, Stadia, MapTiler…) work the same way with the key in the URL; keep in mind the key is then public.

## Run it locally

```bash
npm run serve
```

Then open http://127.0.0.1:8000/. Plain HTML/CSS/JS with [Leaflet](https://leafletjs.com/) 1.9.4, no build step.

On every deploy, bump `VERSION` in `sw.js` together with the `?v=` query strings in `index.html`.

## Tile usage policies

Every provider asks for visible attribution (shown bottom right for the active provider) and forbids bulk downloading, which is why tiles are only cached after you've looked at them. Links to each policy are in `providers.js`. CARTO basemaps are free up to 75,000 map views a month for non-commercial use.

## Licence

Code: MIT. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL](https://opendatacommons.org/licenses/odbl/). Tiles © their providers, see the map's attribution.
