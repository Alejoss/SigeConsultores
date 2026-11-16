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

/** Conserva únicamente un vínculo eliminado que ya existía en esa misma fila. */
function unchangedHistoricalLink(
  item: FodaPayloadItem,
  previous: FodaPayloadItem[],
  objectiveTextField: "policyObjective" | "objetivoPolitica"
): boolean {
  const matches = previous.filter(stored => {
    if (Number(stored.policyObjectiveId) !== Number(item.policyObjectiveId)) return false;
    if (item.fodaElementId) return stored.fodaElementId === item.fodaElementId;
    if (item.id !== undefined && item.id !== null) return String(stored.id) === String(item.id);
    // Formatos antiguos sin identidad: no trasladar un vínculo histórico a otro hallazgo.
    return !stored.fodaElementId && stored.id == null
      && stored.statement === item.statement && stored.subprocess === item.subprocess;
  });
  return matches.length === 1 && [objectiveTextField, "policyObjectiveDescription",
    ...(objectiveTextField === "policyObjective" ? ["selectedObjectiveContent"] : [])]
    .every(key => (matches[0][key] ?? "") === (item[key] ?? ""));
}

/** Valida cada ID, admite repetidos y no confunde objetivos eliminados con ajenos. */
async function normalizeObjectiveLinks(
  db: Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "select">,
  companyId: number,
  serialized: string,
  field: string,
  objectiveTextField: "policyObjective" | "objetivoPolitica",
  previous: FodaPayloadItem[] = []
): Promise<string> {
  const entries = parsePayloadArray(serialized, field);
  const rawIds = entries.map(item => item.policyObjectiveId)
    .filter(value => value !== null && value !== undefined && value !== "");
  if (rawIds.length === 0) return JSON.stringify(entries);
  if (rawIds.some(value => !["number", "string"].includes(typeof value)
    || !Number.isInteger(Number(value)) || Number(value) <= 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El identificador del Objetivo de la Política no es válido." });
  }
  const requestedIds = Array.from(new Set(rawIds.map(Number)));
  const companyPolicies = await db.select({ id: policies.id }).from(policies)
    .where(eq(policies.companyId, companyId));
  const policyIds = new Set(companyPolicies.map(policy => policy.id));
  // Consultar IDs existentes permite distinguir una eliminación de una referencia ajena.
  const objectives = await db.select({ id: policyObjectives.id, policyId: policyObjectives.policyId,
    objective: policyObjectives.objective, description: policyObjectives.description })
    .from(policyObjectives).where(inArray(policyObjectives.id, requestedIds));
  const byId = new Map(objectives.map(objective => [objective.id, objective]));
  return JSON.stringify(entries.map(item => {
    const rawId = item.policyObjectiveId;
    if (rawId === null || rawId === undefined || rawId === "") return item;
    const objective = byId.get(Number(rawId));
    if (!objective) {
      if (unchangedHistoricalLink(item, previous, objectiveTextField)) return item;
      throw new TRPCError({ code: "BAD_REQUEST",
        message: "El Objetivo de la Política seleccionado ya no está disponible. Selecciona un objetivo vigente de esta empresa." });
    }
    if (!policyIds.has(objective.policyId) && objective.policyId !== companyId) {
      throw new TRPCError({ code: "BAD_REQUEST",
        message: "El Objetivo de la Política seleccionado no pertenece a la empresa de este proceso." });
    }
    return { ...item, policyObjectiveId: objective.id,
      [objectiveTextField]: objective.objective, policyObjectiveDescription: objective.description || "",
      ...(objectiveTextField === "policyObjective"
        ? { selectedObjectiveContent: `${objective.objective}\n\n${objective.description || ""}` } : {}) };
  }));
}

export const processFODARouter = router({
  /** La empresa se obtiene del proceso autorizado, nunca de una política recordada por el navegador. */
  listPolicyObjectives: companyProcedure
    .input(z.object({ processId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const process = await assertProcessAccessById(ctx, input.processId);
      const db = await getDb();
      if (!db) return [];
      const companyPolicies = await db.select({ id: policies.id }).from(policies)
        .where(eq(policies.companyId, process.companyId));
      const policyIds = companyPolicies.map(policy => policy.id);
      return db.select().from(policyObjectives).where(policyIds.length
        ? or(inArray(policyObjectives.policyId, policyIds), eq(policyObjectives.policyId, process.companyId))
        : eq(policyObjectives.policyId, process.companyId))
        .orderBy(policyObjectives.orderIndex, policyObjectives.id);
    }),

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

      const existing = await db.select().from(processFODA)
        .where(eq(processFODA.processId, input.processId))
        .orderBy(desc(processFODA.updatedAt));
      const previous = existing[0];
      const [strengths, opportunities, weaknesses, threats] = await Promise.all([
        normalizeObjectiveLinks(db, process.companyId, input.strengths || "[]", "fortalezas", "policyObjective", parsePayloadArray(previous?.strengths || "[]", "fortalezas existentes")),
        normalizeObjectiveLinks(db, process.companyId, input.opportunities || "[]", "oportunidades", "policyObjective", parsePayloadArray(previous?.opportunities || "[]", "oportunidades existentes")),
        normalizeObjectiveLinks(db, process.companyId, input.weaknesses || "[]", "debilidades", "policyObjective", parsePayloadArray(previous?.weaknesses || "[]", "debilidades existentes")),
        normalizeObjectiveLinks(db, process.companyId, input.threats || "[]", "amenazas", "policyObjective", parsePayloadArray(previous?.threats || "[]", "amenazas existentes")),
      ]);

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
      return db.transaction(async tx => {
        const existing = await tx.select().from(processFODA)
          .where(eq(processFODA.processId, input.processId))
          .orderBy(processFODA.id)
          .for("update");
        const previous = [...existing].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
        const matrixData = await normalizeObjectiveLinks(tx, process.companyId, input.matrixData,
          "matriz OTG", "objetivoPolitica", parsePayloadArray(previous?.matrixData ?? "[]", "matriz OTG existente"));
        const incomingRows = parsePayloadArray(matrixData, "matriz OTG");
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
