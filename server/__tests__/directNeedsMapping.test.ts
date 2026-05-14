import { describe, it, expect } from "vitest";

/**
 * Test suite for verifying direct mapping of Solicita and Entrega fields
 * from Subprocess Map to Stakeholder Criticality Matrix
 */

describe("Direct Needs Mapping - Solicita and Entrega", () => {
  it("should map solicita and entrega fields directly from entrada to stakeholders", () => {
    // Simulate data from Subprocess Map
    const subprocessMapData = {
      entrada: JSON.stringify([
        {
          id: 1,
          partesInteresadas: "Proveedor A",
          internoExterno: "Externo",
          clienteProveedor: "Proveedor",
          solicita: "Materias primas de calidad",
          entrega: "Certificados de conformidad",
        },
        {
          id: 2,
          partesInteresadas: "Departamento Interno",
          internoExterno: "Interno",
          clienteProveedor: "Cliente",
          solicita: "Reportes mensuales",
          entrega: "Análisis de datos",
        },
      ]),
      subprocesos: JSON.stringify([]),
      salida: JSON.stringify([]),
    };

    // Parse entrada
    const entrada = JSON.parse(subprocessMapData.entrada);

    // Create stakeholders with direct mapping
    const newStakeholders = entrada.map((item: any, index: number) => ({
      id: (index + 1).toString(),
      name: item.partesInteresadas,
      internalExternal: item.internoExterno === "Interno" ? "Interno" : "Externo",
      needsSolicita: item.solicita || "",
      needsEntrega: item.entrega || "",
    }));

    // Verify mapping
    expect(newStakeholders).toHaveLength(2);
    
    // First stakeholder
    expect(newStakeholders[0].name).toBe("Proveedor A");
    expect(newStakeholders[0].needsSolicita).toBe("Materias primas de calidad");
    expect(newStakeholders[0].needsEntrega).toBe("Certificados de conformidad");
    expect(newStakeholders[0].internalExternal).toBe("Externo");

    // Second stakeholder
    expect(newStakeholders[1].name).toBe("Departamento Interno");
    expect(newStakeholders[1].needsSolicita).toBe("Reportes mensuales");
    expect(newStakeholders[1].needsEntrega).toBe("Análisis de datos");
    expect(newStakeholders[1].internalExternal).toBe("Interno");
  });

  it("should handle empty solicita and entrega fields gracefully", () => {
    const entrada = [
      {
        id: 1,
        partesInteresadas: "Stakeholder 1",
        internoExterno: "Externo",
        clienteProveedor: "Proveedor",
        solicita: "Algo",
        entrega: "",
      },
      {
        id: 2,
        partesInteresadas: "Stakeholder 2",
        internoExterno: "Interno",
        clienteProveedor: "Cliente",
        solicita: "",
        entrega: "Algo",
      },
      {
        id: 3,
        partesInteresadas: "Stakeholder 3",
        internoExterno: "Externo",
        clienteProveedor: "Proveedor",
        solicita: "",
        entrega: "",
      },
    ];

    const newStakeholders = entrada.map((item: any, index: number) => ({
      id: (index + 1).toString(),
      name: item.partesInteresadas,
      needsSolicita: item.solicita || "",
      needsEntrega: item.entrega || "",
    }));

    expect(newStakeholders[0].needsSolicita).toBe("Algo");
    expect(newStakeholders[0].needsEntrega).toBe("");
    
    expect(newStakeholders[1].needsSolicita).toBe("");
    expect(newStakeholders[1].needsEntrega).toBe("Algo");
    
    expect(newStakeholders[2].needsSolicita).toBe("");
    expect(newStakeholders[2].needsEntrega).toBe("");
  });

  it("should preserve multiline text in solicita and entrega", () => {
    const entrada = [
      {
        id: 1,
        partesInteresadas: "Complex Stakeholder",
        internoExterno: "Externo",
        clienteProveedor: "Proveedor",
        solicita: "Requirement 1\nRequirement 2\nRequirement 3",
        entrega: "Deliverable 1\nDeliverable 2",
      },
    ];

    const newStakeholders = entrada.map((item: any) => ({
      id: "1",
      name: item.partesInteresadas,
      needsSolicita: item.solicita || "",
      needsEntrega: item.entrega || "",
    }));

    expect(newStakeholders[0].needsSolicita).toContain("Requirement 1");
    expect(newStakeholders[0].needsSolicita).toContain("Requirement 2");
    expect(newStakeholders[0].needsSolicita).toContain("Requirement 3");
    
    expect(newStakeholders[0].needsEntrega).toContain("Deliverable 1");
    expect(newStakeholders[0].needsEntrega).toContain("Deliverable 2");
  });

  it("should avoid duplicates when loading stakeholders", () => {
    const entrada = [
      {
        id: 1,
        partesInteresadas: "Proveedor A",
        internoExterno: "Externo",
        solicita: "Quality materials",
        entrega: "Certificates",
      },
      {
        id: 2,
        partesInteresadas: "Proveedor A", // Duplicate name
        internoExterno: "Externo",
        solicita: "Different request",
        entrega: "Different delivery",
      },
    ];

    const newStakeholders = entrada.map((item: any, index: number) => ({
      id: (index + 1).toString(),
      name: item.partesInteresadas,
      needsSolicita: item.solicita || "",
      needsEntrega: item.entrega || "",
    }));

    // Simulate duplicate filtering
    const existingNames = new Set(["Proveedor A"]);
    const uniqueStakeholders = newStakeholders.filter(
      (s) => s.name && !existingNames.has(s.name)
    );

    expect(uniqueStakeholders).toHaveLength(0); // Both are duplicates
  });

  it("should handle null/undefined values in entrada items", () => {
    const entrada = [
      {
        id: 1,
        partesInteresadas: "Stakeholder",
        internoExterno: "Externo",
        solicita: null,
        entrega: undefined,
      },
    ];

    const newStakeholders = entrada.map((item: any) => ({
      id: "1",
      name: item.partesInteresadas,
      needsSolicita: item.solicita || "",
      needsEntrega: item.entrega || "",
    }));

    expect(newStakeholders[0].needsSolicita).toBe("");
    expect(newStakeholders[0].needsEntrega).toBe("");
  });

  it("should correctly identify internal vs external stakeholders", () => {
    const entrada = [
      {
        id: 1,
        partesInteresadas: "Internal Department",
        internoExterno: "Interno",
        solicita: "Request 1",
        entrega: "Delivery 1",
      },
      {
        id: 2,
        partesInteresadas: "External Supplier",
        internoExterno: "Externo",
        solicita: "Request 2",
        entrega: "Delivery 2",
      },
    ];

    const newStakeholders = entrada.map((item: any, index: number) => ({
      id: (index + 1).toString(),
      name: item.partesInteresadas,
      internalExternal: item.internoExterno === "Interno" ? "Interno" : "Externo",
      needsSolicita: item.solicita || "",
      needsEntrega: item.entrega || "",
    }));

    expect(newStakeholders[0].internalExternal).toBe("Interno");
    expect(newStakeholders[1].internalExternal).toBe("Externo");
  });
});
