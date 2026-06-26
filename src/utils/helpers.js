// Funções auxiliares gerais da interface e do roteiro

export function getCityName(fullName) {
  if (!fullName) return 'Desconhecido';
  const parts = fullName.split(',');
  return parts[0].trim();
}

export function getCurrentRouteDetails(stops, progress) {
  if (!stops || stops.length === 0) return { city: '', date: '', time: '' };
  
  const lastIndex = Math.min(
    Math.floor(progress * (stops.length - 1)),
    stops.length - 1
  );
  
  const stop = stops[lastIndex];
  return {
    city: getCityName(stop.value),
    date: stop.date ? `${stop.date}` : '',
    time: stop.time ? `${stop.time}` : ''
  };
}

export function calculateTotalTravelTime(stops) {
  if (!stops || stops.length < 2) return '';
  
  const parseDateTime = (stop) => {
    if (!stop.date || !stop.time) return null;
    const dateParts = stop.date.split('/');
    const timeParts = stop.time.split(':');
    if (dateParts.length < 2 || timeParts.length < 2) return null;
    
    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1; // 0-indexed
    const year = dateParts.length === 3 ? parseInt(dateParts[2], 10) : new Date().getFullYear();
    const hour = parseInt(timeParts[0], 10);
    const minute = parseInt(timeParts[1], 10);
    
    return new Date(year, month, day, hour, minute);
  };
  
  const firstDate = parseDateTime(stops[0]);
  const lastDate = parseDateTime(stops[stops.length - 1]);
  
  if (!firstDate || !lastDate) return '';
  
  const diffMs = lastDate - firstDate;
  if (diffMs <= 0) return '';
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return `${diffDays}d ${remainingHours}h`;
  }
  
  const remainingMinutes = diffMinutes % 60;
  if (remainingMinutes > 0) {
    return `${diffHours}h ${remainingMinutes}min`;
  }
  return `${diffHours}h`;
}
