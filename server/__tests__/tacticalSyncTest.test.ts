import { describe, it, expect } from 'vitest';

describe('Tactical Objectives Data Sync', () => {
  it('should verify planningData JSON structure', () => {
    // Simular cómo se guardan los datos
    const ponderacion = 25;
    const puntoPartida = 50;
    const metaLlegada = 75;
    const unidadMedida = '%';

    const planningDataObj = {
      ponderacion,
      puntoPartida,
      metaLlegada,
      unidadMedida,
    };

    const planningDataJSON = JSON.stringify(planningDataObj);
    console.log('Guardado en BD:', planningDataJSON);

    // Simular cómo se cargan los datos
    const loaded = JSON.parse(planningDataJSON);
    console.log('Cargado desde BD:', loaded);

    expect(loaded.ponderacion).toBe(25);
    expect(loaded.puntoPartida).toBe(50);
    expect(loaded.metaLlegada).toBe(75);
    expect(loaded.unidadMedida).toBe('%');
  });

  it('should handle empty planningData', () => {
    const planningDataObj = {};
    const planningDataJSON = JSON.stringify(planningDataObj);

    const loaded = JSON.parse(planningDataJSON);
    const ponderacion = loaded.ponderacion || 0;
    const puntoPartida = loaded.puntoPartida || 0;
    const metaLlegada = loaded.metaLlegada || 0;
    const unidadMedida = loaded.unidadMedida || '';

    expect(ponderacion).toBe(0);
    expect(puntoPartida).toBe(0);
    expect(metaLlegada).toBe(0);
    expect(unidadMedida).toBe('');
  });
});
