import { describe, it, expect } from 'vitest';
import { getCityName, getCurrentRouteDetails, calculateTotalTravelTime } from '../src/utils/helpers.js';

describe('Helper Utilities', () => {
  describe('getCityName', () => {
    it('should extract first part before comma', () => {
      expect(getCityName('Florianópolis, Santa Catarina, Brasil')).toBe('Florianópolis');
      expect(getCityName('Joinville')).toBe('Joinville');
    });

    it('should return Desconhecido for empty string or null', () => {
      expect(getCityName('')).toBe('Desconhecido');
      expect(getCityName(null)).toBe('Desconhecido');
    });
  });

  describe('getCurrentRouteDetails', () => {
    const stops = [
      { id: '1', value: 'Florianópolis, SC', date: '26/06', time: '08:00' },
      { id: '2', value: 'Joinville, SC', date: '26/06', time: '12:30' },
      { id: '3', value: 'Curitiba, PR', date: '27/06', time: '17:00' }
    ];

    it('should return correct details based on progress', () => {
      expect(getCurrentRouteDetails(stops, 0)).toEqual({
        city: 'Florianópolis',
        date: '26/06',
        time: '08:00'
      });

      expect(getCurrentRouteDetails(stops, 0.5)).toEqual({
        city: 'Joinville',
        date: '26/06',
        time: '12:30'
      });

      expect(getCurrentRouteDetails(stops, 1.0)).toEqual({
        city: 'Curitiba',
        date: '27/06',
        time: '17:00'
      });
    });

    it('should return empty values if stops is empty', () => {
      expect(getCurrentRouteDetails([], 0.5)).toEqual({ city: '', date: '', time: '' });
    });
  });

  describe('calculateTotalTravelTime', () => {
    it('should calculate duration correctly for hours', () => {
      const stops = [
        { date: '26/06', time: '08:00' },
        { date: '26/06', time: '12:30' }
      ];
      expect(calculateTotalTravelTime(stops)).toBe('4h 30min');
    });

    it('should calculate duration correctly for days', () => {
      const stops = [
        { date: '26/06', time: '08:00' },
        { date: '27/06', time: '17:00' }
      ];
      expect(calculateTotalTravelTime(stops)).toBe('1d 9h');
    });

    it('should return empty string if date/time is missing', () => {
      const stops = [
        { date: '26/06', time: '08:00' },
        { date: '27/06', time: '' }
      ];
      expect(calculateTotalTravelTime(stops)).toBe('');
    });
  });
});
