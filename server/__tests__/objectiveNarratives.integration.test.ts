import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  accounts,
  companies,
  processFODA,
  processes,
  processTacticalObjectives,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { appRouter } from "../routers";

// Never use real companies, processes, accounts or email addresses.
const suffix = randomUUID();
const narrativeKeys = [
  "situacionInicial",
  "resultadoEsperado",
  "indicador",
] as const;
const narratives = {
  situacionInicial: "Situación inicial textual, no una condición numérica.",
  resultadoEsperado: "Resultado esperado textual, no la meta numérica.",
  indicador: "Definición textual: entregas conformes / entregas totales.",
};
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let accountId = 0;
const companyIds: number[] = [];
const processIds: number[] = [];
let companyId = 0;
let processId = 0;
let siblingProcessId = 0;
let foreignProcessId = 0;
let legacyObjectiveId = 0;
let siblingObjectiveId = 0;
let foreignObjectiveId = 0;

function leaderContext() {
  return {
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: accountId,
      leaderName: "Jefe sintético narrativas",
      leaderEmail: "",
      processId,
      companyId,
      companyName: `Empresa sintética narrativas ${suffix}`,
    },
    req: {} as never,
    res: {} as never,
  } as never;
}

function caller() {
  return appRouter.createCaller(leaderContext());
}

function legacyPlanning() {
  return {
    category: "Operación histórica",
    goal: "Meta histórica",
    ponderacion: 37.5,
    puntoPartida: 12,
    metaLlegada: 85,
    unidadMedida: "entregas",
    avanceMeta: 987.25, // Deliberately differs from the monthly source calculation.
    porcentajeMetaAlcanzado: -17.125,
    trackingType: "mensual_sumatoria",
    monthlyValues: [2, 0, 7, 3, 0, 0, 1, 5, 4, 0, 2, 9],
    checklistValues: [true, false, true],
    puntualSumValues: [1.5, 3.75],
    resultKeys: [
      {
        id: "oo-histórico",
        description: "Tarea conservada",
        condicionInicial: 7,
        meta: 24,
        condicionActual: 9,
        porcentajeAlcanzado: 63.123,
        ooMonthlyValues: [3, 4],
        ooChecklistValues: [false, true],
        tasks: [
          {
            id: "tarea-1",
            deadline: "2028-03-05",
            ponderacion: 100,
            avance: 19,
          },
        ],
        extraResultKey: { version: "legacy", keep: null },
      },
    ],
    unknownKey: { nested: [0, false, null, { keep: "unchanged" }] },
    futureFeature: "conservar sin normalizar",
  };
}

async function objectiveRow(id: number) {
  const [row] = await db
    .select()
    .from(processTacticalObjectives)
    .where(eq(processTacticalObjectives.id, id));
  if (!row) throw new Error("Fixture OTE no encontrado.");
  return row;
}

async function fodaRow(id: number) {
  const [row] = await db
    .select()
    .from(processFODA)
    .where(eq(processFODA.id, id));
  if (!row) throw new Error("Fixture FODA no encontrado.");
  return row;
}

async function insertObjective(
  planningData: string | null,
  targetProcessId = processId
) {
  const [inserted] = await db.insert(processTacticalObjectives).values({
    processId: targetProcessId,
    name: `OTE sintético ${suffix}`,
    description: "Descripción histórica que no se debe vaciar",
    target: "Destino histórico",
    responsible: "Responsable sintético",
    deadline: new Date("2028-07-14T00:00:00Z"),
    subprocess: "Subproceso histórico",
    strategicObjective: "Objetivo estratégico histórico",
    strategicObjectiveDescription: "Descripción estratégica histórica",
    policyObjective: "Texto histórico de política",
    policyObjectiveDescription: "Descripción histórica de política",
    completed: "SI",
    planningData,
    createdAt: new Date("2023-02-03T00:00:00Z"),
    updatedAt: new Date("2023-04-05T00:00:00Z"),
  });
  return Number(inserted.insertId);
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error(
      "DATABASE_URL local es obligatoria para pruebas de narrativas."
    );
  const url = new URL(databaseUrl);
  if (
    url.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(
      "Prueba bloqueada: únicamente se permite MySQL LOCAL en loopback."
    );
  }
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) throw new Error("Base local no disponible para narrativas.");

  // Let MySQL allocate each ID; explicit consecutive IDs are not reserved.
  const [insertedAccount] = await db.insert(accounts).values({
    openId: `narratives-${suffix}`,
    name: "Cuenta sintética sin correo",
    status: "active",
  });
  accountId = Number(insertedAccount.insertId);

  for (let index = 0; index < 2; index++) {
    const [inserted] = await db.insert(companies).values({
      name: `Empresa sintética narrativas ${index} ${suffix}`,
      ownerAccountId: accountId,
      status: "En Proceso",
    });
    companyIds.push(Number(inserted.insertId));
  }
  companyId = companyIds[0];

  for (let index = 0; index < 3; index++) {
    const [inserted] = await db.insert(processes).values({
      companyId: index === 2 ? companyIds[1] : companyId,
      name: `Proceso sintético narrativas ${index} ${suffix}`,
      processType: "soporte",
    });
    processIds.push(Number(inserted.insertId));
  }
  [processId, siblingProcessId, foreignProcessId] = processIds;
  legacyObjectiveId = await insertObjective(JSON.stringify(legacyPlanning()));
  siblingObjectiveId = await insertObjective(
    JSON.stringify(legacyPlanning()),
    siblingProcessId
  );
  foreignObjectiveId = await insertObjective(
    JSON.stringify(legacyPlanning()),
    foreignProcessId
  );
});

afterAll(async () => {
  if (!db) return;
  // Restrict every delete to IDs of this run, including partial setup failures.
  if (processIds.length) {
    await db
      .delete(processTacticalObjectives)
      .where(inArray(processTacticalObjectives.processId, processIds));
    await db
      .delete(processFODA)
      .where(inArray(processFODA.processId, processIds));
    await db.delete(processes).where(inArray(processes.id, processIds));
  }
  if (companyIds.length)
    await db.delete(companies).where(inArray(companies.id, companyIds));
  if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
});

describe("Narrativas OTE: JSON aditivo y escritura aislada", () => {
  it("list/loadPlanningData dan fallbacks de respuesta sin crear claves históricas", async () => {
    const before = await objectiveRow(legacyObjectiveId);
    const api = caller().processTacticalObjectives;
    for (const rows of [
      await api.list({ processId }),
      await api.loadPlanningData({ processId }),
    ]) {
      expect(rows).toContainEqual(
        expect.objectContaining({
          situacionInicial: "",
          resultadoEsperado: "",
          indicador: "",
        })
      );
    }
    expect(await objectiveRow(legacyObjectiveId)).toEqual(before);
    for (const key of narrativeKeys)
      expect(JSON.parse(before.planningData!)).not.toHaveProperty(key);
  });

  it("create sin textos no crea claves; con textos hace merge y conserva JSON adicional", async () => {
    const api = caller().processTacticalObjectives;
    const without = await api.create({
      processId,
      name: "OTE creado sin textos",
    });
    const savedWithout = JSON.parse(
      (await objectiveRow(without.id)).planningData!
    );
    for (const key of narrativeKeys)
      expect(savedWithout).not.toHaveProperty(key);

    const withTexts = await api.create({
      processId,
      name: "OTE creado con textos",
      planningData: JSON.stringify({
        ...legacyPlanning(),
        situacionInicial: "Texto raw previo",
      }),
      ...narratives,
    });
    expect(
      JSON.parse((await objectiveRow(withTexts.id)).planningData!)
    ).toEqual({ ...legacyPlanning(), ...narratives });
    expect(await api.list({ processId })).toContainEqual(
      expect.objectContaining({ id: withTexts.id, ...narratives })
    );
    expect(await api.loadPlanningData({ processId })).toContainEqual(
      expect.objectContaining({ objectiveId: withTexts.id, ...narratives })
    );

    const rawTexts = await api.create({
      processId,
      name: "OTE con textos históricos de JSON",
      planningData: JSON.stringify({ ...legacyPlanning(), ...narratives }),
    });
    expect(JSON.parse((await objectiveRow(rawTexts.id)).planningData!)).toEqual(
      { ...legacyPlanning(), ...narratives }
    );
  });

  it("saveNarratives cambia sólo textos y conserva todos los otros keys y columnas", async () => {
    const before = await objectiveRow(legacyObjectiveId);
    const result = await caller().processTacticalObjectives.saveNarratives({
      objectiveId: legacyObjectiveId,
      ...narratives,
    });
    expect(result).toMatchObject({ success: true, changed: true });
    const after = await objectiveRow(legacyObjectiveId);
    expect(JSON.parse(after.planningData!)).toEqual({
      ...JSON.parse(before.planningData!),
      ...narratives,
    });
    expect({ ...after, planningData: before.planningData }).toEqual(before);
  });

  it("update/savePlanning omitiendo textos los conserva y no crea ausentes", async () => {
    const api = caller().processTacticalObjectives;
    for (const withTexts of [false, true]) {
      const planning = {
        ...legacyPlanning(),
        ...(withTexts ? narratives : {}),
      };
      const id = await insertObjective(JSON.stringify(planning));
      await api.update({
        objectiveId: id,
        name: "Nombre actualizado, textos omitidos",
      });
      expect(JSON.parse((await objectiveRow(id)).planningData!)).toEqual(
        planning
      );
      await api.savePlanning({ objectiveId: id });
      expect(JSON.parse((await objectiveRow(id)).planningData!)).toEqual(
        planning
      );
    }
  });

  it("update/savePlanning hacen merge condicional y '' vacía sólo el texto explícito", async () => {
    const api = caller().processTacticalObjectives;
    const id = await insertObjective(
      JSON.stringify({ ...legacyPlanning(), ...narratives })
    );
    await api.update({
      objectiveId: id,
      name: "Actualización parcial",
      situacionInicial: "Situación revisada",
    });
    expect(JSON.parse((await objectiveRow(id)).planningData!)).toEqual({
      ...legacyPlanning(),
      ...narratives,
      situacionInicial: "Situación revisada",
    });
    await api.savePlanning({ objectiveId: id, resultadoEsperado: "" });
    expect(JSON.parse((await objectiveRow(id)).planningData!)).toEqual({
      ...legacyPlanning(),
      ...narratives,
      situacionInicial: "Situación revisada",
      resultadoEsperado: "",
    });
    await api.update({
      objectiveId: id,
      name: "Borrado explícito",
      indicador: "",
    });
    expect(JSON.parse((await objectiveRow(id)).planningData!)).toEqual({
      ...legacyPlanning(),
      ...narratives,
      situacionInicial: "Situación revisada",
      resultadoEsperado: "",
      indicador: "",
    });
  });

  it("saveNarratives permite borrado explícito de un campo sin tocar los demás", async () => {
    const before = await objectiveRow(legacyObjectiveId);
    await caller().processTacticalObjectives.saveNarratives({
      objectiveId: legacyObjectiveId,
      indicador: "",
    });
    const after = await objectiveRow(legacyObjectiveId);
    expect(JSON.parse(after.planningData!)).toEqual({
      ...JSON.parse(before.planningData!),
      indicador: "",
    });
    expect({ ...after, planningData: before.planningData }).toEqual(before);
  });

  it("saveNarratives sin campos no inicia una transacción ni cambia JSON/columnas", async () => {
    const before = await objectiveRow(legacyObjectiveId);
    const transaction = vi.spyOn(db, "transaction");
    try {
      expect(
        await caller().processTacticalObjectives.saveNarratives({
          objectiveId: legacyObjectiveId,
        })
      ).toMatchObject({ success: true, changed: false });
      expect(transaction).not.toHaveBeenCalled();
      expect(await objectiveRow(legacyObjectiveId)).toEqual(before);
    } finally {
      transaction.mockRestore();
    }
  });

  it("saveNarratives inicializa sólo campos suministrados cuando planningData es NULL", async () => {
    const id = await insertObjective(null);
    const before = await objectiveRow(id);
    await caller().processTacticalObjectives.saveNarratives({
      objectiveId: id,
      indicador: narratives.indicador,
    });
    const after = await objectiveRow(id);
    expect(JSON.parse(after.planningData!)).toEqual({
      indicador: narratives.indicador,
    });
    expect({ ...after, planningData: before.planningData }).toEqual(before);
  });

  it.each(["{truncated", "", "null", "[]", "42", '"texto"'])(
    "rechaza planningData inválido/no objeto %j sin sobrescribirlo",
    async serialized => {
      const id = await insertObjective(serialized);
      const before = await objectiveRow(id);
      await expect(
        caller().processTacticalObjectives.saveNarratives({
          objectiveId: id,
          indicador: "No guardar",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await objectiveRow(id)).toEqual(before);
    }
  );

  it("rechaza acceso de otra empresa o proceso en escrituras y lecturas", async () => {
    const api = caller().processTacticalObjectives;
    for (const [objectiveId, deniedProcessId] of [
      [siblingObjectiveId, siblingProcessId],
      [foreignObjectiveId, foreignProcessId],
    ]) {
      const before = await objectiveRow(objectiveId);
      await expect(
        api.saveNarratives({ objectiveId, indicador: "Prohibido" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(api.saveNarratives({ objectiveId })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        api.update({ objectiveId, name: "Prohibido", indicador: "Prohibido" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        api.savePlanning({ objectiveId, indicador: "Prohibido" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        api.create({ processId: deniedProcessId, name: "Prohibido" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        api.list({ processId: deniedProcessId })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        api.loadPlanningData({ processId: deniedProcessId })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await objectiveRow(objectiveId)).toEqual(before);
    }
  });

  it("rechaza valores no string y >10000 en cada endpoint; acepta longitud 10000", async () => {
    const api = caller().processTacticalObjectives;
    const before = await objectiveRow(legacyObjectiveId);
    for (const key of narrativeKeys) {
      for (const value of [null, 123, "x".repeat(10_001)]) {
        const patch = { [key]: value };
        await expect(
          api.create({ processId, name: "Inválido", ...patch } as never)
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect(
          api.update({
            objectiveId: legacyObjectiveId,
            name: before.name,
            ...patch,
          } as never)
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect(
          api.savePlanning({
            objectiveId: legacyObjectiveId,
            ...patch,
          } as never)
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect(
          api.saveNarratives({
            objectiveId: legacyObjectiveId,
            ...patch,
          } as never)
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
    }
    expect(await objectiveRow(legacyObjectiveId)).toEqual(before);
    await api.saveNarratives({
      objectiveId: legacyObjectiveId,
      indicador: "x".repeat(10_000),
    });
    expect(
      JSON.parse((await objectiveRow(legacyObjectiveId)).planningData!)
        .indicador
    ).toHaveLength(10_000);
  });

  it("escrituras narrativas concurrentes de distintos campos no se pierden", async () => {
    const id = await insertObjective(JSON.stringify(legacyPlanning()));
    await Promise.all([
      caller().processTacticalObjectives.saveNarratives({
        objectiveId: id,
        situacionInicial: narratives.situacionInicial,
      }),
      caller().processTacticalObjectives.saveNarratives({
        objectiveId: id,
        resultadoEsperado: narratives.resultadoEsperado,
      }),
      caller().processTacticalObjectives.saveNarratives({
        objectiveId: id,
        indicador: narratives.indicador,
      }),
    ]);
    expect(JSON.parse((await objectiveRow(id)).planningData!)).toEqual({
      ...legacyPlanning(),
      ...narratives,
    });
  });

  it("saveNarratives y savePlanning concurrentes conservan textos y avanceMeta explícito", async () => {
    const id = await insertObjective(JSON.stringify(legacyPlanning()));
    await Promise.all([
      caller().processTacticalObjectives.saveNarratives({
        objectiveId: id,
        ...narratives,
      }),
      caller().processTacticalObjectives.savePlanning({
        objectiveId: id,
        avanceMeta: 456.75,
      }),
    ]);
    expect(JSON.parse((await objectiveRow(id)).planningData!)).toEqual({
      ...legacyPlanning(),
      ...narratives,
      avanceMeta: 456.75,
    });
  });

  it("saveNarratives y update concurrentes conservan textos y el nombre actualizado", async () => {
    const id = await insertObjective(JSON.stringify(legacyPlanning()));
    await Promise.all([
      caller().processTacticalObjectives.saveNarratives({
        objectiveId: id,
        ...narratives,
      }),
      caller().processTacticalObjectives.update({
        objectiveId: id,
        name: "Nombre concurrente sintético",
      }),
    ]);
    const saved = await objectiveRow(id);
    expect(saved.name).toBe("Nombre concurrente sintético");
    expect(JSON.parse(saved.planningData!)).toEqual({
      ...legacyPlanning(),
      ...narratives,
    });
  });
});

function otgMatrix() {
  return [
    {
      id: 7,
      objetivo: "OTG histórico",
      objetivoPolitica: "Texto de política histórico",
      puntoPartida: 13,
      metaLlegada: 95,
      porcentajeAlcanzadoOTG: 81.234, // Must not be replaced by the current computed percentage.
      valorPuntual: 22,
      monthlyValues: [1, 2, 3],
      objetivoLogrado: "SI",
      comunicado: "NO",
      acciones: [
        {
          id: "acción-1",
          ponderacion: 100,
          porcentajeCompletado: 17.5,
          deadline: "2029-05-04",
          unknown: [false, null],
        },
      ],
      unknownOtgKey: { preserved: "sí" },
    },
    {
      id: "other-row",
      objetivo: "Otra fila intocable",
      acciones: [],
      indicador: "Definición de otra fila",
      extra: [1, 2, 3],
    },
  ];
}

async function insertFoda(
  matrixData: string | null,
  targetProcessId = processId,
  updatedAt = "2022-01-01T00:00:00Z"
) {
  const [inserted] = await db.insert(processFODA).values({
    processId: targetProcessId,
    matrixData,
    strengths: '[{"id":"f1","note":"Fortaleza intacta"}]',
    weaknesses: "Debilidad histórica",
    opportunities: "Oportunidad histórica",
    threats: "Amenaza histórica",
    createdAt: new Date("2021-01-01T00:00:00Z"),
    updatedAt: new Date(updatedAt),
  });
  return Number(inserted.insertId);
}

describe("Narrativas OTG: sólo una fila en matrixData, sin normalizar métricas", () => {
  it("saveMatrixData preserva los tres textos y keys adicionales sin schema nuevo", async () => {
    const matrix = otgMatrix();
    const withNarratives = [{ ...matrix[0], ...narratives }, matrix[1]];
    await caller().processFODA.saveMatrixData({
      processId,
      matrixData: JSON.stringify(withNarratives),
    });
    const saved = await caller().processFODA.get({ processId });
    expect(JSON.parse(saved!.matrixData!)).toEqual(withNarratives);
  });

  it("generic omitiendo textos conserva el patch dedicado, cambia números y respeta altas/bajas sin defaults", async () => {
    const matrix = otgMatrix();
    const legacyRow = {
      id: "legacy-row",
      objetivo: "OTG sin narrativas históricas",
      acciones: [],
    };
    const deletedRow = {
      id: "deleted-row",
      objetivo: "Fila eliminada",
      ...narratives,
    };
    const id = await insertFoda(
      JSON.stringify([...matrix, legacyRow, deletedRow])
    );
    await caller().processFODA.saveObjectiveNarratives({
      processId,
      recordId: id,
      rowId: 7,
      ...narratives,
    });
    const before = await fodaRow(id);
    const { indicador: _omitted, ...otherRow } = matrix[1];
    const numericRow = {
      ...matrix[0],
      id: "7",
      puntoPartida: 23,
      metaLlegada: 110,
      valorPuntual: 31,
    };
    const newRow = {
      id: "new-row",
      objetivo: "OTG nuevo",
      acciones: [],
      situacionInicial: "Texto inicial nuevo",
    };
    const incoming = [numericRow, otherRow, legacyRow, newRow];

    await caller().processFODA.saveMatrixData({
      processId,
      matrixData: JSON.stringify(incoming),
    });
    const after = await fodaRow(id);
    expect(JSON.parse(after.matrixData!)).toEqual([
      { ...numericRow, ...narratives },
      matrix[1],
      legacyRow,
      newRow,
    ]);
    expect({
      ...after,
      matrixData: before.matrixData,
      updatedAt: before.updatedAt,
    }).toEqual(before);
    for (const key of narrativeKeys)
      expect(JSON.parse(after.matrixData!)[2]).not.toHaveProperty(key);
    expect(JSON.parse(after.matrixData!)[3]).not.toHaveProperty(
      "resultadoEsperado"
    );
    expect(JSON.parse(after.matrixData!)[3]).not.toHaveProperty("indicador");
  });

  it("generic conserva los textos propios de versiones con iguales IDs sin copiarlos a legacy", async () => {
    const row = otgMatrix()[0];
    const firstTexts = {
      ...narratives,
      indicador: "Indicador exclusivo versión A",
    };
    const secondTexts = {
      situacionInicial: "Situación exclusiva versión B",
      resultadoEsperado: "Resultado exclusivo versión B",
      indicador: "Indicador exclusivo versión B",
    };
    const firstId = await insertFoda(
      JSON.stringify([{ ...row, ...firstTexts }])
    );
    const secondId = await insertFoda(
      JSON.stringify([{ ...row, id: "7", ...secondTexts }])
    );
    const legacyId = await insertFoda(JSON.stringify([row]));
    const incoming = [{ ...row, metaLlegada: 120 }];
    await caller().processFODA.saveMatrixData({
      processId,
      matrixData: JSON.stringify(incoming),
    });
    expect(JSON.parse((await fodaRow(firstId)).matrixData!)).toEqual([
      { ...incoming[0], ...firstTexts },
    ]);
    expect(JSON.parse((await fodaRow(secondId)).matrixData!)).toEqual([
      { ...incoming[0], ...secondTexts },
    ]);
    expect(JSON.parse((await fodaRow(legacyId)).matrixData!)).toEqual(incoming);
  });

  it("generic permite '' explícito y conserva sólo los textos omitidos", async () => {
    const row = otgMatrix()[0];
    const id = await insertFoda(JSON.stringify([{ ...row, ...narratives }]));
    await caller().processFODA.saveMatrixData({
      processId,
      matrixData: JSON.stringify([{ ...row, resultadoEsperado: "" }]),
    });
    expect(JSON.parse((await fodaRow(id)).matrixData!)).toEqual([
      { ...row, ...narratives, resultadoEsperado: "" },
    ]);
    await caller().processFODA.saveMatrixData({
      processId,
      matrixData: JSON.stringify([
        { ...row, situacionInicial: "", resultadoEsperado: "", indicador: "" },
      ]),
    });
    expect(JSON.parse((await fodaRow(id)).matrixData!)).toEqual([
      { ...row, situacionInicial: "", resultadoEsperado: "", indicador: "" },
    ]);
  });

  it("generic trata matrixData NULL como matriz vacía sin importar textos de otra versión", async () => {
    const id = await insertFoda(null);
    const incoming = otgMatrix();
    await caller().processFODA.saveMatrixData({
      processId,
      matrixData: JSON.stringify(incoming),
    });
    expect(JSON.parse((await fodaRow(id)).matrixData!)).toEqual(incoming);
  });

  it("generic y dedicated concurrentes preservan las narrativas y cambios numéricos", async () => {
    const matrix = otgMatrix();
    const id = await insertFoda(JSON.stringify(matrix));
    const incoming = [
      { ...matrix[0], valorPuntual: 67, metaLlegada: 140 },
      matrix[1],
    ];
    await Promise.all([
      caller().processFODA.saveObjectiveNarratives({
        processId,
        recordId: id,
        rowId: 7,
        ...narratives,
      }),
      caller().processFODA.saveMatrixData({
        processId,
        matrixData: JSON.stringify(incoming),
      }),
    ]);
    expect(JSON.parse((await fodaRow(id)).matrixData!)).toEqual([
      { ...incoming[0], ...narratives },
      incoming[1],
    ]);
  });

  it("dedicated actualiza sólo la fila identificada como string/number y conserva todas las columnas", async () => {
    const id = await insertFoda(JSON.stringify(otgMatrix()));
    const before = await fodaRow(id);
    expect(
      await caller().processFODA.saveObjectiveNarratives({
        processId,
        recordId: id,
        rowId: "7",
        ...narratives,
      })
    ).toMatchObject({ success: true, changed: true });
    const after = await fodaRow(id);
    expect(JSON.parse(after.matrixData!)).toEqual([
      { ...otgMatrix()[0], ...narratives },
      otgMatrix()[1],
    ]);
    expect({ ...after, matrixData: before.matrixData }).toEqual(before);
    expect(
      JSON.parse(
        (await caller().processFODA.get({ processId, recordId: id }))!
          .matrixData!
      )
    ).toEqual(JSON.parse(after.matrixData!));

    await caller().processFODA.saveObjectiveNarratives({
      processId,
      recordId: id,
      rowId: 7,
      indicador: "",
    });
    const cleared = await fodaRow(id);
    expect(JSON.parse(cleared.matrixData!)).toEqual([
      { ...otgMatrix()[0], ...narratives, indicador: "" },
      otgMatrix()[1],
    ]);
    expect({ ...cleared, matrixData: before.matrixData }).toEqual(before);
  });

  it("sin campos no inicia transacción ni toca datos; un solo campo no crea los omitidos", async () => {
    const id = await insertFoda(JSON.stringify(otgMatrix()));
    const before = await fodaRow(id);
    const transaction = vi.spyOn(db, "transaction");
    try {
      expect(
        await caller().processFODA.saveObjectiveNarratives({
          processId,
          recordId: id,
          rowId: 7,
        })
      ).toMatchObject({ success: true, changed: false });
      expect(transaction).not.toHaveBeenCalled();
      expect(await fodaRow(id)).toEqual(before);
    } finally {
      transaction.mockRestore();
    }
    await caller().processFODA.saveObjectiveNarratives({
      processId,
      recordId: id,
      rowId: 7,
      situacionInicial: "Sólo situación",
    });
    const saved = await fodaRow(id);
    expect(JSON.parse(saved.matrixData!)).toEqual([
      { ...otgMatrix()[0], situacionInicial: "Sólo situación" },
      otgMatrix()[1],
    ]);
    expect({ ...saved, matrixData: before.matrixData }).toEqual(before);
  });

  it("recordId selecciona exacto y omitirlo selecciona sólo el último updatedAt", async () => {
    const oldId = await insertFoda(
      JSON.stringify(otgMatrix()),
      processId,
      "2020-01-01T00:00:00Z"
    );
    const latestId = await insertFoda(
      JSON.stringify(otgMatrix()),
      processId,
      "2035-01-01T00:00:00Z"
    );
    const oldBefore = await fodaRow(oldId);
    await caller().processFODA.saveObjectiveNarratives({
      processId,
      rowId: 7,
      indicador: "Último",
    });
    expect(await fodaRow(oldId)).toEqual(oldBefore);
    expect(JSON.parse((await fodaRow(latestId)).matrixData!)[0].indicador).toBe(
      "Último"
    );
    const latestBefore = await fodaRow(latestId);
    await caller().processFODA.saveObjectiveNarratives({
      processId,
      recordId: oldId,
      rowId: 7,
      indicador: "Exacto",
    });
    expect(JSON.parse((await fodaRow(oldId)).matrixData!)[0].indicador).toBe(
      "Exacto"
    );
    expect(await fodaRow(latestId)).toEqual(latestBefore);
  });

  it.each(["{truncated", "", "null", "{}", "[null]", "[1]", "[[]]"])(
    "rechaza matrixData malformado/no array de objetos %j sin escritura",
    async serialized => {
      const id = await insertFoda(serialized);
      const before = await fodaRow(id);
      await expect(
        caller().processFODA.saveObjectiveNarratives({
          processId,
          recordId: id,
          rowId: 7,
          indicador: "No guardar",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await fodaRow(id)).toEqual(before);

      const versionsBefore = await db
        .select()
        .from(processFODA)
        .where(eq(processFODA.processId, processId))
        .orderBy(processFODA.id);
      await expect(
        caller().processFODA.saveMatrixData({
          processId,
          matrixData: JSON.stringify([
            { ...otgMatrix()[0], valorPuntual: 999 },
          ]),
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(
        await db
          .select()
          .from(processFODA)
          .where(eq(processFODA.processId, processId))
          .orderBy(processFODA.id)
      ).toEqual(versionsBefore);
    }
  );

  it("rechaza fila inexistente y recordId de otro proceso, sin fallback ni escritura", async () => {
    const id = await insertFoda(JSON.stringify(otgMatrix()));
    const foreignId = await insertFoda(
      JSON.stringify(otgMatrix()),
      foreignProcessId
    );
    const before = await fodaRow(id);
    const foreignBefore = await fodaRow(foreignId);
    await expect(
      caller().processFODA.saveObjectiveNarratives({
        processId,
        recordId: id,
        rowId: "missing",
        indicador: "No guardar",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      caller().processFODA.saveObjectiveNarratives({
        processId,
        recordId: foreignId,
        rowId: 7,
        indicador: "No guardar",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await fodaRow(id)).toEqual(before);
    expect(await fodaRow(foreignId)).toEqual(foreignBefore);
  });

  it("rechaza empresa/proceso ajenos incluso si no hay campos suministrados", async () => {
    for (const deniedProcessId of [siblingProcessId, foreignProcessId]) {
      const id = await insertFoda(JSON.stringify(otgMatrix()), deniedProcessId);
      const before = await fodaRow(id);
      for (const patch of [{}, { indicador: "No autorizado" }]) {
        await expect(
          caller().processFODA.saveObjectiveNarratives({
            processId: deniedProcessId,
            recordId: id,
            rowId: 7,
            ...patch,
          })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(await fodaRow(id)).toEqual(before);
    }
  });

  it("valida cada texto opcional como string de hasta 10000 caracteres", async () => {
    const id = await insertFoda(JSON.stringify(otgMatrix()));
    const before = await fodaRow(id);
    for (const key of narrativeKeys) {
      for (const value of [null, 123, "x".repeat(10_001)]) {
        await expect(
          caller().processFODA.saveObjectiveNarratives({
            processId,
            recordId: id,
            rowId: 7,
            [key]: value,
          } as never)
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
    }
    expect(await fodaRow(id)).toEqual(before);
    await caller().processFODA.saveObjectiveNarratives({
      processId,
      recordId: id,
      rowId: 7,
      indicador: "x".repeat(10_000),
    });
    expect(
      JSON.parse((await fodaRow(id)).matrixData!)[0].indicador
    ).toHaveLength(10_000);
  });

  it("serializa parches concurrentes de la misma matriz sin perder narrativas", async () => {
    const id = await insertFoda(JSON.stringify(otgMatrix()));
    await Promise.all([
      caller().processFODA.saveObjectiveNarratives({
        processId,
        recordId: id,
        rowId: 7,
        situacionInicial: narratives.situacionInicial,
      }),
      caller().processFODA.saveObjectiveNarratives({
        processId,
        recordId: id,
        rowId: 7,
        resultadoEsperado: narratives.resultadoEsperado,
      }),
      caller().processFODA.saveObjectiveNarratives({
        processId,
        recordId: id,
        rowId: 7,
        indicador: narratives.indicador,
      }),
    ]);
    expect(JSON.parse((await fodaRow(id)).matrixData!)).toEqual([
      { ...otgMatrix()[0], ...narratives },
      otgMatrix()[1],
    ]);
  });
});
