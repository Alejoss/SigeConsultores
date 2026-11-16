import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { accounts, companies, policies, policyObjectives, processes, processFODA } from "../../drizzle/schema";
import { getDb } from "../db";
import { processFODARouter } from "../routers/processFODA";

// Evidencia acotada sobre fixtures nuevos: no consulta ni modifica empresas reales.
const suffix = `foda-preserve-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const fixtureDate = new Date("2025-01-15T12:00:00.000Z");
const categoryNames = ["strengths", "opportunities", "weaknesses", "threats"] as const;
const categoryTypes = ["Fortaleza", "Oportunidad", "Debilidad", "Amenaza"] as const;
type Objective = Pick<typeof policyObjectives.$inferSelect, "id" | "objective" | "description">;
type FodaRow = {
  id: number;
  fodaElementId: string;
  type: typeof categoryTypes[number];
  subprocess: string;
  policyObjectiveId: number;
  policyObjective: string;
  policyObjectiveDescription: string;
  selectedObjectiveContent: string;
  statement: string;
  description: string; // Justificación desarrollada del hallazgo en el formato actual.
};
type Categories = Record<typeof categoryNames[number], FodaRow[]>;
type FodaRecord = typeof processFODA.$inferSelect;
type CompanyFixture = { id: number; name: string; objectives: Objective[]; processIds: number[] };

let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let accountId = 0;
const companyIds: number[] = [];
const policyIds: number[] = [];
const objectiveIds: number[] = [];
const processIds: number[] = [];
const fodaIds: number[] = [];
const fixtures: CompanyFixture[] = [];
let historical: Objective;
let editedProcessId = 0;
let editedFodaId = 0;
let initial: Awaited<ReturnType<typeof snapshot>>;

function caller(company: CompanyFixture) {
  return processFODARouter.createCaller({
    user: null,
    manager: { companyId: company.id, companyName: company.name, managerEmail: "fixture@example.test" },
    processLeader: null, req: {} as never, res: {} as never,
  } as never);
}

function withObjective(row: FodaRow, objective: Objective): FodaRow {
  return { ...row, policyObjectiveId: objective.id, policyObjective: objective.objective,
    policyObjectiveDescription: objective.description || "",
    selectedObjectiveContent: `${objective.objective}\n\n${objective.description || ""}` };
}

function developedCategories(company: CompanyFixture, processId: number): Categories {
  return Object.fromEntries(categoryNames.map((category, index) => [category, [0, 1].map(rowIndex => {
    const objective = processId === editedProcessId && category === "strengths" && rowIndex === 1
      ? historical : company.objectives[(index + rowIndex) % company.objectives.length];
    return {
      id: index * 2 + rowIndex + 1,
      fodaElementId: `${processId}-${category}-${rowIndex}`,
      type: categoryTypes[index],
      subprocess: `Subproceso ficticio ${processId}-${index}`,
      policyObjectiveId: objective.id,
      policyObjective: objective.objective,
      policyObjectiveDescription: objective.description || "",
      selectedObjectiveContent: `${objective.objective}\n\n${objective.description || ""}`,
      statement: `Enunciado desarrollado ${processId}-${category}-${rowIndex}: hallazgo con evidencia ficticia.`,
      description: `Justificación ${processId}-${category}-${rowIndex}: causas, efectos y evidencia a conservar.`,
    };
  })])) as Categories;
}

function developedMatrix(company: CompanyFixture, processId: number) {
  return [processId === editedProcessId ? historical : company.objectives[0], company.objectives[1]]
    .map((objective, index) => ({
      id: `${processId}-otg-${index}`,
      policyObjectiveId: objective.id,
      objetivoPolitica: objective.objective,
      policyObjectiveDescription: objective.description || "",
      objetivoTactico: `OTG desarrollado ${processId}-${index}: mejorar el desempeño ficticio.`,
      situacionInicial: `Narrativa inicial ${processId}-${index} con evidencia y contexto.`,
      resultadoEsperado: `Resultado esperado ${processId}-${index} verificable.`,
      indicador: `Indicador ficticio ${processId}-${index}`,
      puntoPartida: 150, puntoLlegada: 250, alcanzado: 190, ponderacion: 50,
      acciones: [0, 1].map(task => ({
        id: `${processId}-otg-${index}-task-${task}`,
        accion: `Tarea desarrollada ${processId}-${index}-${task}`,
        responsable: `Responsable ficticio ${task}`,
        fechaInicio: "2025-01-15", fechaFin: "2025-12-15", ponderacion: 50, alcanzado: 25,
      })),
    }));
}

function serialize(categories: Categories) {
  return { strengths: JSON.stringify(categories.strengths), opportunities: JSON.stringify(categories.opportunities),
    weaknesses: JSON.stringify(categories.weaknesses), threats: JSON.stringify(categories.threats) };
}

function categoriesOf(record: FodaRecord): Categories {
  return Object.fromEntries(categoryNames.map(key => [key, JSON.parse(record[key]!)])) as Categories;
}

// Todos los upsert envían SIEMPRE las cuatro categorías actuales, nunca valores vacíos por omisión.
function saveCategories(categories: Categories) {
  return caller(fixtures[0]).upsert({ processId: editedProcessId, ...serialize(categories) });
}

async function snapshot() {
  const [accountRows, companyRows, policyRows, objectiveRows, processRows, fodaRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.id, accountId)),
    db.select().from(companies).where(inArray(companies.id, companyIds)).orderBy(companies.id),
    db.select().from(policies).where(inArray(policies.id, policyIds)).orderBy(policies.id),
    db.select().from(policyObjectives).where(inArray(policyObjectives.id, objectiveIds)).orderBy(policyObjectives.id),
    db.select().from(processes).where(inArray(processes.id, processIds)).orderBy(processes.id),
    db.select().from(processFODA).where(inArray(processFODA.processId, processIds)).orderBy(processFODA.id),
  ]);
  // select() captura todas las columnas, incluidos firma, fechas, órdenes y timestamps.
  return { accounts: accountRows, companies: companyRows, policies: policyRows,
    objectives: objectiveRows, processes: processRows, foda: fodaRows };
}

function target(state: Awaited<ReturnType<typeof snapshot>>) {
  const record = state.foda.find(row => row.id === editedFodaId);
  if (!record) throw new Error("Falta el FODA fixture del proceso editado.");
  return record;
}

function expectUneditedData(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
  expect(after.accounts).toEqual(before.accounts);
  expect(after.companies).toEqual(before.companies);
  expect(after.policies).toEqual(before.policies);
  expect(after.objectives).toEqual(before.objectives);
  expect(after.processes).toEqual(before.processes);
  expect(after.foda.map(row => row.id)).toEqual(before.foda.map(row => row.id));
  // Incluye el segundo proceso de la misma empresa y ambos procesos de la otra.
  expect(after.foda.filter(row => row.id !== editedFodaId))
    .toEqual(before.foda.filter(row => row.id !== editedFodaId));
}

beforeAll(async () => {
  const connection = await getDb();
  if (!connection) throw new Error("Se requiere MySQL local de pruebas.");
  db = connection;
  const [account] = await db.insert(accounts).values({ openId: suffix, name: "Fixture preservación FODA", status: "active" });
  accountId = Number(account.insertId);

  for (const label of ["Alfa", "Beta"]) {
    const name = `Empresa ficticia ${label} ${suffix}`;
    const [company] = await db.insert(companies).values({ name, description: "Solo fixture de integración",
      ownerAccountId: accountId, status: "En Proceso" });
    const companyId = Number(company.insertId);
    companyIds.push(companyId);
    const fixture: CompanyFixture = { id: companyId, name, objectives: [], processIds: [] };
    fixtures.push(fixture);
    const [policy] = await db.insert(policies).values({
      companyId, versionNo: `fixture-${label}-v3`, versionDate: fixtureDate,
      policyText: `Política integrada ficticia ${label}. Calidad, seguridad, ambiente y mejora continua.\nTexto firmado a conservar íntegro.`,
      generalManagerName: `Gerencia ficticia ${label}`, generalManagerCI: `FICTICIA-${label}-001`,
      electronicSignature: `firma-electrónica-ficticia-${label}-no-real`,
      createdAt: fixtureDate, updatedAt: fixtureDate,
    });
    const policyId = Number(policy.insertId);
    policyIds.push(policyId);
    for (const orderIndex of [1, 2, 3]) {
      const objective = `Objetivo vigente ficticio ${label}-${orderIndex}`;
      const description = `Descripción desarrollada ${label}-${orderIndex}: alcance, criterio y compromiso.`;
      const [inserted] = await db.insert(policyObjectives).values({ policyId, objective, description,
        orderIndex, createdAt: fixtureDate });
      const id = Number(inserted.insertId);
      objectiveIds.push(id);
      fixture.objectives.push({ id, objective, description });
    }
    if (label === "Alfa") {
      const objective = "Objetivo histórico ficticio Alfa";
      const description = "Descripción histórica íntegra anterior a la corrección.";
      const [removed] = await db.insert(policyObjectives).values({ policyId, objective, description,
        orderIndex: 4, createdAt: fixtureDate });
      const id = Number(removed.insertId);
      objectiveIds.push(id);
      historical = { id, objective, description };
      // Única eliminación para simular historia; es exclusivamente un ID recién creado.
      await db.delete(policyObjectives).where(eq(policyObjectives.id, id));
    }
    for (const processIndex of [0, 1]) {
      const [process] = await db.insert(processes).values({ companyId,
        name: `Proceso ficticio ${label}-${processIndex}`, macroProcess: `Macroproceso ficticio ${label}`,
        processType: processIndex === 0 ? "misional" : "soporte",
        description: `Descripción desarrollada del proceso ${label}-${processIndex}`,
        createdAt: fixtureDate, updatedAt: fixtureDate });
      const processId = Number(process.insertId);
      processIds.push(processId);
      fixture.processIds.push(processId);
      if (label === "Alfa" && processIndex === 0) editedProcessId = processId;
      const [foda] = await db.insert(processFODA).values({ processId,
        ...serialize(developedCategories(fixture, processId)),
        matrixData: JSON.stringify(developedMatrix(fixture, processId)),
        createdAt: fixtureDate, updatedAt: fixtureDate });
      const fodaId = Number(foda.insertId);
      fodaIds.push(fodaId);
      if (processId === editedProcessId) editedFodaId = fodaId;
    }
  }
  initial = await snapshot();
  expect(initial.policies).toHaveLength(2);
  expect(initial.objectives).toHaveLength(6);
  expect(initial.objectives.map(row => row.id)).not.toContain(historical.id);
  expect(initial.processes).toHaveLength(4);
  expect(initial.foda).toHaveLength(4);
  for (const record of initial.foda) {
    for (const category of categoryNames) expect(categoriesOf(record)[category]).toHaveLength(2);
    expect(JSON.parse(record.matrixData!)).toHaveLength(2);
  }
});

beforeEach(async () => {
  const original = target(initial);
  await db.update(processFODA).set({ strengths: original.strengths, opportunities: original.opportunities,
    weaknesses: original.weaknesses, threats: original.threats,
    matrixData: original.matrixData, updatedAt: original.updatedAt }).where(eq(processFODA.id, editedFodaId));
  expect(await snapshot()).toEqual(initial);
});

afterAll(async () => {
  if (!db) return;
  // Limpieza exclusivamente por IDs registrados al insertarse; nunca truncate ni limpieza global.
  if (fodaIds.length) await db.delete(processFODA).where(inArray(processFODA.id, fodaIds));
  if (processIds.length) await db.delete(processes).where(inArray(processes.id, processIds));
  if (objectiveIds.length) await db.delete(policyObjectives).where(inArray(policyObjectives.id, objectiveIds));
  if (policyIds.length) await db.delete(policies).where(inArray(policies.id, policyIds));
  if (companyIds.length) await db.delete(companies).where(inArray(companies.id, companyIds));
  if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
});

describe("FODA: preservación de datos desarrollados de dos empresas ficticias", () => {
  it("leer FODA y objetivos no modifica ninguna política, objetivo, proceso ni FODA", async () => {
    const before = await snapshot();
    for (const company of fixtures) {
      for (const processId of company.processIds) {
        const record = before.foda.find(row => row.processId === processId)!;
        expect(await caller(company).get({ processId })).toEqual(record);
        expect(await caller(company).get({ processId, recordId: record.id })).toEqual(record);
        const objectives = await caller(company).listPolicyObjectives({ processId });
        expect(objectives).toEqual(before.objectives.filter(row => company.objectives.some(objective => objective.id === row.id)));
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("sustituir un vínculo histórico por uno vigente cambia solo ese vínculo y el timestamp de un FODA", async () => {
    const before = await snapshot();
    const original = target(before);
    const next = categoriesOf(original);
    const historicalRow = next.strengths[1];
    expect(historicalRow.policyObjectiveId).toBe(historical.id);
    // Solo se envía el cambio de ID; el servidor debe refrescar sus textos de vínculo.
    next.strengths[1] = { ...historicalRow, policyObjectiveId: fixtures[0].objectives[2].id };
    const expected = categoriesOf(original);
    expected.strengths[1] = withObjective(historicalRow, fixtures[0].objectives[2]);
    await saveCategories(next);
    const after = await snapshot();
    expectUneditedData(before, after);
    expect(target(after)).toEqual({ ...original, ...serialize(expected), updatedAt: target(after).updatedAt });
    expect(target(after).updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
    expect(target(after).matrixData).toBe(original.matrixData);
  });

  it("repetir un objetivo en filas de las cuatro categorías conserva todas las filas y sus hallazgos", async () => {
    const before = await snapshot();
    const original = target(before);
    const next = categoriesOf(original);
    const expected = categoriesOf(original);
    const repeated = fixtures[0].objectives[0];
    for (const category of categoryNames) {
      next[category] = next[category].map(row => ({ ...row, policyObjectiveId: repeated.id }));
      expected[category] = expected[category].map(row => withObjective(row, repeated));
    }
    await saveCategories(next);
    const after = await snapshot();
    expectUneditedData(before, after);
    expect(target(after)).toEqual({ ...original, ...serialize(expected), updatedAt: target(after).updatedAt });
    for (const category of categoryNames) {
      const rows = categoriesOf(target(after))[category];
      expect(rows).toHaveLength(categoriesOf(original)[category].length);
      expect(rows.map(row => row.fodaElementId)).toEqual(categoriesOf(original)[category].map(row => row.fodaElementId));
      expect(rows.map(row => row.policyObjectiveId)).toEqual([repeated.id, repeated.id]);
    }
  });

  it("rechazar un objetivo ajeno no modifica ningún dato, ni siquiera otras categorías enviadas", async () => {
    const before = await snapshot();
    const next = categoriesOf(target(before));
    next.strengths[0].statement = "Cambio válido que tampoco debe persistir tras el rechazo";
    next.threats[1].policyObjectiveId = fixtures[1].objectives[0].id;
    await expect(saveCategories(next)).rejects.toThrow("no pertenece");
    expect(await snapshot()).toEqual(before);
  });

  it("guardar una tarea de matriz conserva el vínculo histórico, narrativas, cuatro categorías y ambas políticas con sus objetivos", async () => {
    const before = await snapshot();
    const original = target(before);
    const next = JSON.parse(original.matrixData!) as ReturnType<typeof developedMatrix>;
    expect(next[0].policyObjectiveId).toBe(historical.id);
    next[0].acciones[0].alcanzado = 75;
    await caller(fixtures[0]).saveMatrixData({ processId: editedProcessId, matrixData: JSON.stringify(next) });
    const after = await snapshot();
    expectUneditedData(before, after);
    expect(target(after)).toEqual({ ...original, matrixData: JSON.stringify(next), updatedAt: target(after).updatedAt });
    for (const category of categoryNames) expect(target(after)[category]).toBe(original[category]);
    expect(target(after).updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
  });
});
