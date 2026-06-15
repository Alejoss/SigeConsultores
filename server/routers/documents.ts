import { router, companyProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDocumentsByCompanyAndType, createCompanyDocument, deleteDocument, getDocumentById } from "../db";
import { storagePut, storageGet, storageDelete } from "../storage";
import { randomUUID } from "crypto";

export const documentsRouter = router({
  // Get documents by company and type
  getByCompanyAndType: companyProcedure
    .input(z.object({
      companyId: z.number(),
      documentType: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const docs = await getDocumentsByCompanyAndType(input.companyId, input.documentType);

        const docsWithFreshUrls = await Promise.all(
          docs.map(async (doc) => {
            if (!doc.fileKey) return doc;
            try {
              const { url } = await storageGet(doc.fileKey);
              return { ...doc, fileUrl: url };
            } catch {
              return doc;
            }
          })
        );

        return docsWithFreshUrls;
      } catch (error) {
        console.error("Error fetching documents:", error);
        return [];
      }
    }),

  // Upload policy document
  uploadPolicyDocument: companyProcedure
    .input(z.object({
      companyId: z.number(),
      fileName: z.string(),
      fileData: z.array(z.number()),
      fileType: z.string(),
      documentType: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Validate file type
        const validTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
        if (!validTypes.includes(input.fileType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Tipo de archivo no permitido. Solo PDF y Word (.doc, .docx)",
          });
        }

        // Convert array to Buffer
        const fileBuffer = Buffer.from(input.fileData);

        // Map document type from client to database enum
        const documentTypeMap: Record<string, "Politica" | "Programa" | "Procedimiento" | "Varios"> = {
          "Policy": "Politica",
          "Values": "Varios",
          "StrategicObjectives": "Programa",
          "Indicators": "Procedimiento",
          "ProcessMap": "Varios",
        };
        const dbDocumentType = documentTypeMap[input.documentType || "Policy"] || "Politica";

        // Upload to S3
        const fileKey = `documents/${input.companyId}/${randomUUID()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, fileBuffer, input.fileType);

        // Save to database
        await createCompanyDocument(
          input.companyId,
          input.fileName,
          dbDocumentType,
          "Vigente",
          url,
          fileKey,
          fileBuffer.length
        );

        return { success: true, url };
      } catch (error) {
        console.error("Error uploading policy document:", error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al cargar el documento",
        });
      }
    }),

  // Delete document (removes from S3 + DB)
  delete: companyProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      try {
        const doc = await getDocumentById(input.id);
        if (doc?.fileKey) {
          await storageDelete(doc.fileKey).catch((err) =>
            console.warn("[Documents] S3 delete failed (non-fatal):", err)
          );
        }
        await deleteDocument(input.id);
        return { success: true };
      } catch (error) {
        console.error("Error deleting document:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al eliminar el documento",
        });
      }
    }),
});
