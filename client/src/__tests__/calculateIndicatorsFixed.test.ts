import { describe, it, expect } from 'vitest';

describe('calculateIndicators - Fixed Weighted Indicators', () => {
  const calculateIndicators = (plannings: any[]) => {
    if (plannings.length === 0) return { metaAlcanzada: 0, alcanzadoPorOO: 0, difference: 0, isEfficient: false };
    
    let totalMetaAlcanzada = 0;
    let totalAlcanzadoPorOO = 0;
    
    plannings.forEach(planning => {
      const ponderacion = planning.ponderacion || 0;
      const porcentajeMetaAlcanzado = planning.porcentajeMetaAlcanzado || 0;
      const avanceMeta = planning.avanceMeta || 0;
      
      totalMetaAlcanzada += porcentajeMetaAlcanzado * (ponderacion / 100);
      totalAlcanzadoPorOO += avanceMeta * (ponderacion / 100);
    });
    
    const metaAlcanzada = Math.round(totalMetaAlcanzada);
    const alcanzadoPorOO = Math.round(totalAlcanzadoPorOO);
    const difference = alcanzadoPorOO - metaAlcanzada;
    
    const isEfficient = alcanzadoPorOO < metaAlcanzada;
    
    return { metaAlcanzada, alcanzadoPorOO, difference, isEfficient };
  };

  it('should return zeros for empty plannings', () => {
    const result = calculateIndicators([]);
    expect(result).toEqual({ metaAlcanzada: 0, alcanzadoPorOO: 0, difference: 0, isEfficient: false });
  });

  it('should calculate correctly for Agrogana real scenario', () => {
    const plannings = [
      {
        ponderacion: 45,
        porcentajeMetaAlcanzado: 20,
        avanceMeta: 42,
      },
      {
        ponderacion: 35,
        porcentajeMetaAlcanzado: 0,
        avanceMeta: 0,
      },
      {
        ponderacion: 10,
        porcentajeMetaAlcanzado: 0,
        avanceMeta: 0,
      },
      {
        ponderacion: 10,
        porcentajeMetaAlcanzado: 0,
        avanceMeta: 0,
      },
    ];

    const result = calculateIndicators(plannings);
    
    // % Meta Alcanzada = (20 * 45%) + (0 * 35%) + (0 * 10%) + (0 * 10%) = 9
    expect(result.metaAlcanzada).toBe(9);
    
    // % Alcanzado por OO = (42 * 45%) + (0 * 35%) + (0 * 10%) + (0 * 10%) = 18.9 ≈ 19
    expect(result.alcanzadoPorOO).toBe(19);
    
    // Difference = 19 - 9 = 10
    expect(result.difference).toBe(10);
    
    // isEfficient = 19 < 9? No, so it's inefficient (false)
    expect(result.isEfficient).toBe(false);
  });

  it('should mark as efficient when OO < Meta', () => {
    const plannings = [
      {
        ponderacion: 100,
        metaLlegada: 100,
        avanceMeta: 50,
      },
    ];

    const result = calculateIndicators(plannings);
    
    expect(result.metaAlcanzada).toBe(100);
    expect(result.alcanzadoPorOO).toBe(50);
    expect(result.difference).toBe(-50);
    expect(result.isEfficient).toBe(true); // 50 < 100, so efficient
  });

  it('should mark as inefficient when OO > Meta', () => {
    const plannings = [
      {
        ponderacion: 100,
        metaLlegada: 50,
        avanceMeta: 100,
      },
    ];

    const result = calculateIndicators(plannings);
    
    expect(result.metaAlcanzada).toBe(50);
    expect(result.alcanzadoPorOO).toBe(100);
    expect(result.difference).toBe(50);
    expect(result.isEfficient).toBe(false); // 100 > 50, so inefficient
  });

  it('should handle multiple objectives with different ponderaciones', () => {
    const plannings = [
      {
        ponderacion: 40,
        metaLlegada: 100,
        avanceMeta: 80,
      },
      {
        ponderacion: 60,
        metaLlegada: 50,
        avanceMeta: 40,
      },
    ];

    const result = calculateIndicators(plannings);
    
    // % Meta Alcanzada = (100 * 40%) + (50 * 60%) = 40 + 30 = 70
    expect(result.metaAlcanzada).toBe(70);
    
    // % Alcanzado por OO = (80 * 40%) + (40 * 60%) = 32 + 24 = 56
    expect(result.alcanzadoPorOO).toBe(56);
    
    // Difference = 56 - 70 = -14
    expect(result.difference).toBe(-14);
    
    // isEfficient = 56 < 70? Yes, so efficient
    expect(result.isEfficient).toBe(true);
  });

  it('should handle zero ponderacion gracefully', () => {
    const plannings = [
      {
        ponderacion: 0,
        metaLlegada: 100,
        avanceMeta: 50,
      },
      {
        ponderacion: 100,
        metaLlegada: 50,
        avanceMeta: 40,
      },
    ];

    const result = calculateIndicators(plannings);
    
    // % Meta Alcanzada = (100 * 0%) + (50 * 100%) = 0 + 50 = 50
    expect(result.metaAlcanzada).toBe(50);
    
    // % Alcanzado por OO = (50 * 0%) + (40 * 100%) = 0 + 40 = 40
    expect(result.alcanzadoPorOO).toBe(40);
    
    // Difference = 40 - 50 = -10
    expect(result.difference).toBe(-10);
    
    // isEfficient = 40 < 50? Yes
    expect(result.isEfficient).toBe(true);
  });

  it('should handle negative avance values', () => {
    const plannings = [
      {
        ponderacion: 100,
        metaLlegada: 100,
        avanceMeta: -50,
      },
    ];

    const result = calculateIndicators(plannings);
    
    expect(result.metaAlcanzada).toBe(100);
    expect(result.alcanzadoPorOO).toBe(-50);
    expect(result.difference).toBe(-150);
    expect(result.isEfficient).toBe(true); // -50 < 100
  });
});
