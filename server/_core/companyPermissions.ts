import { TRPCError } from "@trpc/server";
import { and, eq, or } from "drizzle-orm";
import {
  companyManagementAccess,
  companyTrainings,
  companyValues,
  companies,
  criticalityMatrix,
  documents,
  policies,
  policyObjectives,
  processCharacterizations,
  processCompliances,
  processParticipants,
  processRiskMatrices,
  processResources,
  processTacticalObjectives,
  processes,
  strategicObjectives,
  procedures,
  procedureRecords,
  stakeholderCriticalities,
  stakeholderSurveys,
  trainingBackups,
} from "../../drizzle/schema";
import type { TrpcContext } from "./context";
import { getDb } from "../db";

export type CompanyManagementLevel = "standard" | "coordinator";

type ProcessReference = {
  id: number;
  companyId: number;
};

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

function internal(): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Base de datos no disponible.",
  });
}

/**
 * Confirma que la sesión puede consultar información de la empresa indicada.
 * Un Jefe de Proceso conserva visualización de los módulos de su empresa;
 * los datos de otros procesos se protegen con `assertProcessAccess`.
 */
export function assertCompanyReadAccess(ctx: TrpcContext, companyId: number): void {
  if (ctx.user?.role === "admin") return;
  if (ctx.manager?.companyId === companyId) return;
  if (ctx.processLeader?.companyId === companyId) return;
  forbidden("No tiene acceso a esta empresa.");
}

/**
 * Valida que el Jefe de Proceso tenga la autorización explícita de Coordinador
 * para editar módulos corporativos. El Gerente y el Administrador conservan su
 * control total; el Jefe estándar queda en modo de visualización fuera de su
 * propio proceso.
 */
export async function assertCompanyManagementAccess(
  ctx: TrpcContext,
  companyId: number
): Promise<void> {
  if (ctx.user?.role === "admin") return;
  if (ctx.manager?.companyId === companyId) return;

  const leader = ctx.processLeader;
  if (!leader || leader.companyId !== companyId) {
    forbidden("Solo el Gerente o un Coordinador autorizado puede modificar este módulo de empresa.");
  }

  const db = await getDb();
  if (!db) internal();

  const [access] = await db
    .select({ level: companyManagementAccess.accessLevel })
    .from(companyManagementAccess)
    .where(
      and(
        eq(companyManagementAccess.companyId, companyId),
        eq(companyManagementAccess.accountId, leader.processLeaderId)
      )
    )
    .limit(1);

  if (access?.level === "coordinator") return;
  forbidden("Este Jefe de Proceso puede consultar el módulo, pero no modificarlo. El Gerente debe autorizarlo como Coordinador de empresa.");
}

/**
 * Nómina, organigrama y accesos de personas no se delegan al Coordinador.
 * El Jefe conserva lectura; sólo Gerente de la empresa o Administrador editan.
 */
export function assertCompanyPersonnelManagementAccess(
  ctx: TrpcContext,
  companyId: number
): void {
  if (ctx.user?.role === "admin") return;
  if (ctx.manager?.companyId === companyId) return;
  forbidden("Solo el Gerente de la empresa o el Administrador pueden modificar Nómina, Organigrama y accesos de personas.");
}

/** Obtiene el proceso y verifica que pertenezca a la empresa esperada si aplica. */
export async function getProcessForAccess(processId: number): Promise<ProcessReference> {
  const db = await getDb();
  if (!db) internal();
  const [process] = await db
    .select({ id: processes.id, companyId: processes.companyId })
    .from(processes)
    .where(eq(processes.id, processId))
    .limit(1);
  if (!process) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Proceso no encontrado." });
  }
  return process;
}

/**
 * El Coordinador de empresa no recibe procesos ajenos: esta autorización se
 * limita al proceso propio del Jefe. Gerente y Administrador sí mantienen el
 * acceso actual a todos los procesos de su compañía.
 */
export function assertProcessAccess(ctx: TrpcContext, process: ProcessReference): void {
  if (ctx.user?.role === "admin") return;
  if (ctx.manager?.companyId === process.companyId) return;
  if (
    ctx.processLeader?.companyId === process.companyId &&
    ctx.processLeader.processId === process.id
  ) {
    return;
  }
  forbidden("No tiene acceso a este proceso.");
}

export async function assertProcessAccessById(
  ctx: TrpcContext,
  processId: number
): Promise<ProcessReference> {
  const process = await getProcessForAccess(processId);
  assertProcessAccess(ctx, process);
  return process;
}

/** Resolves either a characterization id or its legacy process-id reference. */
export async function assertProcessCharacterizationAccess(
  ctx: TrpcContext,
  characterizationOrProcessId: number
): Promise<ProcessReference> {
  const db = await getDb();
  if (!db) internal();
  const [row] = await db
    .select({ id: processes.id, companyId: processes.companyId })
    .from(processCharacterizations)
    .innerJoin(processes, eq(processCharacterizations.processId, processes.id))
    // Older rows may use the process id directly in related tables.
    // The caller-supplied id is therefore matched against both forms.
    .where(
      or(
        eq(processCharacterizations.id, characterizationOrProcessId),
        eq(processCharacterizations.processId, characterizationOrProcessId)
      )
    )
    .limit(1);
  if (!row) {
    // A new process has no characterization row yet; the supplied identifier
    // can still be its process id and must be authorized as such.
    return assertProcessAccessById(ctx, characterizationOrProcessId);
  }
  assertProcessAccess(ctx, row);
  return row;
}

export async function assertProcessParticipantAccess(
  ctx: TrpcContext,
  participantId: number
): Promise<ProcessReference> {
  const db = await getDb();
  if (!db) internal();
  const [row] = await db
    .select({ id: processes.id, companyId: processes.companyId })
    .from(processParticipants)
    .innerJoin(
      processCharacterizations,
      or(
        eq(processParticipants.processCharacterizationId, processCharacterizations.id),
        eq(processParticipants.processCharacterizationId, processCharacterizations.processId)
      )
    )
    .innerJoin(processes, eq(processCharacterizations.processId, processes.id))
    .where(eq(processParticipants.id, participantId))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Puesto de trabajo no encontrado." });
  assertProcessAccess(ctx, row);
  return row;
}

export async function assertProcessResourceAccess(
  ctx: TrpcContext,
  resourceId: number
): Promise<ProcessReference> {
  const db = await getDb();
  if (!db) internal();
  const [row] = await db
    .select({ id: processes.id, companyId: processes.companyId })
    .from(processResources)
    .innerJoin(
      processCharacterizations,
      or(
        eq(processResources.processCharacterizationId, processCharacterizations.id),
        eq(processResources.processCharacterizationId, processCharacterizations.processId)
      )
    )
    .innerJoin(processes, eq(processCharacterizations.processId, processes.id))
    .where(eq(processResources.id, resourceId))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Recurso no encontrado." });
  assertProcessAccess(ctx, row);
  return row;
}

async function assertRelatedProcessAccess(
  ctx: TrpcContext,
  source: "criticality" | "compliance" | "risk" | "tactical" | "stakeholder" | "stakeholderSurvey" | "procedure" | "procedureRecord",
  id: number
): Promise<ProcessReference> {
  const db = await getDb();
  if (!db) internal();
  let processId: number | null = null;
  if (source === "criticality") {
    const [row] = await db.select({ processId: criticalityMatrix.processId }).from(criticalityMatrix).where(eq(criticalityMatrix.id, id)).limit(1);
    processId = row?.processId ?? null;
  } else if (source === "compliance") {
    const [row] = await db.select({ processId: processCompliances.processId }).from(processCompliances).where(eq(processCompliances.id, id)).limit(1);
    processId = row?.processId ?? null;
  } else if (source === "risk") {
    const [row] = await db.select({ processId: processRiskMatrices.processId }).from(processRiskMatrices).where(eq(processRiskMatrices.id, id)).limit(1);
    processId = row?.processId ?? null;
  } else if (source === "tactical") {
    const [row] = await db.select({ processId: processTacticalObjectives.processId }).from(processTacticalObjectives).where(eq(processTacticalObjectives.id, id)).limit(1);
    processId = row?.processId ?? null;
  } else if (source === "stakeholder") {
    const [row] = await db.select({ processId: stakeholderCriticalities.processId }).from(stakeholderCriticalities).where(eq(stakeholderCriticalities.id, id)).limit(1);
    processId = row?.processId ?? null;
  } else if (source === "stakeholderSurvey") {
    const [row] = await db.select({ processId: stakeholderSurveys.processId }).from(stakeholderSurveys).where(eq(stakeholderSurveys.id, id)).limit(1);
    processId = row?.processId ?? null;
  } else if (source === "procedure") {
    const [row] = await db.select({ processId: procedures.processId }).from(procedures).where(eq(procedures.id, id)).limit(1);
    processId = row?.processId ?? null;
  } else {
    const [row] = await db
      .select({ processId: procedures.processId })
      .from(procedureRecords)
      .innerJoin(procedures, eq(procedureRecords.procedureId, procedures.id))
      .where(eq(procedureRecords.id, id))
      .limit(1);
    processId = row?.processId ?? null;
  }
  if (!processId) throw new TRPCError({ code: "NOT_FOUND", message: "Registro del proceso no encontrado." });
  return assertProcessAccessById(ctx, processId);
}

export const assertProcessCriticalityAccess = (ctx: TrpcContext, id: number) => assertRelatedProcessAccess(ctx, "criticality", id);
export const assertProcessComplianceAccess = (ctx: TrpcContext, id: number) => assertRelatedProcessAccess(ctx, "compliance", id);
export const assertProcessRiskAccess = (ctx: TrpcContext, id: number) => assertRelatedProcessAccess(ctx, "risk", id);
export const assertProcessTacticalObjectiveAccess = (ctx: TrpcContext, id: number) => assertRelatedProcessAccess(ctx, "tactical", id);
export const assertProcessStakeholderAccess = (ctx: TrpcContext, id: number) => assertRelatedProcessAccess(ctx, "stakeholder", id);
export const assertProcessStakeholderSurveyAccess = (ctx: TrpcContext, id: number) => assertRelatedProcessAccess(ctx, "stakeholderSurvey", id);
export const assertProcessProcedureAccess = (ctx: TrpcContext, id: number) => assertRelatedProcessAccess(ctx, "procedure", id);
export const assertProcessProcedureRecordAccess = (ctx: TrpcContext, id: number) => assertRelatedProcessAccess(ctx, "procedureRecord", id);

type CompanyRecordSource = "companyValue" | "policy" | "policyObjective" | "strategicObjective" | "document";

export async function assertCompanyRecordManagementAccess(
  ctx: TrpcContext,
  source: CompanyRecordSource,
  id: number
): Promise<void> {
  const db = await getDb();
  if (!db) internal();
  let companyId: number | null = null;
  if (source === "companyValue") {
    const [row] = await db.select({ companyId: companyValues.companyId }).from(companyValues).where(eq(companyValues.id, id)).limit(1);
    companyId = row?.companyId ?? null;
  } else if (source === "policy") {
    const [row] = await db.select({ companyId: policies.companyId }).from(policies).where(eq(policies.id, id)).limit(1);
    companyId = row?.companyId ?? null;
  } else if (source === "policyObjective") {
    const [row] = await db
      .select({ companyId: policies.companyId })
      .from(policyObjectives)
      .innerJoin(policies, eq(policyObjectives.policyId, policies.id))
      .where(eq(policyObjectives.id, id))
      .limit(1);
    companyId = row?.companyId ?? null;
    if (!companyId) {
      // Compatibilidad con objetivos históricos que se guardaron con companyId
      // en policyId antes de que la pantalla usara el ID real de la Política.
      const [legacyRow] = await db
        .select({ companyId: companies.id })
        .from(policyObjectives)
        .innerJoin(companies, eq(policyObjectives.policyId, companies.id))
        .where(eq(policyObjectives.id, id))
        .limit(1);
      companyId = legacyRow?.companyId ?? null;
    }
  } else if (source === "strategicObjective") {
    const [row] = await db.select({ companyId: strategicObjectives.companyId }).from(strategicObjectives).where(eq(strategicObjectives.id, id)).limit(1);
    companyId = row?.companyId ?? null;
  } else {
    const [row] = await db
      .select({ companyId: processes.companyId })
      .from(documents)
      .innerJoin(processes, eq(documents.processId, processes.id))
      .where(eq(documents.id, id))
      .limit(1);
    companyId = row?.companyId ?? null;
  }
  if (!companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Registro corporativo no encontrado." });
  await assertCompanyManagementAccess(ctx, companyId);
}

export async function assertCompanyRecordReadAccess(
  ctx: TrpcContext,
  source: CompanyRecordSource,
  id: number
): Promise<void> {
  const db = await getDb();
  if (!db) internal();
  let companyId: number | null = null;
  if (source === "companyValue") {
    const [row] = await db.select({ companyId: companyValues.companyId }).from(companyValues).where(eq(companyValues.id, id)).limit(1);
    companyId = row?.companyId ?? null;
  } else if (source === "policy") {
    const [row] = await db.select({ companyId: policies.companyId }).from(policies).where(eq(policies.id, id)).limit(1);
    companyId = row?.companyId ?? null;
  } else if (source === "policyObjective") {
    const [row] = await db
      .select({ companyId: policies.companyId })
      .from(policyObjectives)
      .innerJoin(policies, eq(policyObjectives.policyId, policies.id))
      .where(eq(policyObjectives.id, id))
      .limit(1);
    companyId = row?.companyId ?? null;
    if (!companyId) {
      // Compatibilidad de lectura para los mismos registros históricos.
      const [legacyRow] = await db
        .select({ companyId: companies.id })
        .from(policyObjectives)
        .innerJoin(companies, eq(policyObjectives.policyId, companies.id))
        .where(eq(policyObjectives.id, id))
        .limit(1);
      companyId = legacyRow?.companyId ?? null;
    }
  } else if (source === "strategicObjective") {
    const [row] = await db.select({ companyId: strategicObjectives.companyId }).from(strategicObjectives).where(eq(strategicObjectives.id, id)).limit(1);
    companyId = row?.companyId ?? null;
  } else {
    const [row] = await db
      .select({ companyId: processes.companyId })
      .from(documents)
      .innerJoin(processes, eq(documents.processId, processes.id))
      .where(eq(documents.id, id))
      .limit(1);
    companyId = row?.companyId ?? null;
  }
  if (!companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Registro corporativo no encontrado." });
  assertCompanyReadAccess(ctx, companyId);
}

async function getTrainingCompanyId(trainingId: number): Promise<number> {
  const db = await getDb();
  if (!db) internal();
  const [training] = await db
    .select({ companyId: companyTrainings.companyId })
    .from(companyTrainings)
    .where(eq(companyTrainings.id, trainingId))
    .limit(1);
  if (!training) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Capacitación no encontrada." });
  }
  return training.companyId;
}

/** Resolves a training record before allowing its read-only or editing action. */
export async function assertCompanyTrainingReadAccess(
  ctx: TrpcContext,
  trainingId: number
): Promise<number> {
  const companyId = await getTrainingCompanyId(trainingId);
  assertCompanyReadAccess(ctx, companyId);
  return companyId;
}

export async function assertCompanyTrainingManagementAccess(
  ctx: TrpcContext,
  trainingId: number
): Promise<number> {
  const companyId = await getTrainingCompanyId(trainingId);
  await assertCompanyManagementAccess(ctx, companyId);
  return companyId;
}

/** Resolves a backup record before allowing its read-only or editing action. */
export async function assertTrainingBackupReadAccess(
  ctx: TrpcContext,
  backupId: number
): Promise<number> {
  const db = await getDb();
  if (!db) internal();
  const [backup] = await db
    .select({ companyId: trainingBackups.companyId })
    .from(trainingBackups)
    .where(eq(trainingBackups.id, backupId))
    .limit(1);
  if (!backup) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Respaldo de capacitación no encontrado." });
  }
  assertCompanyReadAccess(ctx, backup.companyId);
  return backup.companyId;
}

export async function assertTrainingBackupManagementAccess(
  ctx: TrpcContext,
  backupId: number
): Promise<number> {
  const companyId = await assertTrainingBackupReadAccess(ctx, backupId);
  await assertCompanyManagementAccess(ctx, companyId);
  return companyId;
}

export function getCompanyIdFromInput(input: unknown): number | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const envelope = input as Record<string, unknown>;
  // HTTP + SuperJSON may expose the raw object under `json`; direct callers
  // provide the parsed input itself. Support both without trusting a URL value.
  const body =
    envelope.json && typeof envelope.json === "object" && !Array.isArray(envelope.json)
      ? (envelope.json as Record<string, unknown>)
      : envelope;
  const value = body.companyId;
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

/**
 * Only for procedures whose validated input always carries `companyId`.
 * Keeping this middleware separate preserves read-only access for Jefes.
 */
export async function assertCompanyManagementFromRawInput(
  ctx: TrpcContext,
  getRawInput: () => Promise<unknown>
): Promise<void> {
  const companyId = getCompanyIdFromInput(await getRawInput());
  if (!companyId) {
    forbidden("No se pudo identificar la empresa para validar el permiso de edición.");
  }
  await assertCompanyManagementAccess(ctx, companyId);
}

export async function assertCompanyPersonnelManagementFromRawInput(
  ctx: TrpcContext,
  getRawInput: () => Promise<unknown>
): Promise<void> {
  const companyId = getCompanyIdFromInput(await getRawInput());
  if (!companyId) {
    forbidden("No se pudo identificar la empresa para validar el permiso de edición.");
  }
  assertCompanyPersonnelManagementAccess(ctx, companyId);
}

export async function assertCompanyReadFromRawInput(
  ctx: TrpcContext,
  getRawInput: () => Promise<unknown>
): Promise<void> {
  const companyId = getCompanyIdFromInput(await getRawInput());
  if (!companyId) {
    forbidden("No se pudo identificar la empresa para validar el acceso de consulta.");
  }
  assertCompanyReadAccess(ctx, companyId);
}

export const COMPANY_MODULES = [
  "estrategia",
  "sistemas_gestion",
  "nomina_organigrama",
  "documentacion",
  "desempeno",
] as const;

export type CompanyModule = (typeof COMPANY_MODULES)[number];

export const COMPANY_MANAGEMENT_LEVEL_LABEL: Record<CompanyManagementLevel, string> = {
  standard: "Jefe de Proceso",
  coordinator: "Coordinador de empresa",
};

export function companyManagementLevelLabel(level: CompanyManagementLevel): string {
  return COMPANY_MANAGEMENT_LEVEL_LABEL[level];
}
