import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { payrollEmployees, payrollEmploymentPeriods } from "../../drizzle/schema";
import { getDb } from "../db";
import { payrollRouter } from "../routers/payroll";

const companyId = 991004;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let employeeId = 0;

function adminCaller() {
  return payrollRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) throw new Error("La base aislada de Nómina no está disponible.");
  await db.delete(payrollEmploymentPeriods).where(eq(payrollEmploymentPeriods.companyId, companyId));
  await db.delete(payrollEmployees).where(eq(payrollEmployees.companyId, companyId));

  const result = await db.insert(payrollEmployees).values({
    companyId,
    fullName: "Trabajadora temporal de Nómina",
    identityCard: "991004001",
    hireDate: new Date("2024-01-15T12:00:00"),
    area: "Administración",
    position: "Asistente",
    status: "pasivo",
    terminationDate: new Date("2025-12-31T12:00:00"),
  });
  employeeId = Number(result[0].insertId);
});

afterAll(async () => {
  if (!db) return;
  await db.delete(payrollEmploymentPeriods).where(eq(payrollEmploymentPeriods.companyId, companyId));
  await db.delete(payrollEmployees).where(eq(payrollEmployees.companyId, companyId));
});

describe("Nómina: corrección de salida y reincorporación", () => {
  it("corrige la fecha de salida, archiva el periodo anterior y reincorpora sin duplicar la C.I.", async () => {
    const caller = adminCaller();
    await caller.updateInactiveTermination({
      id: employeeId,
      companyId,
      terminationDate: "2026-01-31",
    });

    await caller.reactivateInactive({
      id: employeeId,
      companyId,
      hireDate: "2026-02-01",
    });

    const [employee] = await db
      .select()
      .from(payrollEmployees)
      .where(and(eq(payrollEmployees.id, employeeId), eq(payrollEmployees.companyId, companyId)));
    expect(employee).toMatchObject({
      status: "activo",
      terminationDate: null,
      deletedAt: null,
    });

    const periods = await db
      .select()
      .from(payrollEmploymentPeriods)
      .where(eq(payrollEmploymentPeriods.companyId, companyId));
    expect(periods).toHaveLength(1);
    const closedDate = periods[0].terminationDate as Date;
    expect(`${closedDate.getFullYear()}-${String(closedDate.getMonth() + 1).padStart(2, "0")}-${String(closedDate.getDate()).padStart(2, "0")}`).toBe("2026-01-31");

    const createdAgain = await caller.create({
      companyId,
      fullName: "Trabajadora temporal de Nómina",
      identityCard: "991004001",
      hireDate: "2026-02-01",
      area: "Administración",
      position: "Asistente",
    }).catch(error => error);
    expect(createdAgain).toMatchObject({ message: "Ya existe un trabajador activo con esta C.I." });
  });

  it("retira lógicamente un pasivo sin destruir su historial almacenado", async () => {
    const caller = adminCaller();
    await caller.passToInactive({
      id: employeeId,
      companyId,
      terminationDate: "2026-03-31",
    });
    await caller.deleteInactive({ id: employeeId, companyId });

    const [employee] = await db
      .select()
      .from(payrollEmployees)
      .where(and(eq(payrollEmployees.id, employeeId), eq(payrollEmployees.companyId, companyId)));
    expect(employee.deletedAt).not.toBeNull();

    const inactive = await caller.list({ companyId, status: "pasivo" });
    expect(inactive).toHaveLength(0);
    const periods = await db
      .select()
      .from(payrollEmploymentPeriods)
      .where(eq(payrollEmploymentPeriods.companyId, companyId));
    expect(periods).toHaveLength(1);
  });
});
