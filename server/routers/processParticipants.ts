import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  participantWorkerAssignments,
  participantWorkerKpis,
  participantWorkerKpiValues,
  payrollEmployees,
  processParticipants,
} from "../../drizzle/schema";

const normalizePosition = (value: string | null | undefined) => (value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

/**
 * Trata como equivalentes los cargos iguales tras normalizarlos y también
 * pequeños errores tipográficos dentro de una misma denominación, por ejemplo
 * «Custome Service» frente a «Customer Service». No asocia cargos distintos.
 */
const POSITION_EQUIVALENCE_GROUPS = [
  // Denominaciones corporativas equivalentes. Se mantienen explícitas para no
  // asociar automáticamente puestos distintos solo por pertenecer a una misma área.
  ["jefe comercial", "gerente comercial", "gerente de ventas", "jefe de ventas", "director comercial"],
];

const positionMatches = (participantPosition: string | null | undefined, employeePosition: string | null | undefined) => {
  const participantKey = normalizePosition(participantPosition);
  const employeeKey = normalizePosition(employeePosition);
  if (!participantKey || !employeeKey) return false;
  if (participantKey === employeeKey) return true;
  if (POSITION_EQUIVALENCE_GROUPS.some((group) => group.includes(participantKey) && group.includes(employeeKey))) return true;

  const distance = (left: string, right: string) => {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
        );
      }
      for (let index = 0; index < current.length; index += 1) previous[index] = current[index];
    }
    return previous[right.length];
  };

  const participantWords = participantKey.split(" ");
  const employeeWords = employeeKey.split(" ");
  return participantWords.length === employeeWords.length
    && participantWords.every((word, index) => word === employeeWords[index] || (word.length >= 5 && employeeWords[index].length >= 5 && distance(word, employeeWords[index]) <= 1));
};

const toNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const average = (values: Array<number | null>) => {
  const evaluated = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return evaluated.length ? evaluated.reduce((sum, value) => sum + value, 0) / evaluated.length : null;
};

const kpiPercentage = (monthlyTarget: unknown, values: Array<{ actualValue: unknown }>) => {
  const target = toNumber(monthlyTarget);
  if (target <= 0 || values.length === 0) return null;
  return average(values.map((value) => (toNumber(value.actualValue) / target) * 100));
};

const companyInput = z.object({ companyId: z.number().int().positive() });

export const processParticipantsRouter = router({
  list: companyProcedure
    .input(z.object({ processCharacterizationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db.select().from(processParticipants)
        .where(eq(processParticipants.processCharacterizationId, input.processCharacterizationId))
        .orderBy(asc(processParticipants.orderIndex));
    }),

  create: companyProcedure
    .input(z.object({
      processCharacterizationId: z.number(),
      position: z.string(),
      objective: z.string().optional(),
      responsibility: z.string().optional(),
      authority: z.string().optional(),
      orderIndex: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");

      await db.insert(processParticipants).values({
        processCharacterizationId: input.processCharacterizationId,
        position: input.position,
        objective: input.objective || null,
        responsibility: input.responsibility || null,
        authority: input.authority || null,
        orderIndex: input.orderIndex,
      });

      return { success: true };
    }),

  update: companyProcedure
    .input(z.object({
      id: z.number(),
      position: z.string(),
      objective: z.string().optional(),
      responsibility: z.string().optional(),
      authority: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");

      await db.update(processParticipants)
        .set({
          position: input.position,
          objective: input.objective || null,
          responsibility: input.responsibility || null,
          authority: input.authority || null,
        })
        .where(eq(processParticipants.id, input.id));

      return { success: true };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");

      const assignments = await db.select({ id: participantWorkerAssignments.id })
        .from(participantWorkerAssignments)
        .where(eq(participantWorkerAssignments.processParticipantId, input.id));
      const assignmentIds = assignments.map((assignment) => assignment.id);
      if (assignmentIds.length) {
        const kpis = await db.select({ id: participantWorkerKpis.id })
          .from(participantWorkerKpis)
          .where(inArray(participantWorkerKpis.participantWorkerAssignmentId, assignmentIds));
        const kpiIds = kpis.map((kpi) => kpi.id);
        if (kpiIds.length) {
          await db.delete(participantWorkerKpiValues)
            .where(inArray(participantWorkerKpiValues.participantWorkerKpiId, kpiIds));
          await db.delete(participantWorkerKpis)
            .where(inArray(participantWorkerKpis.id, kpiIds));
        }
        await db.delete(participantWorkerAssignments)
          .where(inArray(participantWorkerAssignments.id, assignmentIds));
      }
      await db.delete(processParticipants)
        .where(eq(processParticipants.id, input.id));

      return { success: true };
    }),

  performanceDashboard: companyProcedure
    .input(companyInput.extend({
      processCharacterizationId: z.number().int().positive(),
      year: z.number().int().min(2020).max(2100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { participants: [], totalWorkers: 0, totalPerformance: null };

      const participants = await db.select().from(processParticipants)
        .where(eq(processParticipants.processCharacterizationId, input.processCharacterizationId))
        .orderBy(asc(processParticipants.orderIndex));
      const activeEmployees = await db.select().from(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")))
        .orderBy(asc(payrollEmployees.fullName));

      const participantIds = participants.map((participant) => participant.id);
      const assignments = participantIds.length
        ? await db.select().from(participantWorkerAssignments)
          .where(inArray(participantWorkerAssignments.processParticipantId, participantIds))
        : [];
      const assignmentIds = assignments.map((assignment) => assignment.id);
      const kpis = assignmentIds.length
        ? await db.select().from(participantWorkerKpis)
          .where(and(inArray(participantWorkerKpis.participantWorkerAssignmentId, assignmentIds), eq(participantWorkerKpis.year, input.year)))
        : [];
      const kpiIds = kpis.map((kpi) => kpi.id);
      const values = kpiIds.length
        ? await db.select().from(participantWorkerKpiValues)
          .where(inArray(participantWorkerKpiValues.participantWorkerKpiId, kpiIds))
        : [];

      const employeeById = new Map(activeEmployees.map((employee) => [employee.id, employee]));
      const valuesByKpi = new Map<number, Array<typeof values[number]>>();
      values.forEach((value) => {
        const current = valuesByKpi.get(value.participantWorkerKpiId) || [];
        current.push(value);
        valuesByKpi.set(value.participantWorkerKpiId, current);
      });
      const kpisByAssignment = new Map<number, Array<typeof kpis[number]>>();
      kpis.forEach((kpi) => {
        const current = kpisByAssignment.get(kpi.participantWorkerAssignmentId) || [];
        current.push(kpi);
        kpisByAssignment.set(kpi.participantWorkerAssignmentId, current);
      });
      const assignmentsByParticipant = new Map<number, Array<typeof assignments[number]>>();
      assignments.forEach((assignment) => {
        const current = assignmentsByParticipant.get(assignment.processParticipantId) || [];
        current.push(assignment);
        assignmentsByParticipant.set(assignment.processParticipantId, current);
      });

      const processWorkerIds = new Set<number>();
      const participantRows = participants.map((participant) => {
        const availableWorkers = activeEmployees.filter((employee) => positionMatches(participant.position, employee.position));
        availableWorkers.forEach((employee) => processWorkerIds.add(employee.id));
        const linkedAssignments = (assignmentsByParticipant.get(participant.id) || [])
          .filter((assignment) => employeeById.has(assignment.payrollEmployeeId));
        const workers = linkedAssignments.map((assignment) => {
          const employee = employeeById.get(assignment.payrollEmployeeId)!;
          const workerKpis = (kpisByAssignment.get(assignment.id) || []).map((kpi) => ({
            ...kpi,
            values: (valuesByKpi.get(kpi.id) || []).sort((a, b) => a.month - b.month),
            percentage: kpiPercentage(kpi.monthlyTarget, valuesByKpi.get(kpi.id) || []),
          }));
          const performance = average(workerKpis.map((kpi) => kpi.percentage));
          return { assignment, employee, kpis: workerKpis, performance };
        });
        const managementPercentage = average(workers.map((worker) => worker.performance));
        return {
          participant,
          availableWorkers,
          workers,
          workerCount: availableWorkers.length,
          managementPercentage,
        };
      });

      return {
        participants: participantRows,
        totalWorkers: processWorkerIds.size,
        totalPerformance: average(participantRows.map((row) => row.managementPercentage)),
      };
    }),

  assignWorker: companyProcedure
    .input(companyInput.extend({ processParticipantId: z.number().int().positive(), payrollEmployeeId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [participant] = await db.select().from(processParticipants).where(eq(processParticipants.id, input.processParticipantId));
      const [employee] = await db.select().from(payrollEmployees).where(and(
        eq(payrollEmployees.id, input.payrollEmployeeId),
        eq(payrollEmployees.companyId, input.companyId),
        eq(payrollEmployees.status, "activo"),
      ));
      if (!participant || !employee) throw new Error("No se encontró el cargo o trabajador activo seleccionado");
      if (!positionMatches(participant.position, employee.position)) {
        throw new Error("El cargo del trabajador no coincide con el cargo del participante");
      }
      const existing = await db.select().from(participantWorkerAssignments).where(and(
        eq(participantWorkerAssignments.processParticipantId, input.processParticipantId),
        eq(participantWorkerAssignments.payrollEmployeeId, input.payrollEmployeeId),
      ));
      if (existing.length) return { success: true, id: existing[0].id, alreadyAssigned: true };
      const result = await db.insert(participantWorkerAssignments).values({
        processParticipantId: input.processParticipantId,
        payrollEmployeeId: input.payrollEmployeeId,
      });
      return { success: true, id: Number(result[0].insertId), alreadyAssigned: false };
    }),

  unassignWorker: companyProcedure
    .input(companyInput.extend({ assignmentId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [assignment] = await db.select({ id: participantWorkerAssignments.id })
        .from(participantWorkerAssignments)
        .innerJoin(payrollEmployees, eq(participantWorkerAssignments.payrollEmployeeId, payrollEmployees.id))
        .where(and(eq(participantWorkerAssignments.id, input.assignmentId), eq(payrollEmployees.companyId, input.companyId)));
      if (!assignment) throw new Error("No se encontró la asignación del trabajador");
      await db.delete(participantWorkerAssignments).where(eq(participantWorkerAssignments.id, input.assignmentId));
      return { success: true };
    }),

  addKpi: companyProcedure
    .input(companyInput.extend({
      assignmentId: z.number().int().positive(),
      year: z.number().int().min(2020).max(2100),
      name: z.string().trim().min(2).max(255),
      monthlyTarget: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [assignment] = await db.select({ id: participantWorkerAssignments.id })
        .from(participantWorkerAssignments)
        .innerJoin(payrollEmployees, eq(participantWorkerAssignments.payrollEmployeeId, payrollEmployees.id))
        .where(and(eq(participantWorkerAssignments.id, input.assignmentId), eq(payrollEmployees.companyId, input.companyId)));
      if (!assignment) throw new Error("No se encontró la asignación del trabajador");
      const result = await db.insert(participantWorkerKpis).values({
        participantWorkerAssignmentId: input.assignmentId,
        year: input.year,
        name: input.name,
        monthlyTarget: String(input.monthlyTarget),
      });
      return { success: true, id: Number(result[0].insertId) };
    }),

  updateKpi: companyProcedure
    .input(companyInput.extend({
      kpiId: z.number().int().positive(),
      name: z.string().trim().min(2).max(255),
      monthlyTarget: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [kpi] = await db.select({ id: participantWorkerKpis.id })
        .from(participantWorkerKpis)
        .innerJoin(participantWorkerAssignments, eq(participantWorkerKpis.participantWorkerAssignmentId, participantWorkerAssignments.id))
        .innerJoin(payrollEmployees, eq(participantWorkerAssignments.payrollEmployeeId, payrollEmployees.id))
        .where(and(eq(participantWorkerKpis.id, input.kpiId), eq(payrollEmployees.companyId, input.companyId)));
      if (!kpi) throw new Error("No se encontró el KPI seleccionado");
      await db.update(participantWorkerKpis).set({
        name: input.name,
        monthlyTarget: String(input.monthlyTarget),
        updatedAt: new Date(),
      }).where(eq(participantWorkerKpis.id, input.kpiId));
      return { success: true };
    }),

  deleteKpi: companyProcedure
    .input(companyInput.extend({ kpiId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [kpi] = await db.select({ id: participantWorkerKpis.id })
        .from(participantWorkerKpis)
        .innerJoin(participantWorkerAssignments, eq(participantWorkerKpis.participantWorkerAssignmentId, participantWorkerAssignments.id))
        .innerJoin(payrollEmployees, eq(participantWorkerAssignments.payrollEmployeeId, payrollEmployees.id))
        .where(and(eq(participantWorkerKpis.id, input.kpiId), eq(payrollEmployees.companyId, input.companyId)));
      if (!kpi) throw new Error("No se encontró el KPI seleccionado");
      await db.delete(participantWorkerKpiValues).where(eq(participantWorkerKpiValues.participantWorkerKpiId, input.kpiId));
      await db.delete(participantWorkerKpis).where(eq(participantWorkerKpis.id, input.kpiId));
      return { success: true };
    }),

  setKpiValue: companyProcedure
    .input(companyInput.extend({
      kpiId: z.number().int().positive(),
      month: z.number().int().min(1).max(12),
      actualValue: z.number().nonnegative().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [kpi] = await db.select({ id: participantWorkerKpis.id })
        .from(participantWorkerKpis)
        .innerJoin(participantWorkerAssignments, eq(participantWorkerKpis.participantWorkerAssignmentId, participantWorkerAssignments.id))
        .innerJoin(payrollEmployees, eq(participantWorkerAssignments.payrollEmployeeId, payrollEmployees.id))
        .where(and(eq(participantWorkerKpis.id, input.kpiId), eq(payrollEmployees.companyId, input.companyId)));
      if (!kpi) throw new Error("No se encontró el KPI seleccionado");
      const existing = await db.select().from(participantWorkerKpiValues).where(and(
        eq(participantWorkerKpiValues.participantWorkerKpiId, input.kpiId),
        eq(participantWorkerKpiValues.month, input.month),
      ));
      if (input.actualValue === null) {
        if (existing.length) await db.delete(participantWorkerKpiValues).where(eq(participantWorkerKpiValues.id, existing[0].id));
        return { success: true };
      }
      if (existing.length) {
        await db.update(participantWorkerKpiValues).set({ actualValue: String(input.actualValue), updatedAt: new Date() })
          .where(eq(participantWorkerKpiValues.id, existing[0].id));
      } else {
        await db.insert(participantWorkerKpiValues).values({
          participantWorkerKpiId: input.kpiId,
          month: input.month,
          actualValue: String(input.actualValue),
        });
      }
      return { success: true };
    }),
});
