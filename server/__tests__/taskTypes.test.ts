import { describe, it, expect } from 'vitest';

describe('Task Types - Puntual vs Mensual', () => {
  describe('Puntual Task Type (Direct %)', () => {
    it('should accept percentage directly from 0-100', () => {
      const task = {
        id: 'task1',
        description: 'Tarea Puntual',
        taskType: 'puntual' as const,
        percentageCompleted: 75,
        monthlyProgress: undefined,
      };

      expect(task.taskType).toBe('puntual');
      expect(task.percentageCompleted).toBe(75);
      expect(task.monthlyProgress).toBeUndefined();
    });

    it('should handle 0% completion', () => {
      const task = {
        id: 'task1',
        description: 'Tarea sin iniciar',
        taskType: 'puntual' as const,
        percentageCompleted: 0,
      };

      expect(task.percentageCompleted).toBe(0);
    });

    it('should handle 100% completion', () => {
      const task = {
        id: 'task1',
        description: 'Tarea completada',
        taskType: 'puntual' as const,
        percentageCompleted: 100,
      };

      expect(task.percentageCompleted).toBe(100);
    });
  });

  describe('Mensual Task Type (Monthly Tracker)', () => {
    it('should initialize with 12 months array', () => {
      const monthlyProgress = Array(12).fill(false);
      expect(monthlyProgress).toHaveLength(12);
      expect(monthlyProgress.every(m => m === false)).toBe(true);
    });

    it('should calculate percentage from monthly progress', () => {
      // 4 months completed out of 12
      const monthlyProgress = [true, true, true, true, false, false, false, false, false, false, false, false];
      const completedMonths = monthlyProgress.filter(m => m).length;
      const percentage = (completedMonths / 12) * 100;

      expect(completedMonths).toBe(4);
      expect(percentage).toBeCloseTo(33.33, 1);
    });

    it('should calculate 100% when all months are completed', () => {
      const monthlyProgress = Array(12).fill(true);
      const completedMonths = monthlyProgress.filter(m => m).length;
      const percentage = (completedMonths / 12) * 100;

      expect(completedMonths).toBe(12);
      expect(percentage).toBe(100);
    });

    it('should calculate 0% when no months are completed', () => {
      const monthlyProgress = Array(12).fill(false);
      const completedMonths = monthlyProgress.filter(m => m).length;
      const percentage = (completedMonths / 12) * 100;

      expect(completedMonths).toBe(0);
      expect(percentage).toBe(0);
    });

    it('should calculate 8.33% for 1 month completed', () => {
      const monthlyProgress = [true, false, false, false, false, false, false, false, false, false, false, false];
      const completedMonths = monthlyProgress.filter(m => m).length;
      const percentage = (completedMonths / 12) * 100;

      expect(completedMonths).toBe(1);
      expect(percentage).toBeCloseTo(8.33, 1);
    });

    it('should handle toggling months on and off', () => {
      let monthlyProgress = Array(12).fill(false);
      
      // Mark January as completed
      monthlyProgress[0] = true;
      let percentage = (monthlyProgress.filter(m => m).length / 12) * 100;
      expect(percentage).toBeCloseTo(8.33, 1);

      // Mark February as completed
      monthlyProgress[1] = true;
      percentage = (monthlyProgress.filter(m => m).length / 12) * 100;
      expect(percentage).toBeCloseTo(16.67, 1);

      // Unmark January
      monthlyProgress[0] = false;
      percentage = (monthlyProgress.filter(m => m).length / 12) * 100;
      expect(percentage).toBeCloseTo(8.33, 1);
    });
  });

  describe('Task Type Conversion', () => {
    it('should preserve percentage when switching from puntual to mensual', () => {
      // Start with puntual task at 75%
      const task = {
        id: 'task1',
        description: 'Tarea',
        taskType: 'puntual' as const,
        percentageCompleted: 75,
      };

      // Convert to mensual: 75% = 9 months out of 12
      const monthsToMark = Math.round((75 / 100) * 12);
      const monthlyProgress = Array(12).fill(false);
      for (let i = 0; i < monthsToMark; i++) {
        monthlyProgress[i] = true;
      }

      const newPercentage = (monthlyProgress.filter(m => m).length / 12) * 100;
      expect(newPercentage).toBeCloseTo(75, 0);
    });

    it('should preserve percentage when switching from mensual to puntual', () => {
      // Start with mensual task: 6 months completed = 50%
      const monthlyProgress = [true, true, true, true, true, true, false, false, false, false, false, false];
      const percentage = (monthlyProgress.filter(m => m).length / 12) * 100;

      // Convert to puntual: round to nearest integer
      const puntualPercentage = Math.round(percentage);
      expect(puntualPercentage).toBe(50);
    });
  });

  describe('Real-world Scenarios - Agrogana', () => {
    it('Scenario 1: Tarea Puntual - "Implementar sistema ERP"', () => {
      // This is a one-time task, not monthly
      const task = {
        id: 'task1',
        description: 'Implementar sistema ERP',
        taskType: 'puntual' as const,
        percentageCompleted: 65, // Currently 65% implemented
      };

      expect(task.taskType).toBe('puntual');
      expect(task.percentageCompleted).toBe(65);
    });

    it('Scenario 2: Tarea Mensual - "Capacitación mensual del equipo"', () => {
      // This is a recurring monthly task
      // January: completed, February: completed, March: pending, etc.
      const monthlyProgress = [true, true, false, false, false, false, false, false, false, false, false, false];
      const task = {
        id: 'task2',
        description: 'Capacitación mensual del equipo',
        taskType: 'mensual' as const,
        monthlyProgress,
        percentageCompleted: Math.round((2 / 12) * 100), // 16.67% -> 17%
      };

      expect(task.taskType).toBe('mensual');
      expect(task.monthlyProgress).toHaveLength(12);
      expect(task.monthlyProgress?.filter(m => m).length).toBe(2);
      expect(task.percentageCompleted).toBe(17);
    });

    it('Scenario 3: Tarea Mensual - "Revisión de indicadores" (3 veces al año)', () => {
      // Task done 3 times per year: Jan, May, Sep
      const monthlyProgress = [true, false, false, false, true, false, false, false, true, false, false, false];
      const task = {
        id: 'task3',
        description: 'Revisión trimestral de indicadores',
        taskType: 'mensual' as const,
        monthlyProgress,
        percentageCompleted: Math.round((3 / 12) * 100), // 25%
      };

      expect(task.taskType).toBe('mensual');
      expect(task.monthlyProgress?.filter(m => m).length).toBe(3);
      expect(task.percentageCompleted).toBe(25);
    });
  });
});
