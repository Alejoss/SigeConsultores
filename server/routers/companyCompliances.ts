import { z } from "zod";
import { getDb } from "../db";
import { companyCompliances } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { storagePut } from "../storage";
import { companyProcedure, router } from "../_core/trpc";

export const companyCompliancesRouter = router({
  list: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return await db
        .select()
        .from(companyCompliances)
        .where(eq(companyCompliances.companyId, input.companyId));
    }),

  create: companyProcedure
    .input(
      z.object({
        companyId: z.number(),
        requirement: z.string().min(1),
        description: z.string().optional(),
        obligationType: z.enum([
          "Legal",
          "Reglamentaria",
          "Concesion",
          "Sistema de Gestion",
          "Otros",
        ]),
        otherObligationType: z.string().optional(),
        responsible: z.string().optional(),
        plannedMonths: z.string().optional(),
        completedMonths: z.string().optional(),
        observations: z.string().optional(),
        evaluationMode: z.enum(["meses", "vigencia"]).optional(),
        validFrom: z.string().nullable().optional(),
        validUntil: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      const result = await db.insert(companyCompliances).values({
        companyId: input.companyId,
        requirement: input.requirement,
        description: input.description ?? null,
        obligationType: input.obligationType,
        otherObligationType: input.otherObligationType ?? null,
        responsible: input.responsible ?? null,
        completed: "NO",
        plannedMonths: input.plannedMonths ?? null,
        completedMonths: input.completedMonths ?? null,
        observations: input.observations ?? null,
        evaluationMode: input.evaluationMode ?? "meses",
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      });
      return { success: true, id: Number(result[0].insertId) };
    }),

  update: companyProcedure
    .input(
      z.object({
        id: z.number(),
        requirement: z.string().min(1).optional(),
        description: z.string().optional(),
        obligationType: z
          .enum([
            "Legal",
            "Reglamentaria",
            "Concesion",
            "Sistema de Gestion",
            "Otros",
          ])
          .optional(),
        otherObligationType: z.string().optional(),
        responsible: z.string().optional(),
        completed: z.enum(["SI", "NO"]).optional(),
        plannedMonths: z.string().optional(),
        completedMonths: z.string().optional(),
        observations: z.string().optional(),
        evaluationMode: z.enum(["meses", "vigencia"]).optional(),
        validFrom: z.string().nullable().optional(),
        validUntil: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      const { id, validFrom, validUntil, ...rest } = input;
      const dateFields = {
        ...(validFrom !== undefined
          ? { validFrom: validFrom ? new Date(validFrom) : null }
          : {}),
        ...(validUntil !== undefined
          ? { validUntil: validUntil ? new Date(validUntil) : null }
          : {}),
      };
      await db
        .update(companyCompliances)
        .set({ ...rest, ...dateFields, updatedAt: new Date() })
        .where(eq(companyCompliances.id, id));
      return { success: true };
    }),

  uploadEvidencePdf: companyProcedure
    .input(
      z.object({
        companyId: z.number(),
        complianceId: z.number(),
        fileName: z.string().min(1).max(255),
        fileData: z
          .array(z.number().int().min(0).max(255))
          .max(10 * 1024 * 1024),
        mimeType: z.literal("application/pdf"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB no disponible");
      const [compliance] = await db
        .select({ id: companyCompliances.id })
        .from(companyCompliances)
        .where(
          and(
            eq(companyCompliances.id, input.complianceId),
            eq(companyCompliances.companyId, input.companyId)
          )
        )
        .limit(1);
      if (!compliance)
        throw new Error("No se encontró el Cumplimiento seleccionado.");

      const fileBuffer = Buffer.from(input.fileData);
      if (fileBuffer.length === 0 || fileBuffer.length > 10 * 1024 * 1024)
        throw new Error("El PDF debe tener un tamaño máximo de 10 MB.");
      if (!fileBuffer.subarray(0, 5).toString("utf8").startsWith("%PDF-"))
        throw new Error("El archivo seleccionado no es un PDF válido.");

      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._() -]/g, "_");
      const fileKey = `compliance-evidence/${input.companyId}/${input.complianceId}/${randomUUID()}-${safeFileName.endsWith(".pdf") ? safeFileName : `${safeFileName}.pdf`}`;
      const { key, url } = await storagePut(
        fileKey,
        fileBuffer,
        input.mimeType
      );
      await db
        .update(companyCompliances)
        .set({
          evidencePdfUrl: url,
          evidencePdfName: safeFileName,
          evidencePdfKey: key,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(companyCompliances.id, input.complianceId),
            eq(companyCompliances.companyId, input.companyId)
          )
        );
      return { success: true, url, fileName: safeFileName };
    }),

  delete: companyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      await db
        .delete(companyCompliances)
        .where(eq(companyCompliances.id, input.id));
      return { success: true };
    }),
});
