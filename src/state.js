// Estado Global da Aplicação

export const state = {
  stops: [
    { id: 'start', value: 'Florianópolis, Santa Catarina, Brasil', coords: [-48.5482, -27.5954], date: '26/06', time: '08:00' },
    { id: 'stop-1', value: 'Joinville, Santa Catarina, Brasil', coords: [-48.8464, -26.3015], date: '26/06', time: '12:30' },
    { id: 'end', value: 'Curitiba, Paraná, Brasil', coords: [-49.2731, -25.4290], date: '27/06', time: '17:00' }
  ],
  map: null,
  routeCoordinates: [],   // Coordenadas completas da rota real (OSRM)
  interpolatedPath: [],    // Coordenadas interpoladas e suavizadas para a animação
  stopIndices: [],         // Índices no interpolatedPath correspondentes a cada parada
  cumulativeDistances: [], // Distâncias acumuladas ao longo do trajeto (em km)
  currentStyle: 'dark',
  avatarType: 'motorcycle', // motorcycle, car, airplane, van, custom
  customAvatarUrl: null,
  customAvatarImage: null,
  avatarSize: 48,
  routeDuration: 15,       // segundos
  cameraPitch: 45,
  cameraZoom: 10.5,
  routeColor: '#ff4757',
  useRainbow: false,
  videoFormat: 'vertical',  // vertical, horizontal, square
  showOverlayInfo: true,
  
  // Configurações de Câmera e Trajeto
  cameraFollow: true,       // Rotacionar câmera no sentido da rota
  currentCameraBearing: 0,  // Bearing atual suavizado da câmera
  previewMarker: null,      // Marcador DOM do veículo no preview do mapa
  placedMarkers: [],        // Referências para pins inseridos no mapa (preview)
  placedPinStopIds: [],     // IDs de pins já inseridos para evitar duplicidade
  introDuration: 3.5,       // segundos (introdução: 0-1.5s zoom out, 1.5-3.5s zoom in + pin inicial)
  outroDuration: 2.5,       // segundos (finalização: zoom out suave mostrando rota inteira)
  summaryDuration: 4.0,     // segundos (tela final de resumo)
  showSummary: true,        // Mostrar tela de resumo final
  videoTitle: 'Minha Viagem dos Sonhos',
  boundsCenter: null,       // Centro ótimo programado da rota toda
  boundsZoom: 8,            // Zoom ótimo programado da rota toda

  // Controle de Animação e Gravação
  isAnimating: false,
  isPreviewMode: false,
  isRecording: false,
  animationStartTime: 0,
  animationFrameId: null,
  mediaRecorder: null,
  recordedChunks: [],
  
  // Cache de imagens dos veículos
  avatarImages: {}
};

export const MAP_STYLES = {
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
};

export const AVATAR_EMOJIS = {
  motorcycle: '🏍️',
  car: '🚗',
  airplane: '✈️',
  van: '🚐'
};
