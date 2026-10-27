import { describe, expect, it } from "vitest";
import {
  buildPolicyObjectiveTraceability,
  calculateTraceabilityOteProgress,
} from "./policyObjectiveTraceability";

describe("trazabilidad de Objetivos de la Política", () => {
  const objectives = [
    { id: 10, objective: "Mejorar la satisfacción del cliente" },
    { id: 20, objective: "Optimizar los costos" },
  ];
  const processes = [
    { id: 1, name: "Comercial" },
    { id: 2, name: "Operaciones" },
    { id: 3, name: "Talento Humano" },
  ];

  it("separa cobertura, no aplicación justificada y KPI por rutas OTG/OTE", () => {
    const result = buildPolicyObjectiveTraceability({
      objectives,
      processes,
      fodaRecords: [
        {
          processId: 1,
          strengths: JSON.stringify([
            {
              policyObjectiveId: 10,
              policyObjective: "Mejorar la satisfacción del cliente",
              subprocess: "Ventas",
              statement: "Seguimiento posventa",
            },
          ]),
          matrixData: JSON.stringify([
            {
              id: "otg-1",
              policyObjectiveId: 10,
              objetivoPolitica: "Mejorar la satisfacción del cliente",
              objetivoTactico: "Mejorar atención comercial",
              acciones: [
                {
                  ponderacion: 100,
                  tipoSeguimiento: "puntual",
                  valorPuntual: 60,
                  puntoLlegadaAccion: 100,
                },
              ],
            },
          ]),
        },
      ],
      tacticalObjectives: [
        {
          id: 100,
          processId: 1,
          name: "OTE Comercial",
          policyObjectiveId: 10,
          policyObjective: "Mejorar la satisfacción del cliente",
          planningData: JSON.stringify({
            puntoPartida: 0,
            metaLlegada: 100,
            avanceMeta: 80,
            ponderacion: 100,
          }),
        },
        {
          id: 101,
          processId: 2,
          name: "OTE Operaciones",
          policyObjectiveId: 10,
          policyObjective: "Mejorar la satisfacción del cliente",
          planningData: JSON.stringify({
            puntoPartida: 0,
            metaLlegada: 100,
            avanceMeta: 40,
            ponderacion: 100,
          }),
        },
      ],
      applicability: [
        {
          policyObjectiveId: 10,
          processId: 3,
          status: "not_applicable",
          justification: "No interviene en la experiencia del cliente.",
          confirmedByName: "Gerencia General",
          confirmedByEmail: null,
          confirmedAt: "2026-10-26T00:00:00.000Z",
        },
      ],
    });

    const trace = result.find(item => item.objectiveId === 10);
    expect(trace?.summary).toMatchObject({
      totalProcesses: 3,
      applicableProcesses: 2,
      notApplicableProcesses: 1,
      coveredProcesses: 2,
      pendingProcesses: 0,
      coveragePercentage: 100,
      processesWithKpi: 2,
      otgProgress: 60,
      oteProgress: 60,
      kpi: 55,
    });
    expect(
      trace?.processes.find(process => process.processId === 1)
    ).toMatchObject({
      status: "covered",
      otgProgress: 60,
      oteProgress: 80,
      kpi: 70,
    });
    expect(
      trace?.processes.find(process => process.processId === 2)
    ).toMatchObject({
      status: "covered",
      otgProgress: null,
      oteProgress: 40,
      kpi: 40,
    });
    expect(
      trace?.processes.find(process => process.processId === 3)?.notApplicable
        ?.justification
    ).toBe("No interviene en la experiencia del cliente.");
  });

  it("reconoce vínculos históricos solo si el texto coincide con un objetivo único", () => {
    const result = buildPolicyObjectiveTraceability({
      objectives,
      processes: [{ id: 1, name: "Comercial" }],
      fodaRecords: [
        {
          processId: 1,
          opportunities: JSON.stringify([
            {
              policyObjective: "MEJORAR  la satisfacción del cliente",
              statement: "Canales de contacto",
            },
          ]),
        },
      ],
      tacticalObjectives: [],
      applicability: [],
    });
    const trace = result.find(item => item.objectiveId === 10);
    expect(trace?.summary.coveredProcesses).toBe(1);
    expect(trace?.processes[0].foda[0].linkSource).toBe("legacy_text");
  });

  it("no crea un vínculo automático si hay objetivos históricos con texto duplicado", () => {
    const result = buildPolicyObjectiveTraceability({
      objectives: [
        { id: 10, objective: "Cumplir requisitos legales" },
        { id: 20, objective: "Cumplir requisitos legales" },
      ],
      processes: [{ id: 1, name: "Legal" }],
      fodaRecords: [
        {
          processId: 1,
          threats: JSON.stringify([
            {
              policyObjective: "Cumplir requisitos legales",
              statement: "Cambio normativo",
            },
          ]),
        },
      ],
      tacticalObjectives: [],
      applicability: [],
    });
    expect(result.every(item => item.summary.coveredProcesses === 0)).toBe(
      true
    );
  });

  it("no considera medible un OTE sin meta, pero sí preserva los seguimientos mensuales", () => {
    expect(
      calculateTraceabilityOteProgress({
        puntoPartida: 0,
        metaLlegada: 0,
        avanceMeta: 0,
      })
    ).toBeNull();
    expect(
      calculateTraceabilityOteProgress({
        trackingType: "mensual_checklist",
        checklistValues: [
          true,
          true,
          true,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
        ],
      })
    ).toBe(25);
  });
});
