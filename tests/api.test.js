import { describe, it, expect, vi } from 'vitest';
import { fetchRouteCoords, fetchAddressSuggestions } from '../src/services/api.js';

describe('API Services', () => {
  describe('fetchRouteCoords', () => {
    it('should throw an error if less than 2 stops have coords', async () => {
      const stops = [
        { coords: [0, 0] },
        { coords: null }
      ];
      await expect(fetchRouteCoords(stops)).rejects.toThrow();
    });

    it('should return coordinates on successful fetch', async () => {
      const stops = [
        { coords: [1, 1] },
        { coords: [2, 2] }
      ];

      const mockResponse = {
        code: 'Ok',
        routes: [
          {
            geometry: {
              coordinates: [[1, 1], [1.5, 1.5], [2, 2]]
            }
          }
        ]
      };

      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockResponse)
      });

      const coords = await fetchRouteCoords(stops);
      expect(coords).toEqual([[1, 1], [1.5, 1.5], [2, 2]]);
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('fetchAddressSuggestions', () => {
    it('should return empty list if query is too short', async () => {
      const suggestions = await fetchAddressSuggestions('ab');
      expect(suggestions).toEqual([]);
    });

    it('should fetch suggestions on valid query', async () => {
      const mockSuggestions = [
        { display_name: 'Florianopolis, SC', lon: '10', lat: '20' }
      ];
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockSuggestions)
      });

      const suggestions = await fetchAddressSuggestions('florianopolis');
      expect(suggestions).toEqual(mockSuggestions);
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
