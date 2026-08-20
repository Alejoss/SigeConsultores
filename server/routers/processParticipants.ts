import { z } from "zod";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  participantWorkerAssignments,
  participantWorkerKpis,
  participantWorkerKpiValues,
  payrollEmployees,
  processCharacterizations,
  processParticipants,
  processes,
} from "../../drizzle/schema";

/** Normaliza nombres de Áreas para comparar mayúsculas, tildes y separadores. */
const normalizeArea = (value: string | null | undefined) => (value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const sameArea = (left: string | null | undefined, right: string | null | undefined) => {
  const leftKey = normalizeArea(left);
  const rightKey = normalizeArea(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
};

const suggestedArea = (processName: string, areas: string[]) => {
  const processKey = normalizeArea(processName);
  const matches = areas.filter((area) => {
    const areaKey = normalizeArea(area);
    return areaKey && (areaKey === processKey || processKey.endsWith(` ${areaKey}`));
  });
  return matches.length === 1 ? matches[0] : null;
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
    .input(companyInput.extend({ processCharacterizationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [characterization] = await db.select({
        id: processCharacterizations.id,
        processId: processCharacterizations.processId,
      })
        .from(processCharacterizations)
        .innerJoin(processes, eq(processCharacterizations.processId, processes.id))
        .where(and(
          or(
            eq(processCharacterizations.id, input.processCharacterizationId),
            eq(processCharacterizations.processId, input.processCharacterizationId),
          ),
          eq(processes.companyId, input.companyId),
        ))
        .limit(1);
      // Un proceso recién creado todavía puede no tener caracterización. En ese
      // caso no existen puestos que listar; devolver una lista vacía evita los
      // reintentos de la interfaz y no crea ni modifica ningún dato.
      if (!characterization) return [];

      // Algunas caracterizaciones antiguas guardaron los puestos con el id del
      // proceso. Se consultan ambos identificadores para conservar ese contenido.
      return db.select().from(processParticipants)
        .where(inArray(processParticipants.processCharacterizationId, [characterization.id, characterization.processId]))
        .orderBy(asc(processParticipants.orderIndex));
    }),

  payrollAreaOptions: companyProcedure
    .input(companyInput.extend({ processCharacterizationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { payrollArea: null, suggestedPayrollArea: null, areas: [] as string[] };

      const [characterization] = await db.select({
        payrollArea: processCharacterizations.payrollArea,
        processName: processes.name,
      })
        .from(processCharacterizations)
        .innerJoin(processes, eq(processCharacterizations.processId, processes.id))
        .where(and(
          or(
            eq(processCharacterizations.id, input.processCharacterizationId),
            eq(processCharacterizations.processId, input.processCharacterizationId),
          ),
          eq(processes.companyId, input.companyId),
        ))
        .limit(1);
      if (!characterization) {
        const [process] = await db.select({ processName: processes.name })
          .from(processes)
          .where(and(eq(processes.id, input.processCharacterizationId), eq(processes.companyId, input.companyId)))
          .limit(1);
        const rows = await db.select({ area: payrollEmployees.area })
          .from(payrollEmployees)
          .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));
        const areas = Array.from(new Set(rows.map((row) => row.area.trim()).filter(Boolean)))
          .sort((left, right) => left.localeCompare(right, "es"));
        return {
          payrollArea: null,
          suggestedPayrollArea: process ? suggestedArea(process.processName, areas) : null,
          areas,
        };
      }

      const rows = await db.select({ area: payrollEmployees.area })
        .from(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));
      const areas = Array.from(new Set(rows.map((row) => row.area.trim()).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right, "es"));
      return {
        payrollArea: characterization.payrollArea,
        suggestedPayrollArea: characterization.payrollArea ? null : suggestedArea(characterization.processName, areas),
        areas,
      };
    }),

  setPayrollArea: companyProcedure
    .input(companyInput.extend({
      processCharacterizationId: z.number().int().positive(),
      payrollArea: z.string().trim().min(1).max(255),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [characterization] = await db.select({
        id: processCharacterizations.id,
        processId: processCharacterizations.processId,
        payrollArea: processCharacterizations.payrollArea,
      })
        .from(processCharacterizations)
        .innerJoin(processes, eq(processCharacterizations.processId, processes.id))
        .where(and(
          or(
            eq(processCharacterizations.id, input.processCharacterizationId),
            eq(processCharacterizations.processId, input.processCharacterizationId),
          ),
          eq(processes.companyId, input.companyId),
        ))
        .limit(1);
      if (!characterization) throw new Error("No se encontró el proceso caracterizado de esta empresa");

      const [area] = await db.select({ area: payrollEmployees.area })
        .from(payrollEmployees)
        .where(and(
          eq(payrollEmployees.companyId, input.companyId),
          eq(payrollEmployees.status, "activo"),
          eq(payrollEmployees.area, input.payrollArea),
        ))
        .limit(1);
      if (!area) throw new Error("Selecciona una Área activa existente en Nómina");
      if (characterization.payrollArea && !sameArea(characterization.payrollArea, area.area)) {
        const participantRows = await db.select({ id: processParticipants.id })
          .from(processParticipants)
          .where(inArray(processParticipants.processCharacterizationId, [characterization.id, characterization.processId]));
        const participantIds = participantRows.map((participant) => participant.id);
        const activeAssignments = participantIds.length
          ? await db.select({ id: payrollEmployees.id })
            .from(payrollEmployees)
            .where(and(
              eq(payrollEmployees.companyId, input.companyId),
              inArray(payrollEmployees.currentProcessParticipantId, participantIds),
            ))
          : [];
        if (activeAssignments.length) {
          throw new Error("No puedes cambiar la Área mientras existan trabajadores vinculados. Reasígnalos o retíralos primero.");
        }
      }

      await db.update(processCharacterizations)
        .set({ payrollArea: area.area, updatedAt: new Date() })
        .where(eq(processCharacterizations.id, characterization.id));
      return { success: true, payrollArea: area.area };
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
    .input(companyInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [participant] = await db.select({ id: processParticipants.id })
        .from(processParticipants)
        .innerJoin(processCharacterizations, or(
          eq(processParticipants.processCharacterizationId, processCharacterizations.id),
          eq(processParticipants.processCharacterizationId, processCharacterizations.processId),
        ))
        .innerJoin(processes, eq(processCharacterizations.processId, processes.id))
        .where(and(eq(processParticipants.id, input.id), eq(processes.companyId, input.companyId)))
        .limit(1);
      if (!participant) throw new Error("No se encontró el Puesto de Trabajo de esta empresa");

      await db.update(payrollEmployees)
        .set({ currentProcessParticipantId: null, updatedAt: new Date() })
        .where(and(
          eq(payrollEmployees.companyId, input.companyId),
          eq(payrollEmployees.currentProcessParticipantId, input.id),
        ));
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
      if (!db) return {
        participants: [],
        totalPositions: 0,
        totalAssignedWorkers: 0,
        pendingEvaluations: 0,
        totalPerformance: null,
      };

      const [characterization] = await db.select({
        id: processCharacterizations.id,
        processId: processCharacterizations.processId,
        payrollArea: processCharacterizations.payrollArea,
      })
        .from(processCharacterizations)
        .innerJoin(processes, eq(processCharacterizations.processId, processes.id))
        .where(and(
          or(
            eq(processCharacterizations.id, input.processCharacterizationId),
            eq(processCharacterizations.processId, input.processCharacterizationId),
          ),
          eq(processes.companyId, input.companyId),
        ))
        .limit(1);
      // Los procesos nuevos se muestran sin puestos ni evaluaciones hasta que
      // su responsable agregue información; no deben producir un error de carga.
      if (!characterization) return {
        payrollArea: null,
        participants: [],
        totalPositions: 0,
        totalAssignedWorkers: 0,
        pendingEvaluations: 0,
        totalPerformance: null,
      };
      const participants = await db.select().from(processParticipants)
        .where(inArray(processParticipants.processCharacterizationId, [characterization.id, characterization.processId]))
        .orderBy(asc(processParticipants.orderIndex));
      const activeEmployees = await db.select().from(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")))
        .orderBy(asc(payrollEmployees.fullName));
      const payrollArea = characterization.payrollArea || null;
      const areaEmployees = payrollArea
        ? activeEmployees.filter((employee) => sameArea(employee.area, payrollArea))
        : [];

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

      const participantRows = participants.map((participant) => {
        // Los candidatos pertenecen al Área de RR.HH. asociada al proceso. Un
        // empleado puede estar en un único puesto funcional a la vez.
        const availableWorkers = areaEmployees;
        const linkedAssignments = (assignmentsByParticipant.get(participant.id) || [])
          .filter((assignment) => employeeById.has(assignment.payrollEmployeeId))
          .filter((assignment) => employeeById.get(assignment.payrollEmployeeId)?.currentProcessParticipantId === participant.id);
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
          workerCount: workers.length,
          managementPercentage,
        };
      });

      const assignedWorkers = participantRows.flatMap((row) => row.workers);
      return {
        payrollArea,
        participants: participantRows,
        totalPositions: participants.length,
        totalAssignedWorkers: assignedWorkers.length,
        pendingEvaluations: assignedWorkers.filter((worker) => worker.performance === null).length,
        totalPerformance: average(participantRows.map((row) => row.managementPercentage)),
      };
    }),

  performanceByArea: companyProcedure
    .input(companyInput.extend({ year: z.number().int().min(2020).max(2100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { areas: [], withoutEvaluation: 0 };

      const processRows = await db.select({
        processCharacterizationId: processCharacterizations.id,
        processId: processes.id,
        processName: processes.name,
      })
        .from(processCharacterizations)
        .innerJoin(processes, eq(processCharacterizations.processId, processes.id))
        .where(eq(processes.companyId, input.companyId))
        .orderBy(asc(processes.name));
      const characterizationIds = processRows.map((process) => process.processCharacterizationId);
      if (!characterizationIds.length) return { areas: [], withoutEvaluation: 0 };

      // Los participantes históricos se registraron usando el identificador del proceso;
      // los nuevos usan el de su caracterización. Se consideran ambos sin modificar datos existentes.
      const participantReferenceIds = Array.from(new Set([
        ...characterizationIds,
        ...processRows.map((process) => process.processId),
      ]));
      const participants = await db.select().from(processParticipants)
        .where(inArray(processParticipants.processCharacterizationId, participantReferenceIds));
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
      const activeEmployees = await db.select().from(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));

      const activeEmployeeById = new Map(activeEmployees.map((employee) => [employee.id, employee]));
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
      const participantsByCharacterization = new Map<number, Array<typeof participants[number]>>();
      participants.forEach((participant) => {
        const current = participantsByCharacterization.get(participant.processCharacterizationId) || [];
        current.push(participant);
        participantsByCharacterization.set(participant.processCharacterizationId, current);
      });

      const calculatedAreas = processRows.map((process) => {
        const processParticipantsRows = [
          ...(participantsByCharacterization.get(process.processCharacterizationId) || []),
          ...(participantsByCharacterization.get(process.processId) || []),
        ].filter((participant, index, rows) => rows.findIndex((row) => row.id === participant.id) === index);
        const participantPerformances = processParticipantsRows.map((participant) => {
          const workerPerformances = (assignmentsByParticipant.get(participant.id) || [])
            .filter((assignment) => activeEmployeeById.get(assignment.payrollEmployeeId)?.currentProcessParticipantId === participant.id)
            .map((assignment) => {
              const scores = (kpisByAssignment.get(assignment.id) || [])
                .map((kpi) => kpiPercentage(kpi.monthlyTarget, valuesByKpi.get(kpi.id) || []));
              return average(scores);
            });
          return average(workerPerformances);
        });
        const performance = average(participantPerformances);
        const evaluatedPositions = participantPerformances.filter((value) => value !== null).length;
        const evaluatedWorkers = processParticipantsRows.reduce((count, participant) => count + (assignmentsByParticipant.get(participant.id) || [])
          .filter((assignment) => activeEmployeeById.get(assignment.payrollEmployeeId)?.currentProcessParticipantId === participant.id)
          .filter((assignment) => average((kpisByAssignment.get(assignment.id) || [])
            .map((kpi) => kpiPercentage(kpi.monthlyTarget, valuesByKpi.get(kpi.id) || []))) !== null).length, 0);
        return {
          processId: process.processId,
          processName: process.processName,
          performance: performance === null ? null : Number(performance.toFixed(1)),
          totalPositions: processParticipantsRows.length,
          evaluatedPositions,
          evaluatedWorkers,
        };
      });

      return {
        areas: calculatedAreas.filter((area) => area.performance !== null),
        withoutEvaluation: calculatedAreas.filter((area) => area.performance === null).length,
      };
    }),

  assignWorker: companyProcedure
    .input(companyInput.extend({ processParticipantId: z.number().int().positive(), payrollEmployeeId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [participant] = await db.select({
        id: processParticipants.id,
        position: processParticipants.position,
        payrollArea: processCharacterizations.payrollArea,
      })
        .from(processParticipants)
        .innerJoin(processCharacterizations, or(
          eq(processParticipants.processCharacterizationId, processCharacterizations.id),
          eq(processParticipants.processCharacterizationId, processCharacterizations.processId),
        ))
        .innerJoin(processes, eq(processCharacterizations.processId, processes.id))
        .where(and(
          eq(processParticipants.id, input.processParticipantId),
          eq(processes.companyId, input.companyId),
        ))
        .limit(1);
      const [employee] = await db.select().from(payrollEmployees).where(and(
        eq(payrollEmployees.id, input.payrollEmployeeId),
        eq(payrollEmployees.companyId, input.companyId),
        eq(payrollEmployees.status, "activo"),
      ));
      if (!participant || !employee) throw new Error("No se encontró el puesto o trabajador activo seleccionado");
      if (!participant.payrollArea) throw new Error("Primero selecciona la Área de Nómina asociada al proceso");
      if (!sameArea(participant.payrollArea, employee.area)) {
        throw new Error("El trabajador no pertenece a la Área de Nómina asociada a este proceso");
      }

      const existing = await db.select().from(participantWorkerAssignments).where(and(
        eq(participantWorkerAssignments.processParticipantId, input.processParticipantId),
        eq(participantWorkerAssignments.payrollEmployeeId, input.payrollEmployeeId),
      ));
      const previousParticipantId = employee.currentProcessParticipantId;
      let assignmentId: number;
      if (existing.length) {
        assignmentId = existing[0].id;
      } else {
        const result = await db.insert(participantWorkerAssignments).values({
          processParticipantId: input.processParticipantId,
          payrollEmployeeId: input.payrollEmployeeId,
        });
        assignmentId = Number(result[0].insertId);
      }
      await db.update(payrollEmployees)
        .set({ currentProcessParticipantId: input.processParticipantId, updatedAt: new Date() })
        .where(eq(payrollEmployees.id, employee.id));
      return {
        success: true,
        id: assignmentId,
        alreadyAssigned: existing.length > 0,
        reassigned: previousParticipantId !== null && previousParticipantId !== input.processParticipantId,
      };
    }),

  unassignWorker: companyProcedure
    .input(companyInput.extend({ assignmentId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [assignment] = await db.select({
        employeeId: payrollEmployees.id,
        processParticipantId: participantWorkerAssignments.processParticipantId,
        currentProcessParticipantId: payrollEmployees.currentProcessParticipantId,
      })
        .from(participantWorkerAssignments)
        .innerJoin(payrollEmployees, eq(participantWorkerAssignments.payrollEmployeeId, payrollEmployees.id))
        .where(and(eq(participantWorkerAssignments.id, input.assignmentId), eq(payrollEmployees.companyId, input.companyId)));
      if (!assignment) throw new Error("No se encontró la asignación del trabajador");
      if (assignment.currentProcessParticipantId === assignment.processParticipantId) {
        await db.update(payrollEmployees)
          .set({ currentProcessParticipantId: null, updatedAt: new Date() })
          .where(eq(payrollEmployees.id, assignment.employeeId));
      }
      // El vínculo y sus KPI se mantienen como historial para no perder información.
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
