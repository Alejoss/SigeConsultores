import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  companyCompliances,
  linkedCommitmentEvidence,
  linkedCommitments,
  managementPrograms,
  operationalFindings,
  managementSystemChecklistActions,
  managementSystemChecklistItems,
  programActions,
  processes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { refreshProgramMetrics } from "./managementPrograms";
import { synchronizeOperationalFindingSummary } from "../lib/operationalFindings";
import { storageDelete, storageGet } from "../storage";
import type { TrpcContext } from "../_core/context";
import { companyProcedure, router } from "../_core/trpc";

const sourceTypeSchema = z.enum([
  "checklist_action",
  "checklist_vigency",
  "program_action",
  "company_compliance",
  "audit_finding",
  "inspection_finding",
  "own",
]);
const commitmentStatusSchema = z.enum(["pending", "completed"]);
const isoDateSchema = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.literal(""),
]);

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

function inputDate(value?: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function dateValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function assertCompanyAccess(ctx: TrpcContext, companyId: number) {
  if (ctx.user?.role === "admin") return;
  if (ctx.manager?.companyId === companyId) return;
  if (ctx.processLeader?.companyId === companyId) return;
  forbidden("No tiene acceso a la empresa solicitada.");
}

function assertSourceManagementAccess(ctx: TrpcContext, companyId: number) {
  assertCompanyAccess(ctx, companyId);
  if (ctx.user?.role === "admin" || ctx.manager?.companyId === companyId)
    return;
  forbidden(
    "Solo el Gerente de la empresa o el Administrador pueden vincular compromisos."
  );
}

function assertCommitmentAccess(
  ctx: TrpcContext,
  companyId: number,
  processId: number
) {
  assertCompanyAccess(ctx, companyId);
  if (ctx.processLeader && ctx.processLeader.processId !== processId) {
    forbidden(
      "El Jefe de Proceso solo puede gestionar los compromisos de su proceso."
    );
  }
}

async function assertProcessBelongsToCompany(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  processId: number
) {
  const [process] = await db
    .select({ id: processes.id, name: processes.name })
    .from(processes)
    .where(and(eq(processes.id, processId), eq(processes.companyId, companyId)))
    .limit(1);
  if (!process) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "El proceso seleccionado no pertenece a esta empresa.",
    });
  }
  return process;
}

type ResolvedSource = {
  sourceType: Exclude<z.infer<typeof sourceTypeSchema>, "own">;
  sourceId: number;
  sourceSubId: number;
  kind: "action" | "vigency";
  title: string;
  description: string | null;
  dueDate: string | null;
  referenceResponsible: string | null;
};

async function resolveSource(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  sourceType: ResolvedSource["sourceType"],
  sourceId: number
): Promise<ResolvedSource> {
  if (sourceType === "checklist_action") {
    const [action] = await db
      .select()
      .from(managementSystemChecklistActions)
      .where(eq(managementSystemChecklistActions.id, sourceId))
      .limit(1);
    if (!action)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "La acción del checklist no existe.",
      });
    const [item] = await db
      .select()
      .from(managementSystemChecklistItems)
      .where(
        and(
          eq(managementSystemChecklistItems.id, action.checklistItemId),
          eq(managementSystemChecklistItems.companyId, companyId)
        )
      )
      .limit(1);
    if (!item)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "La acción no pertenece a esta empresa.",
      });
    return {
      sourceType,
      sourceId: action.id,
      sourceSubId: item.id,
      kind: "action",
      title: action.action.slice(0, 500),
      description: item.standardCode
        ? `${item.standardCode} — ${item.standardName}`
        : item.standardName,
      dueDate: dateValue(action.implementationDate),
      referenceResponsible: action.responsible,
    };
  }

  if (sourceType === "checklist_vigency") {
    const [item] = await db
      .select()
      .from(managementSystemChecklistItems)
      .where(
        and(
          eq(managementSystemChecklistItems.id, sourceId),
          eq(managementSystemChecklistItems.companyId, companyId)
        )
      )
      .limit(1);
    if (!item)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "El estándar del checklist no existe en esta empresa.",
      });
    if (item.verificationMode === "planificacion") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Este estándar no tiene control de vigencia para vincular.",
      });
    }
    return {
      sourceType,
      sourceId: item.id,
      sourceSubId: item.id,
      kind: "vigency",
      title: `Renovar vigencia: ${item.standardName}`.slice(0, 500),
      description:
        item.description ||
        (item.standardCode ? `Estándar ${item.standardCode}` : null),
      dueDate: dateValue(item.validUntil),
      referenceResponsible: item.responsible,
    };
  }

  if (sourceType === "program_action") {
    const [action] = await db
      .select()
      .from(programActions)
      .where(
        and(
          eq(programActions.id, sourceId),
          eq(programActions.companyId, companyId)
        )
      )
      .limit(1);
    if (!action)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "La acción del Programa no existe en esta empresa.",
      });
    const [program] = await db
      .select()
      .from(managementPrograms)
      .where(
        and(
          eq(managementPrograms.id, action.programId),
          eq(managementPrograms.companyId, companyId)
        )
      )
      .limit(1);
    if (!program)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "El Programa de origen no existe.",
      });
    return {
      sourceType,
      sourceId: action.id,
      sourceSubId: program.id,
      kind: "action",
      title: action.action.slice(0, 500),
      description: `Programa: ${program.programName}`,
      dueDate: dateValue(action.implementationDate),
      referenceResponsible: action.responsible,
    };
  }

  if (sourceType === "audit_finding" || sourceType === "inspection_finding") {
    const findingSourceType = sourceType === "audit_finding" ? "audit" : "inspection";
    const [finding] = await db
      .select()
      .from(operationalFindings)
      .where(
        and(
          eq(operationalFindings.id, sourceId),
          eq(operationalFindings.companyId, companyId),
          eq(operationalFindings.sourceType, findingSourceType)
        )
      )
      .limit(1);
    if (!finding)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "El hallazgo de origen no existe en esta empresa.",
      });
    const classification = {
      major_nc: "No conformidad mayor",
      minor_nc: "No conformidad menor",
      observation: "Observación",
      improvement_opportunity: "Oportunidad de mejora",
    }[finding.classification];
    return {
      sourceType,
      sourceId: finding.id,
      sourceSubId: finding.id,
      kind: "action",
      title: finding.closureTask.slice(0, 500),
      description: `${classification} — ${finding.finding}`,
      dueDate: dateValue(finding.targetDate),
      referenceResponsible: finding.referenceResponsible,
    };
  }

  const [compliance] = await db
    .select()
    .from(companyCompliances)
    .where(
      and(
        eq(companyCompliances.id, sourceId),
        eq(companyCompliances.companyId, companyId)
      )
    )
    .limit(1);
  if (!compliance)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "El Cumplimiento de origen no existe en esta empresa.",
    });
  const isVigency = compliance.evaluationMode === "vigencia";
  return {
    sourceType: "company_compliance",
    sourceId: compliance.id,
    sourceSubId: compliance.id,
    kind: isVigency ? "vigency" : "action",
    title: compliance.requirement.slice(0, 500),
    description:
      compliance.description || `Cumplimiento ${compliance.obligationType}`,
    dueDate: isVigency ? dateValue(compliance.validUntil) : null,
    referenceResponsible: compliance.responsible,
  };
}

async function getSourceLinks(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  sourceType: ResolvedSource["sourceType"],
  sourceId: number,
  sourceSubId: number
) {
  return db
    .select()
    .from(linkedCommitments)
    .where(
      and(
        eq(linkedCommitments.companyId, companyId),
        eq(linkedCommitments.sourceType, sourceType),
        eq(linkedCommitments.sourceId, sourceId),
        eq(linkedCommitments.sourceSubId, sourceSubId)
      )
    );
}

function allLinksCompleted(links: Array<{ status: string }>) {
  return links.length > 0 && links.every(link => link.status === "completed");
}

async function synchronizeSource(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  sourceType: ResolvedSource["sourceType"],
  sourceId: number,
  sourceSubId: number
) {
  const links = await getSourceLinks(
    db,
    companyId,
    sourceType,
    sourceId,
    sourceSubId
  );
  const completed = allLinksCompleted(links);

  if (sourceType === "checklist_action") {
    await db
      .update(managementSystemChecklistActions)
      .set({
        completed,
        completedAt: completed ? new Date() : null,
      })
      .where(eq(managementSystemChecklistActions.id, sourceId));
    return {
      completed,
      total: links.length,
      fulfilled: links.filter(link => link.status === "completed").length,
    };
  }

  if (sourceType === "program_action") {
    const [action] = await db
      .select({ programId: programActions.programId })
      .from(programActions)
      .where(
        and(
          eq(programActions.id, sourceId),
          eq(programActions.companyId, companyId)
        )
      )
      .limit(1);
    if (!action)
      return {
        completed,
        total: links.length,
        fulfilled: links.filter(link => link.status === "completed").length,
      };
    await db
      .update(programActions)
      .set({
        completed,
        completedAt: completed ? new Date() : null,
      })
      .where(eq(programActions.id, sourceId));
    await refreshProgramMetrics(db, companyId, action.programId);
    return {
      completed,
      total: links.length,
      fulfilled: links.filter(link => link.status === "completed").length,
    };
  }

  if (sourceType === "audit_finding" || sourceType === "inspection_finding") {
    const findingSourceType = sourceType === "audit_finding" ? "audit" : "inspection";
    await db
      .update(operationalFindings)
      .set({ completed, completedAt: completed ? new Date() : null })
      .where(
        and(
          eq(operationalFindings.id, sourceId),
          eq(operationalFindings.companyId, companyId),
          eq(operationalFindings.sourceType, findingSourceType)
        )
      );
    const [finding] = await db
      .select({ sourceId: operationalFindings.sourceId })
      .from(operationalFindings)
      .where(eq(operationalFindings.id, sourceId))
      .limit(1);
    if (finding)
      await synchronizeOperationalFindingSummary(
        db,
        companyId,
        findingSourceType,
        finding.sourceId
      );
    return {
      completed,
      total: links.length,
      fulfilled: links.filter(link => link.status === "completed").length,
    };
  }

  if (
    sourceType === "checklist_vigency" ||
    sourceType === "company_compliance"
  ) {
    const renewed = links.map(link => ({
      validFrom: dateValue(link.renewedValidFrom),
      validUntil: dateValue(link.renewedValidUntil),
    }));
    const canRenew =
      completed &&
      renewed.every(value =>
        Boolean(
          value.validFrom &&
            value.validUntil &&
            value.validFrom <= value.validUntil
        )
      );
    if (!canRenew) {
      if (sourceType === "company_compliance") {
        await db
          .update(companyCompliances)
          .set({ completed: "NO", updatedAt: new Date() })
          .where(
            and(
              eq(companyCompliances.id, sourceId),
              eq(companyCompliances.companyId, companyId)
            )
          );
      }
      return {
        completed: false,
        total: links.length,
        fulfilled: links.filter(link => link.status === "completed").length,
      };
    }

    // Intersección conservadora de las renovaciones: inicia cuando todos están
    // vigentes y vence en la fecha más temprana informada por cualquier proceso.
    const validFrom = renewed
      .map(value => value.validFrom!)
      .sort()
      .at(-1)!;
    const validUntil = renewed.map(value => value.validUntil!).sort()[0]!;
    if (validFrom > validUntil) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Las vigencias renovadas no comparten un período válido.",
      });
    }
    if (sourceType === "checklist_vigency") {
      await db
        .update(managementSystemChecklistItems)
        .set({
          validFrom: inputDate(validFrom),
          validUntil: inputDate(validUntil),
        })
        .where(
          and(
            eq(managementSystemChecklistItems.id, sourceId),
            eq(managementSystemChecklistItems.companyId, companyId)
          )
        );
    } else {
      await db
        .update(companyCompliances)
        .set({
          validFrom: inputDate(validFrom),
          validUntil: inputDate(validUntil),
          completed: "SI",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(companyCompliances.id, sourceId),
            eq(companyCompliances.companyId, companyId)
          )
        );
    }
    return {
      completed: true,
      total: links.length,
      fulfilled: links.filter(link => link.status === "completed").length,
    };
  }

  return {
    completed: false,
    total: links.length,
    fulfilled: links.filter(link => link.status === "completed").length,
  };
}

async function decorateCommitments(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  commitments: Awaited<ReturnType<typeof getSourceLinks>>
) {
  const evidenceByCommitment = new Map<number, number>();
  if (commitments.length) {
    const evidences = await db
      .select({
        linkedCommitmentId: linkedCommitmentEvidence.linkedCommitmentId,
      })
      .from(linkedCommitmentEvidence)
      .where(eq(linkedCommitmentEvidence.companyId, commitments[0].companyId));
    for (const evidence of evidences) {
      evidenceByCommitment.set(
        evidence.linkedCommitmentId,
        (evidenceByCommitment.get(evidence.linkedCommitmentId) || 0) + 1
      );
    }
  }
  const sourceGroups = new Map<string, typeof commitments>();
  for (const commitment of commitments) {
    const key = `${commitment.sourceType}:${commitment.sourceId}:${commitment.sourceSubId}`;
    sourceGroups.set(key, [...(sourceGroups.get(key) || []), commitment]);
  }
  return commitments.map(commitment => {
    const key = `${commitment.sourceType}:${commitment.sourceId}:${commitment.sourceSubId}`;
    const grouped = sourceGroups.get(key) || [];
    return {
      ...commitment,
      evidenceCount: evidenceByCommitment.get(commitment.id) || 0,
      sourceProgress:
        commitment.sourceType === "own"
          ? null
          : {
              total: grouped.length,
              fulfilled: grouped.filter(item => item.status === "completed")
                .length,
            },
    };
  });
}

export const linkedCommitmentsRouter = router({
  listByProcess: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        processId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      assertCommitmentAccess(ctx, input.companyId, input.processId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible.",
        });
      await assertProcessBelongsToCompany(db, input.companyId, input.processId);
      const commitments = await db
        .select()
        .from(linkedCommitments)
        .where(
          and(
            eq(linkedCommitments.companyId, input.companyId),
            eq(linkedCommitments.processId, input.processId)
          )
        )
        .orderBy(
          asc(linkedCommitments.status),
          asc(linkedCommitments.dueDate),
          asc(linkedCommitments.createdAt)
        );
      return decorateCommitments(
        db,
        commitments as Awaited<ReturnType<typeof getSourceLinks>>
      );
    }),

  listSourceProgress: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        sourceType: z.enum([
          "checklist_action",
          "checklist_vigency",
          "program_action",
          "company_compliance",
          "audit_finding",
          "inspection_finding",
        ]),
        sourceId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      assertSourceManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible.",
        });
      const source = await resolveSource(
        db,
        input.companyId,
        input.sourceType,
        input.sourceId
      );
      const links = await getSourceLinks(
        db,
        input.companyId,
        source.sourceType,
        source.sourceId,
        source.sourceSubId
      );
      return {
        ...source,
        total: links.length,
        fulfilled: links.filter(link => link.status === "completed").length,
        processIds: links.map(link => link.processId),
      };
    }),

  /** Evidencias aportadas por todos los procesos para un elemento de origen. */
  listSourceEvidence: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        sourceType: z.enum([
          "checklist_action",
          "checklist_vigency",
          "program_action",
          "company_compliance",
          "audit_finding",
          "inspection_finding",
        ]),
        sourceId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      assertSourceManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible.",
        });
      const source = await resolveSource(
        db,
        input.companyId,
        input.sourceType,
        input.sourceId
      );
      const links = await getSourceLinks(
        db,
        input.companyId,
        source.sourceType,
        source.sourceId,
        source.sourceSubId
      );
      if (!links.length) return [];
      const processById = new Map(
        (
          await db
            .select({ id: processes.id, name: processes.name })
            .from(processes)
            .where(eq(processes.companyId, input.companyId))
        ).map(process => [process.id, process.name])
      );
      const byCommitmentId = new Map(links.map(link => [link.id, link]));
      const evidence = await db
        .select()
        .from(linkedCommitmentEvidence)
        .where(
          and(
            eq(linkedCommitmentEvidence.companyId, input.companyId),
            inArray(
              linkedCommitmentEvidence.linkedCommitmentId,
              links.map(link => link.id)
            )
          )
        )
        .orderBy(asc(linkedCommitmentEvidence.uploadedAt));
      return Promise.all(
        evidence.map(async item => {
          const linked = byCommitmentId.get(item.linkedCommitmentId);
          try {
            const { url } = await storageGet(item.fileKey);
            return {
              ...item,
              fileUrl: url,
              processId: linked?.processId ?? 0,
              processName: processById.get(linked?.processId ?? 0) || "Proceso",
            };
          } catch {
            return {
              ...item,
              processId: linked?.processId ?? 0,
              processName: processById.get(linked?.processId ?? 0) || "Proceso",
            };
          }
        })
      );
    }),

  createLinks: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        sourceType: z.enum([
          "checklist_action",
          "checklist_vigency",
          "program_action",
          "company_compliance",
          "audit_finding",
          "inspection_finding",
        ]),
        sourceId: z.number().int().positive(),
        processIds: z.array(z.number().int().positive()).min(1).max(100),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertSourceManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible.",
        });
      const source = await resolveSource(
        db,
        input.companyId,
        input.sourceType,
        input.sourceId
      );
      const processIds = Array.from(new Set(input.processIds));
      for (const processId of processIds)
        await assertProcessBelongsToCompany(db, input.companyId, processId);
      let created = 0;
      let alreadyLinked = 0;
      for (const processId of processIds) {
        const [existing] = await db
          .select({ id: linkedCommitments.id })
          .from(linkedCommitments)
          .where(
            and(
              eq(linkedCommitments.companyId, input.companyId),
              eq(linkedCommitments.processId, processId),
              eq(linkedCommitments.sourceType, source.sourceType),
              eq(linkedCommitments.sourceId, source.sourceId),
              eq(linkedCommitments.sourceSubId, source.sourceSubId)
            )
          )
          .limit(1);
        if (existing) {
          alreadyLinked += 1;
          continue;
        }
        await db.insert(linkedCommitments).values({
          companyId: input.companyId,
          processId,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          sourceSubId: source.sourceSubId,
          kind: source.kind,
          title: source.title,
          description: source.description,
          dueDate: inputDate(source.dueDate),
          referenceResponsible: source.referenceResponsible,
        });
        created += 1;
      }
      const progress = await synchronizeSource(
        db,
        input.companyId,
        source.sourceType,
        source.sourceId,
        source.sourceSubId
      );
      return { created, alreadyLinked, progress };
    }),

  createOwn: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        processId: z.number().int().positive(),
        title: z.string().trim().min(1).max(500),
        description: z.string().trim().max(500000).optional(),
        dueDate: isoDateSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertCommitmentAccess(ctx, input.companyId, input.processId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible.",
        });
      await assertProcessBelongsToCompany(db, input.companyId, input.processId);
      const result = await db.insert(linkedCommitments).values({
        companyId: input.companyId,
        processId: input.processId,
        sourceType: "own",
        kind: "own",
        title: input.title,
        description: input.description || null,
        dueDate: inputDate(input.dueDate),
      });
      return { id: Number(result[0].insertId) };
    }),

  updateProgress: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
        dueDate: isoDateSchema.optional(),
        notes: z.string().trim().max(500000).optional(),
        status: commitmentStatusSchema.optional(),
        renewedValidFrom: isoDateSchema.optional(),
        renewedValidUntil: isoDateSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible.",
        });
      const [commitment] = await db
        .select()
        .from(linkedCommitments)
        .where(
          and(
            eq(linkedCommitments.id, input.id),
            eq(linkedCommitments.companyId, input.companyId)
          )
        )
        .limit(1);
      if (!commitment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Compromiso no encontrado.",
        });
      assertCommitmentAccess(ctx, commitment.companyId, commitment.processId);

      const renewedValidFrom =
        input.renewedValidFrom !== undefined
          ? input.renewedValidFrom
          : dateValue(commitment.renewedValidFrom) || "";
      const renewedValidUntil =
        input.renewedValidUntil !== undefined
          ? input.renewedValidUntil
          : dateValue(commitment.renewedValidUntil) || "";
      const requestedStatus = input.status ?? commitment.status;
      if (commitment.kind === "vigency" && requestedStatus === "completed") {
        if (
          !renewedValidFrom ||
          !renewedValidUntil ||
          renewedValidFrom > renewedValidUntil
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Registre una vigencia renovada válida antes de cerrar este compromiso.",
          });
        }
      }
      await db
        .update(linkedCommitments)
        .set({
          ...(input.dueDate !== undefined && {
            dueDate: inputDate(input.dueDate),
          }),
          ...(input.notes !== undefined && { notes: input.notes || null }),
          ...(input.renewedValidFrom !== undefined && {
            renewedValidFrom: inputDate(input.renewedValidFrom),
          }),
          ...(input.renewedValidUntil !== undefined && {
            renewedValidUntil: inputDate(input.renewedValidUntil),
          }),
          ...(input.status !== undefined && {
            status: input.status,
            completedAt: input.status === "completed" ? new Date() : null,
          }),
        })
        .where(eq(linkedCommitments.id, commitment.id));
      if (
        commitment.sourceType !== "own" &&
        commitment.sourceId &&
        commitment.sourceSubId
      ) {
        await synchronizeSource(
          db,
          commitment.companyId,
          commitment.sourceType,
          commitment.sourceId,
          commitment.sourceSubId
        );
      }
      return { success: true };
    }),

  delete: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible.",
        });
      const [commitment] = await db
        .select()
        .from(linkedCommitments)
        .where(
          and(
            eq(linkedCommitments.id, input.id),
            eq(linkedCommitments.companyId, input.companyId)
          )
        )
        .limit(1);
      if (!commitment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Compromiso no encontrado.",
        });
      assertCommitmentAccess(ctx, commitment.companyId, commitment.processId);
      if (commitment.sourceType !== "own")
        assertSourceManagementAccess(ctx, commitment.companyId);

      const evidences = await db
        .select()
        .from(linkedCommitmentEvidence)
        .where(eq(linkedCommitmentEvidence.linkedCommitmentId, commitment.id));
      for (const evidence of evidences) {
        try {
          await storageDelete(evidence.fileKey);
        } catch {
          /* El registro de evidencia se elimina aunque el objeto ya no exista. */
        }
      }
      await db
        .delete(linkedCommitmentEvidence)
        .where(eq(linkedCommitmentEvidence.linkedCommitmentId, commitment.id));
      await db
        .delete(linkedCommitments)
        .where(eq(linkedCommitments.id, commitment.id));
      if (
        commitment.sourceType !== "own" &&
        commitment.sourceId &&
        commitment.sourceSubId
      ) {
        await synchronizeSource(
          db,
          commitment.companyId,
          commitment.sourceType,
          commitment.sourceId,
          commitment.sourceSubId
        );
      }
      return { success: true };
    }),

  listEvidence: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible.",
        });
      const [commitment] = await db
        .select({ processId: linkedCommitments.processId })
        .from(linkedCommitments)
        .where(
          and(
            eq(linkedCommitments.id, input.id),
            eq(linkedCommitments.companyId, input.companyId)
          )
        )
        .limit(1);
      if (!commitment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Compromiso no encontrado.",
        });
      assertCommitmentAccess(ctx, input.companyId, commitment.processId);
      const evidence = await db
        .select()
        .from(linkedCommitmentEvidence)
        .where(
          and(
            eq(linkedCommitmentEvidence.linkedCommitmentId, input.id),
            eq(linkedCommitmentEvidence.companyId, input.companyId)
          )
        )
        .orderBy(asc(linkedCommitmentEvidence.uploadedAt));
      return Promise.all(
        evidence.map(async item => {
          try {
            const { url } = await storageGet(item.fileKey);
            return { ...item, fileUrl: url };
          } catch {
            return item;
          }
        })
      );
    }),

  deleteEvidence: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible.",
        });
      const [evidence] = await db
        .select()
        .from(linkedCommitmentEvidence)
        .where(
          and(
            eq(linkedCommitmentEvidence.id, input.id),
            eq(linkedCommitmentEvidence.companyId, input.companyId)
          )
        )
        .limit(1);
      if (!evidence)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Evidencia no encontrada.",
        });
      const [commitment] = await db
        .select({ processId: linkedCommitments.processId })
        .from(linkedCommitments)
        .where(eq(linkedCommitments.id, evidence.linkedCommitmentId))
        .limit(1);
      if (!commitment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "El compromiso de la evidencia no existe.",
        });
      assertCommitmentAccess(ctx, input.companyId, commitment.processId);
      try {
        await storageDelete(evidence.fileKey);
      } catch {
        /* Se elimina la referencia aun si el objeto ya fue retirado. */
      }
      await db
        .delete(linkedCommitmentEvidence)
        .where(eq(linkedCommitmentEvidence.id, evidence.id));
      return { success: true };
    }),
});
