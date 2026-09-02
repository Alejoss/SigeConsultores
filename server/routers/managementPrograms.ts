import { z } from "zod";
import { router, companyProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { and, asc, eq } from "drizzle-orm";
import {
  linkedCommitments,
  managementProgramFiles,
  managementPrograms,
  programActionBaselines,
  programActions,
} from "../../drizzle/schema";
import { storageDelete, storageGet, storagePut } from "../storage";
import { randomUUID } from "crypto";

const PROGRAM_FILE_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
const MAX_PROGRAM_FILE_BYTES = 50 * 1024 * 1024;

function assertValidProgramFile(mimeType: string, bytes: number) {
  if (
    !PROGRAM_FILE_MIME_TYPES.includes(
      mimeType as (typeof PROGRAM_FILE_MIME_TYPES)[number]
    )
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Solo se permiten archivos PDF, Word o Excel",
    });
  }
  if (bytes > MAX_PROGRAM_FILE_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "El archivo no debe superar 50 MB",
    });
  }
}

function requireProgramManagementAccess(
  ctx: {
    manager: { companyId: number } | null;
    processLeader: unknown;
    user: { role: string } | null;
  },
  companyId: number
) {
  if (ctx.user?.role === "admin") return;
  if (ctx.manager?.companyId === companyId) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      "Solo el Gerente de la empresa o el Administrador pueden administrar acciones de Programas.",
  });
}

function normalizeProgramActionKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function programActionImportKey(action: string, implementationDate?: string) {
  return `${normalizeProgramActionKey(action)}|${implementationDate || ""}`.slice(
    0,
    512
  );
}

const importedProgramActionInput = z.object({
  action: z.string().trim().min(1).max(4000),
  responsible: z.string().trim().max(255).optional(),
  implementationDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
    .optional(),
  completed: z.boolean().optional(),
});

async function ensureProgramActionBaseline(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  programId: number,
  captureLegacyCounts: boolean
) {
  const [existing] = await db
    .select()
    .from(programActionBaselines)
    .where(
      and(
        eq(programActionBaselines.companyId, companyId),
        eq(programActionBaselines.programId, programId)
      )
    )
    .limit(1);
  if (existing) return existing;

  const [program] = await db
    .select({
      plannedActions: managementPrograms.plannedActions,
      completedActions: managementPrograms.completedActions,
    })
    .from(managementPrograms)
    .where(
      and(
        eq(managementPrograms.companyId, companyId),
        eq(managementPrograms.id, programId)
      )
    )
    .limit(1);
  if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });

  // Al convertir un Programa sin acciones detalladas, se conserva su histórico.
  // Si ya hay acciones de versiones anteriores, sus contadores ya son derivados.
  await db.insert(programActionBaselines).values({
    companyId,
    programId,
    legacyPlannedActions: captureLegacyCounts ? (program.plannedActions || 0) : 0,
    legacyCompletedActions: captureLegacyCounts ? (program.completedActions || 0) : 0,
  });
  const [created] = await db
    .select()
    .from(programActionBaselines)
    .where(
      and(
        eq(programActionBaselines.companyId, companyId),
        eq(programActionBaselines.programId, programId)
      )
    )
    .limit(1);
  return created!;
}

export async function refreshProgramMetrics(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  programId: number
) {
  const baseline = await ensureProgramActionBaseline(db, companyId, programId, false);
  const actions = await db
    .select({ completed: programActions.completed })
    .from(programActions)
    .where(
      and(
        eq(programActions.companyId, companyId),
        eq(programActions.programId, programId)
      )
    );
  // El histórico queda preservado, pero al existir acciones detalladas el
  // indicador principal refleja exclusivamente las acciones trazables y sus
  // cierres confirmados desde los procesos responsables.
  const hasOperationalActions = actions.length > 0;
  await db
    .update(managementPrograms)
    .set({
      plannedActions: hasOperationalActions ? actions.length : baseline.legacyPlannedActions,
      completedActions: hasOperationalActions
        ? actions.filter(action => Boolean(action.completed)).length
        : baseline.legacyCompletedActions,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(managementPrograms.id, programId),
        eq(managementPrograms.companyId, companyId)
      )
    );
}

export const managementProgramsRouter = router({
  /** Listar todos los programas de una empresa */
  list: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const programs = await db
        .select()
        .from(managementPrograms)
        .where(eq(managementPrograms.companyId, input.companyId))
        .orderBy(asc(managementPrograms.createdAt));
      const actions = await db
        .select({ programId: programActions.programId, completed: programActions.completed })
        .from(programActions)
        .where(eq(programActions.companyId, input.companyId));
      const totals = new Map<number, { planned: number; completed: number }>();
      for (const action of actions) {
        const total = totals.get(action.programId) || { planned: 0, completed: 0 };
        total.planned += 1;
        if (action.completed) total.completed += 1;
        totals.set(action.programId, total);
      }
      return programs.map(program => {
        const total = totals.get(program.id) || { planned: 0, completed: 0 };
        return { ...program, plannedActions: total.planned, completedActions: total.completed };
      });
    }),

  /** Crear un nuevo programa */
  create: companyProcedure
    .input(
      z.object({
        companyId: z.number(),
        programName: z.string().min(1),
        managementSystem: z.string().default("Calidad"),
      }).strict()
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const insertResult = await db.insert(managementPrograms).values({
        companyId: input.companyId,
        programName: input.programName,
        managementSystem: input.managementSystem,
        plannedActions: 0,
        completedActions: 0,
      });
      const [inserted] = await db
        .select()
        .from(managementPrograms)
        .where(eq(managementPrograms.id, Number(insertResult[0].insertId)));
      return inserted;
    }),

  /** Actualizar campos de un programa mediante autosave */
  update: companyProcedure
    .input(
      z.object({
        id: z.number(),
        companyId: z.number(),
        programName: z.string().optional(),
        managementSystem: z.string().optional(),
      }).strict()
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const { id, companyId, ...updateData } = input;
      await db
        .update(managementPrograms)
        .set(updateData)
        .where(
          and(
            eq(managementPrograms.id, id),
            eq(managementPrograms.companyId, companyId)
          )
        );
      return { success: true };
    }),

  /** Eliminar un programa y todos sus archivos asociados */
  delete: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const [program] = await db
        .select()
        .from(managementPrograms)
        .where(
          and(
            eq(managementPrograms.id, input.id),
            eq(managementPrograms.companyId, input.companyId)
          )
        );
      if (!program)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Programa no encontrado",
        });
      const actions = await db
        .select({ id: programActions.id })
        .from(programActions)
        .where(
          and(
            eq(programActions.programId, input.id),
            eq(programActions.companyId, input.companyId)
          )
        );
      for (const action of actions) {
        const links = await db
          .select({ id: linkedCommitments.id })
          .from(linkedCommitments)
          .where(
            and(
              eq(linkedCommitments.companyId, input.companyId),
              eq(linkedCommitments.sourceType, "program_action"),
              eq(linkedCommitments.sourceId, action.id),
              eq(linkedCommitments.sourceSubId, input.id)
            )
          )
          .limit(1);
        if (links[0])
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "No se puede eliminar un Programa con acciones vinculadas. Retire primero sus vínculos.",
          });
      }

      if (program.planFileKey) {
        try {
          await storageDelete(program.planFileKey);
        } catch {
          /* La referencia en BD siempre se elimina. */
        }
      }
      const documentation = await db
        .select()
        .from(managementProgramFiles)
        .where(
          and(
            eq(managementProgramFiles.programId, input.id),
            eq(managementProgramFiles.companyId, input.companyId)
          )
        );
      for (const file of documentation) {
        try {
          await storageDelete(file.fileKey);
        } catch {
          /* La referencia en BD siempre se elimina. */
        }
      }
      await db
        .delete(managementProgramFiles)
        .where(
          and(
            eq(managementProgramFiles.programId, input.id),
            eq(managementProgramFiles.companyId, input.companyId)
          )
        );
      await db
        .delete(programActions)
        .where(
          and(
            eq(programActions.programId, input.id),
            eq(programActions.companyId, input.companyId)
          )
        );
      await db
        .delete(managementPrograms)
        .where(
          and(
            eq(managementPrograms.id, input.id),
            eq(managementPrograms.companyId, input.companyId)
          )
        );
      return { success: true };
    }),

  /** Listar acciones estructuradas de un Programa. */
  listActions: companyProcedure
    .input(
      z.object({
        programId: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      requireProgramManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const [program] = await db
        .select({ id: managementPrograms.id })
        .from(managementPrograms)
        .where(
          and(
            eq(managementPrograms.id, input.programId),
            eq(managementPrograms.companyId, input.companyId)
          )
        )
        .limit(1);
      if (!program)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Programa no encontrado",
        });
      return db
        .select()
        .from(programActions)
        .where(
          and(
            eq(programActions.programId, input.programId),
            eq(programActions.companyId, input.companyId)
          )
        )
        .orderBy(asc(programActions.orderIndex), asc(programActions.id));
    }),

  /** Crear una acción detallada del Programa. */
  createAction: companyProcedure
    .input(
      z.object({
        programId: z.number().int().positive(),
        companyId: z.number().int().positive(),
        action: z.string().trim().min(1).max(4000),
        responsible: z.string().trim().max(255).optional(),
        implementationDate: z
          .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireProgramManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const [program] = await db
        .select({ id: managementPrograms.id })
        .from(managementPrograms)
        .where(
          and(
            eq(managementPrograms.id, input.programId),
            eq(managementPrograms.companyId, input.companyId)
          )
        )
        .limit(1);
      if (!program)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Programa no encontrado",
        });
      const existing = await db
        .select({ id: programActions.id })
        .from(programActions)
        .where(
          and(
            eq(programActions.programId, input.programId),
            eq(programActions.companyId, input.companyId)
          )
        );
      await ensureProgramActionBaseline(
        db,
        input.companyId,
        input.programId,
        existing.length === 0
      );
      const result = await db.insert(programActions).values({
        companyId: input.companyId,
        programId: input.programId,
        action: input.action,
        responsible: input.responsible || null,
        implementationDate: input.implementationDate
          ? new Date(`${input.implementationDate}T00:00:00.000Z`)
          : null,
        orderIndex: existing.length,
      });
      await refreshProgramMetrics(db, input.companyId, input.programId);
      return { id: Number(result[0].insertId) };
    }),

  /** Editar o cerrar una acción no vinculada a procesos. */
  updateAction: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        programId: z.number().int().positive(),
        companyId: z.number().int().positive(),
        action: z.string().trim().min(1).max(4000).optional(),
        responsible: z.string().trim().max(255).optional(),
        implementationDate: z
          .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
          .optional(),
        completed: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireProgramManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const [action] = await db
        .select()
        .from(programActions)
        .where(
          and(
            eq(programActions.id, input.id),
            eq(programActions.programId, input.programId),
            eq(programActions.companyId, input.companyId)
          )
        )
        .limit(1);
      if (!action)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Acción del Programa no encontrada",
        });
      if (input.completed !== undefined) {
        const links = await db
          .select({ id: linkedCommitments.id })
          .from(linkedCommitments)
          .where(
            and(
              eq(linkedCommitments.companyId, input.companyId),
              eq(linkedCommitments.sourceType, "program_action"),
              eq(linkedCommitments.sourceId, input.id),
              eq(linkedCommitments.sourceSubId, input.programId)
            )
          )
          .limit(1);
        if (links[0])
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Esta acción está vinculada a procesos. Su cumplimiento se actualiza desde Compromisos vinculados.",
          });
      }
      await db
        .update(programActions)
        .set({
          ...(input.action !== undefined && { action: input.action }),
          ...(input.responsible !== undefined && {
            responsible: input.responsible || null,
          }),
          ...(input.implementationDate !== undefined && {
            implementationDate: input.implementationDate
              ? new Date(`${input.implementationDate}T00:00:00.000Z`)
              : null,
          }),
          ...(input.completed !== undefined && {
            completed: input.completed,
            completedAt: input.completed ? new Date() : null,
          }),
        })
        .where(eq(programActions.id, input.id));
      await refreshProgramMetrics(db, input.companyId, input.programId);
      return { success: true };
    }),

  /** Eliminar una acción sólo si no tiene procesos vinculados. */
  deleteAction: companyProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        programId: z.number().int().positive(),
        companyId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireProgramManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const links = await db
        .select({ id: linkedCommitments.id })
        .from(linkedCommitments)
        .where(
          and(
            eq(linkedCommitments.companyId, input.companyId),
            eq(linkedCommitments.sourceType, "program_action"),
            eq(linkedCommitments.sourceId, input.id),
            eq(linkedCommitments.sourceSubId, input.programId)
          )
        )
        .limit(1);
      if (links[0])
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No se puede eliminar una acción con compromisos vinculados. Retire primero sus vínculos.",
        });
      await db
        .delete(programActions)
        .where(
          and(
            eq(programActions.id, input.id),
            eq(programActions.programId, input.programId),
            eq(programActions.companyId, input.companyId)
          )
        );
      await refreshProgramMetrics(db, input.companyId, input.programId);
      return { success: true };
    }),

  /** Importar o actualizar acciones de una planificación Excel sin borrar las existentes. */
  importActions: companyProcedure
    .input(
      z.object({
        programId: z.number().int().positive(),
        companyId: z.number().int().positive(),
        items: z.array(importedProgramActionInput).min(1).max(5000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireProgramManagementAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const [program] = await db
        .select({ id: managementPrograms.id })
        .from(managementPrograms)
        .where(
          and(
            eq(managementPrograms.id, input.programId),
            eq(managementPrograms.companyId, input.companyId)
          )
        )
        .limit(1);
      if (!program)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Programa no encontrado",
        });

      const existing = await db
        .select()
        .from(programActions)
        .where(
          and(
            eq(programActions.programId, input.programId),
            eq(programActions.companyId, input.companyId)
          )
        );
      await ensureProgramActionBaseline(
        db,
        input.companyId,
        input.programId,
        existing.length === 0
      );
      const byImportKey = new Map(
        existing
          .filter(action => action.importKey)
          .map(action => [action.importKey!, action])
      );
      let created = 0;
      let updated = 0;
      let protectedCompletion = 0;
      let nextOrderIndex =
        existing.reduce(
          (max, action) => Math.max(max, action.orderIndex || 0),
          -1
        ) + 1;

      for (const item of input.items) {
        const implementationDate = item.implementationDate || "";
        const importKey = programActionImportKey(
          item.action,
          implementationDate
        );
        const prior = byImportKey.get(importKey);
        if (!prior) {
          await db.insert(programActions).values({
            companyId: input.companyId,
            programId: input.programId,
            importKey,
            action: item.action,
            responsible: item.responsible || null,
            implementationDate: implementationDate
              ? new Date(`${implementationDate}T00:00:00.000Z`)
              : null,
            completed: item.completed ?? false,
            completedAt: item.completed ? new Date() : null,
            orderIndex: nextOrderIndex++,
          });
          created += 1;
          continue;
        }

        let preservesLinkedCompletion = false;
        if (item.completed !== undefined) {
          const links = await db
            .select({ id: linkedCommitments.id })
            .from(linkedCommitments)
            .where(
              and(
                eq(linkedCommitments.companyId, input.companyId),
                eq(linkedCommitments.sourceType, "program_action"),
                eq(linkedCommitments.sourceId, prior.id),
                eq(linkedCommitments.sourceSubId, input.programId)
              )
            )
            .limit(1);
          preservesLinkedCompletion = Boolean(links[0]);
          if (preservesLinkedCompletion) protectedCompletion += 1;
        }
        await db
          .update(programActions)
          .set({
            action: item.action,
            ...(item.responsible !== undefined && {
              responsible: item.responsible || null,
            }),
            ...(item.implementationDate !== undefined && {
              implementationDate: implementationDate
                ? new Date(`${implementationDate}T00:00:00.000Z`)
                : null,
            }),
            ...(item.completed !== undefined &&
              !preservesLinkedCompletion && {
                completed: item.completed,
                completedAt: item.completed ? new Date() : null,
              }),
            updatedAt: new Date(),
          })
          .where(eq(programActions.id, prior.id));
        updated += 1;
      }
      await refreshProgramMetrics(db, input.companyId, input.programId);
      return { created, updated, protectedCompletion };
    }),

  /** Reemplazar el archivo único de planificación de un programa */
  uploadPlan: companyProcedure
    .input(
      z.object({
        id: z.number(),
        companyId: z.number(),
        fileName: z.string().min(1),
        fileData: z.array(z.number().int().min(0).max(255)),
        mimeType: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const [program] = await db
        .select()
        .from(managementPrograms)
        .where(
          and(
            eq(managementPrograms.id, input.id),
            eq(managementPrograms.companyId, input.companyId)
          )
        );
      if (!program)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Programa no encontrado",
        });

      const fileBuffer = Buffer.from(input.fileData);
      assertValidProgramFile(input.mimeType, fileBuffer.length);
      if (program.planFileKey) {
        try {
          await storageDelete(program.planFileKey);
        } catch {
          /* El nuevo archivo conserva la referencia actualizada. */
        }
      }
      const fileKey = `management-programs/${input.companyId}/${input.id}/planning/${randomUUID()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
      await db
        .update(managementPrograms)
        .set({ planFileKey: fileKey, planFileName: input.fileName })
        .where(
          and(
            eq(managementPrograms.id, input.id),
            eq(managementPrograms.companyId, input.companyId)
          )
        );
      return { success: true, url };
    }),

  /** Obtener una URL vigente para la planificación */
  getPlanUrl: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const [program] = await db
        .select()
        .from(managementPrograms)
        .where(
          and(
            eq(managementPrograms.id, input.id),
            eq(managementPrograms.companyId, input.companyId)
          )
        );
      if (!program || !program.planFileKey) return null;
      try {
        const { url } = await storageGet(program.planFileKey);
        return { url, fileName: program.planFileName };
      } catch {
        return null;
      }
    }),

  /** Subir uno de los múltiples documentos de respaldo de un programa */
  uploadDocumentation: companyProcedure
    .input(
      z.object({
        programId: z.number(),
        companyId: z.number(),
        fileName: z.string().min(1),
        fileData: z.array(z.number().int().min(0).max(255)),
        mimeType: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const [program] = await db
        .select({ id: managementPrograms.id })
        .from(managementPrograms)
        .where(
          and(
            eq(managementPrograms.id, input.programId),
            eq(managementPrograms.companyId, input.companyId)
          )
        );
      if (!program)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Programa no encontrado",
        });

      const fileBuffer = Buffer.from(input.fileData);
      assertValidProgramFile(input.mimeType, fileBuffer.length);
      const fileKey = `management-programs/${input.companyId}/${input.programId}/documentation/${randomUUID()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
      const insertResult = await db.insert(managementProgramFiles).values({
        programId: input.programId,
        companyId: input.companyId,
        fileName: input.fileName,
        fileUrl: url,
        fileKey,
        fileSizeBytes: fileBuffer.length,
      });
      return { success: true, id: Number(insertResult[0].insertId), url };
    }),

  /** Listar documentación con URLs vigentes */
  listDocumentation: companyProcedure
    .input(z.object({ programId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const files = await db
        .select()
        .from(managementProgramFiles)
        .where(
          and(
            eq(managementProgramFiles.programId, input.programId),
            eq(managementProgramFiles.companyId, input.companyId)
          )
        )
        .orderBy(asc(managementProgramFiles.uploadedAt));
      return Promise.all(
        files.map(async file => {
          try {
            const { url } = await storageGet(file.fileKey);
            return { ...file, fileUrl: url };
          } catch {
            return file;
          }
        })
      );
    }),

  /** Eliminar un documento específico de respaldo */
  deleteDocumentation: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const [file] = await db
        .select()
        .from(managementProgramFiles)
        .where(
          and(
            eq(managementProgramFiles.id, input.id),
            eq(managementProgramFiles.companyId, input.companyId)
          )
        );
      if (!file)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Documento no encontrado",
        });
      try {
        await storageDelete(file.fileKey);
      } catch {
        /* La referencia en BD siempre se elimina. */
      }
      await db
        .delete(managementProgramFiles)
        .where(
          and(
            eq(managementProgramFiles.id, input.id),
            eq(managementProgramFiles.companyId, input.companyId)
          )
        );
      return { success: true };
    }),
});
