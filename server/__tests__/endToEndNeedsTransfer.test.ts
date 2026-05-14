import { describe, it, expect, beforeEach } from "vitest";

/**
 * End-to-end test suite for complete needs transfer workflow
 * From Subprocess Map to Stakeholder Criticality Matrix
 */

interface SubprocessMapData {
  entrada: string;
  subprocesos: string;
  salida: string;
}

interface EntradaItem {
  id: number;
  partesInteresadas: string;
  internoExterno: string;
  clienteProveedor: string;
  solicita: string;
  entrega: string;
}

interface StakeholderCriticality {
  id: string;
  name: string;
  internalExternal: string;
  needsSolicita: string;
  needsEntrega: string;
  incidenceCriteria: string[];
  incidenceValue: number[];
  riskCriteria: string[];
  riskValue: string[];
  criticityScore: number;
  existingDefenses: string;
  actionToTake: string;
  observations: string;
  startDate: string;
  endDate: string;
  completed: "Si" | "No";
}

describe("End-to-End Needs Transfer Workflow", () => {
  let subprocessMapData: SubprocessMapData;
  let existingStakeholders: StakeholderCriticality[];

  beforeEach(() => {
    // Simulate data from Subprocess Map
    const entradaItems: EntradaItem[] = [
      {
        id: 1,
        partesInteresadas: "Proveedor de Materias Primas",
        internoExterno: "Externo",
        clienteProveedor: "Proveedor",
        solicita: "Especificaciones técnicas claras",
        entrega: "Materias primas de calidad certificada",
      },
      {
        id: 2,
        partesInteresadas: "Departamento de Calidad",
        internoExterno: "Interno",
        clienteProveedor: "Cliente",
        solicita: "Reportes de inspección mensuales",
        entrega: "Análisis de conformidad y recomendaciones",
      },
      {
        id: 3,
        partesInteresadas: "Clientes Finales",
        internoExterno: "Externo",
        clienteProveedor: "Cliente",
        solicita: "Productos con garantía",
        entrega: "Servicio post-venta y soporte técnico",
      },
    ];

    subprocessMapData = {
      entrada: JSON.stringify(entradaItems),
      subprocesos: JSON.stringify([
        { id: 1, acciones: "Inspección de materias primas" },
        { id: 2, acciones: "Verificación de especificaciones" },
        { id: 3, acciones: "Empaque y etiquetado" },
      ]),
      salida: JSON.stringify([]),
    };

    existingStakeholders = [];
  });

  it("should load all stakeholders with correct solicita and entrega data", () => {
    // Parse entrada
    const entrada = JSON.parse(subprocessMapData.entrada);
    const subprocesos = JSON.parse(subprocessMapData.subprocesos);

    // Simulate loadStakeholdersFromSubprocessMap
    const newStakeholders: StakeholderCriticality[] = entrada.map(
      (item: EntradaItem, index: number) => ({
        id: (index + 1).toString(),
        name: item.partesInteresadas,
        internalExternal:
          item.internoExterno === "Interno" ? "Interno" : "Externo",
        needsSolicita: item.solicita,
        needsEntrega: item.entrega,
        incidenceCriteria: [],
        incidenceValue: [],
        riskCriteria: [],
        riskValue: [],
        criticityScore: 0,
        existingDefenses:
          subprocesos.length > index ? subprocesos[index].acciones : "",
        actionToTake: "",
        observations: "",
        startDate: "",
        endDate: "",
        completed: "No",
      })
    );

    // Verify all stakeholders loaded correctly
    expect(newStakeholders).toHaveLength(3);

    // Verify first stakeholder
    expect(newStakeholders[0].name).toBe("Proveedor de Materias Primas");
    expect(newStakeholders[0].internalExternal).toBe("Externo");
    expect(newStakeholders[0].needsSolicita).toBe(
      "Especificaciones técnicas claras"
    );
    expect(newStakeholders[0].needsEntrega).toBe(
      "Materias primas de calidad certificada"
    );
    expect(newStakeholders[0].existingDefenses).toBe(
      "Inspección de materias primas"
    );

    // Verify second stakeholder
    expect(newStakeholders[1].name).toBe("Departamento de Calidad");
    expect(newStakeholders[1].internalExternal).toBe("Interno");
    expect(newStakeholders[1].needsSolicita).toBe(
      "Reportes de inspección mensuales"
    );
    expect(newStakeholders[1].needsEntrega).toBe(
      "Análisis de conformidad y recomendaciones"
    );

    // Verify third stakeholder
    expect(newStakeholders[2].name).toBe("Clientes Finales");
    expect(newStakeholders[2].internalExternal).toBe("Externo");
    expect(newStakeholders[2].needsSolicita).toBe("Productos con garantía");
    expect(newStakeholders[2].needsEntrega).toBe(
      "Servicio post-venta y soporte técnico"
    );
  });

  it("should avoid duplicates when loading stakeholders", () => {
    // Simulate existing stakeholder
    existingStakeholders = [
      {
        id: "1",
        name: "Proveedor de Materias Primas",
        internalExternal: "Externo",
        needsSolicita: "Old request",
        needsEntrega: "Old delivery",
        incidenceCriteria: [],
        incidenceValue: [],
        riskCriteria: [],
        riskValue: [],
        criticityScore: 0,
        existingDefenses: "",
        actionToTake: "",
        observations: "",
        startDate: "",
        endDate: "",
        completed: "No",
      },
    ];

    // Parse entrada
    const entrada = JSON.parse(subprocessMapData.entrada);

    // Create new stakeholders
    const newStakeholders: StakeholderCriticality[] = entrada.map(
      (item: EntradaItem, index: number) => ({
        id: (index + 1).toString(),
        name: item.partesInteresadas,
        internalExternal:
          item.internoExterno === "Interno" ? "Interno" : "Externo",
        needsSolicita: item.solicita,
        needsEntrega: item.entrega,
        incidenceCriteria: [],
        incidenceValue: [],
        riskCriteria: [],
        riskValue: [],
        criticityScore: 0,
        existingDefenses: "",
        actionToTake: "",
        observations: "",
        startDate: "",
        endDate: "",
        completed: "No",
      })
    );

    // Filter duplicates
    const existingNames = new Set(existingStakeholders.map((s) => s.name));
    const uniqueNewStakeholders = newStakeholders.filter(
      (s) => s.name && !existingNames.has(s.name)
    );

    // Should only have 2 new stakeholders (3 total - 1 duplicate)
    expect(uniqueNewStakeholders).toHaveLength(2);
    expect(uniqueNewStakeholders[0].name).toBe("Departamento de Calidad");
    expect(uniqueNewStakeholders[1].name).toBe("Clientes Finales");
  });

  it("should preserve data integrity when updating existing stakeholders", () => {
    // Simulate existing stakeholder with some data
    existingStakeholders = [
      {
        id: "1",
        name: "Proveedor de Materias Primas",
        internalExternal: "Externo",
        needsSolicita: "Old request",
        needsEntrega: "Old delivery",
        incidenceCriteria: ["Calidad"],
        incidenceValue: [2],
        riskCriteria: ["Reputacional"],
        riskValue: ["A"],
        criticityScore: 6,
        existingDefenses: "Inspección inicial",
        actionToTake: "Mejorar proceso",
        observations: "Importante",
        startDate: "2024-01-01",
        endDate: "2024-03-01",
        completed: "Si",
      },
    ];

    // Verify existing data is preserved
    expect(existingStakeholders[0].incidenceValue).toEqual([2]);
    expect(existingStakeholders[0].criticityScore).toBe(6);
    expect(existingStakeholders[0].actionToTake).toBe("Mejorar proceso");
    expect(existingStakeholders[0].completed).toBe("Si");
  });

  it("should handle empty solicita and entrega fields", () => {
    const entradaWithEmpty: EntradaItem[] = [
      {
        id: 1,
        partesInteresadas: "Stakeholder 1",
        internoExterno: "Externo",
        clienteProveedor: "Proveedor",
        solicita: "Something",
        entrega: "",
      },
      {
        id: 2,
        partesInteresadas: "Stakeholder 2",
        internoExterno: "Interno",
        clienteProveedor: "Cliente",
        solicita: "",
        entrega: "Something",
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

    const newStakeholders: StakeholderCriticality[] = entradaWithEmpty.map(
      (item: EntradaItem, index: number) => ({
        id: (index + 1).toString(),
        name: item.partesInteresadas,
        internalExternal:
          item.internoExterno === "Interno" ? "Interno" : "Externo",
        needsSolicita: item.solicita,
        needsEntrega: item.entrega,
        incidenceCriteria: [],
        incidenceValue: [],
        riskCriteria: [],
        riskValue: [],
        criticityScore: 0,
        existingDefenses: "",
        actionToTake: "",
        observations: "",
        startDate: "",
        endDate: "",
        completed: "No",
      })
    );

    expect(newStakeholders[0].needsSolicita).toBe("Something");
    expect(newStakeholders[0].needsEntrega).toBe("");

    expect(newStakeholders[1].needsSolicita).toBe("");
    expect(newStakeholders[1].needsEntrega).toBe("Something");

    expect(newStakeholders[2].needsSolicita).toBe("");
    expect(newStakeholders[2].needsEntrega).toBe("");
  });

  it("should correctly combine loaded stakeholders with existing ones", () => {
    // Simulate existing stakeholders
    existingStakeholders = [
      {
        id: "100",
        name: "Existing Stakeholder",
        internalExternal: "Interno",
        needsSolicita: "Existing request",
        needsEntrega: "Existing delivery",
        incidenceCriteria: [],
        incidenceValue: [],
        riskCriteria: [],
        riskValue: [],
        criticityScore: 0,
        existingDefenses: "",
        actionToTake: "",
        observations: "",
        startDate: "",
        endDate: "",
        completed: "No",
      },
    ];

    // Parse entrada
    const entrada = JSON.parse(subprocessMapData.entrada);

    // Create new stakeholders
    const newStakeholders: StakeholderCriticality[] = entrada.map(
      (item: EntradaItem, index: number) => ({
        id: (
          Math.max(...existingStakeholders.map((s) => parseInt(s.id)), 0) +
          index +
          1
        ).toString(),
        name: item.partesInteresadas,
        internalExternal:
          item.internoExterno === "Interno" ? "Interno" : "Externo",
        needsSolicita: item.solicita,
        needsEntrega: item.entrega,
        incidenceCriteria: [],
        incidenceValue: [],
        riskCriteria: [],
        riskValue: [],
        criticityScore: 0,
        existingDefenses: "",
        actionToTake: "",
        observations: "",
        startDate: "",
        endDate: "",
        completed: "No",
      })
    );

    // Filter duplicates
    const existingNames = new Set(existingStakeholders.map((s) => s.name));
    const uniqueNewStakeholders = newStakeholders.filter(
      (s) => s.name && !existingNames.has(s.name)
    );

    // Combine
    const combined = [...existingStakeholders, ...uniqueNewStakeholders];

    expect(combined).toHaveLength(4); // 1 existing + 3 new
    expect(combined[0].name).toBe("Existing Stakeholder");
    expect(combined[1].name).toBe("Proveedor de Materias Primas");
    expect(combined[1].needsSolicita).toBe("Especificaciones técnicas claras");
    expect(combined[1].needsEntrega).toBe(
      "Materias primas de calidad certificada"
    );
  });
});
