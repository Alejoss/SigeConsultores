import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import type { TrpcContext } from "../_core/context";
import { resolveAuthFromRequest } from "../_core/resolveRequestAuth";
import { assertCompanyAccess, assertProcessAccess, getSessionCompanyId } from "../_core/sessionScope";
import { getDb } from "../db";
import {
  criticalityMatrix, processCharacterizations, processResources, processRiskMatrices,
  processTacticalObjectives, stakeholderCriticalities, processes, procedures, procedureRecords,
  processCompliances, processScheduleActivities, processIndicators, stakeholderSurveys,
  processOutputReleaseControls, processOutputReleasePeriods, processOutputReleaseEvidence,
} from "../../drizzle/schema";
import { getWorkspaceForScope, getProcessWorkspaceStatus, type AnnualWorkspaceRecord } from "./store";
import {
  assertAnnualWorkspaceWritable, runInAnnualScope, runWithAnnualInputValidation, withoutAnnualScope,
  runWithAnnualWriteGuard, validateAnnualWriteAccess,
} from "./runtime";

// Control/identity endpoints retain their canonical services and existing ACLs.
// planningCycles is deliberately wrapped in the source year by its own service.
const BASE_SERVICE_ROUTERS = new Set([
  "auth", "managerAuth", "managerCreation", "passwordReset", "system", "adminOperations",
  "companyAccessRequests", "managerCredentials", "processLeaderInvitations", "accessInvitations",
  "managerInvitations", "teamAccess", "hierarchicalAccess", "companySetup", "recovery",
  "onlineCourses", "courseRegCodes", "planningCycles", "annualWorkspaces", "annualHistory", "processUser",
]);

const PROCESS_PREPARATION_ROUTERS = new Set([
  "processCharacterization", "processCharacterizationCopy", "subprocessMap", "subprocessNeeds",
  "processResources", "processFODA", "processRiskMatrix", "processTacticalObjectives",
  "processStakeholderCriticality", "stakeholderCriticality", "criticalityMatrix", "procedures",
  "processCompliances", "processSchedule", "processIndicators", "processOutputRelease", "stakeholderSurveys",
]);

export function usesAnnualBusinessScope(path: string): boolean {
  return !BASE_SERVICE_ROUTERS.has(path.split(".")[0]);
}

function positiveId(value: unknown, label: string, strings = false): number {
  const candidate = strings && typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label} inválido.` });
  }
  return candidate;
}

function headerValue(ctx: TrpcContext, name: string): string | undefined {
  const value = ctx.req?.headers?.[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Header ${name} inválido.` });
  }
  return value;
}

function inputObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const root = raw as Record<string, unknown>;
  return root.json && typeof root.json === "object" && !Array.isArray(root.json)
    ? root.json as Record<string, unknown> : root;
}

/** Headers select storage; the authenticated actor and actual input authorize it. */
export async function resolveAnnualRequestWorkspace(ctx: TrpcContext, rawInput: unknown): Promise<AnnualWorkspaceRecord | undefined> {
  const companyHeader = headerValue(ctx, "x-isge-company-id");
  const yearHeader = headerValue(ctx, "x-isge-year");
  if (companyHeader !== undefined || yearHeader !== undefined) {
    if (!ctx.user && !ctx.manager && !ctx.processLeader) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Please login (10001)" });
    }
  }
  const sessionCompany = getSessionCompanyId(ctx);
  const companyId = companyHeader !== undefined ? positiveId(companyHeader, "Empresa", true) : sessionCompany;
  if (!companyId) {
    if (yearHeader !== undefined) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecciona la empresa antes del año." });
    // Admin without selection retains the original global flow.
    return undefined;
  }
  assertCompanyAccess(ctx, companyId);
  const body = inputObject(rawInput);
  if (body.companyId !== undefined && positiveId(body.companyId, "Empresa de input") !== companyId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "La empresa del input no coincide con el espacio anual seleccionado." });
  }
  const year = yearHeader !== undefined ? positiveId(yearHeader, "Año", true) : 2026;
  if (year < 2026 || year > 2100) throw new TRPCError({ code: "BAD_REQUEST", message: "Año anual inválido." });
  return withoutAnnualScope(() => getWorkspaceForScope(companyId, year));
}

function directProcessIds(body: Record<string, unknown>): number[] {
  const ids: number[] = [];
  for (const field of ["processId", "sourceProcessId"]) {
    if (body[field] !== undefined) ids.push(positiveId(body[field], field));
  }
  for (const field of ["processIds", "targetProcessIds"]) {
    if (body[field] === undefined) continue;
    if (!Array.isArray(body[field])) throw new TRPCError({ code: "BAD_REQUEST", message: `${field} inválido.` });
    ids.push(...(body[field] as unknown[]).map(value => positiveId(value, field)));
  }
  return Array.from(new Set(ids));
}

/** Only verified destination-list routes skip the leader's source-process ACL.
 * Their resolver still enforces Coordinator/Manager authorization; all IDs must
 * belong to the selected company. Never treat a characterization source as a
 * destination simply because it came in an array.
 */
function sourceProcessIds(path: string, body: Record<string, unknown>): number[] {
  const source = { ...body };
  if (path === "linkedCommitments.createLinks") delete source.processIds;
  if (["processCharacterizationCopy.preview", "processCharacterizationCopy.execute"].includes(path)) delete source.targetProcessIds;
  return directProcessIds(source);
}

async function processIdsForPreparation(path: string, body: Record<string, unknown>): Promise<number[]> {
  const ids = directProcessIds(body);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
  if (body.processCharacterizationId !== undefined) {
    const id = positiveId(body.processCharacterizationId, "Caracterización");
    const [row] = await db.select({ processId: processCharacterizations.processId }).from(processCharacterizations).where(eq(processCharacterizations.id, id)).limit(1);
    // Legacy related rows can store processId instead of characterization id.
    ids.push(row?.processId ?? id);
  }
  if (ids.length) return Array.from(new Set(ids));
  const name = path.split(".")[0];
  const rawId = body.objectiveId ?? body.criticalityId ?? body.resourceId ?? body.recordId ??
    body.procedureId ?? body.controlId ?? body.periodId ?? body.evidenceId ?? body.activityId ??
    body.scheduleId ?? body.indicatorId ?? body.id;
  if (rawId !== undefined) {
    const id = positiveId(rawId, "Registro");
    const table = name === "criticalityMatrix" ? criticalityMatrix :
      name === "processRiskMatrix" ? processRiskMatrices :
      name === "processTacticalObjectives" ? processTacticalObjectives :
      name === "processCompliances" ? processCompliances :
      name === "processSchedule" ? processScheduleActivities :
      name === "processIndicators" ? processIndicators :
      name === "stakeholderSurveys" ? stakeholderSurveys :
      ["processStakeholderCriticality", "stakeholderCriticality"].includes(name) ? stakeholderCriticalities :
      name === "procedures" ? procedures : undefined;
    if (name === "processResources") {
      const [row] = await db.select({ characterizationId: processResources.processCharacterizationId }).from(processResources).where(eq(processResources.id, id)).limit(1);
      if (row) return processIdsForPreparation(path, { processCharacterizationId: row.characterizationId });
    } else if (name === "procedures" && (body.recordId !== undefined || /Record|File/.test(path.split(".")[1] ?? ""))) {
      const recordId = positiveId(body.recordId ?? rawId, "Registro del procedimiento");
      const [row] = await db.select({ processId: procedures.processId }).from(procedureRecords).innerJoin(procedures, eq(procedureRecords.procedureId, procedures.id)).where(eq(procedureRecords.id, recordId)).limit(1);
      if (row) return [row.processId];
    } else if (name === "processOutputRelease") {
      if (body.evidenceId !== undefined || path.endsWith(".deleteEvidence")) {
        const [row] = await db.select({ processId: processOutputReleasePeriods.processId }).from(processOutputReleaseEvidence)
          .innerJoin(processOutputReleasePeriods, eq(processOutputReleaseEvidence.periodId, processOutputReleasePeriods.id))
          .where(eq(processOutputReleaseEvidence.id, id)).limit(1);
        if (row) return [row.processId];
      } else {
        const table = body.periodId !== undefined || path.endsWith(".updatePeriod") ? processOutputReleasePeriods : processOutputReleaseControls;
        const [row] = await db.select({ processId: table.processId }).from(table).where(eq(table.id, id)).limit(1);
        if (row) return [row.processId];
      }
    } else if (table) {
      const [row] = await db.select({ processId: table.processId }).from(table).where(eq(table.id, id)).limit(1);
      if (row) return [row.processId];
    }
  }
  // Do not guess an unrelated process from an actor/input when identity is missing.
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No se pudo resolver la identidad exacta del proceso para comprobar su incorporación anual." });
}

async function assertInputProcessAccess(ctx: TrpcContext, workspace: AnnualWorkspaceRecord, ids: number[], sourceIds: number[] = ids): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
  for (const id of ids) {
    if (sourceIds.includes(id)) assertProcessAccess(ctx, id);
    const [process] = await db.select({ companyId: processes.companyId }).from(processes).where(eq(processes.id, id)).limit(1);
    if (!process || process.companyId !== workspace.companyId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "El proceso del input no pertenece a la empresa del espacio anual." });
    }
  }
}

export async function runInAnnualRequestScope<T>(options: {
  ctx: TrpcContext; path: string; type: string; rawInput: unknown;
}, operation: () => T): Promise<T> {
  if (!usesAnnualBusinessScope(options.path)) return withoutAnnualScope(operation);
  const workspace = await resolveAnnualRequestWorkspace(options.ctx, options.rawInput);
  if (!workspace) return withoutAnnualScope(operation);
  if (options.type !== "query") assertAnnualWorkspaceWritable(workspace);
  return runInAnnualScope(workspace, () => runWithAnnualWriteGuard(async () => {
    const body = inputObject(options.rawInput);
    if (options.type !== "query") await validateAnnualWriteAccess();
    await assertInputProcessAccess(options.ctx, workspace, directProcessIds(body), sourceProcessIds(options.path, body));
    // A file uploaded before associating a procedure has no process identity yet;
    // association/edit is gated later. Closed still rejects the upload above.
    if (options.type !== "query" && options.path !== "procedures.uploadFile" && workspace.year !== 2026 && PROCESS_PREPARATION_ROUTERS.has(options.path.split(".")[0])) {
      const processIds = await processIdsForPreparation(options.path, body);
      await assertInputProcessAccess(options.ctx, workspace, processIds);
      for (const processId of processIds) {
        if (await withoutAnnualScope(() => getProcessWorkspaceStatus(workspace.id, processId)) !== "incorporated") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "El proceso está pendiente de aprobación e incorporación al año seleccionado. Su catálogo y puestos se conservan, pero no se puede editar la caracterización ni sus matrices." });
        }
      }
    }
    return operation();
  }));
}

/**
 * Installed BEFORE every corporate /api/upload and /api/import router/multer.
 * Auth is always canonical. Deferred validation reads the real parsed body
 * before the first getDb/storage operation, without consuming multipart here.
 */
export const annualCorporateHttpScope: RequestHandler = async (req, res, next) => {
  try {
    const auth = await withoutAnnualScope(() => resolveAuthFromRequest(req));
    if (!auth.user && !auth.manager && !auth.processLeader) throw new TRPCError({ code: "UNAUTHORIZED", message: "No autenticado" });
    if (auth.user?.role !== "admin" && !auth.manager && !auth.processLeader) throw new TRPCError({ code: "FORBIDDEN", message: "No tiene acceso a la información de la empresa." });
    const ctx: TrpcContext = { ...auth, req, res };
    const preBody = { ...req.query, ...req.body };
    // The body of a multipart request is not available until multer runs. The
    // selection comes from headers/session, never from a guessed future body.
    const workspace = await resolveAnnualRequestWorkspace(ctx, normalizeHttpInput(preBody));
    if (!workspace) {
      // Admin global compatibility remains; existing router still checks ACLs.
      return withoutAnnualScope(() => next());
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertAnnualWorkspaceWritable(workspace);
    let validatedBody: unknown;
    let validated = false;
    const validate = async () => {
      if (validated && validatedBody === req.body) return;
      const body = normalizeHttpInput({ ...req.query, ...req.body });
      if (body.companyId !== undefined && positiveId(body.companyId, "Empresa del formulario") !== workspace.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "La empresa del formulario no coincide con el espacio anual seleccionado." });
      }
      // Use a separate scope with no validation callback to avoid recursive
      // validation when checking the actual process/company relation.
      await runWithAnnualInputValidation(async () => {}, () => assertInputProcessAccess(ctx, workspace, directProcessIds(body)));
      validatedBody = req.body; validated = true;
    };
    res.locals.annualValidateInput = validate;
    return await runInAnnualScope(workspace, () => runWithAnnualInputValidation(validate, async () => {
      // Express next() returns immediately, long before async multer/router SQL.
      // Keep the lease alive until response completion/disconnect, then drain
      // already-started SQL before release. Detached later callbacks fail closed.
      let responseDone: Promise<void> | undefined;
      if (typeof res.once === "function") {
        responseDone = new Promise(resolve => {
          const done = () => { res.off("finish", done); res.off("close", done); resolve(); };
          res.once("finish", done); res.once("close", done);
        });
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) await validateAnnualWriteAccess();
      await next();
      if (responseDone) await responseDone;
    }));
  } catch (error) {
    const status = error instanceof TRPCError ?
      error.code === "UNAUTHORIZED" ? 401 : error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400 : 500;
    res.status(status).json({ ok: false, error: error instanceof Error ? error.message : "No se pudo resolver el espacio anual." });
  }
};

function normalizeHttpInput(body: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...body };
  for (const field of ["companyId", "processId", "sourceProcessId"]) {
    if (normalized[field] !== undefined) normalized[field] = positiveId(normalized[field], field, true);
  }
  return normalized;
}
