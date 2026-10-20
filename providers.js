/* Tile providers, one button each. To add one, add an entry here and its tile host(s) in sw.js.
 *
 * Every provider here works without an API key. Their usage policies all ask for visible
 * attribution and no bulk downloading, so tiles are only cached once you have looked at them
 * (see sw.js); nothing is prefetched.
 *   OSM:         https://operations.osmfoundation.org/policies/tiles/
 *   OSM France:  https://www.openstreetmap.fr/fonds-de-carte/ (HOT, CyclOSM)
 *   OpenTopoMap: https://opentopomap.org/about
 *   CARTO:       https://github.com/CartoDB/basemap-styles (free up to 75k map views/month, non-commercial)
 *   Esri:        https://www.esri.com/en-us/legal/terms/full-master-agreement
 *
 * layers: one or more L.tileLayer definitions, drawn bottom to top.
 * dark:   the tiles are dark, so the controls switch to a dark look.
 */
(function () {
  const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const ESRI2 = 'https://services.arcgisonline.com/ArcGIS/rest/services';
  const ESRI_CLARITY = 'https://clarity.maptiles.arcgis.com/arcgis/rest/services';
  const CARTO = `${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`;

  window.PROVIDERS = [
    {
      id: 'osm', label: 'OpenStreetMap', icon: '🗺️',
      layers: [{ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxNativeZoom: 19, attribution: OSM }],
    },
    {
      id: 'hot', label: 'Humanitarian', icon: '🏘️',
      layers: [{
        url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', subdomains: 'abc', maxNativeZoom: 19,
        attribution: `${OSM}, tiles by <a href="https://www.hotosm.org/">HOT</a>, hosted by <a href="https://openstreetmap.fr/">OSM France</a>`,
      }],
    },
    {
      id: 'cyclosm', label: 'CyclOSM', icon: '🚲',
      layers: [{
        url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', subdomains: 'abc', maxNativeZoom: 20,
        attribution: `${OSM}, <a href="https://www.cyclosm.org/">CyclOSM</a>, hosted by <a href="https://openstreetmap.fr/">OSM France</a>`,
      }],
    },
    {
      id: 'topo', label: 'OpenTopoMap', icon: '⛰️',
      layers: [{
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', subdomains: 'abc', maxNativeZoom: 17,
        attribution: `${OSM}, <a href="http://viewfinderpanoramas.org">SRTM</a> | style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)`,
      }],
    },
    {
      id: 'light', label: 'CARTO Light', icon: '☀️',
      layers: [{ url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd', maxNativeZoom: 20, attribution: CARTO }],
    },
    {
      id: 'dark', label: 'CARTO Dark', icon: '🌙', dark: true,
      layers: [{ url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd', maxNativeZoom: 20, attribution: CARTO }],
    },
    {
      id: 'satellite', label: 'Satellite', icon: '🛰️', dark: true,
      layers: [
        // World Imagery mixes source mosaics with visibly different colours at mid zooms. The Clarity
        // variant uses one consistent mosaic from z14 up, but is blurry and cloudy below that, so
        // each covers its own zoom range.
        {
          url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxZoom: 13,
          attribution: 'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
        },
        { url: `${ESRI_CLARITY}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, minZoom: 14, maxNativeZoom: 18 },
        // Labels on top. Esri's hosts speak HTTP/1.1 only (6 parallel requests each), so the label
        // layers come from a second host that serves the same tiles.
        { url: `${ESRI2}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 18, opacity: 0.8 },
        { url: `${ESRI2}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 18 },
      ],
    },
  ];
})();
