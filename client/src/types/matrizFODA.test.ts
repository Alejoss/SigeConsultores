import { describe, expect, it } from 'vitest';
import {
  ESCALA_IMPACTO,
  ESCALA_PROBABILIDAD,
  MATRIZ_RIESGO,
  PRESENTACION_RIESGO,
  calcularNivelRiesgo,
} from './matrizFODA';

describe('matriz OTG: escalas históricas con guía visible', () => {
  it('conserva los 25 códigos A–E × 1–5 ya usados por las matrices existentes', () => {
    const expectedKeys = ['A', 'B', 'C', 'D', 'E'].flatMap((probabilidad) =>
      [1, 2, 3, 4, 5].map((impacto) => `${probabilidad}${impacto}`),
    );

    expect(Object.keys(MATRIZ_RIESGO).sort()).toEqual(expectedKeys.sort());
  });

  it('explica completamente las dos escalas sin cambiar sus valores persistidos', () => {
    expect(ESCALA_PROBABILIDAD.map(({ value }) => value)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(ESCALA_IMPACTO.map(({ value }) => value)).toEqual([5, 4, 3, 2, 1]);
    expect(ESCALA_PROBABILIDAD[0].nombre).toBe('Frecuente');
    expect(ESCALA_PROBABILIDAD[4].nombre).toBe('Sumamente improbable');
    expect(ESCALA_IMPACTO[0].nombre).toBe('Catastrófico');
    expect(ESCALA_IMPACTO[4].nombre).toBe('Insignificante');
  });

  it('mantiene el cálculo técnico y agrupa su presentación en grave, medio y bajo', () => {
    expect(calcularNivelRiesgo('A', 1)).toMatchObject({
      nivelRiesgo: 'A1 (Crítico)',
      estimacion: 'Crítico',
    });
    expect(PRESENTACION_RIESGO.Crítico.categoria).toBe('Grave');
    expect(PRESENTACION_RIESGO.Alto.categoria).toBe('Grave');
    expect(PRESENTACION_RIESGO.Medio.categoria).toBe('Medio');
    expect(PRESENTACION_RIESGO.Bajo.categoria).toBe('Bajo');
  });
});
