// Componente de Controle e Eventos da Interface do Usuário (Sidebar)
import { getCityName } from '../utils/helpers.js';
import { fetchAddressSuggestions } from '../services/api.js';

export function initUI(state, callbacks) {
  renderStops(state, callbacks);
  
  // Eventos de Paradas
  document.getElementById('btn-add-stop').addEventListener('click', () => addStopInput(state, callbacks));
  document.getElementById('btn-calculate-route').addEventListener('click', callbacks.calculateRoute);
  
  // Seleção de Veículos / Presets
  const presets = document.querySelectorAll('.avatar-preset');
  presets.forEach(btn => {
    btn.addEventListener('click', (e) => {
      presets.forEach(p => p.classList.remove('active'));
      const preset = e.target.dataset.preset;
      e.target.classList.add('active');
      
      state.avatarType = preset;
      
      const customContainer = document.getElementById('custom-avatar-container');
      if (preset === 'custom') {
        customContainer.classList.remove('hidden');
      } else {
        customContainer.classList.add('hidden');
      }
      
      callbacks.updateVehiclePreviewMarker();
    });
  });
  
  // Upload Customizado
  const fileInput = document.getElementById('input-avatar-file');
  fileInput.addEventListener('change', (e) => handleCustomAvatarUpload(e, state, callbacks));
  
  // Sliders e Controles
  setupSlider('slider-avatar-size', 'val-avatar-size', 'px', (val) => {
    state.avatarSize = parseInt(val);
    if (state.previewMarker) {
      const el = state.previewMarker.getElement();
      if (el) {
        el.style.width = `${val}px`;
        el.style.height = `${val}px`;
      }
    }
  });
  
  setupSlider('slider-route-speed', 'val-route-speed', 's', (val) => {
    state.routeDuration = parseInt(val);
  });
  
  setupSlider('slider-camera-pitch', 'val-camera-pitch', '°', (val) => {
    state.cameraPitch = parseInt(val);
    if (state.map) state.map.setPitch(state.cameraPitch);
  });
  
  setupSlider('slider-camera-zoom', 'val-camera-zoom', '', (val) => {
    state.cameraZoom = parseFloat(val);
    if (state.map) state.map.setZoom(state.cameraZoom);
  });
  
  // Cor da Linha
  const colorPicker = document.getElementById('color-route-line');
  const colorText = document.getElementById('text-route-line-color');
  colorPicker.addEventListener('input', (e) => {
    const color = e.target.value;
    colorText.value = color;
    state.routeColor = color;
    callbacks.updateMapRouteColor();
  });
  
  // Rainbow toggle
  const checkRainbow = document.getElementById('check-rainbow-route');
  if (checkRainbow) {
    checkRainbow.addEventListener('change', (e) => {
      state.useRainbow = e.target.checked;
      callbacks.updateMapRouteColor();
    });
  }
  
  // Estilo do Mapa
  const selectStyle = document.getElementById('select-map-style');
  selectStyle.addEventListener('change', (e) => {
    state.currentStyle = e.target.value;
    if (state.map) {
      state.map.setStyle(callbacks.MAP_STYLES[state.currentStyle]);
      state.map.once('style.load', () => {
        callbacks.setupMapLayers();
        callbacks.recreatePlacedPins();
      });
    }
  });
  
  // Proporção do Vídeo
  const selectFormat = document.getElementById('select-video-format');
  const mapContainer = document.getElementById('map-container');
  const resolutionBadge = document.getElementById('resolution-badge');
  selectFormat.addEventListener('change', (e) => {
    state.videoFormat = e.target.value;
    mapContainer.className = '';
    
    if (state.videoFormat === 'vertical') {
      mapContainer.classList.add('aspect-vertical');
      resolutionBadge.textContent = 'Proporção: 9:16 (Vertical)';
    } else if (state.videoFormat === 'horizontal') {
      mapContainer.classList.add('aspect-horizontal');
      resolutionBadge.textContent = 'Proporção: 16:9 (Horizontal)';
    } else {
      mapContainer.classList.add('aspect-square');
      resolutionBadge.textContent = 'Proporção: 1:1 (Quadrado)';
    }
    
    setTimeout(() => {
      if (state.map) state.map.resize();
    }, 310);
  });
  
  // Título do Vídeo
  const inputTitle = document.getElementById('input-video-title');
  if (inputTitle) {
    inputTitle.addEventListener('input', (e) => {
      state.videoTitle = e.target.value;
    });
  }

  // HUD toggle
  const checkHUD = document.getElementById('check-overlay-info');
  checkHUD.addEventListener('change', (e) => {
    state.showOverlayInfo = e.target.checked;
  });

  // Rotação de Câmera toggle
  const checkRotate = document.getElementById('check-rotate-camera');
  checkRotate.addEventListener('change', (e) => {
    state.cameraFollow = e.target.checked;
  });

  const selectAvatarMode = document.getElementById('select-avatar-style-mode');
  if (selectAvatarMode) {
    selectAvatarMode.addEventListener('change', () => {
      callbacks.updateVehiclePreviewMarker();
    });
  }

  // Bússola toggle
  const checkCompass = document.getElementById('check-show-compass');
  checkCompass.addEventListener('change', (e) => {
    const previewCompass = document.getElementById('preview-compass');
    if (previewCompass) {
      if (e.target.checked) previewCompass.classList.remove('hidden');
      else previewCompass.classList.add('hidden');
    }
  });
  
  // Resumo final toggle
  const checkSummary = document.getElementById('check-show-summary');
  if (checkSummary) {
    checkSummary.addEventListener('change', (e) => {
      state.showSummary = e.target.checked;
    });
  }
  
  // Botões de Ação
  document.getElementById('btn-preview').addEventListener('click', callbacks.startPreviewAnimation);
  document.getElementById('btn-record').addEventListener('click', callbacks.startVideoRecording);
}

// Auxiliar para Sliders
function setupSlider(sliderId, valueId, suffix, callback) {
  const slider = document.getElementById(sliderId);
  const display = document.getElementById(valueId);
  if (!slider) return;
  
  slider.addEventListener('input', (e) => {
    const val = e.target.value;
    display.textContent = val + suffix;
    callback(val);
  });
}

export function renderStops(state, callbacks) {
  const container = document.getElementById('stops-container');
  if (!container) return;
  container.innerHTML = '';
  
  state.stops.forEach((stop, index) => {
    const isStart = index === 0;
    const isEnd = index === state.stops.length - 1;
    let className = 'stop-item';
    let label = index + 1;
    
    if (isStart) {
      className += ' start';
      label = 'I';
    } else if (isEnd) {
      className += ' end';
      label = 'F';
    }
    
    const stopEl = document.createElement('div');
    stopEl.className = className;
    stopEl.dataset.id = stop.id;
    
    stopEl.innerHTML = `
      <div class="stop-badge">${label}</div>
      <div class="stop-input-container">
        <div class="stop-input-wrapper">
          <input type="text" class="stop-input" placeholder="${isStart ? 'Cidade de Partida' : isEnd ? 'Cidade de Destino' : 'Parada intermediária'}" value="${stop.value}">
          <div class="autocomplete-suggestions hidden"></div>
        </div>
        <div class="stop-datetime-wrapper">
          <input type="text" class="stop-date-input" placeholder="Data (ex: 26/06)" value="${stop.date || ''}">
          <input type="text" class="stop-time-input" placeholder="Hora (ex: 14:30)" value="${stop.time || ''}">
        </div>
        <div class="stop-photos-wrapper">
          <label class="stop-photo-upload-btn">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <span>Adicionar Fotos</span>
            <input type="file" multiple accept="image/*" class="stop-photo-input" style="display:none">
          </label>
          <div class="stop-photo-thumbnails"></div>
        </div>
      </div>
      ${!isStart && !isEnd ? `
        <button class="btn-delete-stop" title="Excluir Parada">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      ` : `<div style="width: 28px;"></div>`}
    `;
    
    // Miniaturas
    const thumbnailsContainer = stopEl.querySelector('.stop-photo-thumbnails');
    if (!stop.photos) stop.photos = [];
    
    stop.photos.forEach((photo, pIdx) => {
      const thumb = document.createElement('div');
      thumb.className = 'stop-photo-thumbnail';
      thumb.innerHTML = `
        <img src="${photo.url}" alt="Foto">
        <button class="btn-remove-thumb" title="Remover Foto">×</button>
      `;
      thumb.querySelector('.btn-remove-thumb').addEventListener('click', () => {
        stop.photos.splice(pIdx, 1);
        renderStops(state, callbacks);
      });
      thumbnailsContainer.appendChild(thumb);
    });
    
    // Upload de Fotos
    const fileInput = stopEl.querySelector('.stop-photo-input');
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const url = event.target.result;
          const img = new Image();
          img.onload = () => {
            stop.photos.push({ url, img });
            renderStops(state, callbacks);
          };
          img.src = url;
        };
        reader.readAsDataURL(file);
      });
    });
    
    // Autocomplete
    const input = stopEl.querySelector('.stop-input');
    const suggestionsContainer = stopEl.querySelector('.autocomplete-suggestions');
    setupAutocomplete(input, suggestionsContainer, stop.id, state);
    
    // Data e Hora
    const dateInput = stopEl.querySelector('.stop-date-input');
    const timeInput = stopEl.querySelector('.stop-time-input');
    
    dateInput.addEventListener('input', (e) => {
      const stopObj = state.stops.find(s => s.id === stop.id);
      if (stopObj) stopObj.date = e.target.value;
    });
    
    timeInput.addEventListener('input', (e) => {
      const stopObj = state.stops.find(s => s.id === stop.id);
      if (stopObj) stopObj.time = e.target.value;
    });
    
    // Deleção
    if (!isStart && !isEnd) {
      stopEl.querySelector('.btn-delete-stop').addEventListener('click', () => {
        deleteStop(stop.id, state, callbacks);
      });
    }
    
    container.appendChild(stopEl);
  });
}

function addStopInput(state, callbacks) {
  const newId = 'stop-' + Date.now();
  const lastIndex = state.stops.length - 1;
  
  state.stops.splice(lastIndex, 0, {
    id: newId,
    value: '',
    coords: null,
    date: '',
    time: ''
  });
  
  renderStops(state, callbacks);
}

function deleteStop(id, state, callbacks) {
  state.stops = state.stops.filter(stop => stop.id !== id);
  renderStops(state, callbacks);
}

function setupAutocomplete(input, suggestionsContainer, stopId, state) {
  let debounceTimeout;
  
  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    const query = e.target.value.trim();
    
    if (query.length < 3) {
      suggestionsContainer.classList.add('hidden');
      return;
    }
    
    debounceTimeout = setTimeout(async () => {
      try {
        const data = await fetchAddressSuggestions(query);
        if (data && data.length > 0) {
          suggestionsContainer.innerHTML = '';
          suggestionsContainer.classList.remove('hidden');
          
          data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = item.display_name;
            div.addEventListener('click', () => {
              input.value = item.display_name;
              suggestionsContainer.classList.add('hidden');
              
              const stop = state.stops.find(s => s.id === stopId);
              if (stop) {
                stop.value = item.display_name;
                stop.coords = [parseFloat(item.lon), parseFloat(item.lat)];
              }
            });
            suggestionsContainer.appendChild(div);
          });
        } else {
          suggestionsContainer.classList.add('hidden');
        }
      } catch (err) {
        console.error('Erro ao buscar endereços:', err);
      }
    }, 450);
  });
  
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !suggestionsContainer.contains(e.target)) {
      suggestionsContainer.classList.add('hidden');
    }
  });
}

function handleCustomAvatarUpload(e, state, callbacks) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const url = event.target.result;
    state.customAvatarUrl = url;
    
    const img = new Image();
    img.onload = () => {
      state.customAvatarImage = img;
      document.getElementById('avatar-preview-name').textContent = file.name;
      callbacks.updateVehiclePreviewMarker();
    };
    img.src = url;
  };
  reader.readAsDataURL(file);
}
