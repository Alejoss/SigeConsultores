import { describe, it, expect } from 'vitest';

interface Task {
  id: string;
  description: string;
  responsible: string;
  date: string;
  percentageCompleted: number;
  weighting: number;
}

interface ResultKey {
  id: string;
  description: string;
  responsible: string;
  startDate: string;
  endDate: string;
  implementationDate: string;
  observation: string;
  tasks: Task[];
  number?: number;
  ponderacion?: number;
  condicionInicial?: number;
  meta?: number;
  condicionActual?: number;
  porcentajeAlcanzado?: number;
}

interface TacticalPlanning {
  id: string;
  objectiveId: number;
  objectiveName: string;
  objectiveEnunciation: string;
  objectiveExplanation: string;
  objectiveResponsible: string;
  category: string;
  goal: string | number;
  resultKeys: ResultKey[];
  expanded: boolean;
  ponderacion?: number;
  puntoPartida?: number;
  metaLlegada?: number;
  unidadMedida?: string;
  avanceMeta?: number;
  porcentajeMetaAlcanzado?: number;
}

// Helper functions (same as in TacticalPlanning.tsx)
const calculateTasksAverage = (resultKey: ResultKey): number => {
  if (!resultKey.tasks || resultKey.tasks.length === 0) return 0;
  const totalCompletion = resultKey.tasks.reduce((sum, task) => sum + (task.percentageCompleted || 0), 0);
  return totalCompletion / resultKey.tasks.length;
};

const calculateOTTasksAverage = (planning: TacticalPlanning): number => {
  if (!planning.resultKeys || planning.resultKeys.length === 0) return 0;
  const totalAverage = planning.resultKeys.reduce((sum, rk) => sum + calculateTasksAverage(rk), 0);
  return totalAverage / planning.resultKeys.length;
};

describe('Tasks Average Calculations', () => {
  describe('calculateTasksAverage', () => {
    it('should return 0 when there are no tasks', () => {
      const resultKey: ResultKey = {
        id: '1',
        description: 'Test OO',
        responsible: 'John',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        implementationDate: '2026-01-01',
        observation: '',
        tasks: [],
      };

      expect(calculateTasksAverage(resultKey)).toBe(0);
    });

    it('should calculate average of 3 tasks correctly', () => {
      const resultKey: ResultKey = {
        id: '1',
        description: 'Test OO',
        responsible: 'John',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        implementationDate: '2026-01-01',
        observation: '',
        tasks: [
          { id: '1', description: 'Task 1', responsible: 'John', date: '2026-01-15', percentageCompleted: 100, weighting: 0 },
          { id: '2', description: 'Task 2', responsible: 'Jane', date: '2026-02-15', percentageCompleted: 50, weighting: 0 },
          { id: '3', description: 'Task 3', responsible: 'Bob', date: '2026-03-15', percentageCompleted: 0, weighting: 0 },
        ],
      };

      // Average = (100 + 50 + 0) / 3 = 50
      expect(calculateTasksAverage(resultKey)).toBe(50);
    });

    it('should handle all tasks at 100%', () => {
      const resultKey: ResultKey = {
        id: '1',
        description: 'Test OO',
        responsible: 'John',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        implementationDate: '2026-01-01',
        observation: '',
        tasks: [
          { id: '1', description: 'Task 1', responsible: 'John', date: '2026-01-15', percentageCompleted: 100, weighting: 0 },
          { id: '2', description: 'Task 2', responsible: 'Jane', date: '2026-02-15', percentageCompleted: 100, weighting: 0 },
          { id: '3', description: 'Task 3', responsible: 'Bob', date: '2026-03-15', percentageCompleted: 100, weighting: 0 },
        ],
      };

      expect(calculateTasksAverage(resultKey)).toBe(100);
    });

    it('should handle all tasks at 0%', () => {
      const resultKey: ResultKey = {
        id: '1',
        description: 'Test OO',
        responsible: 'John',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        implementationDate: '2026-01-01',
        observation: '',
        tasks: [
          { id: '1', description: 'Task 1', responsible: 'John', date: '2026-01-15', percentageCompleted: 0, weighting: 0 },
          { id: '2', description: 'Task 2', responsible: 'Jane', date: '2026-02-15', percentageCompleted: 0, weighting: 0 },
          { id: '3', description: 'Task 3', responsible: 'Bob', date: '2026-03-15', percentageCompleted: 0, weighting: 0 },
        ],
      };

      expect(calculateTasksAverage(resultKey)).toBe(0);
    });

    it('should handle decimal percentages', () => {
      const resultKey: ResultKey = {
        id: '1',
        description: 'Test OO',
        responsible: 'John',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        implementationDate: '2026-01-01',
        observation: '',
        tasks: [
          { id: '1', description: 'Task 1', responsible: 'John', date: '2026-01-15', percentageCompleted: 33.33, weighting: 0 },
          { id: '2', description: 'Task 2', responsible: 'Jane', date: '2026-02-15', percentageCompleted: 66.67, weighting: 0 },
          { id: '3', description: 'Task 3', responsible: 'Bob', date: '2026-03-15', percentageCompleted: 50, weighting: 0 },
        ],
      };

      // Average = (33.33 + 66.67 + 50) / 3 = 50
      expect(calculateTasksAverage(resultKey)).toBeCloseTo(50, 1);
    });
  });

  describe('calculateOTTasksAverage', () => {
    it('should return 0 when there are no OOs', () => {
      const planning: TacticalPlanning = {
        id: '1',
        objectiveId: 1,
        objectiveName: 'Test OT',
        objectiveEnunciation: 'Test',
        objectiveExplanation: 'Test',
        objectiveResponsible: 'John',
        category: 'Finanzas',
        goal: 'Test goal',
        resultKeys: [],
        expanded: false,
      };

      expect(calculateOTTasksAverage(planning)).toBe(0);
    });

    it('should calculate average of 2 OOs with tasks correctly', () => {
      const planning: TacticalPlanning = {
        id: '1',
        objectiveId: 1,
        objectiveName: 'Test OT',
        objectiveEnunciation: 'Test',
        objectiveExplanation: 'Test',
        objectiveResponsible: 'John',
        category: 'Finanzas',
        goal: 'Test goal',
        resultKeys: [
          {
            id: '1',
            description: 'OO1',
            responsible: 'John',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            implementationDate: '2026-01-01',
            observation: '',
            tasks: [
              { id: '1', description: 'Task 1', responsible: 'John', date: '2026-01-15', percentageCompleted: 100, weighting: 0 },
              { id: '2', description: 'Task 2', responsible: 'Jane', date: '2026-02-15', percentageCompleted: 50, weighting: 0 },
              { id: '3', description: 'Task 3', responsible: 'Bob', date: '2026-03-15', percentageCompleted: 0, weighting: 0 },
            ],
          },
          {
            id: '2',
            description: 'OO2',
            responsible: 'Jane',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            implementationDate: '2026-01-01',
            observation: '',
            tasks: [
              { id: '4', description: 'Task 4', responsible: 'Bob', date: '2026-01-15', percentageCompleted: 80, weighting: 0 },
              { id: '5', description: 'Task 5', responsible: 'Alice', date: '2026-02-15', percentageCompleted: 60, weighting: 0 },
              { id: '6', description: 'Task 6', responsible: 'Charlie', date: '2026-03-15', percentageCompleted: 40, weighting: 0 },
            ],
          },
        ],
        expanded: false,
      };

      // OO1 average = (100 + 50 + 0) / 3 = 50
      // OO2 average = (80 + 60 + 40) / 3 = 60
      // OT average = (50 + 60) / 2 = 55
      expect(calculateOTTasksAverage(planning)).toBe(55);
    });

    it('should handle OT with single OO', () => {
      const planning: TacticalPlanning = {
        id: '1',
        objectiveId: 1,
        objectiveName: 'Test OT',
        objectiveEnunciation: 'Test',
        objectiveExplanation: 'Test',
        objectiveResponsible: 'John',
        category: 'Finanzas',
        goal: 'Test goal',
        resultKeys: [
          {
            id: '1',
            description: 'OO1',
            responsible: 'John',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            implementationDate: '2026-01-01',
            observation: '',
            tasks: [
              { id: '1', description: 'Task 1', responsible: 'John', date: '2026-01-15', percentageCompleted: 75, weighting: 0 },
              { id: '2', description: 'Task 2', responsible: 'Jane', date: '2026-02-15', percentageCompleted: 75, weighting: 0 },
              { id: '3', description: 'Task 3', responsible: 'Bob', date: '2026-03-15', percentageCompleted: 75, weighting: 0 },
            ],
          },
        ],
        expanded: false,
      };

      // OO1 average = (75 + 75 + 75) / 3 = 75
      // OT average = 75
      expect(calculateOTTasksAverage(planning)).toBe(75);
    });

    it('should match Agrogana scenario: OO1=75%, OO2=60%', () => {
      const planning: TacticalPlanning = {
        id: '1',
        objectiveId: 1,
        objectiveName: 'Subir de 19,5% a 25%',
        objectiveEnunciation: 'Test',
        objectiveExplanation: 'Test',
        objectiveResponsible: 'John',
        category: 'Finanzas',
        goal: 'Test goal',
        resultKeys: [
          {
            id: '1',
            description: 'OO1',
            responsible: 'John',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            implementationDate: '2026-01-01',
            observation: '',
            tasks: [
              { id: '1', description: 'Task 1', responsible: 'John', date: '2026-01-15', percentageCompleted: 80, weighting: 0 },
              { id: '2', description: 'Task 2', responsible: 'Jane', date: '2026-02-15', percentageCompleted: 75, weighting: 0 },
              { id: '3', description: 'Task 3', responsible: 'Bob', date: '2026-03-15', percentageCompleted: 70, weighting: 0 },
            ],
          },
          {
            id: '2',
            description: 'OO2',
            responsible: 'Jane',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            implementationDate: '2026-01-01',
            observation: '',
            tasks: [
              { id: '4', description: 'Task 4', responsible: 'Bob', date: '2026-01-15', percentageCompleted: 60, weighting: 0 },
              { id: '5', description: 'Task 5', responsible: 'Alice', date: '2026-02-15', percentageCompleted: 60, weighting: 0 },
              { id: '6', description: 'Task 6', responsible: 'Charlie', date: '2026-03-15', percentageCompleted: 60, weighting: 0 },
            ],
          },
        ],
        expanded: false,
      };

      // OO1 average = (80 + 75 + 70) / 3 = 75
      // OO2 average = (60 + 60 + 60) / 3 = 60
      // OT average = (75 + 60) / 2 = 67.5
      expect(calculateOTTasksAverage(planning)).toBe(67.5);
    });
  });
});
