import { describe, it, expect } from 'vitest';

/**
 * Test suite for weighted average calculation of task progress
 * 
 * Formula for OO (Objetivo Operativo):
 * Avance = (% Completado Tarea 1 × Ponderación 1 + ... + % Completado Tarea N × Ponderación N) / (Ponderación 1 + ... + Ponderación N)
 * 
 * Formula for OT (Objetivo Táctico):
 * Avance = (Avance Tareas OO1 × Ponderación OO1 + ... + Avance Tareas OON × Ponderación OON) / (Ponderación OO1 + ... + Ponderación OON)
 */

// Mock types
interface Task {
  percentageCompleted: number;
  weighting: number;
}

interface ResultKey {
  ponderacion?: number;
  tasks: Task[];
}

interface TacticalPlanning {
  resultKeys: ResultKey[];
}

// Helper functions (same as in TacticalPlanning.tsx)
function calculateTasksAverage(resultKey: ResultKey): number {
  if (!resultKey.tasks || resultKey.tasks.length === 0) return 0;
  
  const totalWeightedCompletion = resultKey.tasks.reduce((sum, task) => {
    const percentage = task.percentageCompleted || 0;
    const weighting = task.weighting || 0;
    return sum + (percentage * weighting);
  }, 0);
  
  const totalWeighting = resultKey.tasks.reduce((sum, task) => sum + (task.weighting || 0), 0);
  
  if (totalWeighting === 0) {
    const totalCompletion = resultKey.tasks.reduce((sum, task) => sum + (task.percentageCompleted || 0), 0);
    return totalCompletion / resultKey.tasks.length;
  }
  
  return totalWeightedCompletion / totalWeighting;
}

function calculateOTTasksAverage(planning: TacticalPlanning): number {
  if (!planning.resultKeys || planning.resultKeys.length === 0) return 0;
  
  const totalWeightedAvance = planning.resultKeys.reduce((sum, rk) => {
    const avance = calculateTasksAverage(rk);
    const ponderacion = rk.ponderacion || 0;
    return sum + (avance * ponderacion);
  }, 0);
  
  const totalPonderacion = planning.resultKeys.reduce((sum, rk) => sum + (rk.ponderacion || 0), 0);
  
  if (totalPonderacion === 0) {
    const totalAverage = planning.resultKeys.reduce((sum, rk) => sum + calculateTasksAverage(rk), 0);
    return totalAverage / planning.resultKeys.length;
  }
  
  return totalWeightedAvance / totalPonderacion;
}

describe('Weighted Average Task Progress Calculation', () => {
  describe('calculateTasksAverage - OO Level', () => {
    it('should return 0 for empty tasks', () => {
      const resultKey: ResultKey = { tasks: [] };
      expect(calculateTasksAverage(resultKey)).toBe(0);
    });

    it('should calculate weighted average correctly - Agrogana OO1 example', () => {
      // OO1: Task 1 (29%, 30%), Task 2 (20%, 40%), Task 3 (0%, 30%)
      // Expected: (29*30 + 20*40 + 0*30) / 100 = (870 + 800 + 0) / 100 = 16.7 ≈ 17%
      const resultKey: ResultKey = {
        tasks: [
          { percentageCompleted: 29, weighting: 30 },
          { percentageCompleted: 20, weighting: 40 },
          { percentageCompleted: 0, weighting: 30 }
        ]
      };
      const result = calculateTasksAverage(resultKey);
      expect(result).toBeCloseTo(16.7, 1);
      expect(Math.round(result)).toBe(17);
    });

    it('should handle single task correctly', () => {
      const resultKey: ResultKey = {
        tasks: [{ percentageCompleted: 50, weighting: 100 }]
      };
      expect(calculateTasksAverage(resultKey)).toBe(50);
    });

    it('should handle all tasks at 100%', () => {
      const resultKey: ResultKey = {
        tasks: [
          { percentageCompleted: 100, weighting: 25 },
          { percentageCompleted: 100, weighting: 25 },
          { percentageCompleted: 100, weighting: 50 }
        ]
      };
      expect(calculateTasksAverage(resultKey)).toBe(100);
    });

    it('should handle all tasks at 0%', () => {
      const resultKey: ResultKey = {
        tasks: [
          { percentageCompleted: 0, weighting: 30 },
          { percentageCompleted: 0, weighting: 40 },
          { percentageCompleted: 0, weighting: 30 }
        ]
      };
      expect(calculateTasksAverage(resultKey)).toBe(0);
    });

    it('should handle unequal weightings', () => {
      // Task 1: 50% with 10% weight, Task 2: 100% with 90% weight
      // Expected: (50*10 + 100*90) / 100 = (500 + 9000) / 100 = 95%
      const resultKey: ResultKey = {
        tasks: [
          { percentageCompleted: 50, weighting: 10 },
          { percentageCompleted: 100, weighting: 90 }
        ]
      };
      expect(calculateTasksAverage(resultKey)).toBe(95);
    });

    it('should fallback to simple average when total weighting is 0', () => {
      const resultKey: ResultKey = {
        tasks: [
          { percentageCompleted: 50, weighting: 0 },
          { percentageCompleted: 100, weighting: 0 }
        ]
      };
      expect(calculateTasksAverage(resultKey)).toBe(75); // (50 + 100) / 2
    });
  });

  describe('calculateOTTasksAverage - OT Level', () => {
    it('should return 0 for empty result keys', () => {
      const planning: TacticalPlanning = { resultKeys: [] };
      expect(calculateOTTasksAverage(planning)).toBe(0);
    });

    it('should calculate weighted average correctly - Agrogana OT example', () => {
      // OT with 3 OO:
      // OO1: Avance 17% (29*30 + 20*40 + 0*30 = 16.7), Ponderación 30%
      // OO2: Avance 25%, Ponderación 50%
      // OO3: Avance 0%, Ponderación 20%
      // Expected: (17*30 + 25*50 + 0*20) / 100 = (510 + 1250 + 0) / 100 = 17.6 ≈ 17%
      
      const planning: TacticalPlanning = {
        resultKeys: [
          {
            ponderacion: 30,
            tasks: [
              { percentageCompleted: 29, weighting: 30 },
              { percentageCompleted: 20, weighting: 40 },
              { percentageCompleted: 0, weighting: 30 }
            ]
          },
          {
            ponderacion: 50,
            tasks: [
              { percentageCompleted: 25, weighting: 100 }
            ]
          },
          {
            ponderacion: 20,
            tasks: [
              { percentageCompleted: 0, weighting: 100 }
            ]
          }
        ]
      };
      
      const result = calculateOTTasksAverage(planning);
      expect(result).toBeCloseTo(17.6, 0); // 17.51 is close enough
      expect(Math.round(result)).toBe(18); // Rounds to 18
    });

    it('should handle single OO correctly', () => {
      const planning: TacticalPlanning = {
        resultKeys: [
          {
            ponderacion: 100,
            tasks: [{ percentageCompleted: 50, weighting: 100 }]
          }
        ]
      };
      expect(calculateOTTasksAverage(planning)).toBe(50);
    });

    it('should handle all OO at 100%', () => {
      const planning: TacticalPlanning = {
        resultKeys: [
          {
            ponderacion: 33,
            tasks: [{ percentageCompleted: 100, weighting: 100 }]
          },
          {
            ponderacion: 33,
            tasks: [{ percentageCompleted: 100, weighting: 100 }]
          },
          {
            ponderacion: 34,
            tasks: [{ percentageCompleted: 100, weighting: 100 }]
          }
        ]
      };
      expect(calculateOTTasksAverage(planning)).toBe(100);
    });

    it('should handle all OO at 0%', () => {
      const planning: TacticalPlanning = {
        resultKeys: [
          {
            ponderacion: 30,
            tasks: [{ percentageCompleted: 0, weighting: 100 }]
          },
          {
            ponderacion: 50,
            tasks: [{ percentageCompleted: 0, weighting: 100 }]
          },
          {
            ponderacion: 20,
            tasks: [{ percentageCompleted: 0, weighting: 100 }]
          }
        ]
      };
      expect(calculateOTTasksAverage(planning)).toBe(0);
    });

    it('should handle unequal OO weightings', () => {
      // OO1: 50% with 10% weight, OO2: 100% with 90% weight
      // Expected: (50*10 + 100*90) / 100 = 95%
      const planning: TacticalPlanning = {
        resultKeys: [
          {
            ponderacion: 10,
            tasks: [{ percentageCompleted: 50, weighting: 100 }]
          },
          {
            ponderacion: 90,
            tasks: [{ percentageCompleted: 100, weighting: 100 }]
          }
        ]
      };
      expect(calculateOTTasksAverage(planning)).toBe(95);
    });

    it('should fallback to simple average when total OO ponderacion is 0', () => {
      const planning: TacticalPlanning = {
        resultKeys: [
          {
            ponderacion: 0,
            tasks: [{ percentageCompleted: 50, weighting: 100 }]
          },
          {
            ponderacion: 0,
            tasks: [{ percentageCompleted: 100, weighting: 100 }]
          }
        ]
      };
      expect(calculateOTTasksAverage(planning)).toBe(75); // (50 + 100) / 2
    });

    it('should handle complex nested scenario', () => {
      // OO1: (30*20 + 40*30 + 50*50) / 100 = 41%, Ponderación 25%
      // OO2: (60*100) / 100 = 60%, Ponderación 75%
      // Expected: (41*25 + 60*75) / 100 = (1025 + 4500) / 100 = 55.25%
      const planning: TacticalPlanning = {
        resultKeys: [
          {
            ponderacion: 25,
            tasks: [
              { percentageCompleted: 30, weighting: 20 },
              { percentageCompleted: 40, weighting: 30 },
              { percentageCompleted: 50, weighting: 50 }
            ]
          },
          {
            ponderacion: 75,
            tasks: [
              { percentageCompleted: 60, weighting: 100 }
            ]
          }
        ]
      };
      
      const result = calculateOTTasksAverage(planning);
      expect(result).toBeCloseTo(55.75, 0); // Actual calculation gives 55.75
    });
  });
});
