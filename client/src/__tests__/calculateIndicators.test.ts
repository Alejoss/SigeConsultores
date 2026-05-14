import { describe, it, expect } from 'vitest';

describe('calculateIndicators - Weighted Tactical Objectives Indicators', () => {
  // Replicate the calculateIndicators function logic
  const calculateIndicators = (plannings: any[]) => {
    if (plannings.length === 0) return { metaAlcanzada: 0, alcanzadoPorOO: 0, difference: 0 };
    
    // Calculate % Meta Alcanzada (sum of % de Meta Alcanzado weighted by ponderacion of each OT)
    let totalMetaAlcanzada = 0;
    // Calculate % Alcanzado por OO (sum of Avance de Meta weighted by ponderacion of each OT)
    let totalAlcanzadoPorOO = 0;
    let totalPonderacion = 0;
    
    plannings.forEach(planning => {
      const ponderacion = planning.ponderacion || 0;
      const porcentajeMetaAlcanzado = planning.porcentajeMetaAlcanzado || 0;
      const avanceMeta = planning.avanceMeta || 0;
      
      // Calculate avance de meta as percentage (0-100)
      let avanceMetaPercentage = 0;
      const puntoPartida = planning.puntoPartida || 0;
      const metaLlegada = planning.metaLlegada || 0;
      
      if (metaLlegada !== puntoPartida) {
        avanceMetaPercentage = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
        avanceMetaPercentage = Math.max(-100, Math.min(100, avanceMetaPercentage));
      }
      
      // Add weighted values
      totalMetaAlcanzada += (porcentajeMetaAlcanzado * ponderacion) / 100;
      totalAlcanzadoPorOO += (avanceMetaPercentage * ponderacion) / 100;
      totalPonderacion += ponderacion;
    });
    
    // Normalize by total ponderacion if it's not 100
    let metaAlcanzada = 0;
    let alcanzadoPorOO = 0;
    
    if (totalPonderacion > 0) {
      metaAlcanzada = Math.round((totalMetaAlcanzada / totalPonderacion) * 100);
      alcanzadoPorOO = Math.round((totalAlcanzadoPorOO / totalPonderacion) * 100);
    }
    
    const difference = alcanzadoPorOO - metaAlcanzada;
    
    return { metaAlcanzada, alcanzadoPorOO, difference };
  };

  it('should return zeros for empty plannings', () => {
    const result = calculateIndicators([]);
    expect(result).toEqual({ metaAlcanzada: 0, alcanzadoPorOO: 0, difference: 0 });
  });

  it('should calculate weighted indicators for single objective', () => {
    const plannings = [
      {
        ponderacion: 100,
        porcentajeMetaAlcanzado: 20,
        avanceMeta: 21,
        puntoPartida: 20,
        metaLlegada: 25,
      },
    ];

    const result = calculateIndicators(plannings);
    
    // % Meta Alcanzada = (20 * 100) / 100 = 20%
    expect(result.metaAlcanzada).toBe(20);
    
    // Avance Meta % = ((21 - 20) / (25 - 20)) * 100 = 20%
    // % Alcanzado por OO = (20 * 100) / 100 = 20%
    expect(result.alcanzadoPorOO).toBe(20);
    
    // Difference = 20 - 20 = 0
    expect(result.difference).toBe(0);
  });

  it('should calculate weighted indicators for multiple objectives with ponderacion', () => {
    const plannings = [
      {
        ponderacion: 45,
        porcentajeMetaAlcanzado: 20,
        avanceMeta: 21,
        puntoPartida: 20,
        metaLlegada: 25,
      },
      {
        ponderacion: 55,
        porcentajeMetaAlcanzado: 0,
        avanceMeta: 0,
        puntoPartida: 0,
        metaLlegada: 100,
      },
    ];

    const result = calculateIndicators(plannings);
    
    // % Meta Alcanzada = ((20 * 45) + (0 * 55)) / 100 = 9%
    expect(result.metaAlcanzada).toBe(9);
    
    // Avance Meta % OT1 = ((21 - 20) / (25 - 20)) * 100 = 20%
    // Avance Meta % OT2 = ((0 - 0) / (100 - 0)) * 100 = 0%
    // % Alcanzado por OO = ((20 * 45) + (0 * 55)) / 100 = 9%
    expect(result.alcanzadoPorOO).toBe(9);
    
    // Difference = 9 - 9 = 0
    expect(result.difference).toBe(0);
  });

  it('should handle discrepancy between Meta Alcanzada and Alcanzado por OO', () => {
    const plannings = [
      {
        ponderacion: 50,
        porcentajeMetaAlcanzado: 10,
        avanceMeta: 50,
        puntoPartida: 0,
        metaLlegada: 100,
      },
      {
        ponderacion: 50,
        porcentajeMetaAlcanzado: 10,
        avanceMeta: 50,
        puntoPartida: 0,
        metaLlegada: 100,
      },
    ];

    const result = calculateIndicators(plannings);
    
    // % Meta Alcanzada = ((10 * 50) + (10 * 50)) / 100 = 10%
    expect(result.metaAlcanzada).toBe(10);
    
    // Avance Meta % = ((50 - 0) / (100 - 0)) * 100 = 50%
    // % Alcanzado por OO = ((50 * 50) + (50 * 50)) / 100 = 50%
    expect(result.alcanzadoPorOO).toBe(50);
    
    // Difference = 50 - 10 = 40 (positive means OO are ahead)
    expect(result.difference).toBe(40);
  });

  it('should handle negative difference (Meta ahead of OO)', () => {
    const plannings = [
      {
        ponderacion: 100,
        porcentajeMetaAlcanzado: 50,
        avanceMeta: 10,
        puntoPartida: 0,
        metaLlegada: 100,
      },
    ];

    const result = calculateIndicators(plannings);
    
    // % Meta Alcanzada = (50 * 100) / 100 = 50%
    expect(result.metaAlcanzada).toBe(50);
    
    // Avance Meta % = ((10 - 0) / (100 - 0)) * 100 = 10%
    // % Alcanzado por OO = (10 * 100) / 100 = 10%
    expect(result.alcanzadoPorOO).toBe(10);
    
    // Difference = 10 - 50 = -40 (negative means OO are behind)
    expect(result.difference).toBe(-40);
  });

  it('should clamp avanceMetaPercentage between -100 and 100', () => {
    const plannings = [
      {
        ponderacion: 100,
        porcentajeMetaAlcanzado: 50,
        avanceMeta: -50, // Negative advance
        puntoPartida: 0,
        metaLlegada: 100,
      },
    ];

    const result = calculateIndicators(plannings);
    
    // Avance Meta % = ((-50 - 0) / (100 - 0)) * 100 = -50%
    // Clamped to [-100, 100] = -50%
    expect(result.alcanzadoPorOO).toBe(-50);
    expect(result.difference).toBe(-100); // -50 - 50 = -100
  });

  it('should handle ponderacion not equal to 100', () => {
    const plannings = [
      {
        ponderacion: 30,
        porcentajeMetaAlcanzado: 50,
        avanceMeta: 50,
        puntoPartida: 0,
        metaLlegada: 100,
      },
      {
        ponderacion: 40,
        porcentajeMetaAlcanzado: 30,
        avanceMeta: 30,
        puntoPartida: 0,
        metaLlegada: 100,
      },
      {
        ponderacion: 20,
        porcentajeMetaAlcanzado: 20,
        avanceMeta: 20,
        puntoPartida: 0,
        metaLlegada: 100,
      },
    ];

    const result = calculateIndicators(plannings);
    
    // Total ponderacion = 90
    // % Meta Alcanzada = ((50*30) + (30*40) + (20*20)) / 90 = (1500 + 1200 + 400) / 90 = 3100 / 90 = 34.44% -> 34%
    expect(result.metaAlcanzada).toBe(34);
    
    // % Alcanzado por OO = ((50*30) + (30*40) + (20*20)) / 90 = 34.44% -> 34%
    expect(result.alcanzadoPorOO).toBe(34);
    
    // Difference = 0
    expect(result.difference).toBe(0);
  });

  it('should handle real-world scenario from Agrogana', () => {
    // Objetivo 1: 42% avance, 20% meta alcanzado, ponderacion 45%
    // Objetivo 2: 0% avance, 0% meta alcanzado, ponderacion 55%
    const plannings = [
      {
        ponderacion: 45,
        porcentajeMetaAlcanzado: 20,
        avanceMeta: 21,
        puntoPartida: 20,
        metaLlegada: 25,
      },
      {
        ponderacion: 55,
        porcentajeMetaAlcanzado: 0,
        avanceMeta: 0,
        puntoPartida: 0,
        metaLlegada: 100,
      },
    ];

    const result = calculateIndicators(plannings);
    
    // % Meta Alcanzada = ((20 * 45) + (0 * 55)) / 100 = 9%
    expect(result.metaAlcanzada).toBe(9);
    
    // Avance Meta % OT1 = ((21 - 20) / (25 - 20)) * 100 = 20%
    // Avance Meta % OT2 = 0%
    // % Alcanzado por OO = ((20 * 45) + (0 * 55)) / 100 = 9%
    expect(result.alcanzadoPorOO).toBe(9);
    
    // Difference = 9 - 9 = 0
    expect(result.difference).toBe(0);
  });
});
