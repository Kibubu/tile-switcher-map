/* Tile providers. Loaded by the page (app.js) and by the service worker (sw.js), so it must not
 * touch the DOM. To add a provider, add a variant to one of the add() calls below, or a new add()
 * call; the service worker picks up its tile host by itself.
 *
 * The catalogue follows leaflet-providers (https://github.com/leaflet-extras/leaflet-providers),
 * with dead hosts dropped (HikeBike) and moved ones updated (NASA GIBS, OneMap, OpenAIP).
 *
 * Every provider asks for visible attribution and forbids bulk downloading, so tiles are only
 * cached once you have looked at them (see sw.js); nothing is prefetched.
 *
 * Provider fields:
 *   id, label, group  shown in the picker; id is also used in the URL (#…&p=id)
 *   icon              one emoji, shown on the pinned buttons
 *   key               id in TILE_KEYS: the provider needs (or takes) a key, which app.js appends
 *                     to every tile URL as ?<param>=<key>
 *   overlay           drawn on top of the base map (transparent tiles) instead of replacing it
 *   dark              the tiles are dark, so the controls switch to a dark look
 *   bounds, minZoom   where the provider has tiles; the map moves there when it's picked
 *   layers            one or more L.tileLayer definitions ({ url, ...options }), bottom to top
 */
(function (root) {
  const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const CC_BY_SA = '<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>';

  /* Services that take a key. Keys are entered in the page, kept in this browser only
   * (localStorage) and sent only to that service, as the query parameter `param`.
   *   optional      the service also works without a key (text says when)
   *   keylessHosts  ...but only when the page is served from one of these hosts; elsewhere the
   *                 service answers with error tiles, so the key is required there
   *   cache         the service worker may keep its tiles; the others' terms restrict storing tiles,
   *             so they only go through the browser's normal HTTP cache
   */
  root.TILE_KEYS = {
    carto: {
      label: 'CARTO', param: 'key', cache: true, signup: 'https://carto.com/basemaps',
      optional: 'Free without a key up to 75,000 map views a month (non-commercial).',
    },
    stadia: {
      label: 'Stadia Maps', param: 'api_key', cache: true, signup: 'https://client.stadiamaps.com/signup/',
      optional: 'Works without a key on localhost and on domains added to your Stadia account.',
      // Unknown domains get "401 Invalid Authentication" images, which load like normal tiles.
      keylessHosts: ['localhost', '127.0.0.1'],
    },
    thunderforest: { label: 'Thunderforest', param: 'apikey', cache: true, signup: 'https://manage.thunderforest.com/' },
    maptiler: { label: 'MapTiler', param: 'key', signup: 'https://cloud.maptiler.com/account/keys/' },
    mapbox: { label: 'Mapbox', param: 'access_token', signup: 'https://account.mapbox.com/access-tokens/' },
    jawg: { label: 'Jawg Maps', param: 'access-token', signup: 'https://www.jawg.io/lab/access-tokens' },
    tomtom: { label: 'TomTom', param: 'key', signup: 'https://developer.tomtom.com/' },
    here: { label: 'HERE', param: 'apiKey', signup: 'https://platform.here.com/admin/apps' },
    azure: { label: 'Azure Maps', param: 'subscription-key', signup: 'https://azure.microsoft.com/products/azure-maps/' },
    openweathermap: { label: 'OpenWeatherMap', param: 'appid', signup: 'https://home.openweathermap.org/api_keys' },
    openaip: { label: 'openAIP', param: 'apiKey', signup: 'https://www.openaip.net/users/clients' },
    rapidapi: { label: 'MapTiles API (RapidAPI)', param: 'rapidapi-key', signup: 'https://rapidapi.com/MapTilesApi/api/maptiles' },
  };

  const P = [];
  const PROVIDER_FIELDS = ['group', 'icon', 'key', 'overlay', 'dark', 'bounds', 'minZoom'];

  /* Adds one provider per variant: [id, label, variant, extra]. `common` holds the provider
   * fields shared by the group plus the tile layer options; `{variant}` in its url is replaced by
   * the variant. `extra` overrides either (a `url` there replaces the template). */
  function add(common, variants) {
    for (const [id, label, variant, extra = {}] of variants) {
      const all = { ...common, ...extra };
      const p = { id, label };
      const layer = {};
      for (const [k, v] of Object.entries(all)) {
        if (PROVIDER_FIELDS.includes(k)) p[k] = v;
        else layer[k] = v;
      }
      layer.url = layer.url.replace('{variant}', variant);
      if (p.bounds) layer.bounds = p.bounds;
      p.layers = [layer];
      P.push(p);
    }
  }

  // ---------- OpenStreetMap and friends ----------
  add({ group: 'OpenStreetMap', icon: '🗺️', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxNativeZoom: 19, attribution: OSM }, [
    ['osm', 'OpenStreetMap', ''],
    ['osm-de', 'OSM Germany', '', {
      url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', maxNativeZoom: 18,
      attribution: `${OSM}, tiles by <a href="https://www.openstreetmap.de/">OpenStreetMap Deutschland</a>`,
    }],
    ['osm-fr', 'OSM France', '', {
      url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', subdomains: 'abc', maxNativeZoom: 20,
      attribution: `${OSM}, tiles by <a href="https://www.openstreetmap.fr/">OSM France</a>`,
    }],
    ['hot', 'Humanitarian', '', {
      icon: '🏘️', url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', subdomains: 'abc',
      attribution: `${OSM}, tiles by <a href="https://www.hotosm.org/">HOT</a>, hosted by <a href="https://openstreetmap.fr/">OSM France</a>`,
    }],
    ['osm-ch', 'OSM Switzerland', '', {
      url: 'https://tile.osm.ch/switzerland/{z}/{x}/{y}.png', maxNativeZoom: 18, bounds: [[45, 5], [48, 11]],
      attribution: `${OSM}, tiles by <a href="https://osm.ch/">OSM Switzerland</a>`,
    }],
    ['osm-bzh', 'OSM Breton', '', {
      url: 'https://tile.openstreetmap.bzh/br/{z}/{x}/{y}.png', bounds: [[46.2, -5.5], [50, 0.7]],
      attribution: `${OSM}, tiles by <a href="https://www.openstreetmap.bzh/">Breton OpenStreetMap Team</a>`,
    }],
    ['osm-cat', 'OSM Catalan', '', {
      url: 'https://tile.openstreetmap.bzh/ca/{z}/{x}/{y}.png',
      attribution: `${OSM}, tiles by <a href="https://www.openstreetmap.cat/">OpenStreetMap Catalunya</a>`,
    }],
  ]);

  add({ group: 'Topographic & outdoor', icon: '⛰️', url: '', attribution: OSM }, [
    ['topo', 'OpenTopoMap', '', {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', subdomains: 'abc', maxNativeZoom: 17,
      attribution: `${OSM}, <a href="http://viewfinderpanoramas.org">SRTM</a> | style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (${CC_BY_SA})`,
    }],
    ['cyclosm', 'CyclOSM', '', {
      icon: '🚲', url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', subdomains: 'abc', maxNativeZoom: 20,
      attribution: `${OSM}, <a href="https://www.cyclosm.org/">CyclOSM</a>, hosted by <a href="https://openstreetmap.fr/">OSM France</a>`,
    }],
    ['mtbmap', 'MTB Map', '', {
      icon: '🚵', url: 'https://tile.mtbmap.cz/mtbmap_tiles/{z}/{x}/{y}.png', maxNativeZoom: 18,
      attribution: `${OSM} &amp; USGS, <a href="https://mtbmap.cz/">mtbmap.cz</a>`,
    }],
    ['opnv', 'ÖPNV-Karte (transit)', '', {
      icon: '🚌', url: 'https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png', maxNativeZoom: 18,
      attribution: `Map <a href="https://memomaps.de/">memomaps.de</a> <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, map data ${OSM}`,
    }],
    ['freemap-sk', 'Freemap Slovakia', '', {
      url: 'https://{s}.freemap.sk/T/{z}/{x}/{y}.jpeg', subdomains: 'abcd', maxNativeZoom: 16, minZoom: 8,
      bounds: [[47.204642, 15.996093], [49.830896, 22.576904]],
      attribution: `${OSM}, visualization CC-BY-SA 2.0 <a href="http://freemap.sk">Freemap.sk</a>`,
    }],
  ]);

  // ---------- CARTO ----------
  const CARTO = `${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`;
  add({ group: 'CARTO', key: 'carto', icon: '☀️', url: 'https://{s}.basemaps.cartocdn.com/{variant}/{z}/{x}/{y}{r}.png', subdomains: 'abcd', maxNativeZoom: 20, attribution: CARTO }, [
    ['light', 'CARTO Light (Positron)', 'light_all'],
    ['carto-light-nolabels', 'Positron, no labels', 'light_nolabels'],
    ['dark', 'CARTO Dark (Dark Matter)', 'dark_all', { icon: '🌙', dark: true }],
    ['carto-dark-nolabels', 'Dark Matter, no labels', 'dark_nolabels', { icon: '🌙', dark: true }],
    ['carto-voyager', 'Voyager', 'rastertiles/voyager'],
    ['carto-voyager-nolabels', 'Voyager, no labels', 'rastertiles/voyager_nolabels'],
    ['carto-voyager-labelsunder', 'Voyager, labels under', 'rastertiles/voyager_labels_under'],
    ['carto-light-labels', 'Positron labels', 'light_only_labels', { overlay: true }],
    ['carto-dark-labels', 'Dark Matter labels', 'dark_only_labels', { overlay: true }],
    ['carto-voyager-labels', 'Voyager labels', 'rastertiles/voyager_only_labels', { overlay: true }],
  ]);

  // ---------- Esri ----------
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const ESRI_TILES = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>';
  add({ group: 'Esri', icon: '🌐', url: `${ESRI}/{variant}/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 18 }, [
    ['esri-street', 'World Street Map', 'World_Street_Map', {
      attribution: `${ESRI_TILES} &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012`,
    }],
    ['esri-topo', 'World Topo Map', 'World_Topo_Map', {
      attribution: `${ESRI_TILES} &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community`,
    }],
    ['esri-imagery', 'World Imagery', 'World_Imagery', {
      icon: '🛰️', dark: true, maxNativeZoom: 19,
      attribution: `${ESRI_TILES} &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community`,
    }],
    ['esri-terrain', 'World Terrain', 'World_Terrain_Base', { maxNativeZoom: 13, attribution: `${ESRI_TILES} &mdash; Source: USGS, Esri, TANA, DeLorme, and NPS` }],
    ['esri-relief', 'World Shaded Relief', 'World_Shaded_Relief', { maxNativeZoom: 13, attribution: `${ESRI_TILES} &mdash; Source: Esri` }],
    ['esri-physical', 'World Physical', 'World_Physical_Map', { maxNativeZoom: 8, attribution: `${ESRI_TILES} &mdash; Source: US National Park Service` }],
    ['esri-ocean', 'Ocean', 'Ocean/World_Ocean_Base', {
      maxNativeZoom: 13, attribution: `${ESRI_TILES} &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri`,
    }],
    ['esri-natgeo', 'National Geographic', 'NatGeo_World_Map', {
      maxNativeZoom: 16, attribution: `${ESRI_TILES} &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC`,
    }],
    ['esri-gray', 'Light Gray Canvas', 'Canvas/World_Light_Gray_Base', { maxNativeZoom: 16, attribution: `${ESRI_TILES} &mdash; Esri, DeLorme, NAVTEQ` }],
    ['esri-darkgray', 'Dark Gray Canvas', 'Canvas/World_Dark_Gray_Base', { dark: true, maxNativeZoom: 16, attribution: `${ESRI_TILES} &mdash; Esri, DeLorme, NAVTEQ` }],
    ['esri-places', 'Boundaries & places', 'Reference/World_Boundaries_and_Places', { overlay: true, attribution: ESRI_TILES }],
    ['esri-transport', 'Transportation', 'Reference/World_Transportation', { overlay: true, attribution: ESRI_TILES }],
  ]);

  // Satellite with labels, the default imagery. World Imagery mixes source mosaics with visibly
  // different colours at mid zooms. The Clarity variant uses one consistent mosaic from z14 up, but
  // is blurry and cloudy below that, so each covers its own zoom range. Esri's hosts speak
  // HTTP/1.1 only (6 parallel requests each), so the label layers come from a second host that
  // serves the same tiles.
  const ESRI2 = 'https://services.arcgisonline.com/ArcGIS/rest/services';
  P.push({
    id: 'satellite', label: 'Satellite with labels', group: 'Esri', icon: '🛰️', dark: true,
    layers: [
      {
        url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxZoom: 13,
        attribution: 'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
      },
      { url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', minZoom: 14, maxNativeZoom: 18 },
      { url: `${ESRI2}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 18, opacity: 0.8 },
      { url: `${ESRI2}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 18 },
    ],
  });

  // ---------- Stadia Maps (incl. Stamen) ----------
  const STADIA = `&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ${OSM}`;
  const STAMEN = `&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.stamen.com/">Stamen Design</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ${OSM}`;
  add({ group: 'Stadia Maps', key: 'stadia', icon: '🎨', url: 'https://tiles.stadiamaps.com/tiles/{variant}/{z}/{x}/{y}{r}.png', maxNativeZoom: 20, attribution: STADIA }, [
    ['stadia-smooth', 'Alidade Smooth', 'alidade_smooth'],
    ['stadia-smooth-dark', 'Alidade Smooth Dark', 'alidade_smooth_dark', { dark: true }],
    ['stadia-satellite', 'Alidade Satellite', 'alidade_satellite', {
      dark: true, url: 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg',
      attribution: `&copy; CNES, Distribution Airbus DS, &copy; Airbus DS, &copy; PlanetObserver (Contains Copernicus Data) | ${STADIA}`,
    }],
    ['stadia-bright', 'OSM Bright', 'osm_bright'],
    ['stadia-outdoors', 'Outdoors', 'outdoors'],
    ['stamen-toner', 'Stamen Toner', 'stamen_toner', { attribution: STAMEN }],
    ['stamen-toner-bg', 'Stamen Toner Background', 'stamen_toner_background', { attribution: STAMEN }],
    ['stamen-toner-lite', 'Stamen Toner Lite', 'stamen_toner_lite', { attribution: STAMEN }],
    ['stamen-toner-dark', 'Stamen Toner Dark', 'stamen_toner_dark', { dark: true, attribution: STAMEN }],
    ['stamen-toner-blacklite', 'Stamen Toner Blacklite', 'stamen_toner_blacklite', { dark: true, attribution: STAMEN }],
    ['stamen-watercolor', 'Stamen Watercolor', 'stamen_watercolor', {
      url: 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg', maxNativeZoom: 16, attribution: STAMEN,
    }],
    ['stamen-terrain', 'Stamen Terrain', 'stamen_terrain', { maxNativeZoom: 18, attribution: STAMEN }],
    ['stamen-terrain-bg', 'Stamen Terrain Background', 'stamen_terrain_background', { maxNativeZoom: 18, attribution: STAMEN }],
    ['stamen-toner-lines', 'Stamen Toner lines', 'stamen_toner_lines', { overlay: true, attribution: STAMEN }],
    ['stamen-toner-labels', 'Stamen Toner labels', 'stamen_toner_labels', { overlay: true, attribution: STAMEN }],
    ['stamen-terrain-lines', 'Stamen Terrain lines', 'stamen_terrain_lines', { overlay: true, maxNativeZoom: 18, attribution: STAMEN }],
    ['stamen-terrain-labels', 'Stamen Terrain labels', 'stamen_terrain_labels', { overlay: true, maxNativeZoom: 18, attribution: STAMEN }],
  ]);

  // ---------- Thunderforest ----------
  add({
    group: 'Thunderforest', key: 'thunderforest', icon: '🌲', url: 'https://api.thunderforest.com/{variant}/{z}/{x}/{y}{r}.png', maxNativeZoom: 22,
    attribution: `&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>, ${OSM}`,
  }, [
    ['tf-cycle', 'OpenCycleMap', 'cycle', { icon: '🚲' }],
    ['tf-transport', 'Transport', 'transport', { icon: '🚆' }],
    ['tf-transport-dark', 'Transport Dark', 'transport-dark', { icon: '🚆', dark: true }],
    ['tf-landscape', 'Landscape', 'landscape'],
    ['tf-outdoors', 'Outdoors', 'outdoors'],
    ['tf-atlas', 'Atlas', 'atlas'],
    ['tf-pioneer', 'Pioneer', 'pioneer'],
    ['tf-mobile-atlas', 'Mobile Atlas', 'mobile-atlas'],
    ['tf-neighbourhood', 'Neighbourhood', 'neighbourhood'],
    ['tf-spinal', 'Spinal Map', 'spinal-map', { dark: true }],
  ]);

  // ---------- MapTiler ----------
  // 512 px tiles: zoomOffset -1 keeps them at the right scale.
  add({
    group: 'MapTiler', key: 'maptiler', icon: '🧭', url: 'https://api.maptiler.com/maps/{variant}/{z}/{x}/{y}{r}.png',
    tileSize: 512, zoomOffset: -1, minNativeZoom: 1, maxNativeZoom: 21,
    attribution: `<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a> ${OSM}`,
  }, [
    ['maptiler-streets', 'Streets', 'streets-v2'],
    ['maptiler-basic', 'Basic', 'basic-v2'],
    ['maptiler-bright', 'Bright', 'bright-v2'],
    ['maptiler-openstreetmap', 'OpenStreetMap', 'openstreetmap', { url: 'https://api.maptiler.com/maps/openstreetmap/{z}/{x}/{y}{r}.jpg' }],
    ['maptiler-outdoor', 'Outdoor', 'outdoor-v2'],
    ['maptiler-topo', 'Topo', 'topo-v2'],
    ['maptiler-landscape', 'Landscape', 'landscape'],
    ['maptiler-winter', 'Winter', 'winter-v2'],
    ['maptiler-satellite', 'Satellite', 'satellite', { dark: true, url: 'https://api.maptiler.com/maps/satellite/{z}/{x}/{y}{r}.jpg' }],
    ['maptiler-hybrid', 'Hybrid', 'hybrid', { dark: true, url: 'https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}{r}.jpg' }],
    ['maptiler-pastel', 'Pastel', 'pastel'],
    ['maptiler-positron', 'Positron', 'positron'],
    ['maptiler-voyager', 'Voyager', 'voyager-v2'],
    ['maptiler-toner', 'Toner', 'toner-v2'],
    ['maptiler-ocean', 'Ocean', 'ocean'],
    ['maptiler-backdrop', 'Backdrop', 'backdrop'],
    ['maptiler-dataviz', 'Dataviz', 'dataviz'],
    ['maptiler-dataviz-light', 'Dataviz Light', 'dataviz-light'],
    ['maptiler-dataviz-dark', 'Dataviz Dark', 'dataviz-dark', { dark: true }],
    ['maptiler-aquarelle', 'Aquarelle', 'aquarelle', { url: 'https://api.maptiler.com/maps/aquarelle/{z}/{x}/{y}{r}.webp' }],
  ]);

  // Historic Ordnance Survey maps from the National Library of Scotland, served by MapTiler.
  add({
    group: 'Historic maps (UK)', key: 'maptiler', icon: '📜', url: 'https://api.maptiler.com/tiles/{variant}/{z}/{x}/{y}.jpg',
    maxNativeZoom: 18, minZoom: 1, bounds: [[49.6, -12], [61.7, 3]],
    attribution: '<a href="https://maps.nls.uk/projects/subscription-api">National Library of Scotland Historic Maps</a>',
  }, [
    ['nls-1885', 'OS 1:63k, 1885–1900', 'uk-osgb63k1885'],
    ['nls-1888', 'OS 1:1m–1:63k, 1888–1913', 'uk-osgb1888'],
    ['nls-10k-1888', 'OS 1:10k, 1888–1913', 'uk-osgb10k1888'],
    ['nls-1919', 'OS 1:25k, 1919–1947', 'uk-osgb1919'],
    ['nls-25k-1937', 'OS 1:25k, 1937–1961', 'uk-osgb25k1937'],
    ['nls-63k-1955', 'OS 1:63k, 1955–1961', 'uk-osgb63k1955'],
    ['nls-london-1893', 'OS London 1:1k, 1893–1896', 'uk-oslondon1k1893'],
  ]);

  // ---------- Mapbox ----------
  add({
    group: 'Mapbox', key: 'mapbox', icon: '📦', url: 'https://api.mapbox.com/styles/v1/mapbox/{variant}/tiles/{z}/{x}/{y}{r}',
    tileSize: 512, zoomOffset: -1, minNativeZoom: 1, maxNativeZoom: 22,
    attribution: `&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ${OSM} <a href="https://www.mapbox.com/map-feedback/">Improve this map</a>`,
  }, [
    ['mapbox-streets', 'Streets', 'streets-v12'],
    ['mapbox-outdoors', 'Outdoors', 'outdoors-v12'],
    ['mapbox-light', 'Light', 'light-v11'],
    ['mapbox-dark', 'Dark', 'dark-v11', { dark: true }],
    ['mapbox-satellite', 'Satellite', 'satellite-v9', { dark: true }],
    ['mapbox-satellite-streets', 'Satellite Streets', 'satellite-streets-v12', { dark: true }],
    ['mapbox-nav-day', 'Navigation Day', 'navigation-day-v1'],
    ['mapbox-nav-night', 'Navigation Night', 'navigation-night-v1', { dark: true }],
  ]);

  // ---------- Jawg ----------
  add({
    group: 'Jawg Maps', key: 'jawg', icon: '🧩', url: 'https://tile.jawg.io/{variant}/{z}/{x}/{y}{r}.png', maxNativeZoom: 22,
    attribution: `<a href="https://jawg.io">&copy; <b>Jawg</b>Maps</a> ${OSM}`,
  }, [
    ['jawg-streets', 'Streets', 'jawg-streets'],
    ['jawg-terrain', 'Terrain', 'jawg-terrain'],
    ['jawg-sunny', 'Sunny', 'jawg-sunny'],
    ['jawg-lagoon', 'Lagoon', 'jawg-lagoon'],
    ['jawg-light', 'Light', 'jawg-light'],
    ['jawg-dark', 'Dark', 'jawg-dark', { dark: true }],
    ['jawg-matrix', 'Matrix', 'jawg-matrix', { dark: true }],
  ]);

  // ---------- TomTom ----------
  add({
    group: 'TomTom', key: 'tomtom', icon: '🚗', url: 'https://{s}.api.tomtom.com/map/1/tile/{variant}/{z}/{x}/{y}.png', subdomains: 'abcd', maxNativeZoom: 22,
    attribution: `<a href="https://tomtom.com">&copy; 1992–${new Date().getFullYear()} TomTom</a>`,
  }, [
    ['tomtom-basic', 'Basic', 'basic/main'],
    ['tomtom-night', 'Night', 'basic/night', { dark: true }],
    ['tomtom-hybrid', 'Roads & labels', 'hybrid/main', { overlay: true }],
    ['tomtom-labels', 'Labels', 'labels/main', { overlay: true }],
  ]);

  // ---------- HERE ----------
  add({
    group: 'HERE', key: 'here', icon: '📍', url: 'https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style={variant}&size=256&lg=eng', maxNativeZoom: 20,
    attribution: `Map &copy; 1987–${new Date().getFullYear()} <a href="https://platform.here.com">HERE</a>`,
  }, [
    ['here-explore', 'Explore Day', 'explore.day'],
    ['here-explore-night', 'Explore Night', 'explore.night', { dark: true }],
    ['here-lite', 'Lite Day', 'lite.day'],
    ['here-lite-night', 'Lite Night', 'lite.night', { dark: true }],
    ['here-logistics', 'Logistics Day', 'logistics.day'],
    ['here-logistics-night', 'Logistics Night', 'logistics.night', { dark: true }],
    ['here-topo', 'Topo Day', 'topo.day'],
    ['here-topo-night', 'Topo Night', 'topo.night', { dark: true }],
    ['here-terrain', 'Terrain Day', 'terrain.day'],
    ['here-terrain-mobile', 'Terrain Day (mobile)', 'terrain.day.mobile'],
    ['here-pedestrian', 'Pedestrian Day', 'pedestrian.day'],
    ['here-pedestrian-night', 'Pedestrian Night', 'pedestrian.night', { dark: true }],
    ['here-carnav-grey', 'Car navigation, grey', 'carnav.day.grey'],
    ['here-satellite', 'Satellite', 'satellite.day', { dark: true }],
    ['here-explore-satellite', 'Explore Satellite', 'explore.satellite.day', { dark: true }],
    ['here-lite-satellite', 'Lite Satellite', 'lite.satellite.day', { dark: true }],
    ['here-logistics-satellite', 'Logistics Satellite', 'logistics.satellite.day', { dark: true }],
    ['here-hybrid', 'Hybrid Day', 'hybrid.day', { dark: true }],
    ['here-hybrid-mobile', 'Hybrid Day (mobile)', 'hybrid.day.mobile', { dark: true }],
    ['here-hybrid-transit', 'Hybrid Day (transit)', 'hybrid.day.transit', { dark: true }],
    ['here-hybrid-grey', 'Hybrid Day, grey', 'hybrid.grey.day', { dark: true }],
  ]);

  // ---------- Azure Maps ----------
  add({
    group: 'Azure Maps', key: 'azure', icon: '🪟', url: 'https://atlas.microsoft.com/map/tile?api-version=2024-04-01&tilesetId={variant}&zoom={z}&x={x}&y={y}&tileSize=256&language=en-US',
    maxNativeZoom: 22, attribution: `&copy; ${new Date().getFullYear()} <a href="https://azure.microsoft.com/products/azure-maps/">Microsoft</a>, TomTom`,
  }, [
    ['azure-road', 'Road', 'microsoft.base.road'],
    ['azure-darkgrey', 'Dark Grey', 'microsoft.base.darkgrey', { dark: true }],
    ['azure-imagery', 'Imagery', 'microsoft.imagery', { dark: true, maxNativeZoom: 19 }],
    ['azure-terra', 'Terra (shaded relief)', 'microsoft.terra.main', { maxNativeZoom: 6 }],
    ['azure-hybrid', 'Roads & labels', 'microsoft.base.hybrid.road', { overlay: true }],
    ['azure-radar', 'Weather radar', 'microsoft.weather.radar.main', { overlay: true, maxNativeZoom: 15 }],
    ['azure-infrared', 'Weather infrared', 'microsoft.weather.infrared.main', { overlay: true, maxNativeZoom: 15 }],
  ]);

  // ---------- MapTiles API ----------
  add({
    group: 'MapTiles API', key: 'rapidapi', icon: '🔤', url: 'https://maptiles.p.rapidapi.com/{variant}/map/v1/{z}/{x}/{y}.png', maxNativeZoom: 19,
    attribution: `&copy; <a href="http://www.maptilesapi.com/">MapTiles API</a>, ${OSM}`,
  }, [
    ['maptilesapi-en', 'OSM in English', 'en'],
    ['maptilesapi-fr', 'OSM en français', 'fr'],
    ['maptilesapi-es', 'OSM en español', 'es'],
  ]);

  // ---------- National mapping agencies ----------
  const DL_DE = 'Map data &copy; <a href="https://www.bkg.bund.de/">BKG</a> (<a href="http://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a>)';
  add({ group: 'Germany', icon: '🇩🇪', url: '', attribution: DL_DE }, [
    ['basemapde', 'basemap.de', '', {
      url: 'https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png',
      maxNativeZoom: 18, bounds: [[47.2, 5.8], [55.1, 15.1]],
    }],
    ['basemapde-grey', 'basemap.de grey', '', {
      url: 'https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_grau/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png',
      maxNativeZoom: 18, bounds: [[47.2, 5.8], [55.1, 15.1]],
    }],
    ['topplus', 'TopPlusOpen', '', { url: 'https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png', maxNativeZoom: 18 }],
    ['topplus-grey', 'TopPlusOpen grey', '', { url: 'https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_grau/default/WEBMERCATOR/{z}/{y}/{x}.png', maxNativeZoom: 18 }],
  ]);

  add({
    group: 'Austria (basemap.at)', icon: '🇦🇹', url: 'https://mapsneu.wien.gv.at/basemap/{variant}/google3857/{z}/{y}/{x}.png', maxNativeZoom: 19,
    bounds: [[46.35877, 8.782379], [49.037872, 17.189532]], attribution: 'Datenquelle: <a href="https://www.basemap.at">basemap.at</a>',
  }, [
    ['basemapat', 'basemap.at', 'geolandbasemap/normal', { maxNativeZoom: 20 }],
    ['basemapat-grey', 'basemap.at grey', 'bmapgrau/normal'],
    ['basemapat-hidpi', 'basemap.at HiDPI', '', { url: 'https://mapsneu.wien.gv.at/basemap/bmaphidpi/normal/google3857/{z}/{y}/{x}.jpeg' }],
    ['basemapat-terrain', 'Terrain', '', { url: 'https://mapsneu.wien.gv.at/basemap/bmapgelaende/grau/google3857/{z}/{y}/{x}.jpeg' }],
    ['basemapat-surface', 'Surface', '', { url: 'https://mapsneu.wien.gv.at/basemap/bmapoberflaeche/grau/google3857/{z}/{y}/{x}.jpeg' }],
    ['basemapat-ortho', 'Orthophoto', '', { dark: true, maxNativeZoom: 20, url: 'https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg' }],
    ['basemapat-overlay', 'Labels & roads', 'bmapoverlay/normal', { overlay: true }],
  ]);

  add({
    group: 'Switzerland (swisstopo)', icon: '🇨🇭', url: 'https://wmts.geo.admin.ch/1.0.0/{variant}/default/current/3857/{z}/{x}/{y}.jpeg', maxNativeZoom: 18, minZoom: 2,
    bounds: [[45.398181, 5.140242], [48.230651, 11.47757]], attribution: '&copy; <a href="https://www.swisstopo.admin.ch/">swisstopo</a>',
  }, [
    ['swisstopo', 'National Map', 'ch.swisstopo.pixelkarte-farbe'],
    ['swisstopo-grey', 'National Map grey', 'ch.swisstopo.pixelkarte-grau'],
    ['swissimage', 'SWISSIMAGE', 'ch.swisstopo.swissimage', { dark: true, maxNativeZoom: 19 }],
  ]);

  add({
    group: 'Netherlands (PDOK)', icon: '🇳🇱', url: 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/{variant}/EPSG:3857/{z}/{x}/{y}.png', maxNativeZoom: 19, minZoom: 6,
    bounds: [[50.5, 3.25], [54, 7.6]], attribution: 'Kaartgegevens &copy; <a href="https://www.kadaster.nl">Kadaster</a>',
  }, [
    ['nlmaps', 'Standaard', 'standaard'],
    ['nlmaps-pastel', 'Pastel', 'pastel'],
    ['nlmaps-grey', 'Grijs', 'grijs'],
    ['nlmaps-water', 'Water', 'water'],
    ['nlmaps-photo', 'Luchtfoto', '', { dark: true, url: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg' }],
  ]);

  const GEOPF = 'https://data.geopf.fr/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
  add({
    group: 'France (Géoportail)', icon: '🇫🇷', url: '', minZoom: 2, bounds: [[-75, -180], [81, 180]],
    attribution: '<a href="https://www.geoportail.gouv.fr/">Géoportail France</a>',
  }, [
    ['geoportail', 'Plan IGN', '', { url: `${GEOPF}&STYLE=normal&FORMAT=image/png&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`, maxNativeZoom: 18 }],
    ['geoportail-ortho', 'Orthophotos', '', { dark: true, url: `${GEOPF}&STYLE=normal&FORMAT=image/jpeg&LAYER=ORTHOIMAGERY.ORTHOPHOTOS`, maxNativeZoom: 19 }],
    ['geoportail-parcels', 'Cadastral parcels', '', { overlay: true, url: `${GEOPF}&STYLE=PCI%20vecteur&FORMAT=image/png&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS`, maxNativeZoom: 20 }],
  ]);

  add({
    group: 'Singapore (OneMap)', icon: '🇸🇬', url: 'https://www.onemap.gov.sg/maps/tiles/{variant}/{z}/{x}/{y}.png', maxNativeZoom: 19, minZoom: 11,
    bounds: [[1.16, 103.502], [1.56073, 104.11475]],
    attribution: 'New OneMap | Map data &copy; contributors, <a href="https://www.sla.gov.sg/">Singapore Land Authority</a>',
  }, [
    ['onemap', 'Default', 'Default'],
    ['onemap-night', 'Night', 'Night', { dark: true }],
    ['onemap-original', 'Original', 'Original'],
    ['onemap-grey', 'Grey', 'Grey'],
    ['onemap-landlot', 'Land lots', 'LandLot'],
  ]);

  add({
    group: 'USA (USGS)', icon: '🇺🇸', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/{variant}/MapServer/tile/{z}/{y}/{x}', maxNativeZoom: 16,
    attribution: 'Tiles courtesy of the <a href="https://usgs.gov/">U.S. Geological Survey</a>',
  }, [
    ['usgs-topo', 'US Topo', 'USGSTopo'],
    ['usgs-imagery', 'US Imagery', 'USGSImageryOnly', { dark: true }],
    ['usgs-imagery-topo', 'US Imagery Topo', 'USGSImageryTopo', { dark: true }],
  ]);

  // ---------- NASA GIBS ----------
  // "default" is the latest available day. maxNativeZoom follows each layer's tile matrix set.
  add({
    group: 'NASA GIBS', icon: '🔭', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{variant}', minZoom: 1,
    attribution: 'Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System (<a href="https://earthdata.nasa.gov">ESDIS</a>) with funding provided by NASA/HQ.',
  }, [
    ['nasa-truecolor', 'MODIS Terra true colour (today)', 'MODIS_Terra_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', { dark: true, maxNativeZoom: 9 }],
    ['nasa-bands367', 'MODIS Terra bands 3-6-7', 'MODIS_Terra_CorrectedReflectance_Bands367/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', { dark: true, maxNativeZoom: 9 }],
    ['nasa-bluemarble', 'Blue Marble', 'BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg', { dark: true, maxNativeZoom: 8 }],
    ['nasa-blackmarble', 'Black Marble (night lights)', 'VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', { dark: true, maxNativeZoom: 8 }],
    ['nasa-citylights', 'City Lights 2012', 'VIIRS_CityLights_2012/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg', { dark: true, maxNativeZoom: 8 }],
    ['nasa-lst', 'Land surface temperature', 'MODIS_Terra_Land_Surface_Temp_Day/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png', { overlay: true, maxNativeZoom: 7 }],
    ['nasa-snow', 'Snow cover', 'MODIS_Terra_NDSI_Snow_Cover/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', { overlay: true, maxNativeZoom: 8 }],
    ['nasa-aerosol', 'Aerosol optical depth', 'MODIS_Terra_Aerosol/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png', { overlay: true, maxNativeZoom: 6 }],
    ['nasa-chlorophyll', 'Chlorophyll a', 'MODIS_Terra_L2_Chlorophyll_A/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png', { overlay: true, maxNativeZoom: 7 }],
  ]);

  // ---------- Overlays ----------
  add({ group: 'Rail, sea & air', icon: '🚆', overlay: true, url: 'https://{s}.tiles.openrailwaymap.org/{variant}/{z}/{x}/{y}.png', subdomains: 'abc', maxNativeZoom: 19,
    attribution: `Map data: ${OSM} | style &copy; <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (${CC_BY_SA})` }, [
    ['orm', 'OpenRailwayMap', 'standard'],
    ['orm-maxspeed', 'OpenRailwayMap max speed', 'maxspeed'],
    ['orm-signals', 'OpenRailwayMap signals', 'signals'],
    ['orm-electrification', 'OpenRailwayMap electrification', 'electrification'],
    ['orm-gauge', 'OpenRailwayMap gauge', 'gauge'],
    ['openseamap', 'OpenSeaMap seamarks', '', {
      icon: '⚓', url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', subdomains: '', maxNativeZoom: 18,
      attribution: 'Map data: &copy; <a href="http://www.openseamap.org">OpenSeaMap</a> contributors',
    }],
    ['openaip', 'openAIP airspace', '', {
      icon: '✈️', key: 'openaip', url: 'https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png', subdomains: '', minZoom: 4, maxNativeZoom: 14,
      attribution: '<a href="https://www.openaip.net/">openAIP Data</a> (<a href="https://creativecommons.org/licenses/by-nc-sa/3.0/">CC-BY-NC-SA</a>)',
    }],
  ]);

  add({ group: 'Trails & pistes', icon: '🥾', overlay: true, url: 'https://tile.waymarkedtrails.org/{variant}/{z}/{x}/{y}.png', maxNativeZoom: 18,
    attribution: `Map data: ${OSM} | style &copy; <a href="https://waymarkedtrails.org">waymarkedtrails.org</a> (${CC_BY_SA})` }, [
    ['wmt-hiking', 'Hiking routes', 'hiking'],
    ['wmt-cycling', 'Cycling routes', 'cycling', { icon: '🚲' }],
    ['wmt-mtb', 'MTB routes', 'mtb', { icon: '🚵' }],
    ['wmt-slopes', 'Ski slopes', 'slopes', { icon: '⛷️' }],
    ['wmt-riding', 'Riding routes', 'riding', { icon: '🐎' }],
    ['wmt-skating', 'Skating routes', 'skating', { icon: '⛸️' }],
    ['opensnowmap', 'OpenSnowMap pistes', '', {
      icon: '⛷️', url: 'https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png',
      attribution: `Map data: ${OSM} &amp; ODbL, &copy; <a href="https://www.opensnowmap.org/">opensnowmap.org</a> <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>`,
    }],
  ]);

  add({ group: 'Weather (OpenWeatherMap)', key: 'openweathermap', icon: '🌦️', overlay: true, url: 'https://tile.openweathermap.org/map/{variant}/{z}/{x}/{y}.png', maxNativeZoom: 19,
    attribution: 'Weather &copy; <a href="https://openweathermap.org">OpenWeatherMap</a>' }, [
    ['owm-clouds', 'Clouds', 'clouds_new'],
    ['owm-precipitation', 'Precipitation', 'precipitation_new'],
    ['owm-pressure', 'Pressure', 'pressure_new'],
    ['owm-wind', 'Wind', 'wind_new'],
    ['owm-temperature', 'Temperature', 'temp_new'],
  ]);

  add({ group: 'Data', icon: '📊', overlay: true, url: 'https://maptile3.org/2020/county/{variant}/{z}/{x}/{y}.png', bounds: [[14, -180], [72, -56]],
    attribution: '<a href="http://www.justicemap.org/terms.php">Justice Map</a>' }, [
    ['safecast', 'Safecast radiation', '', {
      icon: '☢️', url: 'https://s3.amazonaws.com/te512.safecast.org/{z}/{x}/{y}.png', maxNativeZoom: 16, bounds: undefined,
      attribution: `Map data: ${OSM} | style &copy; <a href="https://safecast.org/">Safecast</a> (${CC_BY_SA})`,
    }],
    ['justice-income', 'US income (Justice Map)', 'income'],
    ['justice-plurality', 'US plurality (Justice Map)', 'plural'],
    ['justice-white', 'US White (Justice Map)', 'white'],
    ['justice-black', 'US Black (Justice Map)', 'black'],
    ['justice-hispanic', 'US Hispanic (Justice Map)', 'hispanic'],
    ['justice-asian', 'US Asian (Justice Map)', 'asian'],
    ['justice-indian', 'US American Indian (Justice Map)', 'indian'],
    ['justice-multi', 'US multiracial (Justice Map)', 'multi'],
    ['justice-nonwhite', 'US non-White (Justice Map)', 'nonwhite'],
  ]);

  root.PROVIDERS = P;
  // Shown as buttons until the user pins others.
  root.DEFAULT_PINS = ['osm', 'hot', 'cyclosm', 'topo', 'light', 'dark', 'satellite'];
})(self);
