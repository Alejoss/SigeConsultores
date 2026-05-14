import { describe, it, expect } from "vitest";

/**
 * Test para verificar que el mapeo de tipos de documentos funciona correctamente
 * El frontend envía tipos como "Policy", "Values", "StrategicObjectives"
 * pero la BD espera "Politica", "Programa", "Procedimiento", "Varios"
 */

// Función de mapeo (copiada de db.ts para testing)
function mapDocumentType(frontendType: string): string {
  const typeMap: Record<string, string> = {
    'Policy': 'Politica',
    'Values': 'Varios',
    'StrategicObjectives': 'Varios',
  };
  return typeMap[frontendType] || frontendType;
}

describe("Document Type Mapping", () => {
  it("should map 'Policy' to 'Politica'", () => {
    expect(mapDocumentType('Policy')).toBe('Politica');
  });

  it("should map 'Values' to 'Varios'", () => {
    expect(mapDocumentType('Values')).toBe('Varios');
  });

  it("should map 'StrategicObjectives' to 'Varios'", () => {
    expect(mapDocumentType('StrategicObjectives')).toBe('Varios');
  });

  it("should return original type if not in map", () => {
    expect(mapDocumentType('Politica')).toBe('Politica');
    expect(mapDocumentType('Programa')).toBe('Programa');
    expect(mapDocumentType('Procedimiento')).toBe('Procedimiento');
    expect(mapDocumentType('Varios')).toBe('Varios');
  });

  it("should handle unknown types gracefully", () => {
    expect(mapDocumentType('UnknownType')).toBe('UnknownType');
  });

  it("should be case-sensitive", () => {
    expect(mapDocumentType('policy')).toBe('policy');
    expect(mapDocumentType('POLICY')).toBe('POLICY');
  });
});
