import { describe, it, expect } from "vitest";

describe("Subprocess Needs Extraction", () => {
  it("should extract needs from entrada data", () => {
    const entradaData = [
      { id: 1, partesInteresadas: "Proveedor A", internoExterno: "Externo", necesidades: "Entrega a tiempo" },
      { id: 2, partesInteresadas: "Cliente B", internoExterno: "Externo", necesidades: "Calidad garantizada" },
      { id: 3, partesInteresadas: "Departamento Interno", internoExterno: "Interno", necesidades: "Información actualizada" },
    ];

    const needsSet = new Set<string>();
    entradaData.forEach((row: any) => {
      if (row.necesidades && row.necesidades.trim()) {
        needsSet.add(row.necesidades.trim());
      }
    });

    const needs = Array.from(needsSet);
    expect(needs.length).toBe(3);
    expect(needs).toContain("Entrega a tiempo");
    expect(needs).toContain("Calidad garantizada");
    expect(needs).toContain("Información actualizada");
  });

  it("should handle duplicate needs", () => {
    const entradaData = [
      { id: 1, partesInteresadas: "Proveedor A", internoExterno: "Externo", necesidades: "Entrega a tiempo" },
      { id: 2, partesInteresadas: "Proveedor B", internoExterno: "Externo", necesidades: "Entrega a tiempo" },
      { id: 3, partesInteresadas: "Cliente C", internoExterno: "Externo", necesidades: "Calidad garantizada" },
    ];

    const needsSet = new Set<string>();
    entradaData.forEach((row: any) => {
      if (row.necesidades && row.necesidades.trim()) {
        needsSet.add(row.necesidades.trim());
      }
    });

    const needs = Array.from(needsSet);
    expect(needs.length).toBe(2);
    expect(needs).toContain("Entrega a tiempo");
    expect(needs).toContain("Calidad garantizada");
  });

  it("should extract needs with source information", () => {
    const entradaData = [
      { 
        id: 1, 
        partesInteresadas: "Proveedor A", 
        internoExterno: "Externo", 
        clienteProveedor: "Proveedor",
        necesidades: "Entrega a tiempo" 
      },
      { 
        id: 2, 
        partesInteresadas: "Cliente B", 
        internoExterno: "Externo", 
        clienteProveedor: "Cliente",
        necesidades: "Calidad garantizada" 
      },
    ];

    const needsWithSources = entradaData
      .filter((row: any) => row.necesidades && row.necesidades.trim())
      .map((row: any, index: number) => ({
        id: index + 1,
        need: row.necesidades.trim(),
        stakeholder: row.partesInteresadas,
        internalExternal: row.internoExterno,
        clienteProveedor: row.clienteProveedor,
      }));

    expect(needsWithSources.length).toBe(2);
    expect(needsWithSources[0].need).toBe("Entrega a tiempo");
    expect(needsWithSources[0].stakeholder).toBe("Proveedor A");
    expect(needsWithSources[1].need).toBe("Calidad garantizada");
    expect(needsWithSources[1].stakeholder).toBe("Cliente B");
  });

  it("should handle empty entrada data", () => {
    const entradaData: any[] = [];

    const needsSet = new Set<string>();
    entradaData.forEach((row: any) => {
      if (row.necesidades && row.necesidades.trim()) {
        needsSet.add(row.necesidades.trim());
      }
    });

    const needs = Array.from(needsSet);
    expect(needs.length).toBe(0);
  });

  it("should ignore empty or whitespace-only needs", () => {
    const entradaData = [
      { id: 1, partesInteresadas: "Proveedor A", internoExterno: "Externo", necesidades: "Entrega a tiempo" },
      { id: 2, partesInteresadas: "Proveedor B", internoExterno: "Externo", necesidades: "" },
      { id: 3, partesInteresadas: "Proveedor C", internoExterno: "Externo", necesidades: "   " },
      { id: 4, partesInteresadas: "Proveedor D", internoExterno: "Externo", necesidades: "Calidad garantizada" },
    ];

    const needsSet = new Set<string>();
    entradaData.forEach((row: any) => {
      if (row.necesidades && row.necesidades.trim()) {
        needsSet.add(row.necesidades.trim());
      }
    });

    const needs = Array.from(needsSet);
    expect(needs.length).toBe(2);
    expect(needs).toContain("Entrega a tiempo");
    expect(needs).toContain("Calidad garantizada");
  });
});
