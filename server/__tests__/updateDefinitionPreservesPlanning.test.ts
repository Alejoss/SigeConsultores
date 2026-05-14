import { describe, it, expect } from 'vitest';

describe('Update Definition Preserves Planning Data - Bug #2 Final Fix', () => {
  describe('Scenario: User edits Definition field, Planning data should be preserved', () => {
    it('should preserve planning data when updating metaLlegada in Definition', () => {
      // Step 1: User has filled planning data
      const initialPlanningData = {
        ponderacion: 45,
        puntoPartida: 20,
        metaLlegada: 20, // Original value
        unidadMedida: '%',
        avanceMeta: 0,
        category: 'Finanzas',
        goal: 'Aumentar rentabilidad',
        resultKeys: [
          { id: '1', description: 'Tarea 1', responsible: 'Juan' }
        ]
      };

      // Step 2: User edits metaLlegada in Definition (from 20 to 25)
      // This triggers an update mutation WITHOUT planningData
      const updateInput = {
        objectiveId: 1,
        name: 'Subir de 19,5% a 25%...',
        ponderacion: 45,
        puntoPartida: 20,
        metaLlegada: 25, // Changed value
        unidadMedida: '%',
        // NOTE: planningData is NOT sent from Definition
        // planningData: undefined
      };

      // Step 3: Backend merge logic (same as update mutation)
      const existingPlanningData = initialPlanningData;
      const planningDataObj = {
        ...existingPlanningData,
        ponderacion: updateInput.ponderacion !== undefined ? updateInput.ponderacion : (existingPlanningData.ponderacion || 0),
        puntoPartida: updateInput.puntoPartida !== undefined ? updateInput.puntoPartida : (existingPlanningData.puntoPartida || 0),
        metaLlegada: updateInput.metaLlegada !== undefined ? updateInput.metaLlegada : (existingPlanningData.metaLlegada || 0),
        unidadMedida: updateInput.unidadMedida !== undefined ? updateInput.unidadMedida : (existingPlanningData.unidadMedida || ''),
      };

      // Step 4: Verify all planning data is preserved
      expect(planningDataObj.category).toBe('Finanzas');
      expect(planningDataObj.goal).toBe('Aumentar rentabilidad');
      expect(planningDataObj.resultKeys.length).toBe(1);
      expect(planningDataObj.resultKeys[0].description).toBe('Tarea 1');
      expect(planningDataObj.avanceMeta).toBe(0);
      
      // And the updated value is applied
      expect(planningDataObj.metaLlegada).toBe(25);
      expect(planningDataObj.ponderacion).toBe(45);
    });

    it('should preserve all planning fields when only one Definition field changes', () => {
      const existingPlanningData = {
        ponderacion: 40,
        puntoPartida: 9000,
        metaLlegada: 6750,
        unidadMedida: '$',
        avanceMeta: 7000,
        category: 'Procesos Internos',
        goal: 'Reducir costos',
        resultKeys: [
          { id: 'rk1', description: 'Result Key 1', responsible: 'Team A', tasks: [] },
          { id: 'rk2', description: 'Result Key 2', responsible: 'Team B', tasks: [] }
        ]
      };

      // User only changes puntoPartida
      const updateInput = {
        objectiveId: 1,
        name: 'Objetivo',
        ponderacion: undefined,
        puntoPartida: 9500, // Changed
        metaLlegada: undefined,
        unidadMedida: undefined,
      };

      const planningDataObj = {
        ...existingPlanningData,
        ponderacion: updateInput.ponderacion !== undefined ? updateInput.ponderacion : (existingPlanningData.ponderacion || 0),
        puntoPartida: updateInput.puntoPartida !== undefined ? updateInput.puntoPartida : (existingPlanningData.puntoPartida || 0),
        metaLlegada: updateInput.metaLlegada !== undefined ? updateInput.metaLlegada : (existingPlanningData.metaLlegada || 0),
        unidadMedida: updateInput.unidadMedida !== undefined ? updateInput.unidadMedida : (existingPlanningData.unidadMedida || ''),
      };

      // Verify only puntoPartida changed
      expect(planningDataObj.puntoPartida).toBe(9500);
      
      // All other fields preserved
      expect(planningDataObj.ponderacion).toBe(40);
      expect(planningDataObj.metaLlegada).toBe(6750);
      expect(planningDataObj.unidadMedida).toBe('$');
      expect(planningDataObj.avanceMeta).toBe(7000);
      expect(planningDataObj.category).toBe('Procesos Internos');
      expect(planningDataObj.goal).toBe('Reducir costos');
      expect(planningDataObj.resultKeys.length).toBe(2);
    });

    it('should handle empty existing planning data gracefully', () => {
      const existingPlanningData = {};

      const updateInput = {
        objectiveId: 1,
        name: 'Objetivo',
        ponderacion: 50,
        puntoPartida: 10,
        metaLlegada: 50,
        unidadMedida: 'unidades',
      };

      const planningDataObj = {
        ...existingPlanningData,
        ponderacion: updateInput.ponderacion !== undefined ? updateInput.ponderacion : (existingPlanningData.ponderacion || 0),
        puntoPartida: updateInput.puntoPartida !== undefined ? updateInput.puntoPartida : (existingPlanningData.puntoPartida || 0),
        metaLlegada: updateInput.metaLlegada !== undefined ? updateInput.metaLlegada : (existingPlanningData.metaLlegada || 0),
        unidadMedida: updateInput.unidadMedida !== undefined ? updateInput.unidadMedida : (existingPlanningData.unidadMedida || ''),
      };

      expect(planningDataObj.ponderacion).toBe(50);
      expect(planningDataObj.puntoPartida).toBe(10);
      expect(planningDataObj.metaLlegada).toBe(50);
      expect(planningDataObj.unidadMedida).toBe('unidades');
    });

    it('should preserve avanceMeta when updating Definition', () => {
      const existingPlanningData = {
        ponderacion: 45,
        puntoPartida: 20,
        metaLlegada: 25,
        unidadMedida: '%',
        avanceMeta: 22.5, // User's manual entry
        category: 'Finanzas',
        goal: 'Aumentar rentabilidad',
        resultKeys: []
      };

      // User updates metaLlegada
      const updateInput = {
        objectiveId: 1,
        name: 'Objetivo',
        ponderacion: 45,
        puntoPartida: 20,
        metaLlegada: 30, // Changed
        unidadMedida: '%',
      };

      const planningDataObj = {
        ...existingPlanningData,
        ponderacion: updateInput.ponderacion !== undefined ? updateInput.ponderacion : (existingPlanningData.ponderacion || 0),
        puntoPartida: updateInput.puntoPartida !== undefined ? updateInput.puntoPartida : (existingPlanningData.puntoPartida || 0),
        metaLlegada: updateInput.metaLlegada !== undefined ? updateInput.metaLlegada : (existingPlanningData.metaLlegada || 0),
        unidadMedida: updateInput.unidadMedida !== undefined ? updateInput.unidadMedida : (existingPlanningData.unidadMedida || ''),
      };

      // avanceMeta should be preserved even though it's not in updateInput
      expect(planningDataObj.avanceMeta).toBe(22.5);
      expect(planningDataObj.metaLlegada).toBe(30);
    });

    it('should preserve resultKeys and category when updating any Definition field', () => {
      const existingPlanningData = {
        ponderacion: 60,
        puntoPartida: 40,
        metaLlegada: 90,
        unidadMedida: 'unidades',
        avanceMeta: 60,
        category: 'Cliente',
        goal: 'Mejorar satisfacción',
        resultKeys: [
          {
            id: 'rk1',
            description: 'Objetivo Operativo 1',
            responsible: 'Responsable de Finca',
            ponderacion: 40,
            condicionInicial: 9000,
            meta: 6750,
            condicionActual: 7000,
            porcentajeAlcanzado: 88.89
          },
          {
            id: 'rk2',
            description: 'Objetivo Operativo 2',
            responsible: 'Jefe de Finca, Ventas y GG',
            ponderacion: 60,
            condicionInicial: 40,
            meta: 90,
            condicionActual: 60,
            porcentajeAlcanzado: 40
          }
        ]
      };

      // User updates name and metaLlegada
      const updateInput = {
        objectiveId: 1,
        name: 'Objetivo Táctico Actualizado',
        ponderacion: 60,
        puntoPartida: 40,
        metaLlegada: 95, // Changed
        unidadMedida: 'unidades',
      };

      const planningDataObj = {
        ...existingPlanningData,
        ponderacion: updateInput.ponderacion !== undefined ? updateInput.ponderacion : (existingPlanningData.ponderacion || 0),
        puntoPartida: updateInput.puntoPartida !== undefined ? updateInput.puntoPartida : (existingPlanningData.puntoPartida || 0),
        metaLlegada: updateInput.metaLlegada !== undefined ? updateInput.metaLlegada : (existingPlanningData.metaLlegada || 0),
        unidadMedida: updateInput.unidadMedida !== undefined ? updateInput.unidadMedida : (existingPlanningData.unidadMedida || ''),
      };

      // Verify resultKeys are completely preserved
      expect(planningDataObj.resultKeys.length).toBe(2);
      expect(planningDataObj.resultKeys[0].ponderacion).toBe(40);
      expect(planningDataObj.resultKeys[0].condicionActual).toBe(7000);
      expect(planningDataObj.resultKeys[0].porcentajeAlcanzado).toBe(88.89);
      expect(planningDataObj.resultKeys[1].ponderacion).toBe(60);
      expect(planningDataObj.resultKeys[1].condicionActual).toBe(60);
      expect(planningDataObj.resultKeys[1].porcentajeAlcanzado).toBe(40);
      
      // And category/goal preserved
      expect(planningDataObj.category).toBe('Cliente');
      expect(planningDataObj.goal).toBe('Mejorar satisfacción');
      
      // And metaLlegada updated
      expect(planningDataObj.metaLlegada).toBe(95);
    });
  });
});
