import { describe, it, expect } from 'vitest';

/**
 * Test for JSON parsing logic in TacticalDefinition component
 * This tests the display logic for strategicObjectiveDescription field
 */

describe('TacticalDefinition JSON Parsing', () => {
  // Helper function that mimics the component's parsing logic
  const parseStrategicObjectiveDescription = (value: string): string => {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(value);
      // If it's an object with a description field, use that
      if (typeof parsed === 'object' && parsed.description) {
        return parsed.description;
      }
      // If it's an object with a name field, use that
      if (typeof parsed === 'object' && parsed.name) {
        return parsed.name;
      }
      // Otherwise return the original string
      return value;
    } catch (e) {
      // If it's not JSON, just return the string as-is
      return value;
    }
  };

  it('should display plain text description as-is', () => {
    const plainText = 'Incremento de la rentabilidad';
    const result = parseStrategicObjectiveDescription(plainText);
    expect(result).toBe('Incremento de la rentabilidad');
  });

  it('should parse JSON with description field and extract description', () => {
    const jsonWithDescription = JSON.stringify({
      category: '',
      goal: 100,
      resultKeys: ['Key1', 'Key2'],
      description: 'Incremento de la rentabilidad'
    });
    const result = parseStrategicObjectiveDescription(jsonWithDescription);
    expect(result).toBe('Incremento de la rentabilidad');
  });

  it('should parse JSON with name field and extract name', () => {
    const jsonWithName = JSON.stringify({
      id: 123,
      name: 'Incremento de la rentabilidad',
      description: 'dfdfd'
    });
    const result = parseStrategicObjectiveDescription(jsonWithName);
    expect(result).toBe('Incremento de la rentabilidad');
  });

  it('should handle JSON with only description field', () => {
    const jsonOnlyDescription = JSON.stringify({
      description: 'Test Description'
    });
    const result = parseStrategicObjectiveDescription(jsonOnlyDescription);
    expect(result).toBe('Test Description');
  });

  it('should handle JSON with only name field', () => {
    const jsonOnlyName = JSON.stringify({
      name: 'Test Name'
    });
    const result = parseStrategicObjectiveDescription(jsonOnlyName);
    expect(result).toBe('Test Name');
  });

  it('should handle complex JSON from planning data', () => {
    const complexJson = JSON.stringify({
      category: 'Strategic',
      goal: 250,
      resultKeys: ['Result1', 'Result2'],
      id: '1773264058392',
      description: 'dfdfd',
      responsible: '',
      startDate: '',
      endDate: '',
      implementationDate: '',
      observation: '',
      tasks: []
    });
    const result = parseStrategicObjectiveDescription(complexJson);
    expect(result).toBe('dfdfd');
  });

  it('should handle empty string', () => {
    const empty = '';
    const result = parseStrategicObjectiveDescription(empty);
    expect(result).toBe('');
  });

  it('should handle null-like string values', () => {
    const nullString = 'null';
    const result = parseStrategicObjectiveDescription(nullString);
    // 'null' is valid JSON, so it will parse but won't have description or name
    expect(result).toBe('null');
  });

  it('should handle malformed JSON gracefully', () => {
    const malformedJson = '{"category":"","goal":100,"resultKeys":["Key1"';
    const result = parseStrategicObjectiveDescription(malformedJson);
    // Should return the original string since it's not valid JSON
    expect(result).toBe(malformedJson);
  });

  it('should prioritize description over name when both exist', () => {
    const jsonBoth = JSON.stringify({
      name: 'Name Value',
      description: 'Description Value'
    });
    const result = parseStrategicObjectiveDescription(jsonBoth);
    expect(result).toBe('Description Value');
  });
});
