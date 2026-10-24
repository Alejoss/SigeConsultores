import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  accounts,
  accountRoles,
  changeManagementActions,
  changeManagementEvents,
  changeManagementImpacts,
  changeManagementIndicators,
  changeManagementRecords,
  changeManagementScopeLinks,
  changeManagementSuggestions,
  companyManagers,
  linkedCommitments,
  linkedCommitmentEvidence,
  processIndicators,
  processOwners,
  processRiskMatrices,
  processes,
  roles,
  stakeholderCriticalities,
  strategicObjectives,
  subprocesses,
} from "../../drizzle/schema";
import { assertCompanyManagementAccess, assertCompanyReadAccess } from "../_core/companyPermissions";
import type { TrpcContext } from "../_core/context";
import { companyManagementProcedure, companyProcedure, companyReadProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

const statusSchema = z.enum([
  "draft",
  "under_evaluation",
  "approved",
  "in_execution",
  "implemented_pending_verification",
  "closed",
  "cancelled",
]);
type ChangeStatus = z.infer<typeof statusSchema>;
const impactLevelSchema = z.enum(["low", "medium", "high"]);
const originSchema = z.enum([
  "strategy",
  "audit",
  "risk_opportunity",
  "legal_requirement",
  "client",
  "technology",
  "internal_improvement",
  "other",
]);
const actionStatusSchema = z.enum(["pending", "in_progress", "completed", "cancelled"]);
const impactCategorySchema = z.enum([
  "quality",
  "environment",
  "occupational_health_safety",
  "legal_compliance",
  "resources_infrastructure",
  "technology",
  "competence_training",
  "information_documentation",
  "risks_opportunities",
  "management_systems",
  "basc_control_security",
  "other",
]);
const scopeTypeSchema = z.enum([
  "strategic_objective",
  "process",
  "subprocess",
  "stakeholder",
  "risk_opportunity",
  "indicator",
  "custom_measure",
]);
const isoDateSchema = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]);

function failure(code: TRPCError["code"], message: string): never {
  throw new TRPCError({ code, message });
}

function asDate(value?: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function actor(ctx: TrpcContext) {
  return {
    accountId: ctx.user?.id ?? ctx.processLeader?.processLeaderId ?? null,
    name:
      ctx.user?.name ||
      ctx.processLeader?.leaderName ||
      ctx.manager?.managerEmail ||
      "Usuario ISGE 360",
  };
}

function assertManager(ctx: TrpcContext, companyId: number) {
  if (ctx.user?.role === "admin") return;
  if (ctx.manager?.companyId === companyId) return;
  failure("FORBIDDEN", "Solo el Gerente puede autorizar esta decisión de Gestión de Cambios.");
}

async function getChangeOrThrow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  id: number
) {
  const [change] = await db
    .select()
    .from(changeManagementRecords)
    .where(and(eq(changeManagementRecords.id, id), eq(changeManagementRecords.companyId, companyId)))
    .limit(1);
  if (!change) failure("NOT_FOUND", "No se encontró el expediente de cambio solicitado.");
  return change;
}

async function assertChangeEditor(
  ctx: TrpcContext,
  change: Awaited<ReturnType<typeof getChangeOrThrow>>
) {
  assertCompanyReadAccess(ctx, change.companyId);
  if (ctx.user?.role === "admin" || ctx.manager?.companyId === change.companyId) return;
  if (
    ctx.processLeader &&
    ctx.processLeader.companyId === change.companyId &&
    change.responsibleAccountId === ctx.processLeader.processLeaderId
  ) {
    return;
  }
  await assertCompanyManagementAccess(ctx, change.companyId);
}

/**
 * El responsable nombrado puede impulsar el plan y preparar la verificación.
 * El alcance, impactos, indicadores y decisiones corporativas permanecen bajo
 * Gerencia o el Coordinador autorizado.
 */
async function assertCorporateChangeManager(ctx: TrpcContext, companyId: number) {
  await assertCompanyManagementAccess(ctx, companyId);
}

async function assertProcessInCompany(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  processId: number
) {
  const [process] = await db
    .select({ id: processes.id, name: processes.name })
    .from(processes)
    .where(and(eq(processes.id, processId), eq(processes.companyId, companyId)))
    .limit(1);
  if (!process) failure("BAD_REQUEST", "El proceso seleccionado no pertenece a esta empresa.");
  return process;
}

/** Un responsable con acceso debe ser Gerente o dueño de un proceso de la empresa. */
async function getCompanyResponsible(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  accountId: number
) {
  const [manager, owner, roleResponsible] = await Promise.all([
    db
      .select({ id: accounts.id, name: accounts.name, email: accounts.email })
      .from(companyManagers)
      .innerJoin(accounts, eq(companyManagers.accountId, accounts.id))
      .where(and(eq(companyManagers.companyId, companyId), eq(companyManagers.accountId, accountId)))
      .limit(1),
    db
      .select({ id: accounts.id, name: accounts.name, email: accounts.email })
      .from(processOwners)
      .innerJoin(accounts, eq(processOwners.accountId, accounts.id))
      .where(and(eq(processOwners.companyId, companyId), eq(processOwners.accountId, accountId)))
      .limit(1),
    db
      .select({ id: accounts.id, name: accounts.name, email: accounts.email })
      .from(accountRoles)
      .innerJoin(roles, eq(accountRoles.roleId, roles.id))
      .innerJoin(accounts, eq(accountRoles.accountId, accounts.id))
      .where(
        and(
          eq(accountRoles.companyId, companyId),
          eq(accountRoles.accountId, accountId),
          eq(accountRoles.status, "active"),
          inArray(roles.slug, ["company_manager", "process_leader"])
        )
      )
      .limit(1),
  ]);
  const responsible = manager[0] || owner[0] || roleResponsible[0];
  if (!responsible) {
    failure("BAD_REQUEST", "El responsable seleccionado debe ser Gerente o dueño de un proceso de esta empresa.");
  }
  return responsible;
}

async function writeEvent(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  changeId: number,
  companyId: number,
  eventType: "created" | "updated" | "status" | "scope" | "impact" | "action" | "indicator" | "closure",
  detail: string,
  ctx: TrpcContext
) {
  const by = actor(ctx);
  await db.insert(changeManagementEvents).values({
    changeId,
    companyId,
    eventType,
    detail,
    actorAccountId: by.accountId,
    actorName: by.name,
  });
}

async function getActionProgress(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  actionIds: number[]
) {
  if (!actionIds.length) return new Map<number, { total: number; completed: number; evidenceCount: number }>();
  const commitments = await db
    .select({
      sourceId: linkedCommitments.sourceId,
      status: linkedCommitments.status,
      id: linkedCommitments.id,
    })
    .from(linkedCommitments)
    .where(
      and(
        eq(linkedCommitments.companyId, companyId),
        eq(linkedCommitments.sourceType, "change_action"),
        inArray(linkedCommitments.sourceId, actionIds)
      )
    );
  const result = new Map<number, { total: number; completed: number; evidenceCount: number }>();
  for (const commitment of commitments) {
    if (!commitment.sourceId) continue;
    const current = result.get(commitment.sourceId) || { total: 0, completed: 0, evidenceCount: 0 };
    current.total += 1;
    if (commitment.status === "completed") current.completed += 1;
    result.set(commitment.sourceId, current);
  }
  return result;
}

async function decorateChanges(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  changes: Array<typeof changeManagementRecords.$inferSelect>
) {
  if (!changes.length) return [];
  const ids = changes.map(item => item.id);
  const [allActions, allScope, allImpacts, allIndicators, allEvents] = await Promise.all([
    db.select().from(changeManagementActions).where(and(eq(changeManagementActions.companyId, companyId), inArray(changeManagementActions.changeId, ids))).orderBy(asc(changeManagementActions.createdAt)),
    db.select().from(changeManagementScopeLinks).where(and(eq(changeManagementScopeLinks.companyId, companyId), inArray(changeManagementScopeLinks.changeId, ids))).orderBy(asc(changeManagementScopeLinks.createdAt)),
    db.select().from(changeManagementImpacts).where(inArray(changeManagementImpacts.changeId, ids)).orderBy(asc(changeManagementImpacts.createdAt)),
    db.select().from(changeManagementIndicators).where(and(eq(changeManagementIndicators.companyId, companyId), inArray(changeManagementIndicators.changeId, ids))).orderBy(asc(changeManagementIndicators.createdAt)),
    db.select().from(changeManagementEvents).where(and(eq(changeManagementEvents.companyId, companyId), inArray(changeManagementEvents.changeId, ids))).orderBy(desc(changeManagementEvents.createdAt)),
  ]);
  const progress = await getActionProgress(db, companyId, allActions.map(action => action.id));
  return changes.map(change => {
    const actions = allActions
      .filter(action => action.changeId === change.id)
      .map(action => ({ ...action, linkProgress: progress.get(action.id) || { total: 0, completed: 0, evidenceCount: 0 } }));
    const completedActions = actions.filter(action => {
      const linkedDone = action.linkProgress.total > 0 && action.linkProgress.total === action.linkProgress.completed;
      return action.status === "completed" || linkedDone;
    }).length;
    return {
      ...change,
      actions,
      scope: allScope.filter(item => item.changeId === change.id),
      impacts: allImpacts.filter(item => item.changeId === change.id),
      indicators: allIndicators.filter(item => item.changeId === change.id),
      events: allEvents.filter(item => item.changeId === change.id),
      actionProgress: { total: actions.length, completed: completedActions },
    };
  });
}

async function resolveScopeSnapshot(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  link: { linkType: z.infer<typeof scopeTypeSchema>; referenceId?: number; processId?: number; title?: string; description?: string }
) {
  if (link.linkType === "custom_measure") {
    if (!link.title?.trim()) failure("BAD_REQUEST", "La medida propia debe tener un nombre.");
    return { referenceId: null, processId: link.processId ?? null, title: link.title.trim(), description: link.description?.trim() || null, snapshot: null };
  }
  if (!link.referenceId) failure("BAD_REQUEST", "Seleccione el registro que desea vincular.");
  if (link.linkType === "process") {
    const process = await assertProcessInCompany(db, companyId, link.referenceId);
    return { referenceId: process.id, processId: process.id, title: process.name, description: null, snapshot: JSON.stringify(process) };
  }
  if (link.linkType === "strategic_objective") {
    const [item] = await db.select().from(strategicObjectives).where(and(eq(strategicObjectives.id, link.referenceId), eq(strategicObjectives.companyId, companyId))).limit(1);
    if (!item) failure("BAD_REQUEST", "El objetivo estratégico no pertenece a esta empresa.");
    return { referenceId: item.id, processId: null, title: item.objective, description: item.description, snapshot: JSON.stringify(item) };
  }
  if (link.linkType === "subprocess") {
    const [item] = await db.select({ id: subprocesses.id, processId: subprocesses.processId, name: subprocesses.name }).from(subprocesses).innerJoin(processes, eq(subprocesses.processId, processes.id)).where(and(eq(subprocesses.id, link.referenceId), eq(processes.companyId, companyId))).limit(1);
    if (!item) failure("BAD_REQUEST", "El subproceso seleccionado no pertenece a esta empresa.");
    return { referenceId: item.id, processId: item.processId, title: item.name, description: null, snapshot: JSON.stringify(item) };
  }
  if (link.linkType === "risk_opportunity") {
    const [item] = await db.select({ id: processRiskMatrices.id, processId: processRiskMatrices.processId, description: processRiskMatrices.description, mitigation: processRiskMatrices.mitigation }).from(processRiskMatrices).innerJoin(processes, eq(processRiskMatrices.processId, processes.id)).where(and(eq(processRiskMatrices.id, link.referenceId), eq(processes.companyId, companyId))).limit(1);
    if (!item) failure("BAD_REQUEST", "El riesgo u oportunidad seleccionado no pertenece a esta empresa.");
    return { referenceId: item.id, processId: item.processId, title: item.description, description: item.mitigation, snapshot: JSON.stringify(item) };
  }
  if (link.linkType === "stakeholder") {
    const [item] = await db.select({ id: stakeholderCriticalities.id, processId: stakeholderCriticalities.processId, name: stakeholderCriticalities.name, actions: stakeholderCriticalities.accionATomar }).from(stakeholderCriticalities).innerJoin(processes, eq(stakeholderCriticalities.processId, processes.id)).where(and(eq(stakeholderCriticalities.id, link.referenceId), eq(processes.companyId, companyId))).limit(1);
    if (!item) failure("BAD_REQUEST", "La parte interesada seleccionada no pertenece a esta empresa.");
    return { referenceId: item.id, processId: item.processId, title: item.name, description: item.actions, snapshot: JSON.stringify(item) };
  }
  const [item] = await db.select().from(processIndicators).innerJoin(processes, eq(processIndicators.processId, processes.id)).where(and(eq(processIndicators.id, link.referenceId), eq(processes.companyId, companyId))).limit(1);
  if (!item) failure("BAD_REQUEST", "El indicador seleccionado no pertenece a esta empresa.");
  return { referenceId: item.processIndicators.id, processId: item.processIndicators.processId, title: item.processIndicators.name, description: item.processIndicators.target, snapshot: JSON.stringify(item.processIndicators) };
}

export const changeManagementRouter = router({
  list: companyReadProcedure
    .input(z.object({ companyId: z.number().int().positive(), status: statusSchema.optional() }))
    .query(async ({ input, ctx }) => {
      assertCompanyReadAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const rows = await db.select().from(changeManagementRecords).where(input.status ? and(eq(changeManagementRecords.companyId, input.companyId), eq(changeManagementRecords.status, input.status)) : eq(changeManagementRecords.companyId, input.companyId)).orderBy(desc(changeManagementRecords.updatedAt));
      return decorateChanges(db, input.companyId, rows);
    }),

  getReferenceOptions: companyReadProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const [companyProcesses, objectives, risks, stakeholders, indicators, owners, managers, activeRoleResponsibles] = await Promise.all([
        db.select().from(processes).where(eq(processes.companyId, input.companyId)).orderBy(asc(processes.name)),
        db.select().from(strategicObjectives).where(eq(strategicObjectives.companyId, input.companyId)).orderBy(asc(strategicObjectives.orderIndex)),
        db.select({ id: processRiskMatrices.id, processId: processRiskMatrices.processId, description: processRiskMatrices.description, mitigation: processRiskMatrices.mitigation }).from(processRiskMatrices).innerJoin(processes, eq(processRiskMatrices.processId, processes.id)).where(eq(processes.companyId, input.companyId)),
        db.select({ id: stakeholderCriticalities.id, processId: stakeholderCriticalities.processId, name: stakeholderCriticalities.name, actions: stakeholderCriticalities.accionATomar }).from(stakeholderCriticalities).innerJoin(processes, eq(stakeholderCriticalities.processId, processes.id)).where(eq(processes.companyId, input.companyId)),
        db.select({ id: processIndicators.id, processId: processIndicators.processId, name: processIndicators.name, unit: processIndicators.unit, currentValue: processIndicators.currentValue, target: processIndicators.target }).from(processIndicators).innerJoin(processes, eq(processIndicators.processId, processes.id)).where(eq(processes.companyId, input.companyId)),
        db.select({ accountId: processOwners.accountId, processId: processOwners.processId, name: accounts.name, email: accounts.email }).from(processOwners).innerJoin(accounts, eq(processOwners.accountId, accounts.id)).where(eq(processOwners.companyId, input.companyId)),
        db.select({ accountId: companyManagers.accountId, name: accounts.name, email: accounts.email }).from(companyManagers).innerJoin(accounts, eq(companyManagers.accountId, accounts.id)).where(eq(companyManagers.companyId, input.companyId)),
        db.select({ accountId: accountRoles.accountId, processId: accountRoles.processId, name: accounts.name, email: accounts.email }).from(accountRoles).innerJoin(roles, eq(accountRoles.roleId, roles.id)).innerJoin(accounts, eq(accountRoles.accountId, accounts.id)).where(and(eq(accountRoles.companyId, input.companyId), eq(accountRoles.status, "active"), inArray(roles.slug, ["company_manager", "process_leader"]))),
      ]);
      const processIds = companyProcesses.map(process => process.id);
      const children = processIds.length ? await db.select().from(subprocesses).where(inArray(subprocesses.processId, processIds)).orderBy(asc(subprocesses.name)) : [];
      const responsibles = new Map<number, { accountId: number; processId?: number; name: string | null; email: string | null }>();
      for (const person of [...owners, ...managers, ...activeRoleResponsibles]) {
        if (!responsibles.has(person.accountId)) responsibles.set(person.accountId, person);
      }
      return { processes: companyProcesses, strategicObjectives: objectives, subprocesses: children, risks, stakeholders, indicators, responsibles: Array.from(responsibles.values()) };
    }),

  create: companyManagementProcedure
    .input(z.object({ companyId: z.number().int().positive(), title: z.string().trim().min(3).max(500), description: z.string().trim().max(500000).optional(), reason: z.string().trim().max(500000).optional(), objective: z.string().trim().max(500000).optional(), expectedResult: z.string().trim().max(500000).optional(), origin: originSchema, originDetail: z.string().trim().max(500000).optional(), impactLevel: impactLevelSchema, responsibleAccountId: z.number().int().positive().optional(), responsibleProcessId: z.number().int().positive().optional(), responsibleName: z.string().trim().max(255).optional(), responsibleEmail: z.string().trim().email().max(320).optional(), plannedStartDate: isoDateSchema.optional(), targetCompletionDate: isoDateSchema.optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const proposedBy = actor(ctx);
      let responsibleName = input.responsibleName || null;
      let responsibleEmail = input.responsibleEmail || null;
      let responsibleProcessId: number | null = null;
      if (input.responsibleAccountId) {
        const responsible = await getCompanyResponsible(db, input.companyId, input.responsibleAccountId);
        responsibleName = responsible.name || responsibleName;
        responsibleEmail = responsible.email || responsibleEmail;
      }
      if (input.responsibleProcessId) {
        const process = await assertProcessInCompany(db, input.companyId, input.responsibleProcessId);
        responsibleProcessId = process.id;
        responsibleName = process.name;
        responsibleEmail = null;
      }
      const result = await db.insert(changeManagementRecords).values({ companyId: input.companyId, title: input.title, description: input.description || null, reason: input.reason || null, objective: input.objective || null, expectedResult: input.expectedResult || null, origin: input.origin, originDetail: input.originDetail || null, impactLevel: input.impactLevel, responsibleAccountId: input.responsibleAccountId || null, responsibleProcessId, responsibleName, responsibleEmail, proposedByAccountId: proposedBy.accountId, proposedByName: proposedBy.name, plannedStartDate: asDate(input.plannedStartDate), targetCompletionDate: asDate(input.targetCompletionDate) });
      const id = Number(result[0].insertId);
      await writeEvent(db, id, input.companyId, "created", "Se abrió el expediente de cambio.", ctx);
      return { id };
    }),

  update: companyProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive(), title: z.string().trim().min(3).max(500).optional(), description: z.string().trim().max(500000).optional(), reason: z.string().trim().max(500000).optional(), objective: z.string().trim().max(500000).optional(), expectedResult: z.string().trim().max(500000).optional(), origin: originSchema.optional(), originDetail: z.string().trim().max(500000).optional(), impactLevel: impactLevelSchema.optional(), responsibleAccountId: z.number().int().positive().nullable().optional(), responsibleProcessId: z.number().int().positive().nullable().optional(), responsibleName: z.string().trim().max(255).nullable().optional(), responsibleEmail: z.string().trim().email().max(320).nullable().optional(), plannedStartDate: isoDateSchema.optional(), targetCompletionDate: isoDateSchema.optional(), decisionNotes: z.string().trim().max(500000).optional(), verificationResult: z.enum(["pending", "effective", "partially_effective", "not_effective"]).optional(), verificationNotes: z.string().trim().max(500000).optional(), verificationDate: isoDateSchema.optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const change = await getChangeOrThrow(db, input.companyId, input.id);
      const hasCorporateFields = [
        input.title,
        input.description,
        input.reason,
        input.objective,
        input.expectedResult,
        input.origin,
        input.originDetail,
        input.impactLevel,
        input.responsibleAccountId,
        input.responsibleProcessId,
        input.responsibleName,
        input.responsibleEmail,
        input.plannedStartDate,
        input.targetCompletionDate,
        input.decisionNotes,
      ].some(value => value !== undefined);
      if (hasCorporateFields) await assertCorporateChangeManager(ctx, input.companyId);
      else await assertChangeEditor(ctx, change);
      const { companyId: _companyId, id: _id, responsibleAccountId, responsibleProcessId, plannedStartDate, targetCompletionDate, verificationDate, ...values } = input;
      let responsible = {};
      if (responsibleAccountId !== undefined) {
        await assertCompanyManagementAccess(ctx, input.companyId);
        if (responsibleAccountId === null) responsible = { responsibleAccountId: null, responsibleName: input.responsibleName || null, responsibleEmail: input.responsibleEmail || null };
        else {
          const account = await getCompanyResponsible(db, input.companyId, responsibleAccountId);
          responsible = { responsibleAccountId, responsibleName: account.name || input.responsibleName || null, responsibleEmail: account.email || input.responsibleEmail || null };
        }
      }
      if (responsibleProcessId !== undefined) {
        await assertCompanyManagementAccess(ctx, input.companyId);
        if (responsibleProcessId === null) {
          responsible = { ...responsible, responsibleProcessId: null };
        } else {
          const process = await assertProcessInCompany(db, input.companyId, responsibleProcessId);
          responsible = {
            ...responsible,
            responsibleProcessId: process.id,
            responsibleAccountId: null,
            responsibleName: process.name,
            responsibleEmail: null,
          };
        }
      }
      await db.update(changeManagementRecords).set({ ...values, ...responsible, ...(plannedStartDate !== undefined && { plannedStartDate: asDate(plannedStartDate) }), ...(targetCompletionDate !== undefined && { targetCompletionDate: asDate(targetCompletionDate) }), ...(verificationDate !== undefined && { verificationDate: asDate(verificationDate) }), updatedAt: new Date() }).where(eq(changeManagementRecords.id, change.id));
      await writeEvent(db, change.id, input.companyId, "updated", "Se actualizó la información del expediente.", ctx);
      return { success: true };
    }),

  transition: companyProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive(), status: statusSchema, note: z.string().trim().max(500000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const change = await getChangeOrThrow(db, input.companyId, input.id);
      if (change.status === "closed") failure("BAD_REQUEST", "Un cambio cerrado no puede volver a modificarse.");
      const allowedTransitions: Record<string, ChangeStatus[]> = {
        draft: ["under_evaluation", "cancelled"],
        under_evaluation: ["approved", "cancelled"],
        approved: ["in_execution", "cancelled"],
        in_execution: ["implemented_pending_verification", "cancelled"],
        implemented_pending_verification: ["closed", "cancelled"],
      };
      if (!allowedTransitions[change.status]?.includes(input.status)) {
        failure("BAD_REQUEST", `No se puede pasar de «${change.status}» a «${input.status}» sin completar las etapas anteriores.`);
      }
      if (input.status === "under_evaluation") {
        await assertCompanyManagementAccess(ctx, input.companyId);
      } else if (input.status === "approved" || input.status === "closed" || input.status === "cancelled") {
        assertManager(ctx, input.companyId);
      } else {
        await assertChangeEditor(ctx, change);
      }
      if (input.status === "cancelled" && !input.note) failure("BAD_REQUEST", "Explique el motivo de la cancelación.");
      if (input.status === "approved" && !input.note) failure("BAD_REQUEST", "Registre el fundamento y las condiciones de la aprobación gerencial.");
      if (input.status === "closed" && !input.note) failure("BAD_REQUEST", "Registre la conclusión gerencial que autoriza el cierre.");
      if (input.status === "approved") {
        const [scope, impacts, indicators, actions] = await Promise.all([
          db.select({ id: changeManagementScopeLinks.id }).from(changeManagementScopeLinks).where(eq(changeManagementScopeLinks.changeId, change.id)).limit(1),
          db.select({ id: changeManagementImpacts.id }).from(changeManagementImpacts).where(eq(changeManagementImpacts.changeId, change.id)).limit(1),
          db.select({ id: changeManagementIndicators.id }).from(changeManagementIndicators).where(eq(changeManagementIndicators.changeId, change.id)).limit(1),
          db.select().from(changeManagementActions).where(eq(changeManagementActions.changeId, change.id)),
        ]);
        if (!change.reason || !change.objective || !change.expectedResult) {
          failure("BAD_REQUEST", "Antes de aprobar, complete el motivo, objetivo y resultado verificable del cambio.");
        }
        if (!scope[0] || !impacts[0] || !indicators[0]) {
          failure("BAD_REQUEST", "Antes de aprobar, vincule al menos un elemento de alcance, un impacto y un indicador de resultado.");
        }
        if (change.impactLevel !== "low") {
          if ((!change.responsibleAccountId && !change.responsibleProcessId && !change.responsibleName?.trim()) || !actions.length) {
            failure("BAD_REQUEST", "Un cambio de impacto medio o alto requiere responsable de gestión y al menos una acción planificada.");
          }
          const incompletePlan = actions.some(action => !action.responsibleProcessId || !action.plannedDate || !action.evidenceExpected);
          if (incompletePlan) {
            failure("BAD_REQUEST", "Cada acción de un cambio de impacto medio o alto debe tener proceso responsable, fecha prevista y evidencia esperada.");
          }
        }
      }
      if (input.status === "closed") {
        const [actions, indicators] = await Promise.all([
          db.select().from(changeManagementActions).where(eq(changeManagementActions.changeId, change.id)),
          db.select({ id: changeManagementIndicators.id, achievedValue: changeManagementIndicators.achievedValue, measurementDate: changeManagementIndicators.measurementDate }).from(changeManagementIndicators).where(eq(changeManagementIndicators.changeId, change.id)),
        ]);
        if (actions.some(action => action.status !== "completed")) {
          failure("BAD_REQUEST", "No se puede cerrar el cambio mientras existan acciones pendientes.");
        }
        if (!indicators.some(indicator => indicator.achievedValue?.trim() && indicator.measurementDate)) {
          failure("BAD_REQUEST", "Antes del cierre, registre el resultado alcanzado y la fecha de medición de al menos un indicador.");
        }
        if (change.verificationResult === "pending" || !change.verificationNotes?.trim()) {
          failure("BAD_REQUEST", "Antes del cierre, registre el resultado de verificación y sus observaciones.");
        }
        const evidenceRequiredActionIds = actions.filter(action => action.evidenceExpected?.trim()).map(action => action.id);
        if (evidenceRequiredActionIds.length) {
          const requiredCommitments = await db
            .select({ id: linkedCommitments.id, sourceId: linkedCommitments.sourceId })
            .from(linkedCommitments)
            .where(
              and(
                eq(linkedCommitments.companyId, input.companyId),
                eq(linkedCommitments.sourceType, "change_action"),
                inArray(linkedCommitments.sourceId, evidenceRequiredActionIds)
              )
            );
          const commitmentIds = requiredCommitments.map(commitment => commitment.id);
          const evidence = commitmentIds.length
            ? await db.select({ linkedCommitmentId: linkedCommitmentEvidence.linkedCommitmentId }).from(linkedCommitmentEvidence).where(inArray(linkedCommitmentEvidence.linkedCommitmentId, commitmentIds))
            : [];
          const evidenceCommitments = new Set(evidence.map(item => item.linkedCommitmentId));
          if (requiredCommitments.some(commitment => !evidenceCommitments.has(commitment.id))) {
            failure("BAD_REQUEST", "Hay acciones que exigen evidencia y aún no tienen un archivo adjunto en el proceso responsable.");
          }
        }
      }
      const now = new Date();
      const who = actor(ctx).name;
      await db.update(changeManagementRecords).set({ status: input.status, decisionNotes: input.note ?? change.decisionNotes, ...(input.status === "approved" && { approvedAt: now, approvedByName: who }), ...(input.status === "implemented_pending_verification" && { closureRequestedAt: now }), ...(input.status === "closed" && { closedAt: now, closedByName: who }), ...(input.status === "cancelled" && { cancellationReason: input.note || null }), updatedAt: now }).where(eq(changeManagementRecords.id, change.id));
      await writeEvent(db, change.id, input.companyId, input.status === "closed" ? "closure" : "status", `${change.status} → ${input.status}${input.note ? `: ${input.note}` : ""}`, ctx);
      return { success: true };
    }),

  addScopeLinks: companyProcedure
    .input(z.object({ companyId: z.number().int().positive(), changeId: z.number().int().positive(), links: z.array(z.object({ linkType: scopeTypeSchema, referenceId: z.number().int().positive().optional(), processId: z.number().int().positive().optional(), title: z.string().trim().max(500).optional(), description: z.string().trim().max(500000).optional() })).min(1).max(100) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const change = await getChangeOrThrow(db, input.companyId, input.changeId);
      await assertCorporateChangeManager(ctx, input.companyId);
      for (const link of input.links) {
        const snapshot = await resolveScopeSnapshot(db, input.companyId, link);
        const existing = await db.select({ id: changeManagementScopeLinks.id }).from(changeManagementScopeLinks).where(and(eq(changeManagementScopeLinks.changeId, change.id), eq(changeManagementScopeLinks.linkType, link.linkType), snapshot.referenceId ? eq(changeManagementScopeLinks.referenceId, snapshot.referenceId) : eq(changeManagementScopeLinks.titleSnapshot, snapshot.title))).limit(1);
        if (existing[0]) continue;
        await db.insert(changeManagementScopeLinks).values({ changeId: change.id, companyId: input.companyId, linkType: link.linkType, referenceId: snapshot.referenceId, processId: snapshot.processId, titleSnapshot: snapshot.title, descriptionSnapshot: snapshot.description, snapshotJson: snapshot.snapshot });
      }
      await writeEvent(db, change.id, input.companyId, "scope", "Se añadieron referencias al alcance del cambio.", ctx);
      return { success: true };
    }),

  upsertImpacts: companyProcedure
    .input(z.object({ companyId: z.number().int().positive(), changeId: z.number().int().positive(), impacts: z.array(z.object({ category: impactCategorySchema, impactLevel: impactLevelSchema, notes: z.string().trim().max(500000).optional() })).max(12) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const change = await getChangeOrThrow(db, input.companyId, input.changeId);
      await assertCorporateChangeManager(ctx, input.companyId);
      for (const item of input.impacts) {
        const [existing] = await db.select({ id: changeManagementImpacts.id }).from(changeManagementImpacts).where(and(eq(changeManagementImpacts.changeId, change.id), eq(changeManagementImpacts.category, item.category))).limit(1);
        if (existing) await db.update(changeManagementImpacts).set({ impactLevel: item.impactLevel, notes: item.notes || null, updatedAt: new Date() }).where(eq(changeManagementImpacts.id, existing.id));
        else await db.insert(changeManagementImpacts).values({ changeId: change.id, category: item.category, impactLevel: item.impactLevel, notes: item.notes || null });
      }
      await writeEvent(db, change.id, input.companyId, "impact", "Se actualizó la evaluación de impactos.", ctx);
      return { success: true };
    }),

  addIndicator: companyProcedure
    .input(z.object({ companyId: z.number().int().positive(), changeId: z.number().int().positive(), processId: z.number().int().positive().optional(), indicatorId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(255), unit: z.string().trim().max(100).optional(), baselineValue: z.string().trim().max(100).optional(), targetValue: z.string().trim().max(100).optional(), achievedValue: z.string().trim().max(100).optional(), measurementDate: isoDateSchema.optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const change = await getChangeOrThrow(db, input.companyId, input.changeId);
      await assertCorporateChangeManager(ctx, input.companyId);
      if (input.processId) await assertProcessInCompany(db, input.companyId, input.processId);
      if (input.indicatorId) {
        const [indicator] = await db.select({ id: processIndicators.id, processId: processIndicators.processId }).from(processIndicators).innerJoin(processes, eq(processIndicators.processId, processes.id)).where(and(eq(processIndicators.id, input.indicatorId), eq(processes.companyId, input.companyId))).limit(1);
        if (!indicator) failure("BAD_REQUEST", "El indicador seleccionado no pertenece a esta empresa.");
      }
      const result = await db.insert(changeManagementIndicators).values({ changeId: change.id, companyId: input.companyId, processId: input.processId || null, indicatorId: input.indicatorId || null, name: input.name, unit: input.unit || null, baselineValue: input.baselineValue || null, targetValue: input.targetValue || null, achievedValue: input.achievedValue || null, measurementDate: asDate(input.measurementDate) });
      await writeEvent(db, change.id, input.companyId, "indicator", `Se agregó el indicador «${input.name}».`, ctx);
      return { id: Number(result[0].insertId) };
    }),

  createAction: companyProcedure
    .input(z.object({ companyId: z.number().int().positive(), changeId: z.number().int().positive(), action: z.string().trim().min(3).max(500000), responsibleProcessId: z.number().int().positive(), responsibleName: z.string().trim().max(255).optional(), responsibleEmail: z.string().trim().email().max(320).optional(), resourceRequired: z.string().trim().max(500000).optional(), plannedDate: isoDateSchema.optional(), trainingRequired: z.string().trim().max(500000).optional(), documentToUpdate: z.string().trim().max(500000).optional(), evidenceExpected: z.string().trim().max(500000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const change = await getChangeOrThrow(db, input.companyId, input.changeId);
      await assertChangeEditor(ctx, change);
      const processName = (await assertProcessInCompany(db, input.companyId, input.responsibleProcessId)).name;
      const result = await db.insert(changeManagementActions).values({ changeId: change.id, companyId: input.companyId, action: input.action, responsibleProcessId: input.responsibleProcessId, responsibleName: input.responsibleName || processName, responsibleEmail: input.responsibleEmail || null, resourceRequired: input.resourceRequired || null, plannedDate: asDate(input.plannedDate), trainingRequired: input.trainingRequired || null, documentToUpdate: input.documentToUpdate || null, evidenceExpected: input.evidenceExpected || null });
      const actionId = Number(result[0].insertId);
      await db.insert(linkedCommitments).values({ companyId: input.companyId, processId: input.responsibleProcessId, sourceType: "change_action", sourceId: actionId, sourceSubId: change.id, kind: "action", title: input.action.slice(0, 500), description: `Gestión de cambios: ${change.title}`, dueDate: asDate(input.plannedDate), referenceResponsible: input.responsibleName || processName });
      await writeEvent(db, change.id, input.companyId, "action", `Se agregó la acción «${input.action.slice(0, 180)}».`, ctx);
      return { id: actionId };
    }),

  updateAction: companyProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive(), action: z.string().trim().min(3).max(500000).optional(), responsibleName: z.string().trim().max(255).nullable().optional(), responsibleEmail: z.string().trim().email().max(320).nullable().optional(), resourceRequired: z.string().trim().max(500000).nullable().optional(), plannedDate: isoDateSchema.optional(), trainingRequired: z.string().trim().max(500000).nullable().optional(), documentToUpdate: z.string().trim().max(500000).nullable().optional(), evidenceExpected: z.string().trim().max(500000).nullable().optional(), status: actionStatusSchema.optional(), progressNotes: z.string().trim().max(500000).nullable().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const [action] = await db.select().from(changeManagementActions).where(and(eq(changeManagementActions.id, input.id), eq(changeManagementActions.companyId, input.companyId))).limit(1);
      if (!action) failure("NOT_FOUND", "La acción de cambio no existe.");
      const change = await getChangeOrThrow(db, input.companyId, action.changeId);
      await assertChangeEditor(ctx, change);
      const { companyId: _companyId, id: _id, plannedDate, status, ...values } = input;
      if (status !== undefined && action.responsibleProcessId) {
        failure("BAD_REQUEST", "Esta acción está asignada a un proceso. Su cumplimiento debe registrarse desde Compromisos vinculados del proceso responsable.");
      }
      await db.update(changeManagementActions).set({ ...values, ...(plannedDate !== undefined && { plannedDate: asDate(plannedDate) }), ...(status !== undefined && { status, completedAt: status === "completed" ? new Date() : null }), updatedAt: new Date() }).where(eq(changeManagementActions.id, action.id));
      await writeEvent(db, change.id, input.companyId, "action", "Se actualizó una acción del plan de cambio.", ctx);
      return { success: true };
    }),

  suggest: companyProcedure
    .input(z.object({ companyId: z.number().int().positive(), title: z.string().trim().min(3).max(500), rationale: z.string().trim().min(3).max(500000) }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyReadAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const by = actor(ctx);
      const result = await db.insert(changeManagementSuggestions).values({ companyId: input.companyId, processId: ctx.processLeader?.processId || null, suggestedByAccountId: by.accountId, suggestedByName: by.name, title: input.title, rationale: input.rationale });
      return { id: Number(result[0].insertId) };
    }),

  listSuggestions: companyManagementProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      return db.select().from(changeManagementSuggestions).where(eq(changeManagementSuggestions.companyId, input.companyId)).orderBy(asc(changeManagementSuggestions.status), desc(changeManagementSuggestions.createdAt));
    }),

  reviewSuggestion: companyProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive(), decision: z.enum(["accepted", "dismissed"]), reviewNotes: z.string().trim().max(500000).optional() }))
    .mutation(async ({ input, ctx }) => {
      assertManager(ctx, input.companyId);
      const db = await getDb();
      if (!db) failure("INTERNAL_SERVER_ERROR", "Base de datos no disponible.");
      const [suggestion] = await db
        .select()
        .from(changeManagementSuggestions)
        .where(and(eq(changeManagementSuggestions.id, input.id), eq(changeManagementSuggestions.companyId, input.companyId)))
        .limit(1);
      if (!suggestion) failure("NOT_FOUND", "La sugerencia no existe en esta empresa.");
      if (suggestion.status !== "pending") failure("BAD_REQUEST", "La sugerencia ya fue revisada por Gerencia.");
      const now = new Date();
      let changeId: number | null = null;
      if (input.decision === "accepted") {
        const created = await db.insert(changeManagementRecords).values({
          companyId: input.companyId,
          title: suggestion.title,
          description: suggestion.rationale,
          reason: suggestion.rationale,
          origin: "internal_improvement",
          impactLevel: "medium",
          proposedByAccountId: suggestion.suggestedByAccountId,
          proposedByName: suggestion.suggestedByName,
          decisionNotes: input.reviewNotes || null,
          status: "under_evaluation",
        });
        changeId = Number(created[0].insertId);
        await writeEvent(db, changeId, input.companyId, "created", `Expediente abierto desde la sugerencia #${suggestion.id}.`, ctx);
      }
      await db.update(changeManagementSuggestions).set({
        status: input.decision,
        reviewNotes: input.reviewNotes || null,
        changeId,
        reviewedAt: now,
        updatedAt: now,
      }).where(eq(changeManagementSuggestions.id, suggestion.id));
      return { success: true, changeId };
    }),
});
