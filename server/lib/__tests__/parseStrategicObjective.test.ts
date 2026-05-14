import { describe, it, expect } from 'vitest';
import { parseStrategicObjectiveDescription } from '../parseStrategicObjective';

describe('parseStrategicObjectiveDescription', () => {
  it('should handle plain text', () => {
    const result = parseStrategicObjectiveDescription('Incremento de la rentabilidad');
    expect(result).toBe('Incremento de la rentabilidad');
  });

  it('should extract description from JSON object', () => {
    const json = JSON.stringify({
      description: 'Incremento de la rentabilidad',
      name: 'Objetivo 1'
    });
    const result = parseStrategicObjectiveDescription(json);
    expect(result).toBe('Incremento de la rentabilidad');
  });

  it('should extract name if description is missing', () => {
    const json = JSON.stringify({
      name: 'Objetivo 1'
    });
    const result = parseStrategicObjectiveDescription(json);
    expect(result).toBe('Objetivo 1');
  });

  it('should handle complex JSON with category and goal fields', () => {
    const json = JSON.stringify({
      category: '',
      goal: 100,
      resultKeys: ['Key1', 'Key2'],
      description: 'Incremento de la rentabilidad'
    });
    const result = parseStrategicObjectiveDescription(json);
    expect(result).toBe('Incremento de la rentabilidad');
  });

  it('should handle JSON with only complex fields', () => {
    const json = JSON.stringify({
      category: '',
      goal: 100,
      resultKeys: ['Key1', 'Key2']
    });
    const result = parseStrategicObjectiveDescription(json);
    // Should return original since no text field found
    expect(result).toContain('category');
  });

  it('should handle array of objects with description', () => {
    const json = JSON.stringify([
      {
        id: '1',
        description: 'Incremento de la rentabilidad'
      }
    ]);
    const result = parseStrategicObjectiveDescription(json);
    expect(result).toBe('Incremento de la rentabilidad');
  });

  it('should handle null and undefined', () => {
    expect(parseStrategicObjectiveDescription(null)).toBe('');
    expect(parseStrategicObjectiveDescription(undefined)).toBe('');
  });

  it('should handle empty string', () => {
    expect(parseStrategicObjectiveDescription('')).toBe('');
  });

  it('should handle malformed JSON', () => {
    const malformed = '{invalid json}';
    const result = parseStrategicObjectiveDescription(malformed);
    expect(result).toBe(malformed);
  });

  it('should handle JSON with title field', () => {
    const json = JSON.stringify({
      title: 'Incremento de la rentabilidad',
      other: 'data'
    });
    const result = parseStrategicObjectiveDescription(json);
    expect(result).toBe('Incremento de la rentabilidad');
  });

  it('should handle whitespace correctly', () => {
    const json = JSON.stringify({
      description: '  Incremento de la rentabilidad  '
    });
    const result = parseStrategicObjectiveDescription(json);
    expect(result).toBe('Incremento de la rentabilidad');
  });

  it('should handle the exact JSON from the bug report', () => {
    const bugJson = '{"category":"","goal":100,"resultKeys":[{"id":"1773264058392","description":"dfdfdf","responsible":"","startDate":"","endDate":"","implementationDate":"","observation":"","tasks":[]}]}';
    const result = parseStrategicObjectiveDescription(bugJson);
    // Should extract description from the first object in resultKeys array
    expect(result).toBe('dfdfdf');
  });
});
