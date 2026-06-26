// Funções matemáticas e de interpolação para o trajeto da viagem

export function lerpAngle(current, target, factor) {
  let diff = target - current;
  while (diff < -180) diff += 360;
  while (diff > 180) diff -= 360;
  return current + diff * factor;
}

export function getBearing(start, end) {
  const rad = Math.PI / 180;
  const lat1 = start[1] * rad;
  const lat2 = end[1] * rad;
  const lon1 = start[0] * rad;
  const lon2 = end[0] * rad;
  
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const bearing = Math.atan2(y, x) / rad;
  return (bearing + 360) % 360;
}

export function interpolateRouteCoordinates(routeCoordinates, numSteps = 1200) {
  if (!routeCoordinates || routeCoordinates.length < 2) return [];
  
  const path = [];
  let totalDist = 0;
  const segments = [];
  
  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const p1 = routeCoordinates[i];
    const p2 = routeCoordinates[i + 1];
    const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    totalDist += d;
    segments.push({ p1, p2, startDist: totalDist - d, dist: d });
  }
  
  for (let i = 0; i <= numSteps; i++) {
    const targetDist = (i / numSteps) * totalDist;
    let segment = segments[segments.length - 1];
    for (let j = 0; j < segments.length; j++) {
      if (targetDist <= segments[j].startDist + segments[j].dist) {
        segment = segments[j];
        break;
      }
    }
    
    const t = segment.dist === 0 ? 0 : (targetDist - segment.startDist) / segment.dist;
    const lon = segment.p1[0] + (segment.p2[0] - segment.p1[0]) * t;
    const lat = segment.p1[1] + (segment.p2[1] - segment.p1[1]) * t;
    path.push([lon, lat]);
  }
  
  return path;
}

export function calculateStopIndices(stops, interpolatedPath) {
  if (!stops || !interpolatedPath || interpolatedPath.length === 0) return [];
  return stops.map(stop => {
    if (!stop.coords) return -1;
    let minIndex = 0;
    let minDist = Infinity;
    for (let i = 0; i < interpolatedPath.length; i++) {
      const p = interpolatedPath[i];
      const dist = Math.hypot(p[0] - stop.coords[0], p[1] - stop.coords[1]);
      if (dist < minDist) {
        minDist = dist;
        minIndex = i;
      }
    }
    return minIndex;
  });
}

export function getDistanceKM(coord1, coord2) {
  if (!coord1 || !coord2) return 0;
  const R = 6371; // Earth's radius in km
  const rad = Math.PI / 180;
  const lat1 = coord1[1] * rad;
  const lat2 = coord2[1] * rad;
  const dLat = (coord2[1] - coord1[1]) * rad;
  const dLon = (coord2[0] - coord1[0]) * rad;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

