// Componente de Controle e Renderização do Mapa (MapLibre GL)
import maplibregl from 'maplibre-gl';
import { getCityName } from '../utils/helpers.js';
import { MAP_STYLES } from '../state.js';

export function initMap(state, onLoadCallback) {
  state.map = new maplibregl.Map({
    container: 'map',
    style: MAP_STYLES[state.currentStyle],
    center: [-48.8464, -26.3015],
    zoom: 8,
    pitch: state.cameraPitch,
    preserveDrawingBuffer: true
  });
  
  state.map.on('load', () => {
    setupMapLayers(state);
    if (onLoadCallback) onLoadCallback();
  });
}

export function setupMapLayers(state) {
  const map = state.map;
  if (!map) return;
  
  if (map.getSource('route-bg-source')) {
    map.removeLayer('route-bg-layer');
    map.removeSource('route-bg-source');
  }
  
  map.addSource('route-bg-source', {
    type: 'geojson',
    lineMetrics: true, // Necessário para gradientes (rainbow)
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: state.routeCoordinates
      }
    }
  });
  
  const bgLineColor = (state.currentStyle === 'dark') ? '#444444' : '#777777';
  
  map.addLayer({
    id: 'route-bg-layer',
    type: 'line',
    source: 'route-bg-source',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': bgLineColor,
      'line-width': 8,
      'line-opacity': 0.5
    }
  });

  if (map.getSource('route-active-source')) {
    if (map.getLayer('route-active-casing-layer')) map.removeLayer('route-active-casing-layer');
    if (map.getLayer('route-active-layer')) map.removeLayer('route-active-layer');
    map.removeSource('route-active-source');
  }
  
  map.addSource('route-active-source', {
    type: 'geojson',
    lineMetrics: true, // Necessário para gradientes (rainbow)
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: []
      }
    }
  });
  
  const casingColor = (state.currentStyle === 'dark') ? '#111111' : '#ffffff';
  
  map.addLayer({
    id: 'route-active-casing-layer',
    type: 'line',
    source: 'route-active-source',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': casingColor,
      'line-width': 12,
      'line-opacity': 0.95
    }
  });
  
  const activePaint = state.useRainbow ? {
    'line-gradient': [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0, '#ff4757',
      0.2, '#ff9f43',
      0.4, '#feca57',
      0.6, '#1dd1a1',
      0.8, '#54a0ff',
      1, '#5f27cd'
    ],
    'line-width': 8,
    'line-opacity': 0.98
  } : {
    'line-color': state.routeColor,
    'line-width': 8,
    'line-opacity': 0.98
  };

  map.addLayer({
    id: 'route-active-layer',
    type: 'line',
    source: 'route-active-source',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: activePaint
  });
}

export function getRainbowColor(x) {
  const colors = [
    { p: 0.0, r: 255, g: 71,  b: 87 },
    { p: 0.2, r: 255, g: 159, b: 67 },
    { p: 0.4, r: 254, g: 202, b: 87 },
    { p: 0.6, r: 29,  g: 209, b: 161 },
    { p: 0.8, r: 84,  g: 160, b: 255 },
    { p: 1.0, r: 95,  g: 39,  b: 205 }
  ];
  
  if (x <= 0) return '#ff4757';
  if (x >= 1) return '#5f27cd';
  
  let i = 0;
  while (i < colors.length - 1 && x > colors[i+1].p) {
    i++;
  }
  
  const c1 = colors[i];
  const c2 = colors[i+1];
  const t = (x - c1.p) / (c2.p - c1.p);
  
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function updateMapRouteColor(state, progress = 1.0) {
  if (state.map && state.map.getLayer('route-active-layer')) {
    if (state.useRainbow) {
      const totalDist = state.cumulativeDistances && state.cumulativeDistances.length > 0
        ? state.cumulativeDistances[state.cumulativeDistances.length - 1]
        : 100;
      const currentDist = totalDist * progress;
      const cycleLengthKm = Math.min(80, Math.max(15, totalDist / 4));
      
      const stops = [
        'interpolate',
        ['linear'],
        ['line-progress']
      ];
      
      const numStops = 40;
      for (let i = 0; i <= numStops; i++) {
        const stopProgress = i / numStops;
        const distanceAtStop = stopProgress * currentDist;
        const colorProgress = (distanceAtStop / cycleLengthKm) % 1.0;
        stops.push(stopProgress, getRainbowColor(colorProgress));
      }

      state.map.setPaintProperty('route-active-layer', 'line-gradient', stops);
      state.map.setPaintProperty('route-active-layer', 'line-color', null);
    } else {
      state.map.setPaintProperty('route-active-layer', 'line-gradient', null);
      state.map.setPaintProperty('route-active-layer', 'line-color', state.routeColor);
    }
  }
}

export function recreatePlacedPins(state) {
  const currentPlaced = [...state.placedMarkers];
  state.placedMarkers = [];
  currentPlaced.forEach(p => p.remove());
}

export function addStopPinToMap(state, stop, type) {
  if (!state.map || !stop.coords) return;
  
  const containerEl = document.createElement('div');
  containerEl.className = 'custom-map-pin-container';
  containerEl.dataset.stopId = stop.id;
  
  const el = document.createElement('div');
  el.className = `custom-map-pin ${type}`;
  
  const cityName = getCityName(stop.value);
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'pin-tooltip';
  tooltipEl.innerHTML = `
    <span class="tooltip-city">${cityName}</span>
    ${stop.date || stop.time ? `<span class="tooltip-time">${stop.date ? stop.date : ''} ${stop.time ? stop.time : ''}</span>` : ''}
  `;
  el.appendChild(tooltipEl);
  containerEl.appendChild(el);
  
  const marker = new maplibregl.Marker({
    element: containerEl,
    anchor: 'bottom'
  }).setLngLat(stop.coords).addTo(state.map);
  
  state.placedMarkers.push(marker);
  state.placedPinStopIds.push(stop.id);
}

export function isPinOnMap(state, stopId) {
  return state.placedPinStopIds.includes(stopId);
}

export function fitRouteOnMap(state) {
  if (state.map && state.boundsCenter) {
    state.map.jumpTo({
      center: state.boundsCenter,
      zoom: state.boundsZoom,
      pitch: 0,
      bearing: 0
    });
  }
}
