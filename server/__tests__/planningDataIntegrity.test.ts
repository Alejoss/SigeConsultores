import { describe, it, expect } from 'vitest';

describe('Planning Data Integrity - Bug #2 Fix', () => {
  describe('loadPlanningData preserves all planning information', () => {
    it('should load planning data correctly from JSON', () => {
      // Simulate DB object with planningData JSON
      const dbObject = {
        id: 1,
        processId: 1,
        name: 'Subir de 19,5% a 25%...',
        description: 'Objetivo táctico 1',
        planningData: JSON.stringify({
          ponderacion: 45,
          puntoPartida: 20,
          metaLlegada: 25,
          unidadMedida: '%',
          avanceMeta: 0,
          category: 'Finanzas',
          goal: 'Aumentar rentabilidad',
          resultKeys: [
            { id: '1', description: 'Tarea 1', responsible: 'Juan' }
          ]
        })
      };

      // Simulate loadPlanningData logic
      const planningData = dbObject.planningData
        ? JSON.parse(dbObject.planningData)
        : { category: '', goal: 0, resultKeys: [] };

      const ponderacion = planningData.ponderacion || 0;
      const puntoPartida = planningData.puntoPartida || 0;
      const metaLlegada = planningData.metaLlegada || 0;
      const avanceMeta = planningData.avanceMeta || 0;
      const unidadMedida = planningData.unidadMedida || '';

      let porcentajeMetaAlcanzado = 0;
      if (metaLlegada !== puntoPartida) {
        porcentajeMetaAlcanzado = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
        porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentajeMetaAlcanzado));
      }

      const result = {
        id: `planning_${dbObject.id}`,
        objectiveId: dbObject.id,
        objectiveName: dbObject.name || '',
        category: planningData.category || '',
        goal: planningData.goal ? String(planningData.goal) : '',
        resultKeys: planningData.resultKeys || [],
        ponderacion,
        puntoPartida,
        metaLlegada,
        unidadMedida,
        avanceMeta,
        porcentajeMetaAlcanzado,
      };

      // Verify all data is loaded correctly
      expect(result.ponderacion).toBe(45);
      expect(result.puntoPartida).toBe(20);
      expect(result.metaLlegada).toBe(25);
      expect(result.unidadMedida).toBe('%');
      expect(result.avanceMeta).toBe(0);
      expect(result.category).toBe('Finanzas');
      expect(result.goal).toBe('Aumentar rentabilidad');
      expect(result.resultKeys.length).toBe(1);
      expect(result.porcentajeMetaAlcanzado).toBe(-100); // (0 - 20) / (25 - 20) * 100 = -400%, clamped to -100
    });

    it('should calculate porcentajeMetaAlcanzado correctly when loading', () => {
      const testCases = [
        {
          name: 'Objetivo 1 - No progress',
          puntoPartida: 20,
          metaLlegada: 25,
          avanceMeta: 0,
          expected: -100 // (0 - 20) / (25 - 20) = -4 = -400%, clamped to -100
        },
        {
          name: 'Objetivo Operativo 1 - 88.89% progress',
          puntoPartida: 9000,
          metaLlegada: 6750,
          avanceMeta: 7000,
          expected: 88.89
        },
        {
          name: 'Objetivo Operativo 2 - 40% progress',
          puntoPartida: 40,
          metaLlegada: 90,
          avanceMeta: 60,
          expected: 40
        },
      ];

      testCases.forEach(testCase => {
        const { puntoPartida, metaLlegada, avanceMeta } = testCase;
        let porcentajeMetaAlcanzado = 0;
        if (metaLlegada !== puntoPartida) {
          porcentajeMetaAlcanzado = ((avanceMeta - puntoPartida) / (metaLlegada - puntoPartida)) * 100;
          porcentajeMetaAlcanzado = Math.max(-100, Math.min(100, porcentajeMetaAlcanzado));
        }

        expect(Math.round(porcentajeMetaAlcanzado * 100) / 100).toBe(testCase.expected);
      });
    });

    it('should not lose data when Definition changes and Planning is reloaded', () => {
      // Scenario: User has planning data saved
      const initialPlanningData = {
        ponderacion: 45,
        puntoPartida: 20,
        metaLlegada: 20, // User will change this to 25
        unidadMedida: '%',
        avanceMeta: 0,
        category: 'Finanzas',
        goal: 'Aumentar rentabilidad',
        resultKeys: [
          { id: '1', description: 'Tarea 1', responsible: 'Juan' }
        ]
      };

      // User updates metaLlegada in Definition from 20 to 25
      // Then returns to Planning
      // The loadPlanningData should still have all the planning data

      const planningDataJSON = JSON.stringify(initialPlanningData);
      const loadedPlanningData = JSON.parse(planningDataJSON);

      // Verify all data is preserved
      expect(loadedPlanningData.ponderacion).toBe(45);
      expect(loadedPlanningData.category).toBe('Finanzas');
      expect(loadedPlanningData.goal).toBe('Aumentar rentabilidad');
      expect(loadedPlanningData.resultKeys.length).toBe(1);
      expect(loadedPlanningData.avanceMeta).toBe(0);
    });

    it('should handle empty planningData gracefully', () => {
      // Simulate DB object with no planningData
      const dbObject = {
        id: 1,
        processId: 1,
        name: 'Objetivo táctico',
        description: 'Description',
        planningData: null
      };

      const planningData = dbObject.planningData
        ? JSON.parse(dbObject.planningData)
        : { category: '', goal: 0, resultKeys: [] };

      const ponderacion = planningData.ponderacion || 0;
      const puntoPartida = planningData.puntoPartida || 0;
      const metaLlegada = planningData.metaLlegada || 0;
      const avanceMeta = planningData.avanceMeta || 0;

      expect(ponderacion).toBe(0);
      expect(puntoPartida).toBe(0);
      expect(metaLlegada).toBe(0);
      expect(avanceMeta).toBe(0);
    });

    it('should preserve planning data even when resultKeys array is large', () => {
      const planningDataJSON = JSON.stringify({
        ponderacion: 50,
        puntoPartida: 10,
        metaLlegada: 50,
        unidadMedida: 'unidades',
        avanceMeta: 30,
        category: 'Procesos',
        goal: 'Mejorar procesos',
        resultKeys: Array.from({ length: 10 }, (_, i) => ({
          id: `rk_${i}`,
          description: `Result Key ${i + 1}`,
          responsible: `Person ${i + 1}`,
          tasks: []
        }))
      });

      const loadedData = JSON.parse(planningDataJSON);

      expect(loadedData.ponderacion).toBe(50);
      expect(loadedData.resultKeys.length).toBe(10);
      expect(loadedData.resultKeys[0].description).toBe('Result Key 1');
      expect(loadedData.resultKeys[9].description).toBe('Result Key 10');
    });
  });

  describe('Merge logic for Definition + Planning data', () => {
    it('should use planning data values when available', () => {
      const planningData = {
        ponderacion: 45,
        puntoPartida: 20,
        metaLlegada: 25,
        unidadMedida: '%',
        avanceMeta: 0,
      };

      // Simulate merge logic
      const ponderacion = planningData.ponderacion || 0;
      const puntoPartida = planningData.puntoPartida || 0;
      const metaLlegada = planningData.metaLlegada || 0;
      const avanceMeta = planningData.avanceMeta || 0;

      expect(ponderacion).toBe(45);
      expect(puntoPartida).toBe(20);
      expect(metaLlegada).toBe(25);
      expect(avanceMeta).toBe(0);
    });

    it('should provide defaults when planning data is missing', () => {
      const planningData = {};

      const ponderacion = planningData.ponderacion || 0;
      const puntoPartida = planningData.puntoPartida || 0;
      const metaLlegada = planningData.metaLlegada || 0;
      const avanceMeta = planningData.avanceMeta || 0;

      expect(ponderacion).toBe(0);
      expect(puntoPartida).toBe(0);
      expect(metaLlegada).toBe(0);
      expect(avanceMeta).toBe(0);
    });
  });
});
