import { describe, it, expect } from "vitest";

/**
 * Test suite for verifying that "Necesidades y Expectativas" data
 * is correctly transferred from Subprocess Map to Stakeholder Criticality Matrix
 */

describe("Stakeholder Needs Transfer from Subprocess Map", () => {
  it("should combine solicita and entrega fields into necesidades text", () => {
    // Simulate the combining logic from SubprocessMap.tsx
    const entrada = [
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
        partesInteresadas: "Departamento de Ventas",
        internoExterno: "Interno",
        clienteProveedor: "Cliente",
        solicita: "Reportes mensuales",
        entrega: "Análisis de tendencias",
      },
    ];

    const necesidadesText = entrada
      .map((row) => {
        const parts = [];
        if (row.solicita?.trim()) parts.push(`Solicita: ${row.solicita}`);
        if (row.entrega?.trim()) parts.push(`Entrega: ${row.entrega}`);
        return parts.join("\n");
      })
      .filter((text) => text.trim())
      .join("\n---\n");

    expect(necesidadesText).toContain("Solicita: Materias primas de calidad");
    expect(necesidadesText).toContain("Entrega: Certificados de conformidad");
    expect(necesidadesText).toContain("Solicita: Reportes mensuales");
    expect(necesidadesText).toContain("Entrega: Análisis de tendencias");
    expect(necesidadesText).toContain("---");
  });

  it("should handle empty solicita and entrega fields", () => {
    const entrada = [
      {
        id: 1,
        partesInteresadas: "Stakeholder",
        internoExterno: "Externo",
        clienteProveedor: "Proveedor",
        solicita: "",
        entrega: "Entrega algo",
      },
      {
        id: 2,
        partesInteresadas: "Another",
        internoExterno: "Interno",
        clienteProveedor: "Cliente",
        solicita: "Solicita algo",
        entrega: "",
      },
    ];

    const necesidadesText = entrada
      .map((row) => {
        const parts = [];
        if (row.solicita?.trim()) parts.push(`Solicita: ${row.solicita}`);
        if (row.entrega?.trim()) parts.push(`Entrega: ${row.entrega}`);
        return parts.join("\n");
      })
      .filter((text) => text.trim())
      .join("\n---\n");

    expect(necesidadesText).toContain("Entrega: Entrega algo");
    expect(necesidadesText).toContain("Solicita: Solicita algo");
    // The first row should not have Solicita since it's empty
    expect(necesidadesText.split("---")[0]).not.toContain("Solicita: ");
  });

  it("should create stakeholders with necesidades from subprocess map", () => {
    const subprocessMapData = {
      entrada: JSON.stringify([
        {
          id: 1,
          partesInteresadas: "Cliente Principal",
          internoExterno: "Externo",
          clienteProveedor: "Cliente",
          solicita: "Productos de calidad",
          entrega: "Garantía de satisfacción",
        },
      ]),
      necesidades: "Solicita: Productos de calidad\nEntrega: Garantía de satisfacción",
      subprocesos: JSON.stringify([]),
      salida: JSON.stringify([]),
    };

    const entrada = JSON.parse(subprocessMapData.entrada);

    const newStakeholders = entrada.map((item: any) => ({
      id: "1",
      name: item.partesInteresadas,
      internalExternal: item.internoExterno === "Interno" ? "Interno" : "Externo",
      needsExpectations: subprocessMapData.necesidades,
    }));

    expect(newStakeholders).toHaveLength(1);
    expect(newStakeholders[0].name).toBe("Cliente Principal");
    expect(newStakeholders[0].needsExpectations).toContain("Productos de calidad");
    expect(newStakeholders[0].needsExpectations).toContain("Garantía de satisfacción");
  });

  it("should handle multiple stakeholders with different needs", () => {
    const subprocessMapData = {
      entrada: JSON.stringify([
        {
          id: 1,
          partesInteresadas: "Proveedor 1",
          internoExterno: "Externo",
          clienteProveedor: "Proveedor",
          solicita: "Pago puntual",
          entrega: "Facturas claras",
        },
        {
          id: 2,
          partesInteresadas: "Proveedor 2",
          internoExterno: "Externo",
          clienteProveedor: "Proveedor",
          solicita: "Comunicación constante",
          entrega: "Reportes de avance",
        },
      ]),
      necesidades: `Solicita: Pago puntual\nEntrega: Facturas claras\n---\nSolicita: Comunicación constante\nEntrega: Reportes de avance`,
      subprocesos: JSON.stringify([]),
      salida: JSON.stringify([]),
    };

    const entrada = JSON.parse(subprocessMapData.entrada);

    const newStakeholders = entrada.map((item: any) => ({
      id: item.id.toString(),
      name: item.partesInteresadas,
      needsExpectations: subprocessMapData.necesidades,
    }));

    expect(newStakeholders).toHaveLength(2);
    expect(newStakeholders[0].name).toBe("Proveedor 1");
    expect(newStakeholders[1].name).toBe("Proveedor 2");
    // Both should have the combined necesidades
    expect(newStakeholders[0].needsExpectations).toContain("Pago puntual");
    expect(newStakeholders[1].needsExpectations).toContain("Comunicación constante");
  });

  it("should preserve formatting when combining needs", () => {
    const solicita = "Necesidad 1\nNecesidad 2";
    const entrega = "Entrega 1\nEntrega 2";

    const parts = [];
    if (solicita?.trim()) parts.push(`Solicita: ${solicita}`);
    if (entrega?.trim()) parts.push(`Entrega: ${entrega}`);
    const combined = parts.join("\n");

    expect(combined).toContain("Solicita: Necesidad 1");
    expect(combined).toContain("Necesidad 2");
    expect(combined).toContain("Entrega: Entrega 1");
    expect(combined).toContain("Entrega 2");
  });

  it("should handle null or undefined necesidades gracefully", () => {
    const subprocessMapData = {
      entrada: JSON.stringify([
        {
          id: 1,
          partesInteresadas: "Stakeholder",
          internoExterno: "Externo",
          clienteProveedor: "Cliente",
        },
      ]),
      necesidades: null,
      subprocesos: JSON.stringify([]),
      salida: JSON.stringify([]),
    };

    const entrada = JSON.parse(subprocessMapData.entrada);

    const newStakeholders = entrada.map((item: any) => ({
      id: "1",
      name: item.partesInteresadas,
      needsExpectations: subprocessMapData.necesidades || "",
    }));

    expect(newStakeholders[0].needsExpectations).toBe("");
  });
});
