import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { participantWorkerAssignments, participantWorkerKpis, participantWorkerKpiValues, payrollEmployees } from "../../drizzle/schema";
import { getDb } from "../db";
import { companyProcedure, router } from "../_core/trpc";

const employeeInput = z.object({
  companyId: z.number(),
  fullName: z.string().trim().min(2).max(255),
  identityCard: z.string().trim().min(5).max(20),
  hireDate: z.string().min(8),
  area: z.string().trim().min(1).max(255),
  position: z.string().trim().min(1).max(255),
});

const normalizeIdentityCard = (identityCard: string) => identityCard.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
const toDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`);
const toNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/**
 * Calcula el desempeño anual de cada trabajador con base en los KPI que tiene
 * registrados en Participantes. Un KPI se promedia únicamente entre los meses
 * que ya tienen resultado, para no castigar meses todavía pendientes.
 */
const getEmployeePerformance = async (
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  employeeIds: number[],
  year: number,
) => {
  const performanceByEmployee = new Map<number, number>();
  if (!employeeIds.length) return performanceByEmployee;

  const assignments = await db.select().from(participantWorkerAssignments)
    .where(inArray(participantWorkerAssignments.payrollEmployeeId, employeeIds));
  const assignmentIds = assignments.map((assignment) => assignment.id);
  if (!assignmentIds.length) return performanceByEmployee;

  const kpis = await db.select().from(participantWorkerKpis)
    .where(and(inArray(participantWorkerKpis.participantWorkerAssignmentId, assignmentIds), eq(participantWorkerKpis.year, year)));
  const kpiIds = kpis.map((kpi) => kpi.id);
  if (!kpiIds.length) return performanceByEmployee;

  const values = await db.select().from(participantWorkerKpiValues)
    .where(inArray(participantWorkerKpiValues.participantWorkerKpiId, kpiIds));
  const valuesByKpi = new Map<number, number[]>();
  values.forEach((value) => {
    const current = valuesByKpi.get(value.participantWorkerKpiId) || [];
    current.push(toNumber(value.actualValue));
    valuesByKpi.set(value.participantWorkerKpiId, current);
  });
  const employeeByAssignment = new Map(assignments.map((assignment) => [assignment.id, assignment.payrollEmployeeId]));
  const scoresByEmployee = new Map<number, number[]>();
  kpis.forEach((kpi) => {
    const target = toNumber(kpi.monthlyTarget);
    const valuesForKpi = valuesByKpi.get(kpi.id) || [];
    const score = target > 0 && valuesForKpi.length ? average(valuesForKpi.map((value) => (value / target) * 100)) : null;
    const employeeId = employeeByAssignment.get(kpi.participantWorkerAssignmentId);
    if (employeeId === undefined || score === null) return;
    const current = scoresByEmployee.get(employeeId) || [];
    current.push(score);
    scoresByEmployee.set(employeeId, current);
  });
  scoresByEmployee.forEach((scores, employeeId) => {
    const score = average(scores);
    if (score !== null) performanceByEmployee.set(employeeId, Number(score.toFixed(1)));
  });
  return performanceByEmployee;
};

export const payrollRouter = router({
  list: companyProcedure
    .input(z.object({ companyId: z.number(), status: z.enum(["activo", "pasivo"]).default("activo"), performanceYear: z.number().int().min(2020).max(2100).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const employees = await db
        .select()
        .from(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, input.status)))
        .orderBy(asc(payrollEmployees.fullName));
      const performanceByEmployee = input.status === "activo"
        ? await getEmployeePerformance(db, employees.map((employee) => employee.id), input.performanceYear ?? new Date().getFullYear())
        : new Map<number, number>();
      return employees.map((employee) => ({ ...employee, performance: performanceByEmployee.get(employee.id) ?? null }));
    }),

  create: companyProcedure
    .input(employeeInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      const identityCard = normalizeIdentityCard(input.identityCard);
      const existing = await db
        .select({ id: payrollEmployees.id, status: payrollEmployees.status })
        .from(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.identityCard, identityCard)));
      if (existing.length > 0) {
        throw new Error(existing[0].status === "pasivo"
          ? "La C.I. ya pertenece a personal pasivo. No se puede duplicar el historial."
          : "Ya existe un trabajador activo con esta C.I.");
      }
      const result = await db.insert(payrollEmployees).values({
        companyId: input.companyId,
        fullName: input.fullName.trim(),
        identityCard,
        hireDate: toDate(input.hireDate),
        area: input.area.trim(),
        position: input.position.trim(),
        status: "activo",
      });
      return { success: true, id: Number(result[0].insertId) };
    }),

  update: companyProcedure
    .input(employeeInput.extend({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      const identityCard = normalizeIdentityCard(input.identityCard);
      const duplicate = await db
        .select({ id: payrollEmployees.id })
        .from(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.identityCard, identityCard)));
      if (duplicate.some((employee) => employee.id !== input.id)) {
        throw new Error("Ya existe un trabajador registrado con esta C.I.");
      }
      await db
        .update(payrollEmployees)
        .set({
          fullName: input.fullName.trim(),
          identityCard,
          hireDate: toDate(input.hireDate),
          area: input.area.trim(),
          position: input.position.trim(),
          updatedAt: new Date(),
        })
        .where(and(eq(payrollEmployees.id, input.id), eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));
      return { success: true };
    }),

  passToInactive: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), terminationDate: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      await db
        .update(payrollEmployees)
        .set({ status: "pasivo", terminationDate: toDate(input.terminationDate), updatedAt: new Date() })
        .where(and(eq(payrollEmployees.id, input.id), eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));
      return { success: true };
    }),

  deleteActive: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      await db
        .delete(payrollEmployees)
        .where(and(eq(payrollEmployees.id, input.id), eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));
      return { success: true };
    }),

  clearActive: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      await db
        .delete(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));
      return { success: true };
    }),

  importBulk: companyProcedure
    .input(z.object({ companyId: z.number(), rows: z.array(employeeInput.omit({ companyId: true })).min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      let inserted = 0;
      let updated = 0;
      let skippedInactive = 0;
      for (const row of input.rows) {
        const identityCard = normalizeIdentityCard(row.identityCard);
        const existing = await db
          .select({ id: payrollEmployees.id, status: payrollEmployees.status })
          .from(payrollEmployees)
          .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.identityCard, identityCard)));
        const data = {
          fullName: row.fullName.trim(),
          identityCard,
          hireDate: toDate(row.hireDate),
          area: row.area.trim(),
          position: row.position.trim(),
          updatedAt: new Date(),
        };
        if (existing.length === 0) {
          await db.insert(payrollEmployees).values({ companyId: input.companyId, ...data, status: "activo" });
          inserted++;
        } else if (existing[0].status === "activo") {
          await db.update(payrollEmployees).set(data).where(eq(payrollEmployees.id, existing[0].id));
          updated++;
        } else {
          skippedInactive++;
        }
      }
      return { success: true, inserted, updated, skippedInactive };
    }),

  analytics: companyProcedure
    .input(z.object({ companyId: z.number(), area: z.string().optional(), performanceYear: z.number().int().min(2020).max(2100).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          activeCount: 0,
          inactiveCount: 0,
          averagePerformance: null as number | null,
          areas: [] as string[],
          recentTerminations: 0,
          periodRotationRate: 0,
          months: [] as Array<{ month: string; exits: number; averageHeadcount: number; rotationRate: number }>,
        };
      }

      const allEmployees = await db
        .select()
        .from(payrollEmployees)
        .where(eq(payrollEmployees.companyId, input.companyId));

      const areas = Array.from(new Set(allEmployees.map((employee) => employee.area).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
      const activeCount = allEmployees.filter((employee) => employee.status === "activo").length;
      const inactiveCount = allEmployees.filter((employee) => employee.status === "pasivo").length;
      const filteredEmployees = input.area ? allEmployees.filter((employee) => employee.area === input.area) : allEmployees;
      const activeEmployeesForPerformance = filteredEmployees.filter((employee) => employee.status === "activo");
      const performanceByEmployee = await getEmployeePerformance(
        db,
        activeEmployeesForPerformance.map((employee) => employee.id),
        input.performanceYear ?? new Date().getFullYear(),
      );
      const evaluatedPerformances = activeEmployeesForPerformance
        .map((employee) => performanceByEmployee.get(employee.id))
        .filter((performance): performance is number => performance !== undefined);
      // MySQL devuelve los campos DATE como objetos Date; convertirlos con String(Date)
      // produce valores como "Wed Jul 15" que no son fechas válidas. Normalizamos ambos formatos.
      const asDate = (value: Date | string | null) => {
        if (!value) return null;
        if (value instanceof Date) {
          return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
        }
        const isoDate = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
        return isoDate ? new Date(`${isoDate}T12:00:00`) : null;
      };
      const today = new Date();
      const months: Array<{ month: string; exits: number; averageHeadcount: number; rotationRate: number }> = [];
      const periodStart = new Date(today.getFullYear(), today.getMonth() - 11, 1, 12, 0, 0, 0);
      const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 12, 0, 0, 0);

      for (let offset = 11; offset >= 0; offset--) {
        const monthStart = new Date(today.getFullYear(), today.getMonth() - offset, 1, 12, 0, 0, 0);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - offset + 1, 0, 12, 0, 0, 0);
        // Para una tasa interpretable, el denominador es todo trabajador que estuvo
        // vinculado al menos un día del mes; una sola salida no puede superar 100 %.
        const linkedEmployees = filteredEmployees.filter((employee) => {
          const hired = asDate(employee.hireDate);
          const terminated = asDate(employee.terminationDate);
          return hired && hired <= monthEnd && (!terminated || terminated >= monthStart);
        }).length;
        const exits = filteredEmployees.filter((employee) => {
          const terminated = asDate(employee.terminationDate);
          return terminated && terminated >= monthStart && terminated <= monthEnd;
        }).length;
        const rotationRate = linkedEmployees > 0 ? Number(((exits / linkedEmployees) * 100).toFixed(1)) : 0;
        months.push({
          month: new Intl.DateTimeFormat("es-EC", { month: "short", year: "numeric" }).format(monthStart).replace(".", ""),
          exits,
          // Se conserva la clave por compatibilidad con la interfaz; representa personal vinculado del mes.
          averageHeadcount: linkedEmployees,
          rotationRate,
        });
      }

      const recentTerminations = months.reduce((sum, month) => sum + month.exits, 0);
      const employeesLinkedInPeriod = filteredEmployees.filter((employee) => {
        const hired = asDate(employee.hireDate);
        const terminated = asDate(employee.terminationDate);
        return hired && hired <= periodEnd && (!terminated || terminated >= periodStart);
      }).length;
      const periodRotationRate = employeesLinkedInPeriod > 0
        ? Number(((recentTerminations / employeesLinkedInPeriod) * 100).toFixed(1))
        : 0;

      return {
        activeCount,
        inactiveCount,
        averagePerformance: average(evaluatedPerformances) === null ? null : Number(average(evaluatedPerformances)!.toFixed(1)),
        areas,
        recentTerminations,
        periodRotationRate,
        months,
      };
    }),
});
