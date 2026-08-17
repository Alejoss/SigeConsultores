import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  criticalityMatrix,
  participantWorkerAssignments,
  participantWorkerKpis,
  participantWorkerKpiValues,
  planningCycleActivations,
  planningCycleDecisions,
  planningCycleSnapshots,
  planningCycles,
  processCharacterizations,
  processCompliances,
  processParticipants,
  processTacticalObjectives,
  processes,
  stakeholders,
} from "../../drizzle/schema";

const ITEM_TYPES = ["ote", "otg", "stakeholder_action", "compliance", "participant_kpi"] as const;
type CycleItemType = typeof ITEM_TYPES[number];
type CycleDecision = "pending" | "migrate" | "close" | "review";

type CycleCandidate = {
  itemType: CycleItemType;
  sourceItemKey: string;
  title: string;
  description: string | null;
  completionPercent: number;
  sourcePayloadJson: string;
};

const companyInput = z.object({ companyId: z.number().int().positive() });

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const average = (values: number[]) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0;

const clampPercent = (value: unknown) => Math.max(0, Math.min(100, asNumber(value)));

function calculateOteProgress(planningData: unknown) {
  if (!planningData) return 0;
  try {
    const data = typeof planningData === "string" ? JSON.parse(planningData) : planningData as any;
    const resultKeys = Array.isArray(data?.resultKeys) ? data.resultKeys : [];
    const values = resultKeys.map((resultKey: any) => {
      if (resultKey?.porcentajeAlcanzado !== undefined) return clampPercent(resultKey.porcentajeAlcanzado);
      const tasks = Array.isArray(resultKey?.tasks) ? resultKey.tasks : [];
      return tasks.length ? average(tasks.map((task: any) => clampPercent(task?.percentageCompleted))) : 0;
    });
    return average(values);
  } catch {
    return 0;
  }
}

function calculateKpiProgress(monthlyTarget: unknown, values: Array<{ actualValue: unknown }>) {
  const target = asNumber(monthlyTarget);
  if (target <= 0 || values.length === 0) return 0;
  return average(values.map((value) => (asNumber(value.actualValue) / target) * 100));
}

async function buildCandidates(companyId: number, processId: number, sourceYear: number): Promise<CycleCandidate[]> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const processRows = await db.select().from(processes)
    .where(and(eq(processes.id, processId), eq(processes.companyId, companyId)))
    .limit(1);
  if (!processRows[0]) throw new Error("El proceso no corresponde a la empresa seleccionada");

  const candidates: CycleCandidate[] = [];
  const [objectives, compliances, criticalities, stakeholderRows, characterizations] = await Promise.all([
    db.select().from(processTacticalObjectives).where(eq(processTacticalObjectives.processId, processId)),
    db.select().from(processCompliances).where(eq(processCompliances.processId, processId)),
    db.select().from(criticalityMatrix).where(eq(criticalityMatrix.processId, processId)),
    db.select().from(stakeholders).where(eq(stakeholders.processId, processId)),
    db.select().from(processCharacterizations).where(eq(processCharacterizations.processId, processId)).limit(1),
  ]);

  for (const objective of objectives) {
    candidates.push({
      itemType: "ote",
      sourceItemKey: String(objective.id),
      title: objective.name,
      description: objective.description || objective.target || null,
      completionPercent: calculateOteProgress(objective.planningData),
      sourcePayloadJson: JSON.stringify(objective),
    });
  }

  for (const compliance of compliances) {
    const validUntil = compliance.validUntil ? new Date(compliance.validUntil) : null;
    const isStillValid = compliance.evaluationMode === "vigencia" && validUntil && validUntil.getFullYear() >= sourceYear + 1;
    candidates.push({
      itemType: "compliance",
      sourceItemKey: String(compliance.id),
      title: compliance.requirement,
      description: isStillValid
        ? `Vigencia hasta ${validUntil.toLocaleDateString("es-EC")}. Requiere revisión antes de reiniciar.`
        : (compliance.description || compliance.regulation || null),
      completionPercent: clampPercent(compliance.completionPercentage),
      sourcePayloadJson: JSON.stringify({ ...compliance, isStillValid }),
    });
  }

  const stakeholderNames = new Map(stakeholderRows.map((stakeholder) => [stakeholder.id, stakeholder.name]));
  for (const criticality of criticalities) {
    if (!criticality.actionToTake?.trim()) continue;
    candidates.push({
      itemType: "stakeholder_action",
      sourceItemKey: String(criticality.id),
      title: criticality.actionToTake,
      description: stakeholderNames.get(criticality.stakeholderId) || "Gestión con Partes Interesadas",
      completionPercent: clampPercent(criticality.completionPercentage),
      sourcePayloadJson: JSON.stringify(criticality),
    });
  }

  const characterization = characterizations[0];
  if (characterization) {
    // Se contemplan ambos identificadores para mantener compatibilidad con participantes históricos.
    const participants = await db.select().from(processParticipants)
      .where(inArray(processParticipants.processCharacterizationId, [characterization.id, processId]));
    const participantIds = participants.map((participant) => participant.id);
    if (participantIds.length) {
      const assignments = await db.select().from(participantWorkerAssignments)
        .where(inArray(participantWorkerAssignments.processParticipantId, participantIds));
      const assignmentIds = assignments.map((assignment) => assignment.id);
      if (assignmentIds.length) {
        const kpis = await db.select().from(participantWorkerKpis)
          .where(and(inArray(participantWorkerKpis.participantWorkerAssignmentId, assignmentIds), eq(participantWorkerKpis.year, sourceYear)));
        const kpiIds = kpis.map((kpi) => kpi.id);
        const values = kpiIds.length
          ? await db.select().from(participantWorkerKpiValues).where(inArray(participantWorkerKpiValues.participantWorkerKpiId, kpiIds))
          : [];
        const valuesByKpi = new Map<number, Array<{ actualValue: unknown }>>();
        values.forEach((value) => {
          const group = valuesByKpi.get(value.participantWorkerKpiId) || [];
          group.push(value);
          valuesByKpi.set(value.participantWorkerKpiId, group);
        });
        const assignmentParticipant = new Map(assignments.map((assignment) => [assignment.id, assignment.processParticipantId]));
        const participantPosition = new Map(participants.map((participant) => [participant.id, participant.position]));
        for (const kpi of kpis) {
          candidates.push({
            itemType: "participant_kpi",
            sourceItemKey: String(kpi.id),
            title: kpi.name,
            description: `KPI ${sourceYear} · ${participantPosition.get(assignmentParticipant.get(kpi.participantWorkerAssignmentId) || 0) || "Participante"}`,
            completionPercent: calculateKpiProgress(kpi.monthlyTarget, valuesByKpi.get(kpi.id) || []),
            sourcePayloadJson: JSON.stringify(kpi),
          });
        }
      }
    }
  }

  return candidates;
}

async function getOrCreateActivation(companyId: number, targetYear: number, accountId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const existing = await db.select().from(planningCycleActivations)
    .where(and(eq(planningCycleActivations.companyId, companyId), eq(planningCycleActivations.targetYear, targetYear)))
    .limit(1);
  if (existing[0]) return existing[0];
  await db.insert(planningCycleActivations).values({
    companyId,
    targetYear,
    status: "draft",
    createdByAccountId: accountId || null,
  });
  const created = await db.select().from(planningCycleActivations)
    .where(and(eq(planningCycleActivations.companyId, companyId), eq(planningCycleActivations.targetYear, targetYear)))
    .limit(1);
  return created[0];
}

export const planningCyclesRouter = router({
  overview: companyProcedure
    .input(companyInput.extend({ processId: z.number().int().positive(), targetYear: z.number().int().min(2020).max(2100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [activation] = await db.select().from(planningCycleActivations)
        .where(and(eq(planningCycleActivations.companyId, input.companyId), eq(planningCycleActivations.targetYear, input.targetYear)))
        .limit(1);
      const [cycle] = await db.select().from(planningCycles)
        .where(and(
          eq(planningCycles.companyId, input.companyId),
          eq(planningCycles.processId, input.processId),
          eq(planningCycles.cycleYear, input.targetYear),
        ))
        .limit(1);
      const decisions = cycle
        ? await db.select().from(planningCycleDecisions)
          .where(eq(planningCycleDecisions.targetCycleId, cycle.id))
          .orderBy(asc(planningCycleDecisions.itemType), asc(planningCycleDecisions.title))
        : [];
      const snapshots = await db.select().from(planningCycleSnapshots)
        .where(eq(planningCycleSnapshots.cycleId, cycle?.sourceCycleId || -1))
        .orderBy(asc(planningCycleSnapshots.itemType), asc(planningCycleSnapshots.title));
      const pendingCount = decisions.filter((decision) => decision.decision === "pending").length;
      return {
        sourceYear: input.targetYear - 1,
        activation: activation || null,
        cycle: cycle || null,
        decisions,
        snapshots,
        pendingCount,
        ready: decisions.length > 0 && pendingCount === 0,
      };
    }),

  prepareDraft: companyProcedure
    .input(companyInput.extend({ processId: z.number().int().positive(), targetYear: z.number().int().min(2020).max(2100) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const sourceYear = input.targetYear - 1;
      const activation = await getOrCreateActivation(input.companyId, input.targetYear, ctx.user?.id);
      const existingTarget = await db.select().from(planningCycles).where(and(
        eq(planningCycles.companyId, input.companyId),
        eq(planningCycles.processId, input.processId),
        eq(planningCycles.cycleYear, input.targetYear),
      )).limit(1);
      if (existingTarget[0]) return { cycleId: existingTarget[0].id, created: false };

      let [sourceCycle] = await db.select().from(planningCycles).where(and(
        eq(planningCycles.companyId, input.companyId),
        eq(planningCycles.processId, input.processId),
        eq(planningCycles.cycleYear, sourceYear),
      )).limit(1);
      if (!sourceCycle) {
        await db.insert(planningCycles).values({
          companyId: input.companyId,
          processId: input.processId,
          cycleYear: sourceYear,
          status: "active",
        });
        [sourceCycle] = await db.select().from(planningCycles).where(and(
          eq(planningCycles.companyId, input.companyId),
          eq(planningCycles.processId, input.processId),
          eq(planningCycles.cycleYear, sourceYear),
        )).limit(1);
      }

      await db.insert(planningCycles).values({
        activationId: activation.id,
        sourceCycleId: sourceCycle.id,
        companyId: input.companyId,
        processId: input.processId,
        cycleYear: input.targetYear,
        status: "in_review",
        preparedByAccountId: ctx.user?.id || null,
        preparedAt: new Date(),
      });
      const [targetCycle] = await db.select().from(planningCycles).where(and(
        eq(planningCycles.companyId, input.companyId),
        eq(planningCycles.processId, input.processId),
        eq(planningCycles.cycleYear, input.targetYear),
      )).limit(1);

      const candidates = await buildCandidates(input.companyId, input.processId, sourceYear);
      if (candidates.length) {
        await db.insert(planningCycleDecisions).values(candidates.map((candidate) => ({
          targetCycleId: targetCycle.id,
          sourceCycleId: sourceCycle.id,
          itemType: candidate.itemType,
          sourceItemKey: candidate.sourceItemKey,
          title: candidate.title,
          description: candidate.description,
          completionPercent: candidate.completionPercent.toFixed(2),
          sourcePayloadJson: candidate.sourcePayloadJson,
          decision: "pending" as const,
        })));
      }
      return { cycleId: targetCycle.id, created: true, itemCount: candidates.length };
    }),

  updateDecision: companyProcedure
    .input(companyInput.extend({
      decisionId: z.number().int().positive(),
      decision: z.enum(["migrate", "close", "review"]),
      note: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [decision] = await db.select().from(planningCycleDecisions)
        .where(eq(planningCycleDecisions.id, input.decisionId)).limit(1);
      if (!decision) throw new Error("Decisión no encontrada");
      const [cycle] = await db.select().from(planningCycles)
        .where(eq(planningCycles.id, decision.targetCycleId)).limit(1);
      if (!cycle || cycle.companyId !== input.companyId || !["in_review", "ready"].includes(cycle.status)) {
        throw new Error("El borrador no está disponible para cambios");
      }
      await db.update(planningCycleDecisions).set({
        decision: input.decision as CycleDecision,
        decisionNote: input.note?.trim() || null,
        decidedByAccountId: ctx.user?.id || null,
        decidedAt: new Date(),
      }).where(eq(planningCycleDecisions.id, input.decisionId));
      return { success: true };
    }),

  markReady: companyProcedure
    .input(companyInput.extend({ cycleId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [cycle] = await db.select().from(planningCycles).where(eq(planningCycles.id, input.cycleId)).limit(1);
      if (!cycle || cycle.companyId !== input.companyId) throw new Error("Ciclo no encontrado");
      const decisions = await db.select().from(planningCycleDecisions)
        .where(eq(planningCycleDecisions.targetCycleId, input.cycleId));
      if (!decisions.length || decisions.some((decision) => decision.decision === "pending")) {
        throw new Error("Debe decidir el destino de todos los elementos antes de marcar el ciclo como listo");
      }
      await db.update(planningCycles).set({ status: "ready", preparedByAccountId: ctx.user?.id || null, preparedAt: new Date() })
        .where(eq(planningCycles.id, input.cycleId));
      return { success: true };
    }),

  managerOverview: companyProcedure
    .input(companyInput.extend({ targetYear: z.number().int().min(2020).max(2100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [activation] = await db.select().from(planningCycleActivations).where(and(
        eq(planningCycleActivations.companyId, input.companyId),
        eq(planningCycleActivations.targetYear, input.targetYear),
      )).limit(1);
      const companyProcesses = await db.select().from(processes)
        .where(eq(processes.companyId, input.companyId)).orderBy(asc(processes.name));
      const cycles = await db.select().from(planningCycles).where(and(
        eq(planningCycles.companyId, input.companyId),
        eq(planningCycles.cycleYear, input.targetYear),
      ));
      const cycleByProcess = new Map(cycles.map((cycle) => [cycle.processId, cycle]));
      return {
        activation: activation || null,
        processes: companyProcesses.map((process) => ({
          id: process.id,
          name: process.name,
          macroProcess: process.macroProcess,
          cycle: cycleByProcess.get(process.id) || null,
        })),
      };
    }),

  setDeadline: companyProcedure
    .input(companyInput.extend({ targetYear: z.number().int().min(2020).max(2100), deadline: z.string().nullable().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const activation = await getOrCreateActivation(input.companyId, input.targetYear, ctx.user?.id);
      if (!["draft", "active"].includes(activation.status)) throw new Error("El ciclo empresarial no permite cambiar su fecha límite");
      await db.update(planningCycleActivations).set({
        deadline: input.deadline ? new Date(`${input.deadline}T00:00:00`) : null,
      }).where(eq(planningCycleActivations.id, activation.id));
      return { success: true };
    }),

  activateCompanyCycle: companyProcedure
    .input(companyInput.extend({ targetYear: z.number().int().min(2020).max(2100) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [activation] = await db.select().from(planningCycleActivations).where(and(
        eq(planningCycleActivations.companyId, input.companyId),
        eq(planningCycleActivations.targetYear, input.targetYear),
      )).limit(1);
      if (!activation) throw new Error("Primero debe configurarse el ciclo empresarial");
      if (activation.status === "active") return { success: true, alreadyActive: true };
      if (activation.status !== "draft") throw new Error("El ciclo empresarial no está disponible para activación");

      const targetCycles = await db.select().from(planningCycles).where(and(
        eq(planningCycles.companyId, input.companyId),
        eq(planningCycles.cycleYear, input.targetYear),
      ));
      const sourceCyclesToClose = new Set<number>();
      for (const cycle of targetCycles) {
        if (cycle.status !== "ready") continue;
        const decisions = await db.select().from(planningCycleDecisions)
          .where(eq(planningCycleDecisions.targetCycleId, cycle.id));
        for (const decision of decisions) {
          // Los ciclos listos no contienen pendientes; se conserva esta salvaguarda para que
          // un snapshot histórico nunca reciba un estado no permitido.
          const migrationDecision = decision.decision === "pending" ? "review" : decision.decision;
          await db.insert(planningCycleSnapshots).values({
            cycleId: decision.sourceCycleId || cycle.sourceCycleId || cycle.id,
            itemType: decision.itemType,
            sourceItemKey: decision.sourceItemKey,
            title: decision.title,
            description: decision.description,
            completionPercent: String(decision.completionPercent),
            snapshotJson: decision.sourcePayloadJson,
            migrationDecision,
            migratedToCycleId: decision.decision === "migrate" ? cycle.id : null,
          }).onDuplicateKeyUpdate({ set: {
            completionPercent: String(decision.completionPercent),
            snapshotJson: decision.sourcePayloadJson,
            migrationDecision,
            migratedToCycleId: decision.decision === "migrate" ? cycle.id : null,
          } });
        }
        if (cycle.sourceCycleId) sourceCyclesToClose.add(cycle.sourceCycleId);
        await db.update(planningCycles).set({ status: "active", activatedAt: new Date() }).where(eq(planningCycles.id, cycle.id));
      }
      for (const sourceCycleId of Array.from(sourceCyclesToClose)) {
        await db.update(planningCycles).set({ status: "closed", closedAt: new Date() }).where(eq(planningCycles.id, sourceCycleId));
      }
      await db.update(planningCycleActivations).set({ status: "active", activatedAt: new Date(), activatedByAccountId: ctx.user?.id || null })
        .where(eq(planningCycleActivations.id, activation.id));
      return { success: true, activatedCycles: targetCycles.filter((cycle) => cycle.status === "ready").length };
    }),
});
