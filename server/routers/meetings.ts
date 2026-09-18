import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  companies,
  linkedCommitmentEvidence,
  linkedCommitments,
  meetingAgreementEvidence,
  meetingAgreements,
  meetingFiles,
  meetingTypes,
  processMeetings,
  processes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { sendEmailStrict } from "../_core/emailService";
import type { TrpcContext } from "../_core/context";
import { companyProcedure, router } from "../_core/trpc";
import { storageDelete, storageGet } from "../storage";

const MAX_TEXT_LENGTH = 500_000;
const isoDateSchema = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.literal(""),
]);
const responsibleTypeSchema = z.enum([
  "same_process_employee",
  "same_process_owner",
  "other_process",
]);
const localAgreementStatusSchema = z.enum(["pending", "completed"]);

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type AgreementResponsibleType = z.infer<typeof responsibleTypeSchema>;

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

function unavailable(): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Base de datos no disponible.",
  });
}

function dateValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function inputDate(value?: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function assertCompanyAccess(ctx: TrpcContext, companyId: number) {
  if (ctx.user?.role === "admin") return;
  if (ctx.manager?.companyId === companyId) return;
  if (ctx.processLeader?.companyId === companyId) return;
  forbidden("No tiene acceso a la empresa solicitada.");
}

function assertProcessAccess(
  ctx: TrpcContext,
  companyId: number,
  processId: number
) {
  assertCompanyAccess(ctx, companyId);
  if (ctx.processLeader && ctx.processLeader.processId !== processId) {
    forbidden("El Jefe de Proceso solo puede gestionar las reuniones de su proceso.");
  }
}

function assertCrossProcessLinkAuthority(
  ctx: TrpcContext,
  companyId: number,
  sourceProcessId: number,
  targetProcessId: number
) {
  assertProcessAccess(ctx, companyId, sourceProcessId);
  if (targetProcessId === sourceProcessId) return;
  if (ctx.user?.role === "admin" || ctx.manager?.companyId === companyId) return;
  forbidden(
    "El Jefe de Proceso puede autovincular acuerdos de su proceso, pero no asignar responsabilidades a otro proceso."
  );
}

async function assertProcessBelongsToCompany(
  db: Db,
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

async function getMeetingOrThrow(db: Db, companyId: number, meetingId: number) {
  const [meeting] = await db
    .select()
    .from(processMeetings)
    .where(
      and(
        eq(processMeetings.id, meetingId),
        eq(processMeetings.companyId, companyId)
      )
    )
    .limit(1);
  if (!meeting) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Reunión no encontrada." });
  }
  return meeting;
}

async function getAgreementOrThrow(
  db: Db,
  companyId: number,
  agreementId: number
) {
  const [agreement] = await db
    .select()
    .from(meetingAgreements)
    .where(
      and(
        eq(meetingAgreements.id, agreementId),
        eq(meetingAgreements.companyId, companyId)
      )
    )
    .limit(1);
  if (!agreement) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Acuerdo no encontrado." });
  }
  return agreement;
}

async function getTypeOrThrow(db: Db, companyId: number, typeId: number) {
  const [meetingType] = await db
    .select()
    .from(meetingTypes)
    .where(
      and(eq(meetingTypes.id, typeId), eq(meetingTypes.companyId, companyId))
    )
    .limit(1);
  if (!meetingType) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Tipo de reunión no encontrado.",
    });
  }
  return meetingType;
}

function targetProcessForAssignment(
  sourceProcessId: number,
  responsibleType: AgreementResponsibleType,
  requestedTargetProcessId?: number | null
): number | null {
  if (responsibleType === "same_process_employee") return null;
  if (responsibleType === "same_process_owner") return sourceProcessId;
  return requestedTargetProcessId || null;
}

async function validateAssignment(
  db: Db,
  ctx: TrpcContext,
  params: {
    companyId: number;
    sourceProcessId: number;
    responsibleType: AgreementResponsibleType;
    targetProcessId?: number | null;
  }
) {
  const targetProcessId = targetProcessForAssignment(
    params.sourceProcessId,
    params.responsibleType,
    params.targetProcessId
  );
  if (params.responsibleType === "other_process" && !targetProcessId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Seleccione el proceso responsable del acuerdo.",
    });
  }
  if (targetProcessId) {
    await assertProcessBelongsToCompany(db, params.companyId, targetProcessId);
    assertCrossProcessLinkAuthority(
      ctx,
      params.companyId,
      params.sourceProcessId,
      targetProcessId
    );
  }
  return targetProcessId;
}

async function getAgreementLinks(db: Db, companyId: number, agreementId: number, meetingId: number) {
  return db
    .select()
    .from(linkedCommitments)
    .where(
      and(
        eq(linkedCommitments.companyId, companyId),
        eq(linkedCommitments.sourceType, "meeting_agreement"),
        eq(linkedCommitments.sourceId, agreementId),
        eq(linkedCommitments.sourceSubId, meetingId)
      )
    );
}

async function getLinkEvidenceCount(db: Db, companyId: number, linkId: number) {
  const evidence = await db
    .select({ id: linkedCommitmentEvidence.id })
    .from(linkedCommitmentEvidence)
    .where(
      and(
        eq(linkedCommitmentEvidence.companyId, companyId),
        eq(linkedCommitmentEvidence.linkedCommitmentId, linkId)
      )
    );
  return evidence.length;
}

async function synchronizeLinkedPresentation(
  db: Db,
  agreement: typeof meetingAgreements.$inferSelect
) {
  const links = await getAgreementLinks(
    db,
    agreement.companyId,
    agreement.id,
    agreement.meetingId
  );
  for (const link of links) {
    await db
      .update(linkedCommitments)
      .set({
        title: agreement.description.slice(0, 500),
        description: `Acuerdo de reunión #${agreement.meetingId}`,
        dueDate: agreement.dueDate,
        referenceResponsible: agreement.responsibleName || null,
        updatedAt: new Date(),
      })
      .where(eq(linkedCommitments.id, link.id));
  }
}

async function ensureAgreementLink(
  db: Db,
  agreement: typeof meetingAgreements.$inferSelect
) {
  if (!agreement.targetProcessId) return null;
  const links = await getAgreementLinks(
    db,
    agreement.companyId,
    agreement.id,
    agreement.meetingId
  );
  const existing = links.find(link => link.processId === agreement.targetProcessId);
  if (existing) {
    await synchronizeLinkedPresentation(db, agreement);
    return existing;
  }
  const result = await db.insert(linkedCommitments).values({
    companyId: agreement.companyId,
    processId: agreement.targetProcessId,
    sourceType: "meeting_agreement",
    sourceId: agreement.id,
    sourceSubId: agreement.meetingId,
    kind: "action",
    title: agreement.description.slice(0, 500),
    description: `Acuerdo de reunión #${agreement.meetingId}`,
    dueDate: agreement.dueDate,
    referenceResponsible: agreement.responsibleName || null,
    status: agreement.status === "completed" ? "completed" : "pending",
    completedAt: agreement.status === "completed" ? new Date() : null,
  });
  return { id: Number(result[0].insertId) };
}

function agreementStatusLabel(status: string) {
  if (status === "completed") return "Cumplido";
  if (status === "cancelled") return "Cancelado";
  return "Pendiente";
}

function responsibleLabel(
  agreement: typeof meetingAgreements.$inferSelect,
  processNames: Map<number, string>
) {
  if (agreement.responsibleName?.trim()) return agreement.responsibleName.trim();
  if (agreement.responsibleType === "same_process_owner")
    return "Dueño del proceso";
  if (agreement.responsibleType === "same_process_employee")
    return "Empleado del proceso";
  return (
    processNames.get(agreement.targetProcessId || 0) ||
    "Proceso responsable"
  );
}

async function buildMinutes(
  db: Db,
  companyId: number,
  meetingId: number
): Promise<string> {
  const meeting = await getMeetingOrThrow(db, companyId, meetingId);
  const [meetingType] = await db
    .select({ name: meetingTypes.name })
    .from(meetingTypes)
    .where(eq(meetingTypes.id, meeting.meetingTypeId))
    .limit(1);
  const agreements = await db
    .select()
    .from(meetingAgreements)
    .where(
      and(
        eq(meetingAgreements.companyId, companyId),
        eq(meetingAgreements.meetingId, meetingId)
      )
    )
    .orderBy(asc(meetingAgreements.createdAt));
  const processRows = await db
    .select({ id: processes.id, name: processes.name })
    .from(processes)
    .where(eq(processes.companyId, companyId));
  const processNames = new Map(processRows.map(process => [process.id, process.name]));
  const groups = new Map<string, typeof agreements>();
  for (const agreement of agreements) {
    const label = responsibleLabel(agreement, processNames);
    groups.set(label, [...(groups.get(label) || []), agreement]);
  }

  const lines = [
    "ACTA DE REUNIÓN",
    "",
    `Tipo de reunión: ${meetingType?.name || "Sin tipo"}`,
    `Fecha: ${dateValue(meeting.meetingDate) || "No registrada"}`,
    `Objetivo: ${meeting.objective}`,
  ];
  if (meeting.participants?.trim()) lines.push(`Participantes: ${meeting.participants.trim()}`);
  if (meeting.locationOrMedium?.trim()) lines.push(`Lugar o medio: ${meeting.locationOrMedium.trim()}`);
  if (meeting.notes?.trim()) lines.push(`Notas: ${meeting.notes.trim()}`);
  lines.push("", "ACUERDOS Y PENDIENTES");
  if (!groups.size) {
    lines.push("Sin acuerdos registrados.");
  } else {
    for (const [responsible, grouped] of Array.from(groups.entries())) {
      lines.push("", `Responsable: ${responsible}`);
      for (const agreement of grouped) {
        lines.push(`- ${agreement.description}`);
        lines.push(
          `  Fecha tope: ${dateValue(agreement.dueDate) || "Sin fecha"} · Estado: ${agreementStatusLabel(agreement.status)}`
        );
      }
    }
  }
  if (meeting.status === "annulled") {
    lines.push("", `REUNIÓN ANULADA: ${meeting.annulmentReason || "Sin motivo registrado"}`);
  }
  return lines.join("\n");
}

async function decorateFile<T extends { fileKey: string }>(item: T) {
  try {
    const { url } = await storageGet(item.fileKey);
    return { ...item, fileUrl: url };
  } catch {
    return item;
  }
}

export const meetingsRouter = router({
  list: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        processId: z.number().int().positive(),
        includeArchived: z.boolean().optional(),
        includeAnnulled: z.boolean().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      assertProcessAccess(ctx, input.companyId, input.processId);
      const db = await getDb();
      if (!db) unavailable();
      await assertProcessBelongsToCompany(db, input.companyId, input.processId);

      const types = await db
        .select()
        .from(meetingTypes)
        .where(
          and(
            eq(meetingTypes.companyId, input.companyId),
            eq(meetingTypes.processId, input.processId)
          )
        )
        .orderBy(asc(meetingTypes.isArchived), asc(meetingTypes.name));
      // Los tipos archivados se mantienen visibles para que sus reuniones y su
      // historial no desaparezcan de la vista. Solo dejan de estar disponibles
      // para crear reuniones nuevas.
      const visibleTypes = types;
      const typeIds = visibleTypes.map(type => type.id);
      if (!typeIds.length) return [];

      const meetingRows = await db
        .select()
        .from(processMeetings)
        .where(
          and(
            eq(processMeetings.companyId, input.companyId),
            eq(processMeetings.processId, input.processId),
            inArray(processMeetings.meetingTypeId, typeIds)
          )
        )
        .orderBy(asc(processMeetings.meetingDate), asc(processMeetings.createdAt));
      const visibleMeetings = input.includeAnnulled
        ? meetingRows
        : meetingRows.filter(meeting => meeting.status === "active");
      const meetingIds = visibleMeetings.map(meeting => meeting.id);
      const agreements = meetingIds.length
        ? await db
            .select()
            .from(meetingAgreements)
            .where(
              and(
                eq(meetingAgreements.companyId, input.companyId),
                inArray(meetingAgreements.meetingId, meetingIds)
              )
            )
            .orderBy(asc(meetingAgreements.createdAt))
        : [];
      const agreementIds = agreements.map(agreement => agreement.id);
      const links = agreementIds.length
        ? await db
            .select()
            .from(linkedCommitments)
            .where(
              and(
                eq(linkedCommitments.companyId, input.companyId),
                eq(linkedCommitments.sourceType, "meeting_agreement"),
                inArray(linkedCommitments.sourceId, agreementIds)
              )
            )
        : [];
      const localEvidence = agreementIds.length
        ? await db
            .select({ agreementId: meetingAgreementEvidence.meetingAgreementId })
            .from(meetingAgreementEvidence)
            .where(
              and(
                eq(meetingAgreementEvidence.companyId, input.companyId),
                inArray(meetingAgreementEvidence.meetingAgreementId, agreementIds)
              )
            )
        : [];
      const linkedEvidence = links.length
        ? await db
            .select({ linkedCommitmentId: linkedCommitmentEvidence.linkedCommitmentId })
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
        : [];
      const files = meetingIds.length
        ? await db
            .select({ meetingId: meetingFiles.meetingId })
            .from(meetingFiles)
            .where(
              and(
                eq(meetingFiles.companyId, input.companyId),
                inArray(meetingFiles.meetingId, meetingIds)
              )
            )
        : [];
      const processRows = await db
        .select({ id: processes.id, name: processes.name })
        .from(processes)
        .where(eq(processes.companyId, input.companyId));
      const processNames = new Map(processRows.map(process => [process.id, process.name]));
      const linksByAgreement = new Map<number, typeof links>();
      for (const link of links) {
        linksByAgreement.set(link.sourceId || 0, [
          ...(linksByAgreement.get(link.sourceId || 0) || []),
          link,
        ]);
      }
      const localEvidenceCounts = new Map<number, number>();
      for (const evidence of localEvidence) {
        localEvidenceCounts.set(
          evidence.agreementId,
          (localEvidenceCounts.get(evidence.agreementId) || 0) + 1
        );
      }
      const linkedEvidenceCounts = new Map<number, number>();
      for (const evidence of linkedEvidence) {
        linkedEvidenceCounts.set(
          evidence.linkedCommitmentId,
          (linkedEvidenceCounts.get(evidence.linkedCommitmentId) || 0) + 1
        );
      }
      const fileCounts = new Map<number, number>();
      for (const file of files) {
        fileCounts.set(file.meetingId, (fileCounts.get(file.meetingId) || 0) + 1);
      }
      const agreementsByMeeting = new Map<number, typeof agreements>();
      for (const agreement of agreements) {
        agreementsByMeeting.set(agreement.meetingId, [
          ...(agreementsByMeeting.get(agreement.meetingId) || []),
          agreement,
        ]);
      }

      return visibleTypes.map(type => ({
        ...type,
        meetings: visibleMeetings
          .filter(meeting => meeting.meetingTypeId === type.id)
          .map(meeting => {
            const meetingAgreements = agreementsByMeeting.get(meeting.id) || [];
            const activeAgreements = meetingAgreements.filter(
              agreement => agreement.status !== "cancelled"
            );
            const completedAgreements = activeAgreements.filter(
              agreement => agreement.status === "completed"
            );
            return {
              ...meeting,
              agreementCount: activeAgreements.length,
              completedAgreementCount: completedAgreements.length,
              completionPercentage: activeAgreements.length
                ? Math.round((completedAgreements.length / activeAgreements.length) * 100)
                : null,
              fileCount: fileCounts.get(meeting.id) || 0,
              agreements: meetingAgreements.map(agreement => {
                const agreementLinks = linksByAgreement.get(agreement.id) || [];
                const link = agreementLinks[0] || null;
                return {
                  ...agreement,
                  targetProcessName:
                    processNames.get(agreement.targetProcessId || 0) || null,
                  localEvidenceCount: localEvidenceCounts.get(agreement.id) || 0,
                  linkedCommitment: link
                    ? {
                        id: link.id,
                        processId: link.processId,
                        processName: processNames.get(link.processId) || "Proceso",
                        status: link.status,
                        evidenceCount: linkedEvidenceCounts.get(link.id) || 0,
                      }
                    : null,
                };
              }),
            };
          }),
      }));
    }),

  listAvailableProcesses: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        processId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      assertProcessAccess(ctx, input.companyId, input.processId);
      const db = await getDb();
      if (!db) unavailable();
      return db
        .select({ id: processes.id, name: processes.name, processType: processes.processType })
        .from(processes)
        .where(eq(processes.companyId, input.companyId))
        .orderBy(asc(processes.name));
    }),

  createType: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        processId: z.number().int().positive(),
        name: z.string().trim().min(1).max(255),
        description: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertProcessAccess(ctx, input.companyId, input.processId);
      const db = await getDb();
      if (!db) unavailable();
      await assertProcessBelongsToCompany(db, input.companyId, input.processId);
      const result = await db.insert(meetingTypes).values({
        companyId: input.companyId,
        processId: input.processId,
        name: input.name,
        description: input.description || null,
      });
      return { id: Number(result[0].insertId) };
    }),

  updateType: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
        name: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
        isArchived: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const meetingType = await getTypeOrThrow(db, input.companyId, input.id);
      assertProcessAccess(ctx, input.companyId, meetingType.processId);
      await db
        .update(meetingTypes)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description || null,
          }),
          ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
          updatedAt: new Date(),
        })
        .where(eq(meetingTypes.id, input.id));
      return { success: true };
    }),

  deleteEmptyType: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const meetingType = await getTypeOrThrow(db, input.companyId, input.id);
      assertProcessAccess(ctx, input.companyId, meetingType.processId);
      const meetings = await db
        .select({ id: processMeetings.id })
        .from(processMeetings)
        .where(eq(processMeetings.meetingTypeId, meetingType.id))
        .limit(1);
      if (meetings.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No puede eliminar un tipo que ya contiene reuniones; archívelo en su lugar.",
        });
      }
      await db.delete(meetingTypes).where(eq(meetingTypes.id, meetingType.id));
      return { success: true };
    }),

  createMeeting: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        processId: z.number().int().positive(),
        meetingTypeId: z.number().int().positive(),
        meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        objective: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
        participants: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
        locationOrMedium: z.string().trim().max(255).optional(),
        notes: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      assertProcessAccess(ctx, input.companyId, input.processId);
      const db = await getDb();
      if (!db) unavailable();
      const meetingType = await getTypeOrThrow(db, input.companyId, input.meetingTypeId);
      if (meetingType.processId !== input.processId || meetingType.isArchived) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El tipo de reunión no está disponible para este proceso.",
        });
      }
      const result = await db.insert(processMeetings).values({
        companyId: input.companyId,
        processId: input.processId,
        meetingTypeId: input.meetingTypeId,
        meetingDate: inputDate(input.meetingDate)!,
        objective: input.objective,
        participants: input.participants || null,
        locationOrMedium: input.locationOrMedium || null,
        notes: input.notes || null,
      });
      return { id: Number(result[0].insertId) };
    }),

  updateMeeting: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
        meetingDate: isoDateSchema.optional(),
        objective: z.string().trim().min(1).max(MAX_TEXT_LENGTH).optional(),
        participants: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
        locationOrMedium: z.string().trim().max(255).optional(),
        notes: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
        minutesText: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const meeting = await getMeetingOrThrow(db, input.companyId, input.id);
      assertProcessAccess(ctx, input.companyId, meeting.processId);
      if (meeting.status === "annulled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Una reunión anulada no puede editarse.",
        });
      }
      await db
        .update(processMeetings)
        .set({
          ...(input.meetingDate !== undefined && {
            meetingDate: inputDate(input.meetingDate)!,
          }),
          ...(input.objective !== undefined && { objective: input.objective }),
          ...(input.participants !== undefined && {
            participants: input.participants || null,
          }),
          ...(input.locationOrMedium !== undefined && {
            locationOrMedium: input.locationOrMedium || null,
          }),
          ...(input.notes !== undefined && { notes: input.notes || null }),
          ...(input.minutesText !== undefined && {
            minutesText: input.minutesText || null,
          }),
          updatedAt: new Date(),
        })
        .where(eq(processMeetings.id, meeting.id));
      return { success: true };
    }),

  annulMeeting: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
        reason: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const meeting = await getMeetingOrThrow(db, input.companyId, input.id);
      assertProcessAccess(ctx, input.companyId, meeting.processId);
      if (meeting.status === "annulled") return { success: true };
      await db
        .update(processMeetings)
        .set({
          status: "annulled",
          annulledAt: new Date(),
          annulmentReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(processMeetings.id, meeting.id));
      return { success: true };
    }),

  deleteEmptyMeeting: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const meeting = await getMeetingOrThrow(db, input.companyId, input.id);
      assertProcessAccess(ctx, input.companyId, meeting.processId);
      if (meeting.status === "annulled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Una reunión anulada conserva su historial y no puede eliminarse.",
        });
      }
      const [agreement] = await db
        .select({ id: meetingAgreements.id })
        .from(meetingAgreements)
        .where(eq(meetingAgreements.meetingId, meeting.id))
        .limit(1);
      const [file] = await db
        .select({ id: meetingFiles.id })
        .from(meetingFiles)
        .where(eq(meetingFiles.meetingId, meeting.id))
        .limit(1);
      if (agreement || file || meeting.minutesText?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Solo puede eliminar una reunión vacía. Si ya tiene información, anúlela para conservar el historial.",
        });
      }
      await db.delete(processMeetings).where(eq(processMeetings.id, meeting.id));
      return { success: true };
    }),

  createAgreement: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        meetingId: z.number().int().positive(),
        description: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
        responsibleType: responsibleTypeSchema,
        responsibleName: z.string().trim().max(255).optional(),
        responsibleEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
        targetProcessId: z.number().int().positive().optional().nullable(),
        dueDate: isoDateSchema.optional(),
        notes: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const meeting = await getMeetingOrThrow(db, input.companyId, input.meetingId);
      assertProcessAccess(ctx, input.companyId, meeting.processId);
      if (meeting.status === "annulled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No puede agregar acuerdos a una reunión anulada." });
      }
      const targetProcessId = await validateAssignment(db, ctx, {
        companyId: input.companyId,
        sourceProcessId: meeting.processId,
        responsibleType: input.responsibleType,
        targetProcessId: input.targetProcessId,
      });
      const result = await db.insert(meetingAgreements).values({
        companyId: input.companyId,
        processId: meeting.processId,
        meetingId: meeting.id,
        description: input.description,
        responsibleType: input.responsibleType,
        responsibleName: input.responsibleName || null,
        responsibleEmail: input.responsibleEmail || null,
        targetProcessId,
        dueDate: inputDate(input.dueDate),
        notes: input.notes || null,
      });
      const agreementId = Number(result[0].insertId);
      const agreement = await getAgreementOrThrow(db, input.companyId, agreementId);
      const link = await ensureAgreementLink(db, agreement);
      return { id: agreementId, linkedCommitmentId: link?.id || null };
    }),

  updateAgreement: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
        description: z.string().trim().min(1).max(MAX_TEXT_LENGTH).optional(),
        responsibleName: z.string().trim().max(255).optional(),
        responsibleEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
        dueDate: isoDateSchema.optional(),
        notes: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const agreement = await getAgreementOrThrow(db, input.companyId, input.id);
      assertProcessAccess(ctx, input.companyId, agreement.processId);
      const meeting = await getMeetingOrThrow(db, input.companyId, agreement.meetingId);
      if (meeting.status === "annulled" || agreement.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El acuerdo ya no puede editarse." });
      }
      await db
        .update(meetingAgreements)
        .set({
          ...(input.description !== undefined && { description: input.description }),
          ...(input.responsibleName !== undefined && {
            responsibleName: input.responsibleName || null,
          }),
          ...(input.responsibleEmail !== undefined && {
            responsibleEmail: input.responsibleEmail || null,
          }),
          ...(input.dueDate !== undefined && { dueDate: inputDate(input.dueDate) }),
          ...(input.notes !== undefined && { notes: input.notes || null }),
          updatedAt: new Date(),
        })
        .where(eq(meetingAgreements.id, agreement.id));
      const updated = await getAgreementOrThrow(db, input.companyId, agreement.id);
      await synchronizeLinkedPresentation(db, updated);
      return { success: true };
    }),

  changeAgreementAssignment: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
        responsibleType: responsibleTypeSchema,
        responsibleName: z.string().trim().max(255).optional(),
        responsibleEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
        targetProcessId: z.number().int().positive().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const agreement = await getAgreementOrThrow(db, input.companyId, input.id);
      assertProcessAccess(ctx, input.companyId, agreement.processId);
      const meeting = await getMeetingOrThrow(db, input.companyId, agreement.meetingId);
      if (meeting.status === "annulled" || agreement.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El acuerdo ya no puede reasignarse." });
      }
      if (
        agreement.targetProcessId &&
        agreement.targetProcessId !== agreement.processId
      ) {
        assertCrossProcessLinkAuthority(
          ctx,
          input.companyId,
          agreement.processId,
          agreement.targetProcessId
        );
      }
      const targetProcessId = await validateAssignment(db, ctx, {
        companyId: input.companyId,
        sourceProcessId: agreement.processId,
        responsibleType: input.responsibleType,
        targetProcessId: input.targetProcessId,
      });
      const existingLinks = await getAgreementLinks(
        db,
        agreement.companyId,
        agreement.id,
        agreement.meetingId
      );
      const needsDestinationChange =
        existingLinks.some(link => link.processId !== targetProcessId) ||
        (Boolean(targetProcessId) && !existingLinks.length);
      if (needsDestinationChange && existingLinks.length) {
        for (const link of existingLinks) {
          const evidenceCount = await getLinkEvidenceCount(db, input.companyId, link.id);
          if (link.status === "completed" || evidenceCount > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "No puede cambiar un responsable cuando el compromiso vinculado ya tiene avance o evidencias. Conserve el histórico y cree un nuevo acuerdo si corresponde.",
            });
          }
        }
        await db
          .delete(linkedCommitments)
          .where(
            and(
              eq(linkedCommitments.companyId, input.companyId),
              eq(linkedCommitments.sourceType, "meeting_agreement"),
              eq(linkedCommitments.sourceId, agreement.id),
              eq(linkedCommitments.sourceSubId, agreement.meetingId)
            )
          );
      }
      await db
        .update(meetingAgreements)
        .set({
          responsibleType: input.responsibleType,
          responsibleName: input.responsibleName || null,
          responsibleEmail: input.responsibleEmail || null,
          targetProcessId,
          updatedAt: new Date(),
        })
        .where(eq(meetingAgreements.id, agreement.id));
      const updated = await getAgreementOrThrow(db, input.companyId, agreement.id);
      const link = await ensureAgreementLink(db, updated);
      return { success: true, linkedCommitmentId: link?.id || null };
    }),

  updateLocalAgreementStatus: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
        status: localAgreementStatusSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const agreement = await getAgreementOrThrow(db, input.companyId, input.id);
      assertProcessAccess(ctx, input.companyId, agreement.processId);
      const meeting = await getMeetingOrThrow(db, input.companyId, agreement.meetingId);
      if (meeting.status === "annulled" || agreement.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El acuerdo ya no puede actualizar su cumplimiento.",
        });
      }
      const links = await getAgreementLinks(
        db,
        input.companyId,
        agreement.id,
        agreement.meetingId
      );
      if (links.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El cumplimiento de este acuerdo se actualiza desde Compromisos vinculados del proceso responsable.",
        });
      }
      await db
        .update(meetingAgreements)
        .set({
          status: input.status,
          completedAt: input.status === "completed" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(meetingAgreements.id, agreement.id));
      return { success: true };
    }),

  cancelAgreement: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const agreement = await getAgreementOrThrow(db, input.companyId, input.id);
      assertProcessAccess(ctx, input.companyId, agreement.processId);
      const meeting = await getMeetingOrThrow(db, input.companyId, agreement.meetingId);
      if (meeting.status === "annulled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Los acuerdos de una reunión anulada se conservan como historial.",
        });
      }
      const links = await getAgreementLinks(
        db,
        input.companyId,
        agreement.id,
        agreement.meetingId
      );
      if (links.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No puede cancelar un acuerdo que sigue vinculado. Mantenga el compromiso histórico o reasigne el acuerdo antes de cancelarlo.",
        });
      }
      await db
        .update(meetingAgreements)
        .set({ status: "cancelled", completedAt: null, updatedAt: new Date() })
        .where(eq(meetingAgreements.id, agreement.id));
      return { success: true };
    }),

  deleteEmptyAgreement: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const agreement = await getAgreementOrThrow(db, input.companyId, input.id);
      assertProcessAccess(ctx, input.companyId, agreement.processId);
      const meeting = await getMeetingOrThrow(db, input.companyId, agreement.meetingId);
      if (meeting.status === "annulled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Los acuerdos de una reunión anulada se conservan como historial.",
        });
      }
      const links = await getAgreementLinks(
        db,
        input.companyId,
        agreement.id,
        agreement.meetingId
      );
      const evidence = await db
        .select({ id: meetingAgreementEvidence.id })
        .from(meetingAgreementEvidence)
        .where(eq(meetingAgreementEvidence.meetingAgreementId, agreement.id))
        .limit(1);
      if (links.length || evidence.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No puede eliminar un acuerdo con vínculos o evidencias; use el historial o anule la reunión.",
        });
      }
      await db.delete(meetingAgreements).where(eq(meetingAgreements.id, agreement.id));
      return { success: true };
    }),

  generateMinutes: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        meetingId: z.number().int().positive(),
        save: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const meeting = await getMeetingOrThrow(db, input.companyId, input.meetingId);
      assertProcessAccess(ctx, input.companyId, meeting.processId);
      if (meeting.status === "annulled" && input.save !== false) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Una reunión anulada conserva el acta existente y no puede regenerarla.",
        });
      }
      const minutesText = await buildMinutes(db, input.companyId, input.meetingId);
      if (input.save !== false) {
        await db
          .update(processMeetings)
          .set({ minutesText, updatedAt: new Date() })
          .where(eq(processMeetings.id, meeting.id));
      }
      return { minutesText };
    }),

  sendAgreementEmail: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        agreementId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const agreement = await getAgreementOrThrow(db, input.companyId, input.agreementId);
      assertProcessAccess(ctx, input.companyId, agreement.processId);
      const meeting = await getMeetingOrThrow(db, input.companyId, agreement.meetingId);
      if (meeting.status === "annulled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No puede enviar comunicaciones nuevas desde una reunión anulada.",
        });
      }
      if (!agreement.responsibleEmail?.trim()) {
        await db
          .update(meetingAgreements)
          .set({
            communicationStatus: "failed",
            communicationLastAttemptAt: new Date(),
            communicationError: "No se registró un correo para la persona responsable.",
            updatedAt: new Date(),
          })
          .where(eq(meetingAgreements.id, agreement.id));
        return {
          success: false,
          status: "failed" as const,
          message: "No se envió el correo porque falta una dirección del responsable.",
        };
      }
      await db
        .update(meetingAgreements)
        .set({
          communicationStatus: "pending",
          communicationLastAttemptAt: new Date(),
          communicationError: null,
          updatedAt: new Date(),
        })
        .where(eq(meetingAgreements.id, agreement.id));
      const minutesText = await buildMinutes(db, input.companyId, meeting.id);
      const [company] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);
      const wasAccepted = await sendEmailStrict({
        to: agreement.responsibleEmail,
        subject: `Acta y compromiso de reunión · ${company?.name || "ISGE 360"}`,
        textContent: minutesText,
        htmlContent: `<main style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937"><h1>Acta de reunión</h1><p>Se comparte el acta y los acuerdos registrados en ISGE 360.</p><pre style="white-space:pre-wrap;font-family:Arial,sans-serif;background:#f8fafc;padding:16px;border-radius:8px">${escapeHtml(minutesText)}</pre></main>`,
      });
      await db
        .update(meetingAgreements)
        .set({
          communicationStatus: wasAccepted ? "sent" : "failed",
          communicationLastAttemptAt: new Date(),
          communicationError: wasAccepted
            ? null
            : "Amazon SES no confirmó el envío. Copie el acta para enviarla manualmente.",
          updatedAt: new Date(),
        })
        .where(eq(meetingAgreements.id, agreement.id));
      return {
        success: wasAccepted,
        status: wasAccepted ? ("sent" as const) : ("failed" as const),
        message: wasAccepted
          ? "Amazon SES confirmó la aceptación del correo."
          : "El correo no fue confirmado por Amazon SES. Puede copiar el acta para enviarla manualmente.",
      };
    }),

  listMeetingFiles: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        meetingId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const meeting = await getMeetingOrThrow(db, input.companyId, input.meetingId);
      assertProcessAccess(ctx, input.companyId, meeting.processId);
      const files = await db
        .select()
        .from(meetingFiles)
        .where(
          and(
            eq(meetingFiles.companyId, input.companyId),
            eq(meetingFiles.meetingId, input.meetingId)
          )
        )
        .orderBy(asc(meetingFiles.uploadedAt));
      return Promise.all(files.map(decorateFile));
    }),

  listAgreementEvidence: companyProcedure
    .input(
      z.object({
        companyId: z.number().int().positive(),
        agreementId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const agreement = await getAgreementOrThrow(db, input.companyId, input.agreementId);
      assertProcessAccess(ctx, input.companyId, agreement.processId);
      const evidence = await db
        .select()
        .from(meetingAgreementEvidence)
        .where(
          and(
            eq(meetingAgreementEvidence.companyId, input.companyId),
            eq(meetingAgreementEvidence.meetingAgreementId, input.agreementId)
          )
        )
        .orderBy(asc(meetingAgreementEvidence.uploadedAt));
      return Promise.all(evidence.map(decorateFile));
    }),

  deleteMeetingFile: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const [file] = await db
        .select()
        .from(meetingFiles)
        .where(
          and(eq(meetingFiles.id, input.id), eq(meetingFiles.companyId, input.companyId))
        )
        .limit(1);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Archivo no encontrado." });
      const meeting = await getMeetingOrThrow(db, input.companyId, file.meetingId);
      assertProcessAccess(ctx, input.companyId, meeting.processId);
      if (meeting.status === "annulled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Los archivos de una reunión anulada se conservan como historial.",
        });
      }
      try {
        await storageDelete(file.fileKey);
      } catch {
        /* Se elimina la referencia incluso si el objeto ya no existe. */
      }
      await db.delete(meetingFiles).where(eq(meetingFiles.id, file.id));
      return { success: true };
    }),

  deleteAgreementEvidence: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) unavailable();
      const [evidence] = await db
        .select()
        .from(meetingAgreementEvidence)
        .where(
          and(
            eq(meetingAgreementEvidence.id, input.id),
            eq(meetingAgreementEvidence.companyId, input.companyId)
          )
        )
        .limit(1);
      if (!evidence) throw new TRPCError({ code: "NOT_FOUND", message: "Evidencia no encontrada." });
      const agreement = await getAgreementOrThrow(
        db,
        input.companyId,
        evidence.meetingAgreementId
      );
      assertProcessAccess(ctx, input.companyId, agreement.processId);
      const meeting = await getMeetingOrThrow(db, input.companyId, agreement.meetingId);
      if (meeting.status === "annulled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Las evidencias de una reunión anulada se conservan como historial.",
        });
      }
      try {
        await storageDelete(evidence.fileKey);
      } catch {
        /* Se elimina la referencia incluso si el objeto ya no existe. */
      }
      await db
        .delete(meetingAgreementEvidence)
        .where(eq(meetingAgreementEvidence.id, evidence.id));
      return { success: true };
    }),
});
