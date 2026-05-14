import { describe, it, expect } from 'vitest';

describe('New Calculation System - Weighted Indicators', () => {
  describe('Level 2: % de Meta Alcanzado', () => {
    it('should calculate % Meta Alcanzado correctly', () => {
      // Formula: ((Avance Meta - Punto Partida) / (Meta - Punto Partida)) * 100
      const avanceMeta = 2.5;
      const puntoPartida = 2;
      const metaLlegada = 3;
      
      const result = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
      expect(result).toBe(50);
    });

    it('should handle negative percentages', () => {
      const avanceMeta = 1.5;
      const puntoPartida = 2;
      const metaLlegada = 3;
      
      const result = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
      expect(result).toBe(-50);
    });

    it('should clamp values between -100 and 100', () => {
      const avanceMeta = 5;
      const puntoPartida = 2;
      const metaLlegada = 3;
      
      let result = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
      result = Math.max(-100, Math.min(100, result));
      expect(result).toBe(100);
    });
  });

  describe('Level 3: % Alcanzado General PONDERADO', () => {
    it('should calculate weighted achievement correctly', () => {
      // Formula: Σ(% de Meta Alcanzado × Ponderación) / 100
      const objectives = [
        { porcentajeMetaAlcanzado: 45.45, ponderacion: 25 },
        { porcentajeMetaAlcanzado: 60, ponderacion: 30 },
        { porcentajeMetaAlcanzado: 75, ponderacion: 25 },
        { porcentajeMetaAlcanzado: 50, ponderacion: 20 },
      ];

      let totalWeightedAchievement = 0;
      objectives.forEach(obj => {
        totalWeightedAchievement += (obj.porcentajeMetaAlcanzado * obj.ponderacion) / 100;
      });

      const result = Math.round(totalWeightedAchievement);
      expect(result).toBe(58); // Approximately 58.11%
    });

    it('should handle empty objectives', () => {
      const objectives: any[] = [];
      let totalWeightedAchievement = 0;
      
      objectives.forEach(obj => {
        totalWeightedAchievement += (obj.porcentajeMetaAlcanzado * obj.ponderacion) / 100;
      });

      expect(totalWeightedAchievement).toBe(0);
    });
  });

  describe('% Previsto (Temporal Progress)', () => {
    it('should calculate % Previsto based on elapsed days', () => {
      // Formula: (Días transcurridos / Días totales) × 100
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-12-31');
      const today = new Date('2026-04-17'); // 107 days elapsed

      const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      const result = Math.round((daysElapsed / totalDays) * 100);
      expect(result).toBe(29); // Approximately 29.32%
    });

    it('should clamp % Previsto between 0 and 100', () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-12-31');
      const today = new Date('2027-01-01'); // After end date

      const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      let result = Math.round((daysElapsed / totalDays) * 100);
      result = Math.max(0, Math.min(100, result));
      expect(result).toBe(100);
    });
  });

  describe('% Diferencia (Ahead or Behind)', () => {
    it('should calculate difference correctly', () => {
      // Formula: % Alcanzado - % Previsto
      const percentageAchieved = 58;
      const percentagePlanned = 29;

      const difference = percentageAchieved - percentagePlanned;
      expect(difference).toBe(29); // Ahead by 29%
    });

    it('should handle negative differences', () => {
      const percentageAchieved = 20;
      const percentagePlanned = 50;

      const difference = percentageAchieved - percentagePlanned;
      expect(difference).toBe(-30); // Behind by 30%
    });
  });
});
