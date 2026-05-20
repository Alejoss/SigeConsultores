import { z } from "zod";
import { randomUUID } from "crypto";
import { companyProcedure, router } from "../_core/trpc";
import { storagePut, storageGet, storageDelete } from "../storage";
import {
  createOrganizationChart,
  getOrganizationChart,
  getOrganizationChartNodes,
  createOrganizationChartNode,
  updateOrganizationChartNode,
  deleteOrganizationChartNode,
  uploadOrganizationChartFile,
  getOrganizationChartFiles,
  deleteOrganizationChartFile,
} from "../db";

// Zod schemas for validation
const CreateChartInput = z.object({
  companyId: z.number(),
  name: z.string().min(1),
  description: z.string().optional(),
});

const UpdateNodeInput = z.object({
  nodeId: z.number(),
  position: z.string().optional(),
  department: z.string().optional(),
  personName: z.string().optional(),
  email: z.string().refine((val) => !val || val.includes('@'), { message: 'Email inválido' }).optional(),
  phone: z.string().optional(),
  responsibilities: z.string().optional(),
  salary: z.number().optional(),
});

const CreateNodeInput = z.object({
  chartId: z.number(),
  nodeId: z.string(),
  parentNodeId: z.string().optional(),
  position: z.string(),
  department: z.string().optional(),
  personName: z.string().optional(),
  email: z.string().refine((val) => !val || val.includes('@'), { message: 'Email inválido' }).optional(),
  phone: z.string().optional(),
  responsibilities: z.string().optional(),
  salary: z.number().optional(),
  level: z.number(),
  order: z.number(),
});

export const organizationChartRouter = router({
  /**
   * Create a new organization chart for a company
   */
  createChart: companyProcedure
    .input(CreateChartInput)
    .mutation(async ({ input, ctx }) => {
      try {
        const chart = await createOrganizationChart(input.companyId, input.name, input.description);
        return {
          success: true,
          chartId: chart.id,
        };
      } catch (error) {
        console.error("[OrganizationChart] Error creating chart:", error);
        throw error;
      }
    }),

  /**
   * Get organization chart for a company
   */
  getChart: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      try {
        return await getOrganizationChart(input.companyId);
      } catch (error) {
        console.error("[OrganizationChart] Error getting chart:", error);
        return null;
      }
    }),

  /**
   * Create a new node in the organization chart
   */
  createNode: companyProcedure
    .input(CreateNodeInput)
    .mutation(async ({ input, ctx }) => {
      try {
        const node = await createOrganizationChartNode(input.chartId, {
          nodeId: input.nodeId,
          parentNodeId: input.parentNodeId,
          position: input.position,
          department: input.department,
          personName: input.personName,
          email: input.email,
          phone: input.phone,
          responsibilities: input.responsibilities,
          salary: input.salary,
          level: input.level,
          order: input.order,
        });

        return {
          success: true,
          nodeId: node.id,
        };
      } catch (error) {
        console.error("[OrganizationChart] Error creating node:", error);
        throw error;
      }
    }),

  /**
   * Update a node in the organization chart
   */
  updateNode: companyProcedure
    .input(UpdateNodeInput)
    .mutation(async ({ input, ctx }) => {
      try {
        await updateOrganizationChartNode(input.nodeId, {
          position: input.position,
          department: input.department,
          personName: input.personName,
          email: input.email,
          phone: input.phone,
          responsibilities: input.responsibilities,
          salary: input.salary,
        });

        return { success: true };
      } catch (error) {
        console.error("[OrganizationChart] Error updating node:", error);
        throw error;
      }
    }),

  /**
   * Delete a node from the organization chart
   */
  deleteNode: companyProcedure
    .input(z.object({ nodeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await deleteOrganizationChartNode(input.nodeId);
        return { success: true };
      } catch (error) {
        console.error("[OrganizationChart] Error deleting node:", error);
        throw error;
      }
    }),

  /**
   * Get all nodes for an organization chart
   */
  getNodes: companyProcedure
    .input(z.object({ chartId: z.number() }))
    .query(async ({ input }) => {
      try {
        return await getOrganizationChartNodes(input.chartId);
      } catch (error) {
        console.error("[OrganizationChart] Error getting nodes:", error);
        return [];
      }
    }),

  /**
   * Upload a PDF file for the organization chart
   */
  uploadPDF: companyProcedure
    .input(z.object({
      chartId: z.number(),
      fileName: z.string(),
      fileData: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user!.id;
      const userName = ctx.user!.name ?? "Usuario";

      console.log("[OrganizationChart] uploadPDF start", {
        chartId: input.chartId,
        fileName: input.fileName,
        fileSize: input.fileData.length,
        userId,
      });

      try {
        // Remove previous PDF (one per chart)
        const existing = await getOrganizationChartFiles(input.chartId);
        for (const old of existing) {
          console.log("[OrganizationChart] Replacing previous PDF:", old.fileKey);
          await storageDelete(old.fileKey).catch((err: any) =>
            console.warn("[OrganizationChart] S3 delete old failed (non-fatal):", err)
          );
          await deleteOrganizationChartFile(old.id);
        }

        const fileBuffer = Buffer.from(input.fileData);
        const fileKey = `orgchart/${input.chartId}/${randomUUID()}-${input.fileName}`;

        console.log("[OrganizationChart] Uploading to S3:", fileKey);
        const { url, key } = await storagePut(fileKey, fileBuffer, "application/pdf");
        console.log("[OrganizationChart] S3 upload ok, saving to DB");

        const file = await uploadOrganizationChartFile(
          input.chartId,
          input.fileName,
          url,
          key,
          userId,
          userName,
        );

        console.log("[OrganizationChart] uploadPDF complete, fileId:", file.id);
        return { success: true, fileId: file.id };
      } catch (error) {
        console.error("[OrganizationChart] Error uploading PDF:", error);
        throw error;
      }
    }),

  /**
   * Delete a PDF file from the organization chart
   */
  deletePDF: companyProcedure
    .input(z.object({ fileId: z.number() }))
    .mutation(async ({ input }) => {
      console.log("[OrganizationChart] deletePDF fileId:", input.fileId);
      try {
        const file = await deleteOrganizationChartFile(input.fileId);
        if (file?.fileKey) {
          console.log("[OrganizationChart] Deleting from S3:", file.fileKey);
          await storageDelete(file.fileKey).catch((err) =>
            console.warn("[OrganizationChart] S3 delete failed (non-fatal):", err)
          );
        }
        return { success: true };
      } catch (error) {
        console.error("[OrganizationChart] Error deleting PDF:", error);
        throw error;
      }
    }),

  /**
   * Get all uploaded PDF files for an organization chart (with fresh presigned URLs)
   */
  getFiles: companyProcedure
    .input(z.object({ chartId: z.number() }))
    .query(async ({ input }) => {
      try {
        const files = await getOrganizationChartFiles(input.chartId);

        const filesWithFreshUrls = await Promise.all(
          files.map(async (file) => {
            try {
              const { url } = await storageGet(file.fileKey);
              return { ...file, fileUrl: url };
            } catch {
              return file;
            }
          })
        );

        return filesWithFreshUrls;
      } catch (error) {
        console.error("[OrganizationChart] Error getting files:", error);
        return [];
      }
    }),
});
