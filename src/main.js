// Orchestrator Principal do Roteiro de Viagem Animada
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { state, MAP_STYLES, AVATAR_EMOJIS } from './state.js';
import { fetchRouteCoords } from './services/api.js';
import {
  initMap,
  setupMapLayers,
  updateMapRouteColor,
  recreatePlacedPins,
  addStopPinToMap,
  isPinOnMap,
  fitRouteOnMap
} from './components/map.js';
import {
  startVideoRecording,
  stopVideoRecording,
  captureRecordingFrame,
  drawRecordingFrame
} from './components/recorder.js';
import { initUI, renderStops } from './components/ui.js';
import { lerpAngle, getBearing, interpolateRouteCoordinates, calculateStopIndices, getDistanceKM } from './utils/math.js';
import { getCityName, getCurrentRouteDetails, calculateTotalTravelTime } from './utils/helpers.js';

// Inicialização Geral
document.addEventListener('DOMContentLoaded', async () => {
  // Inicializa UI
  initUI(state, {
    calculateRoute,
    startPreviewAnimation,
    startVideoRecording: () => {
      cleanupAnimationState();
      startVideoRecording(state, updateVehiclePreviewMarker, animateFrame);
    },
    updateVehiclePreviewMarker,
    updateMapRouteColor: () => updateMapRouteColor(state),
    setupMapLayers: () => setupMapLayers(state),
    recreatePlacedPins: () => recreatePlacedPins(state),
    MAP_STYLES
  });

  // Carrega Emojis
  await loadAvatarPresets();

  // Inicializa Mapa
  initMap(state, () => {
    // Rota inicial default
    setTimeout(() => {
      calculateRoute();
    }, 1000);
  });
});

// Converte Emoji em Imagem para poder rotacionar no canvas
async function loadAvatarPresets() {
  for (const [key, emoji] of Object.entries(AVATAR_EMOJIS)) {
    state.avatarImages[key] = await emojiToImage(emoji);
  }
}

function emojiToImage(emoji, size = 128) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.font = `${size * 0.7}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(size / 2, size / 2);

    if (emoji === '🏍️' || emoji === '🚗' || emoji === '🚐') {
      ctx.scale(-1, 1);
    } else if (emoji === '✈️') {
      ctx.rotate(Math.PI / 4);
    }

    ctx.fillText(emoji, 0, 0);
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL();
  });
}

// Cria/Atualiza o marcador HTML do veículo usado na tela de preview
function updateVehiclePreviewMarker() {
  if (!state.map) return;

  if (state.previewMarker) {
    state.previewMarker.remove();
    state.previewMarker = null;
  }

  const markerEl = document.createElement('div');
  markerEl.className = 'preview-vehicle-marker';
  markerEl.style.width = `${state.avatarSize}px`;
  markerEl.style.height = `${state.avatarSize}px`;

  if (state.avatarType === 'custom' && state.customAvatarUrl) {
    markerEl.style.backgroundImage = `url(${state.customAvatarUrl})`;
  } else if (state.avatarImages[state.avatarType]) {
    markerEl.style.backgroundImage = `url(${state.avatarImages[state.avatarType].src})`;
  }

  const selectMode = document.getElementById('select-avatar-style-mode');
  const avatarStyleMode = selectMode ? selectMode.value : '3d';

  state.previewMarker = new maplibregl.Marker({
    element: markerEl,
    rotationAlignment: (avatarStyleMode === '2d') ? 'map' : 'viewport',
    pitchAlignment: (avatarStyleMode === '2d') ? 'map' : 'viewport'
  });

  if (state.isAnimating && state.interpolatedPath.length > 0) {
    state.previewMarker.setLngLat(state.interpolatedPath[0]).addTo(state.map);
  }
}

// Calcula Rota
async function calculateRoute() {
  try {
    const coords = await fetchRouteCoords(state.stops);
    state.routeCoordinates = coords;

    state.interpolatedPath = interpolateRouteCoordinates(state.routeCoordinates);
    state.stopIndices = calculateStopIndices(state.stops, state.interpolatedPath);

    // Calcula distâncias acumuladas ao longo de interpolatedPath
    let accum = 0;
    state.cumulativeDistances = [0];
    for (let i = 0; i < state.interpolatedPath.length - 1; i++) {
      accum += getDistanceKM(state.interpolatedPath[i], state.interpolatedPath[i + 1]);
      state.cumulativeDistances.push(accum);
    }

    setupMapLayers(state);

    // Bounds
    const bounds = state.routeCoordinates.reduce((acc, coord) => {
      return acc.extend(coord);
    }, new maplibregl.LngLatBounds(state.routeCoordinates[0], state.routeCoordinates[0]));

    const cameraOptions = state.map.cameraForBounds(bounds, { padding: 80 });
    if (cameraOptions) {
      state.boundsCenter = [cameraOptions.center.lng, cameraOptions.center.lat];
      state.boundsZoom = cameraOptions.zoom;
    } else {
      state.boundsCenter = [bounds.getCenter().lng, bounds.getCenter().lat];
      state.boundsZoom = 8;
    }

    fitRouteOnMap(state);
  } catch (err) {
    alert(err.message || 'Erro ao calcular rota.');
  }
}

// Iniciar Preview da Animação
function startPreviewAnimation() {
  if (state.interpolatedPath.length === 0) {
    alert('Calcule a rota antes de visualizar.');
    return;
  }

  cleanupAnimationState();

  state.isAnimating = true;
  state.isPreviewMode = true;
  state.animationStartTime = performance.now();
  state.currentCameraBearing = 0;

  const hiddenCanvas = document.getElementById('hidden-recording-canvas');
  if (hiddenCanvas) {
    let width, height;
    if (state.videoFormat === 'vertical') {
      width = 1080; height = 1920;
    } else if (state.videoFormat === 'horizontal') {
      width = 1920; height = 1080;
    } else {
      width = 1080; height = 1080;
    }
    hiddenCanvas.width = width;
    hiddenCanvas.height = height;
    hiddenCanvas.classList.remove('hidden');
  }

  const previewCompass = document.getElementById('preview-compass');
  if (previewCompass) {
    previewCompass.classList.add('hidden');
  }

  updateVehiclePreviewMarker();
  if (state.previewMarker) {
    state.previewMarker.getElement().style.display = 'none'; // Esconde marcador DOM já que desenhamos no Canvas
  }

  animateFrame();
}

function cleanupAnimationState() {
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
  }

  state.placedMarkers.forEach(m => m.remove());
  state.placedMarkers = [];
  state.placedPinStopIds = [];

  if (state.previewMarker) {
    state.previewMarker.remove();
    state.previewMarker = null;
  }

  // Esconder canvas de gravação
  const hiddenCanvas = document.getElementById('hidden-recording-canvas');
  if (hiddenCanvas) {
    hiddenCanvas.classList.add('hidden');
  }

  // Restaurar bússola DOM se ativada
  const checkCompass = document.getElementById('check-show-compass');
  const previewCompass = document.getElementById('preview-compass');
  if (previewCompass) {
    if (checkCompass && checkCompass.checked) {
      previewCompass.classList.remove('hidden');
    } else {
      previewCompass.classList.add('hidden');
    }
  }

  // Ocultar overlay de resumo DOM
  const summaryOverlay = document.getElementById('summary-card-overlay');
  if (summaryOverlay) summaryOverlay.classList.add('hidden');

  if (state.useRainbow) {
    updateMapRouteColor(state, 1.0);
  }
}

// Loop Principal de Animação
function animateFrame() {
  if (!state.isAnimating) return;

  try {
    const now = performance.now();
    const elapsed = (now - state.animationStartTime) / 1000;

    const totalDuration = state.introDuration + state.routeDuration + state.outroDuration + (state.showSummary ? state.summaryDuration : 0);
    const progressPercent = Math.min(elapsed / totalDuration, 1.0);

    if (state.isRecording) {
      const progressFill = document.getElementById('recording-progress');
      if (progressFill) progressFill.style.width = `${Math.round(progressPercent * 100)}%`;
    }

    let currentCoords = state.stops[0].coords;
    let currentZoom = state.cameraZoom;
    let currentPitch = state.cameraPitch;
    let targetBearing = 0;
    let travelProgress = 0;

    const selectMode = document.getElementById('select-avatar-style-mode');
    const avatarStyleMode = selectMode ? selectMode.value : '3d';

    // ----------------------------------------------------
    // FASE 1: Introdução (Zoom-in para o início)
    // ----------------------------------------------------
    if (elapsed < state.introDuration) {
      const startCoords = state.stops[0].coords;

      if (elapsed < 1.5) {
        if (state.map && state.boundsCenter) {
          state.map.jumpTo({
            center: state.boundsCenter,
            zoom: state.boundsZoom,
            pitch: 0,
            bearing: 0
          });
        }
      } else {
        const t = (elapsed - 1.5) / 2.0;
        const easeT = 1 - Math.pow(1 - t, 3);

        const interpCenter = [
          state.boundsCenter[0] + (startCoords[0] - state.boundsCenter[0]) * easeT,
          state.boundsCenter[1] + (startCoords[1] - state.boundsCenter[1]) * easeT
        ];

        currentZoom = state.boundsZoom + (state.cameraZoom - state.boundsZoom) * easeT;
        currentPitch = 0 + (state.cameraPitch - 0) * easeT;

        if (state.placedMarkers.length === 0) {
          addStopPinToMap(state, state.stops[0], 'start');
        }

        if (state.map) {
          state.map.jumpTo({
            center: interpCenter,
            zoom: currentZoom,
            pitch: currentPitch,
            bearing: 0
          });
        }
      }

      if (state.map && state.map.getSource('route-active-source')) {
        state.map.getSource('route-active-source').setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] }
        });
      }
    }
    // ----------------------------------------------------
    // FASE 2: Percurso / Viagem
    // ----------------------------------------------------
    else if (elapsed < state.introDuration + state.routeDuration) {
      if (state.previewMarker) {
        state.previewMarker.getElement().style.display = 'block';
        state.previewMarker.getElement().style.opacity = '1';
      }

      travelProgress = Math.min((elapsed - state.introDuration) / state.routeDuration, 1.0);
      const pathLength = state.interpolatedPath.length;
      const currentIndex = Math.floor(travelProgress * (pathLength - 1));
      currentCoords = state.interpolatedPath[currentIndex];

      const traveledPath = state.interpolatedPath.slice(0, currentIndex + 1);
      if (state.map && state.map.getSource('route-active-source')) {
        state.map.getSource('route-active-source').setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: traveledPath }
        });
      }

      if (state.useRainbow) {
        updateMapRouteColor(state, travelProgress);
      }

      if (currentIndex < pathLength - 1) {
        const nextCoords = state.interpolatedPath[currentIndex + 1];
        targetBearing = getBearing(currentCoords, nextCoords);
      }

      const checkRotate = document.getElementById('check-rotate-camera');
      const shouldFollow = checkRotate ? checkRotate.checked : true;

      if (shouldFollow) {
        state.currentCameraBearing = lerpAngle(state.currentCameraBearing, targetBearing, 0.06);
      } else {
        state.currentCameraBearing = lerpAngle(state.currentCameraBearing, 0, 0.12);
      }

      if (state.previewMarker) {
        state.previewMarker.setLngLat(currentCoords);
        if (avatarStyleMode === '2d') {
          state.previewMarker.setRotation(targetBearing);
        } else {
          state.previewMarker.setRotation(0);
        }
      }

      if (state.map) {
        state.map.jumpTo({
          center: currentCoords,
          bearing: state.currentCameraBearing,
          pitch: state.cameraPitch,
          zoom: state.cameraZoom
        });
      }

      state.stops.forEach((stop, stopIdx) => {
        const targetIndex = state.stopIndices[stopIdx];
        if (currentIndex >= targetIndex && !isPinOnMap(state, stop.id)) {
          const type = stopIdx === 0 ? 'start' : stopIdx === state.stops.length - 1 ? 'end' : 'stop-point';
          addStopPinToMap(state, stop, type);
        }
      });

      updatePreviewCompass(targetBearing);
    }
    // ----------------------------------------------------
    // FASE 3: Zoom Out final do trajeto completo
    // ----------------------------------------------------
    else if (elapsed < state.introDuration + state.routeDuration + state.outroDuration) {
      const outroElapsed = elapsed - (state.introDuration + state.routeDuration);
      const outroT = Math.min(outroElapsed / state.outroDuration, 1.0);
      const easeT = 1 - Math.pow(1 - outroT, 3);

      const endCoords = state.stops[state.stops.length - 1].coords;
      travelProgress = 1.0;
      currentCoords = endCoords;

      if (state.previewMarker) {
        state.previewMarker.getElement().style.opacity = `${Math.max(0, 1 - outroT * 2)}`;
      }

      if (state.map && state.map.getSource('route-active-source')) {
        state.map.getSource('route-active-source').setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: state.interpolatedPath }
        });
      }

      if (state.useRainbow) {
        updateMapRouteColor(state, 1.0);
      }

      state.stops.forEach((stop, stopIdx) => {
        if (!isPinOnMap(state, stop.id)) {
          const type = stopIdx === 0 ? 'start' : stopIdx === state.stops.length - 1 ? 'end' : 'stop-point';
          addStopPinToMap(state, stop, type);
        }
      });

      currentZoom = state.cameraZoom + (state.boundsZoom - state.cameraZoom) * easeT;
      currentPitch = state.cameraPitch + (0 - state.cameraPitch) * easeT;
      state.currentCameraBearing = lerpAngle(state.currentCameraBearing, 0, easeT);

      if (state.map && state.boundsCenter) {
        state.map.jumpTo({
          center: [
            endCoords[0] + (state.boundsCenter[0] - endCoords[0]) * easeT,
            endCoords[1] + (state.boundsCenter[1] - endCoords[1]) * easeT
          ],
          zoom: currentZoom,
          pitch: currentPitch,
          bearing: state.currentCameraBearing
        });
      }

      updatePreviewCompass(0);

      // Esconde resumo se estivesse aberto
      const summaryOverlay = document.getElementById('summary-card-overlay');
      if (summaryOverlay) summaryOverlay.classList.add('hidden');
    }
    // ----------------------------------------------------
    // FASE 4: Tela Final de Resumo (Opcional)
    // ----------------------------------------------------
    else {
      travelProgress = 1.0;
    }

    // ----------------------------------------------------
    // Lógica de Postcard/Polaroid (Multi-foto Stack, Máximo 4 por parada)
    // ----------------------------------------------------
    let activePhotos = [];
    let activePhotoCity = '';

    state.stops.forEach((stop, stopIdx) => {
      const targetIndex = state.stopIndices[stopIdx];
      if (targetIndex !== -1 && travelProgress > 0) {
        const pathLength = state.interpolatedPath.length;
        const reachTime = state.introDuration + (targetIndex / pathLength) * state.routeDuration;
        const timeSinceReached = elapsed - reachTime;

        const displayDuration = 2.5; // Exibe Polaroid por 2.5s
        if (timeSinceReached >= 0 && timeSinceReached < displayDuration && stop.photos && stop.photos.length > 0) {
          activePhotos = stop.photos.slice(0, 4);
          activePhotoCity = getCityName(stop.value);
        }
      }
    });

    const popupCard = document.getElementById('photo-popup-card');
    if (popupCard) {
      popupCard.classList.add('hidden');
      popupCard.innerHTML = '';
      delete popupCard.dataset.currentStopCity;
    }

    // Captura o frame para gravação e pré-visualização (sempre desenha no canvas)
    if (state.isAnimating) {
      const isIntro = elapsed < state.introDuration;
      const isSummaryPhase = state.showSummary && (elapsed >= state.introDuration + state.routeDuration + state.outroDuration);
      drawRecordingFrame(state, currentCoords, targetBearing, travelProgress, isIntro, activePhotos, activePhotoCity, isSummaryPhase);
      // Captura frame para o encoder MP4 (no-op para WebM/preview)
      if (state.isRecording) captureRecordingFrame(state);
    }

    // Continua ou finaliza a animação
    if (progressPercent < 1.0) {
      state.animationFrameId = requestAnimationFrame(animateFrame);
    } else {
      state.isAnimating = false;
      setTimeout(async () => {
        cleanupAnimationState();
        if (state.isRecording) {
          await stopVideoRecording(state);
        } else {
          state.isPreviewMode = false;
          alert('Visualização concluída com sucesso!');
        }
      }, 500);
    }
  } catch (error) {
    console.error("Erro crítico na animação do frame:", error);
    alert("Erro durante a animação/gravação: " + error.message);
    state.isAnimating = false;
    if (state.isRecording) {
      stopVideoRecording(state);
    }
  }
}

function updatePreviewCompass(bearing) {
  const needle = document.getElementById('compass-needle');
  if (needle) {
    needle.style.transform = `translate(-50%, -50%) rotate(${bearing}deg)`;
  }
}

// Popula o painel de resumo da viagem no HTML overlay
function populateSummaryDOM() {
  document.getElementById('summary-title').textContent = state.videoTitle || 'Minha Viagem dos Sonhos';

  const totalTimeStr = calculateTotalTravelTime(state.stops);
  const totalDist = state.cumulativeDistances.length > 0 ? state.cumulativeDistances[state.cumulativeDistances.length - 1] : 0;
  
  const stopsEl = document.getElementById('summary-stat-stops');
  const durationEl = document.getElementById('summary-stat-duration');
  
  if (stopsEl) {
    stopsEl.textContent = state.stops.length;
  }
  if (durationEl) {
    if (totalTimeStr) {
      durationEl.textContent = `${Math.round(totalDist)} km (${totalTimeStr})`;
    } else {
      durationEl.textContent = `${Math.round(totalDist)} km`;
    }
  }

  const collage = document.getElementById('summary-collage');
  if (!collage) return;
  collage.innerHTML = '';

  let count = 0;
  state.stops.forEach(stop => {
    if (stop.photos) {
      stop.photos.forEach(photo => {
        if (count < 6) {
          const div = document.createElement('div');
          div.className = 'summary-collage-photo';

          const rotations = [-5, 3, -3, 4, -2, 5];
          div.style.transform = `rotate(${rotations[count % rotations.length]}deg)`;

          div.innerHTML = `<img src="${photo.url}" alt="Resumo">`;
          collage.appendChild(div);
          count++;
        }
      });
    }
  });
}
