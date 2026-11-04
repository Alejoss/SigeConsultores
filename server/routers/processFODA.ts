import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, companyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { policies, policyObjectives, processFODA } from "../../drizzle/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { assertProcessAccessById } from "../_core/companyPermissions";

type FodaPayloadItem = Record<string, unknown>;

function parsePayloadArray(serialized: string, field: string): FodaPayloadItem[] {
  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) throw new Error("not-array");
    if (parsed.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error("invalid-item");
    }
    return parsed as FodaPayloadItem[];
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `El contenido de ${field} no tiene un formato válido.`,
    });
  }
}

/** Valida IDs nuevos contra la empresa del proceso y conserva los textos históricos. */
async function normalizeObjectiveLinks(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  serialized: string,
  field: string,
  objectiveTextField: "policyObjective" | "objetivoPolitica"
): Promise<string> {
  const entries = parsePayloadArray(serialized, field);
  const rawIds = entries
    .map(item => item.policyObjectiveId)
    .filter(value => value !== null && value !== undefined && value !== "");
  const requestedIds = Array.from(new Set(rawIds
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0)));

  if (rawIds.length === 0) return JSON.stringify(entries);
  if (requestedIds.length !== rawIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "El identificador del Objetivo de la Política no es válido.",
    });
  }

  const companyPolicies = await db
    .select({ id: policies.id })
    .from(policies)
    .where(eq(policies.companyId, companyId));
  const policyIds = companyPolicies.map(policy => policy.id);
  const companyOwnership = policyIds.length > 0
    ? or(inArray(policyObjectives.policyId, policyIds), eq(policyObjectives.policyId, companyId))
    : eq(policyObjectives.policyId, companyId);
  const validObjectives = await db
    .select({
      id: policyObjectives.id,
      objective: policyObjectives.objective,
      description: policyObjectives.description,
    })
    .from(policyObjectives)
    .where(and(inArray(policyObjectives.id, requestedIds), companyOwnership));
  const byId = new Map(validObjectives.map(objective => [objective.id, objective]));

  return JSON.stringify(entries.map(item => {
    const rawId = item.policyObjectiveId;
    if (rawId === null || rawId === undefined || rawId === "") return item;
    const objectiveId = typeof rawId === "number" ? rawId : Number(rawId);
    const objective = byId.get(objectiveId);
    if (!Number.isInteger(objectiveId) || !objective) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "El Objetivo de la Política seleccionado no pertenece a la empresa de este proceso.",
      });
    }
    return {
      ...item,
      policyObjectiveId: objective.id,
      [objectiveTextField]: objective.objective,
      policyObjectiveDescription: objective.description || "",
      ...(objectiveTextField === "policyObjective"
        ? { selectedObjectiveContent: `${objective.objective}\n\n${objective.description || ""}` }
        : {}),
    };
  }));
}

export const processFODARouter = router({
  get: companyProcedure
    .input(z.object({ processId: z.number(), recordId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await assertProcessAccessById(ctx, input.processId);
      const db = await getDb();
      if (!db) return null;

      const result = await db
        .select()
        .from(processFODA)
        .where(
          input.recordId
            ? and(
                eq(processFODA.processId, input.processId),
                eq(processFODA.id, input.recordId)
              )
            : eq(processFODA.processId, input.processId)
        )
        .orderBy(desc(processFODA.updatedAt))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    }),

  upsert: companyProcedure
    .input(z.object({
      processId: z.number(),
      strengths: z.string().optional(),
      opportunities: z.string().optional(),
      weaknesses: z.string().optional(),
      threats: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const process = await assertProcessAccessById(ctx, input.processId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [strengths, opportunities, weaknesses, threats] = await Promise.all([
        normalizeObjectiveLinks(db, process.companyId, input.strengths || "[]", "fortalezas", "policyObjective"),
        normalizeObjectiveLinks(db, process.companyId, input.opportunities || "[]", "oportunidades", "policyObjective"),
        normalizeObjectiveLinks(db, process.companyId, input.weaknesses || "[]", "debilidades", "policyObjective"),
        normalizeObjectiveLinks(db, process.companyId, input.threats || "[]", "amenazas", "policyObjective"),
      ]);

      const existing = await db.select().from(processFODA)
        .where(eq(processFODA.processId, input.processId));

      if (existing.length > 0) {
        await db.update(processFODA)
          .set({
            strengths,
            opportunities,
            weaknesses,
            threats,
            updatedAt: new Date(),
          })
          .where(eq(processFODA.processId, input.processId));
      } else {
        await db.insert(processFODA).values({
          processId: input.processId,
          strengths,
          opportunities,
          weaknesses,
          threats,
        });
      }

      return { success: true, message: "FODA guardado exitosamente" };
    }),

  saveObjectiveNarratives: companyProcedure
    .input(z.object({
      processId: z.number(),
      recordId: z.number().int().positive().optional(),
      rowId: z.union([z.number(), z.string()]),
      situacionInicial: z.string().max(10_000).optional(),
      resultadoEsperado: z.string().max(10_000).optional(),
      indicador: z.string().max(10_000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertProcessAccessById(ctx, input.processId);
      const narratives = {
        ...(input.situacionInicial !== undefined ? { situacionInicial: input.situacionInicial } : {}),
        ...(input.resultadoEsperado !== undefined ? { resultadoEsperado: input.resultadoEsperado } : {}),
        ...(input.indicador !== undefined ? { indicador: input.indicador } : {}),
      };
      if (Object.keys(narratives).length === 0) {
        return { success: true, changed: false, message: "Sin cambios narrativos" };
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db.transaction(async tx => {
        const [existing] = await tx.select().from(processFODA)
          .where(input.recordId !== undefined
            ? and(eq(processFODA.processId, input.processId), eq(processFODA.id, input.recordId))
            : eq(processFODA.processId, input.processId))
          .orderBy(desc(processFODA.updatedAt))
          .limit(1)
          .for("update");
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Registro FODA no encontrado." });
        }

        // Unlike full matrix saves, this path must not normalize links, metrics or actions.
        const rows = parsePayloadArray(existing.matrixData ?? "", "matriz OTG existente");
        const index = rows.findIndex(row => String(row.id) === String(input.rowId));
        if (index < 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Objetivo táctico general no encontrado." });
        }
        rows[index] = { ...rows[index], ...narratives };

        await tx.update(processFODA)
          .set({
            matrixData: JSON.stringify(rows),
            // Preserve every other FODA column, including its stored timestamps.
            updatedAt: existing.updatedAt,
          })
          .where(and(eq(processFODA.id, existing.id), eq(processFODA.processId, input.processId)));

        return { success: true, changed: true, message: "Textos del objetivo táctico general guardados" };
      });
    }),

  saveMatrixData: companyProcedure
    .input(z.object({
      processId: z.number(),
      matrixData: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const process = await assertProcessAccessById(ctx, input.processId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const matrixData = await normalizeObjectiveLinks(
        db,
        process.companyId,
        input.matrixData,
        "matriz OTG",
        "objetivoPolitica"
      );

      const incomingRows = parsePayloadArray(matrixData, "matriz OTG");
      return db.transaction(async tx => {
        const existing = await tx.select().from(processFODA)
          .where(eq(processFODA.processId, input.processId))
          .orderBy(processFODA.id)
          .for("update");

        if (existing.length > 0) {
          // Validate every version before writing; malformed JSON may hide narratives.
          const matrices = existing.map(record => {
            const storedRows = parsePayloadArray(record.matrixData ?? "[]", "matriz OTG existente");
            const storedById = new Map(storedRows.map(row => [String(row.id), row]));
            const rows = incomingRows.map(row => {
              const stored = storedById.get(String(row.id));
              const merged = { ...row };
              for (const key of ["situacionInicial", "resultadoEsperado", "indicador"] as const) {
                if (!Object.prototype.hasOwnProperty.call(row, key)
                  && stored && Object.prototype.hasOwnProperty.call(stored, key)) {
                  merged[key] = stored[key];
                }
              }
              return merged;
            });
            return { id: record.id, matrixData: JSON.stringify(rows) };
          });
          const updatedAt = new Date();
          for (const matrix of matrices) {
            await tx.update(processFODA)
              .set({ matrixData: matrix.matrixData, updatedAt })
              .where(and(eq(processFODA.id, matrix.id), eq(processFODA.processId, input.processId)));
          }
        } else {
          await tx.insert(processFODA).values({
            processId: input.processId,
            matrixData,
            strengths: null,
            opportunities: null,
            weaknesses: null,
            threats: null,
          });
        }

        return { success: true, message: "Matriz guardada exitosamente" };
      });
    }),
});
