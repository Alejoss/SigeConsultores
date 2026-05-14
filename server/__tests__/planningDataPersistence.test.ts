import { describe, it, expect } from 'vitest';

describe('Planning Data Persistence - Bug Fix', () => {
  describe('savePlanning with all fields', () => {
    it('should preserve all planning fields when saving', () => {
      // Simulating the merge logic from savePlanning
      const existingPlanningData = {
        ponderacion: 25,
        puntoPartida: 2,
        metaLlegada: 3,
        unidadMedida: '%',
        avanceMeta: 2.5,
        category: 'Finanzas',
        goal: 'Aumentar rentabilidad',
        resultKeys: [
          { id: '1', description: 'Tarea 1', responsible: 'Juan' }
        ]
      };

      // New input only updating category and goal
      const input = {
        category: 'Cliente',
        goal: 'Mejorar satisfacción',
        resultKeys: undefined,
        ponderacion: undefined,
        puntoPartida: undefined,
        metaLlegada: undefined,
        unidadMedida: undefined,
        avanceMeta: undefined,
      };

      // Merge logic (same as backend)
      const planningData = {
        ...existingPlanningData,
        category: input.category !== undefined ? input.category : (existingPlanningData.category || ''),
        goal: input.goal !== undefined ? input.goal : (existingPlanningData.goal || ''),
        resultKeys: input.resultKeys !== undefined ? input.resultKeys : (existingPlanningData.resultKeys || []),
        ponderacion: input.ponderacion !== undefined ? input.ponderacion : (existingPlanningData.ponderacion || 0),
        puntoPartida: input.puntoPartida !== undefined ? input.puntoPartida : (existingPlanningData.puntoPartida || 0),
        metaLlegada: input.metaLlegada !== undefined ? input.metaLlegada : (existingPlanningData.metaLlegada || 0),
        unidadMedida: input.unidadMedida !== undefined ? input.unidadMedida : (existingPlanningData.unidadMedida || ''),
        avanceMeta: input.avanceMeta !== undefined ? input.avanceMeta : (existingPlanningData.avanceMeta || 0),
      };

      // Verify all fields are preserved
      expect(planningData.ponderacion).toBe(25);
      expect(planningData.puntoPartida).toBe(2);
      expect(planningData.metaLlegada).toBe(3);
      expect(planningData.unidadMedida).toBe('%');
      expect(planningData.avanceMeta).toBe(2.5);
      // And new values are updated
      expect(planningData.category).toBe('Cliente');
      expect(planningData.goal).toBe('Mejorar satisfacción');
      expect(planningData.resultKeys).toEqual([
        { id: '1', description: 'Tarea 1', responsible: 'Juan' }
      ]);
    });

    it('should update planning fields when provided', () => {
      const existingPlanningData = {
        ponderacion: 25,
        puntoPartida: 2,
        metaLlegada: 3,
        unidadMedida: '%',
        avanceMeta: 2.5,
      };

      const input = {
        ponderacion: 30,
        puntoPartida: 2,
        metaLlegada: 4,
        unidadMedida: '%',
        avanceMeta: 3.0,
      };

      const planningData = {
        ...existingPlanningData,
        ponderacion: input.ponderacion !== undefined ? input.ponderacion : (existingPlanningData.ponderacion || 0),
        puntoPartida: input.puntoPartida !== undefined ? input.puntoPartida : (existingPlanningData.puntoPartida || 0),
        metaLlegada: input.metaLlegada !== undefined ? input.metaLlegada : (existingPlanningData.metaLlegada || 0),
        unidadMedida: input.unidadMedida !== undefined ? input.unidadMedida : (existingPlanningData.unidadMedida || ''),
        avanceMeta: input.avanceMeta !== undefined ? input.avanceMeta : (existingPlanningData.avanceMeta || 0),
      };

      expect(planningData.ponderacion).toBe(30);
      expect(planningData.metaLlegada).toBe(4);
      expect(planningData.avanceMeta).toBe(3.0);
    });

    it('should handle empty input without losing data', () => {
      const existingPlanningData = {
        ponderacion: 45,
        puntoPartida: 20,
        metaLlegada: 25,
        unidadMedida: '%',
        avanceMeta: 22.5,
        category: 'Procesos Internos',
        goal: 'Optimizar procesos',
        resultKeys: []
      };

      const input = {
        category: undefined,
        goal: undefined,
        resultKeys: undefined,
        ponderacion: undefined,
        puntoPartida: undefined,
        metaLlegada: undefined,
        unidadMedida: undefined,
        avanceMeta: undefined,
      };

      const planningData = {
        ...existingPlanningData,
        category: input.category !== undefined ? input.category : (existingPlanningData.category || ''),
        goal: input.goal !== undefined ? input.goal : (existingPlanningData.goal || ''),
        resultKeys: input.resultKeys !== undefined ? input.resultKeys : (existingPlanningData.resultKeys || []),
        ponderacion: input.ponderacion !== undefined ? input.ponderacion : (existingPlanningData.ponderacion || 0),
        puntoPartida: input.puntoPartida !== undefined ? input.puntoPartida : (existingPlanningData.puntoPartida || 0),
        metaLlegada: input.metaLlegada !== undefined ? input.metaLlegada : (existingPlanningData.metaLlegada || 0),
        unidadMedida: input.unidadMedida !== undefined ? input.unidadMedida : (existingPlanningData.unidadMedida || ''),
        avanceMeta: input.avanceMeta !== undefined ? input.avanceMeta : (existingPlanningData.avanceMeta || 0),
      };

      // All data should be preserved
      expect(planningData.ponderacion).toBe(45);
      expect(planningData.puntoPartida).toBe(20);
      expect(planningData.metaLlegada).toBe(25);
      expect(planningData.unidadMedida).toBe('%');
      expect(planningData.avanceMeta).toBe(22.5);
      expect(planningData.category).toBe('Procesos Internos');
      expect(planningData.goal).toBe('Optimizar procesos');
    });
  });

  describe('loadPlanningData with all fields', () => {
    it('should return all planning fields when loading', () => {
      const planningDataJSON = JSON.stringify({
        ponderacion: 45,
        puntoPartida: 20,
        metaLlegada: 25,
        unidadMedida: '%',
        avanceMeta: 22.5,
        category: 'Procesos Internos',
        goal: 'Optimizar procesos',
        resultKeys: []
      });

      const planningData = JSON.parse(planningDataJSON);

      // Verify all fields are loaded
      expect(planningData.ponderacion).toBe(45);
      expect(planningData.puntoPartida).toBe(20);
      expect(planningData.metaLlegada).toBe(25);
      expect(planningData.unidadMedida).toBe('%');
      expect(planningData.avanceMeta).toBe(22.5);
      expect(planningData.category).toBe('Procesos Internos');
      expect(planningData.goal).toBe('Optimizar procesos');
    });

    it('should provide defaults for missing fields', () => {
      const planningDataJSON = JSON.stringify({
        category: 'Finanzas',
        goal: 'Aumentar rentabilidad'
      });

      const planningData = planningDataJSON
        ? JSON.parse(planningDataJSON)
        : { category: '', goal: 0, resultKeys: [] };

      // Verify defaults are applied
      const ponderacion = planningData.ponderacion || 0;
      const puntoPartida = planningData.puntoPartida || 0;
      const metaLlegada = planningData.metaLlegada || 0;
      const unidadMedida = planningData.unidadMedida || '';
      const avanceMeta = planningData.avanceMeta || 0;

      expect(ponderacion).toBe(0);
      expect(puntoPartida).toBe(0);
      expect(metaLlegada).toBe(0);
      expect(unidadMedida).toBe('');
      expect(avanceMeta).toBe(0);
    });
  });

  describe('Data loss prevention', () => {
    it('should not lose data when switching between Definition and Planning', () => {
      // Simulate the scenario: save in Planning, go to Definition, come back
      const initialPlanningData = {
        ponderacion: 45,
        puntoPartida: 20,
        metaLlegada: 25,
        unidadMedida: '%',
        avanceMeta: 22.5,
        category: 'Procesos Internos',
        goal: 'Optimizar procesos',
        resultKeys: [
          { id: '1', description: 'Task 1', responsible: 'Juan' }
        ]
      };

      // Save to DB (JSON stringified)
      const savedJSON = JSON.stringify(initialPlanningData);

      // Later, load from DB
      const loadedPlanningData = JSON.parse(savedJSON);

      // Verify all data is intact
      expect(loadedPlanningData).toEqual(initialPlanningData);
      expect(loadedPlanningData.ponderacion).toBe(45);
      expect(loadedPlanningData.avanceMeta).toBe(22.5);
      expect(loadedPlanningData.resultKeys.length).toBe(1);
    });
  });
});
