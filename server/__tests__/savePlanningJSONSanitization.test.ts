import { describe, it, expect } from 'vitest';

describe('savePlanning JSON Sanitization - Fix for 80 Errors', () => {
  describe('Sanitize function should handle complex objects', () => {
    // Replicate the sanitizeForJSON function from the fix
    const sanitizeForJSON = (obj: any): any => {
      if (obj === null || obj === undefined) return null;
      if (typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeForJSON(item));
      }
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          if (value === undefined) {
            // Skip undefined values
            continue;
          } else if (value === null) {
            sanitized[key] = null;
          } else if (typeof value === 'object') {
            sanitized[key] = sanitizeForJSON(value);
          } else if (typeof value === 'function') {
            // Skip functions
            continue;
          } else {
            sanitized[key] = value;
          }
        }
      }
      return sanitized;
    };

    it('should remove undefined values from objects', () => {
      const input = {
        id: '1',
        description: 'Test',
        undefined_field: undefined,
        value: 42,
      };

      const sanitized = sanitizeForJSON(input);
      expect(sanitized).toEqual({
        id: '1',
        description: 'Test',
        value: 42,
      });
      expect(sanitized.undefined_field).toBeUndefined();
    });

    it('should handle arrays with undefined values', () => {
      const input = [
        { id: '1', description: 'Item 1' },
        { id: '2', description: undefined },
        { id: '3', value: 100 },
      ];

      const sanitized = sanitizeForJSON(input);
      expect(sanitized.length).toBe(3);
      expect(sanitized[0]).toEqual({ id: '1', description: 'Item 1' });
      expect(sanitized[1]).toEqual({ id: '2' });
      expect(sanitized[2]).toEqual({ id: '3', value: 100 });
    });

    it('should skip function properties', () => {
      const input = {
        id: '1',
        description: 'Test',
        myFunction: () => console.log('test'),
        value: 42,
      };

      const sanitized = sanitizeForJSON(input);
      expect(sanitized).toEqual({
        id: '1',
        description: 'Test',
        value: 42,
      });
      expect(sanitized.myFunction).toBeUndefined();
    });

    it('should handle nested objects with mixed undefined and null values', () => {
      const input = {
        id: '1',
        nested: {
          field1: 'value',
          field2: undefined,
          field3: null,
          deepNested: {
            a: 1,
            b: undefined,
          },
        },
        array: [
          { x: 1, y: undefined },
          { x: 2, y: null },
        ],
      };

      const sanitized = sanitizeForJSON(input);
      expect(sanitized.nested.field1).toBe('value');
      expect(sanitized.nested.field2).toBeUndefined();
      expect(sanitized.nested.field3).toBeNull();
      expect(sanitized.nested.deepNested.a).toBe(1);
      expect(sanitized.nested.deepNested.b).toBeUndefined();
      expect(sanitized.array[0].x).toBe(1);
      expect(sanitized.array[0].y).toBeUndefined();
      expect(sanitized.array[1].x).toBe(2);
      expect(sanitized.array[1].y).toBeNull();
    });

    it('should be JSON.stringify compatible after sanitization', () => {
      const input = {
        id: '1',
        description: 'Test',
        undefined_field: undefined,
        null_field: null,
        nested: {
          value: 42,
          undef: undefined,
        },
        array: [
          { id: '1', undef: undefined },
          { id: '2', value: 'test' },
        ],
      };

      const sanitized = sanitizeForJSON(input);
      
      // Should not throw
      const jsonString = JSON.stringify(sanitized);
      expect(jsonString).toBeTruthy();
      expect(jsonString.length).toBeGreaterThan(0);
      
      // Should be able to parse back
      const parsed = JSON.parse(jsonString);
      expect(parsed.id).toBe('1');
      expect(parsed.description).toBe('Test');
      expect(parsed.nested.value).toBe(42);
    });

    it('should handle ResultKey objects from TacticalPlanning', () => {
      const resultKeys = [
        {
          id: 'rk1',
          description: 'Objetivo Operativo 1',
          responsible: 'Responsable de Finca',
          startDate: '15/03/2026',
          endDate: '31/12/2026',
          implementationDate: '',
          observation: '',
          tasks: [],
          number: 1,
          ponderacion: 40,
          condicionInicial: 9000,
          meta: 6750,
          condicionActual: 7000,
          porcentajeAlcanzado: 88.89,
        },
        {
          id: 'rk2',
          description: 'Objetivo Operativo 2',
          responsible: 'Jefe de Finca, Ventas y GG',
          startDate: undefined,
          endDate: '31/12/2026',
          implementationDate: null,
          observation: '',
          tasks: [],
          number: 2,
          ponderacion: 60,
          condicionInicial: 40,
          meta: 90,
          condicionActual: 60,
          porcentajeAlcanzado: 40,
        },
      ];

      const sanitized = sanitizeForJSON(resultKeys);
      
      // Should be JSON.stringify compatible
      const jsonString = JSON.stringify(sanitized);
      expect(jsonString).toBeTruthy();
      
      // Should preserve all important fields
      expect(sanitized[0].ponderacion).toBe(40);
      expect(sanitized[0].porcentajeAlcanzado).toBe(88.89);
      expect(sanitized[1].ponderacion).toBe(60);
      
      // Should remove undefined but keep null
      expect(sanitized[1].startDate).toBeUndefined();
      expect(sanitized[1].implementationDate).toBeNull();
    });

    it('should handle planning data merge scenario', () => {
      const existingPlanningData = {
        ponderacion: 45,
        puntoPartida: 20,
        metaLlegada: 25,
        unidadMedida: '%',
        avanceMeta: 21.5,
        category: 'Finanzas',
        goal: 'Aumentar rentabilidad',
        resultKeys: [
          {
            id: 'rk1',
            description: 'OO1',
            ponderacion: 40,
            condicionInicial: 9000,
            meta: 6750,
            condicionActual: 7000,
            porcentajeAlcanzado: 88.89,
          },
        ],
      };

      const newResultKeys = [
        {
          id: 'rk1',
          description: 'OO1',
          ponderacion: 40,
          condicionInicial: 9000,
          meta: 6750,
          condicionActual: 7000,
          porcentajeAlcanzado: 88.89,
          undefined_prop: undefined,
        },
      ];

      const planningData = {
        ...existingPlanningData,
        resultKeys: sanitizeForJSON(newResultKeys),
      };

      const jsonString = JSON.stringify(planningData);
      expect(jsonString).toBeTruthy();
      
      const parsed = JSON.parse(jsonString);
      expect(parsed.ponderacion).toBe(45);
      expect(parsed.avanceMeta).toBe(21.5);
      expect(parsed.resultKeys[0].porcentajeAlcanzado).toBe(88.89);
      expect(parsed.resultKeys[0].undefined_prop).toBeUndefined();
    });
  });
});
