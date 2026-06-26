// Serviços de Integração com APIs Externas (OSRM e Autocomplete)

export async function fetchRouteCoords(stops) {
  const validStops = stops.filter(stop => stop.coords);
  if (validStops.length < 2) {
    throw new Error('Por favor, defina pelo menos a partida (início) e o destino (fim) usando o autocomplete!');
  }
  
  const coordsString = validStops.map(stop => `${stop.coords[0]},${stop.coords[1]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
    return data.routes[0].geometry.coordinates;
  }
  throw new Error('Erro ao calcular rota pela OSRM.');
}

export async function fetchAddressSuggestions(query) {
  if (!query || query.trim().length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
  const res = await fetch(url);
  return await res.json();
}
