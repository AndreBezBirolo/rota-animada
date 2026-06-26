import { describe, it, expect } from 'vitest';
import { lerpAngle, getBearing, interpolateRouteCoordinates, calculateStopIndices, getDistanceKM } from '../src/utils/math.js';

describe('Math Utilities', () => {
  describe('lerpAngle', () => {
    it('should interpolate angles correctly', () => {
      expect(lerpAngle(0, 100, 0.5)).toBe(50);
      expect(lerpAngle(350, 10, 0.5)).toBe(360); // Wraps around correctly (350 + 10 = 360/0)
    });
  });

  describe('getBearing', () => {
    it('should calculate bearing from start to end coordinates', () => {
      const florianopolis = [-48.5482, -27.5954];
      const joinville = [-48.8464, -26.3015];
      const bearing = getBearing(florianopolis, joinville);
      
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThanOrEqual(360);
      expect(Math.round(bearing)).toBe(348); // North-Northwest bearing approx
    });
  });

  describe('interpolateRouteCoordinates', () => {
    it('should return empty array for less than 2 coordinates', () => {
      expect(interpolateRouteCoordinates([])).toEqual([]);
      expect(interpolateRouteCoordinates([[0, 0]])).toEqual([]);
    });

    it('should interpolate points correctly', () => {
      const coords = [
        [0, 0],
        [10, 10]
      ];
      const path = interpolateRouteCoordinates(coords, 10);
      expect(path.length).toBe(11);
      expect(path[0]).toEqual([0, 0]);
      expect(path[10]).toEqual([10, 10]);
    });
  });

  describe('calculateStopIndices', () => {
    it('should locate the closest points for each stop', () => {
      const stops = [
        { coords: [0, 0] },
        { coords: [5, 5] },
        { coords: [10, 10] }
      ];
      const path = [
        [0, 0],
        [2, 2],
        [4, 4],
        [6, 6],
        [8, 8],
        [10, 10]
      ];
      const indices = calculateStopIndices(stops, path);
      expect(indices).toEqual([0, 2, 5]); // [0,0] is at index 0, [5,5] is closest to [4,4] (index 2) or [6,6] (index 3), [10,10] is at index 5
    });
  });

  describe('getDistanceKM', () => {
    it('should calculate distance correctly between coordinates', () => {
      const florianopolis = [-48.5482, -27.5954];
      const curitiba = [-49.2731, -25.4290];
      const distance = getDistanceKM(florianopolis, curitiba);
      expect(Math.round(distance)).toBe(251); // Approx 251km
    });

    it('should return 0 for same coordinates or null', () => {
      expect(getDistanceKM([0, 0], [0, 0])).toBe(0);
      expect(getDistanceKM(null, [0, 0])).toBe(0);
    });
  });
});
