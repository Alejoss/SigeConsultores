import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  processCharacterizations,
  processParticipants,
  processResources,
  procedures,
  subprocessMaps,
  subprocessMapEntries,
  subprocessMapSubprocesses,
  subprocessMapOutputs,
  processes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { companyProcedure, router } from "../_core/trpc";

const copyModuleSchema = z.enum([
  "participants",
  "resources",
  "subprocessMap",
  "procedures",
]);
const copyInput = z.object({
  companyId: z.number().int().positive(),
  sourceProcessId: z.number().int().positive(),
  targetProcessIds: z.array(z.number().int().positive()).min(1),
  modules: z.array(copyModuleSchema).min(1),
});

type CopyModule = z.infer<typeof copyModuleSchema>;

function assertCopyAccess(
  ctx: {
    processLeader?: unknown;
    manager?: { companyId: number } | null;
    user?: { role?: string } | null;
  },
  companyId: number
) {
  if (ctx.manager && ctx.manager.companyId !== companyId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tiene acceso a la empresa solicitada.",
    });
  }
  if (ctx.processLeader) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Sólo el Administrador o Gerente puede copiar información entre procesos.",
    });
  }
}

async function getValidProcesses(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  sourceProcessId: number,
  targetProcessIds: number[]
) {
  const uniqueTargets = targetProcessIds.filter(
    (id, index, values) =>
      values.indexOf(id) === index && id !== sourceProcessId
  );
  if (!uniqueTargets.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Selecciona al menos un proceso destino diferente al origen.",
    });
  }

  const rows = await db
    .select()
    .from(processes)
    .where(
      and(
        eq(processes.companyId, companyId),
        inArray(processes.id, [sourceProcessId, ...uniqueTargets])
      )
    );
  const byId = new Map(rows.map(row => [row.id, row]));
  if (!byId.has(sourceProcessId) || uniqueTargets.some(id => !byId.has(id))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "El origen y todos los destinos deben pertenecer a la misma empresa.",
    });
  }
  return {
    source: byId.get(sourceProcessId)!,
    targets: uniqueTargets.map(id => byId.get(id)!),
  };
}

async function sourceSnapshot(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  sourceProcessId: number
) {
  const [characterization] = await db
    .select()
    .from(processCharacterizations)
    .where(eq(processCharacterizations.processId, sourceProcessId))
    .limit(1);
  // Compatibilidad: algunas caracterizaciones históricas guardaron puestos y recursos
  // con el id del proceso, no con el id de la caracterización. Se leen ambos sin modificar el origen.
  const sourceParticipants = characterization
    ? await db
        .select()
        .from(processParticipants)
        .where(
          inArray(processParticipants.processCharacterizationId, [
            characterization.id,
            sourceProcessId,
          ])
        )
    : [];
  const sourceResources = characterization
    ? await db
        .select()
        .from(processResources)
        .where(
          inArray(processResources.processCharacterizationId, [
            characterization.id,
            sourceProcessId,
          ])
        )
    : [];
  const [sourceMap] = await db
    .select()
    .from(subprocessMaps)
    .where(eq(subprocessMaps.processId, sourceProcessId))
    .limit(1);
  const sourceMapEntries = sourceMap
    ? await db
        .select()
        .from(subprocessMapEntries)
        .where(eq(subprocessMapEntries.subprocessMapId, sourceMap.id))
    : [];
  const sourceMapSubprocesses = sourceMap
    ? await db
        .select()
        .from(subprocessMapSubprocesses)
        .where(eq(subprocessMapSubprocesses.subprocessMapId, sourceMap.id))
    : [];
  const sourceMapOutputs = sourceMap
    ? await db
        .select()
        .from(subprocessMapOutputs)
        .where(eq(subprocessMapOutputs.subprocessMapId, sourceMap.id))
    : [];
  const sourceProcedures = await db
    .select()
    .from(procedures)
    .where(eq(procedures.processId, sourceProcessId));
  return {
    characterization,
    sourceParticipants,
    sourceResources,
    sourceMap,
    sourceMapEntries,
    sourceMapSubprocesses,
    sourceMapOutputs,
    sourceProcedures,
  };
}

async function targetOccupancy(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  targetProcessId: number
) {
  const [characterization] = await db
    .select()
    .from(processCharacterizations)
    .where(eq(processCharacterizations.processId, targetProcessId))
    .limit(1);
  // También se protege contenido histórico del destino para que nunca sea sobrescrito.
  const participantCount = characterization
    ? (
        await db
          .select({ id: processParticipants.id })
          .from(processParticipants)
          .where(
            inArray(processParticipants.processCharacterizationId, [
              characterization.id,
              targetProcessId,
            ])
          )
      ).length
    : 0;
  const resourceCount = characterization
    ? (
        await db
          .select({ id: processResources.id })
          .from(processResources)
          .where(
            inArray(processResources.processCharacterizationId, [
              characterization.id,
              targetProcessId,
            ])
          )
      ).length
    : 0;
  const mapCount = (
    await db
      .select({ id: subprocessMaps.id })
      .from(subprocessMaps)
      .where(eq(subprocessMaps.processId, targetProcessId))
  ).length;
  const procedureCount = (
    await db
      .select({ id: procedures.id })
      .from(procedures)
      .where(eq(procedures.processId, targetProcessId))
  ).length;
  return {
    characterization,
    participantCount,
    resourceCount,
    mapCount,
    procedureCount,
  };
}

function resultForModules(
  modules: CopyModule[],
  source: Awaited<ReturnType<typeof sourceSnapshot>>,
  occupancy: Awaited<ReturnType<typeof targetOccupancy>>
) {
  return modules.map(module => {
    const sourceCount =
      module === "participants"
        ? source.sourceParticipants.length
        : module === "resources"
          ? source.sourceResources.length
          : module === "subprocessMap"
            ? source.sourceMap
              ? 1
              : 0
            : source.sourceProcedures.length;
    const targetCount =
      module === "participants"
        ? occupancy.participantCount
        : module === "resources"
          ? occupancy.resourceCount
          : module === "subprocessMap"
            ? occupancy.mapCount
            : occupancy.procedureCount;
    return {
      module,
      sourceCount,
      targetCount,
      action:
        sourceCount === 0
          ? "without_source_data"
          : targetCount > 0
            ? "skipped_nonempty"
            : "ready",
    };
  });
}

export const processCharacterizationCopyRouter = router({
  preview: companyProcedure.input(copyInput).query(async ({ ctx, input }) => {
    assertCopyAccess(ctx, input.companyId);
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Base de datos no disponible",
      });
    const { source, targets } = await getValidProcesses(
      db,
      input.companyId,
      input.sourceProcessId,
      input.targetProcessIds
    );
    const snapshot = await sourceSnapshot(db, source.id);
    return {
      source: { id: source.id, name: source.name },
      targets: await Promise.all(
        targets.map(async target => ({
          id: target.id,
          name: target.name,
          modules: resultForModules(
            input.modules,
            snapshot,
            await targetOccupancy(db, target.id)
          ),
        }))
      ),
    };
  }),

  execute: companyProcedure
    .input(copyInput)
    .mutation(async ({ ctx, input }) => {
      assertCopyAccess(ctx, input.companyId);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible",
        });
      const { source, targets } = await getValidProcesses(
        db,
        input.companyId,
        input.sourceProcessId,
        input.targetProcessIds
      );
      const snapshot = await sourceSnapshot(db, source.id);
      const copied = [] as Array<{
        processId: number;
        processName: string;
        copied: Record<string, number>;
        skipped: CopyModule[];
      }>;

      for (const target of targets) {
        const targetResult = await db.transaction(async tx => {
          const occupancy = await targetOccupancy(tx as any, target.id);
          let characterization = occupancy.characterization;
          if (
            !characterization &&
            input.modules.some(
              module => module === "participants" || module === "resources"
            )
          ) {
            const inserted = await tx
              .insert(processCharacterizations)
              .values({ processId: target.id });
            const id = Number(
              (inserted as any)[0]?.insertId || (inserted as any).insertId
            );
            [characterization] = await tx
              .select()
              .from(processCharacterizations)
              .where(eq(processCharacterizations.id, id))
              .limit(1);
          }
          const counts: Record<string, number> = {};
          const skipped: CopyModule[] = [];
          const participantMap = new Map<
            number,
            { id: number; position: string }
          >();

          if (input.modules.includes("participants")) {
            if (occupancy.participantCount > 0) skipped.push("participants");
            else if (characterization) {
              for (const participant of snapshot.sourceParticipants) {
                const inserted = await tx.insert(processParticipants).values({
                  processCharacterizationId: characterization.id,
                  position: participant.position,
                  objective: participant.objective,
                  responsibility: participant.responsibility,
                  authority: participant.authority,
                  orderIndex: participant.orderIndex,
                });
                participantMap.set(participant.id, {
                  id: Number(
                    (inserted as any)[0]?.insertId || (inserted as any).insertId
                  ),
                  position: participant.position,
                });
              }
              counts.participants = snapshot.sourceParticipants.length;
            }
          }

          if (input.modules.includes("resources")) {
            if (occupancy.resourceCount > 0) skipped.push("resources");
            else if (characterization) {
              const existingTargetParticipants = await tx
                .select()
                .from(processParticipants)
                .where(
                  eq(
                    processParticipants.processCharacterizationId,
                    characterization.id
                  )
                );
              const targetByPosition = new Map(
                existingTargetParticipants.map(row => [
                  row.position.trim().toLocaleLowerCase(),
                  row,
                ])
              );
              let resourceCount = 0;
              for (const resource of snapshot.sourceResources) {
                const copiedParticipant = resource.participantId
                  ? participantMap.get(resource.participantId)
                  : undefined;
                const matchingParticipant =
                  copiedParticipant ||
                  targetByPosition.get(
                    (resource.participant || "").trim().toLocaleLowerCase()
                  );
                await tx.insert(processResources).values({
                  processCharacterizationId: characterization.id,
                  participantId: matchingParticipant?.id ?? null,
                  participant:
                    matchingParticipant?.position ??
                    resource.participant ??
                    null,
                  resourceType: resource.resourceType,
                  description: resource.description,
                  resourceName: resource.resourceName,
                  resourceElements: resource.resourceElements,
                  orderIndex: resource.orderIndex,
                });
                resourceCount += 1;
              }
              counts.resources = resourceCount;
            }
          }

          if (input.modules.includes("subprocessMap")) {
            if (occupancy.mapCount > 0) skipped.push("subprocessMap");
            else if (snapshot.sourceMap) {
              const inserted = await tx.insert(subprocessMaps).values({
                processId: target.id,
                entrada: snapshot.sourceMap.entrada,
                necesidades: snapshot.sourceMap.necesidades,
                subprocesos: snapshot.sourceMap.subprocesos,
                salida: snapshot.sourceMap.salida,
              });
              const mapId = Number(
                (inserted as any)[0]?.insertId || (inserted as any).insertId
              );
              if (snapshot.sourceMapEntries.length) {
                await tx.insert(subprocessMapEntries).values(
                  snapshot.sourceMapEntries.map(entry => ({
                    subprocessMapId: mapId,
                    partesInteresadas: entry.partesInteresadas,
                    internoExterno: entry.internoExterno,
                    clienteProveedor: entry.clienteProveedor,
                    necesidades: entry.necesidades,
                    orderIndex: entry.orderIndex,
                  }))
                );
              }
              if (snapshot.sourceMapSubprocesses.length) {
                await tx.insert(subprocessMapSubprocesses).values(
                  snapshot.sourceMapSubprocesses.map(subprocess => ({
                    subprocessMapId: mapId,
                    acciones: subprocess.acciones,
                    subproceso: subprocess.subproceso,
                    orderIndex: subprocess.orderIndex,
                  }))
                );
              }
              if (snapshot.sourceMapOutputs.length) {
                await tx.insert(subprocessMapOutputs).values(
                  snapshot.sourceMapOutputs.map(output => ({
                    subprocessMapId: mapId,
                    salidas: output.salidas,
                    doc: output.doc,
                    orderIndex: output.orderIndex,
                  }))
                );
              }
              counts.subprocessMap = 1;
            }
          }

          if (input.modules.includes("procedures")) {
            if (occupancy.procedureCount > 0) skipped.push("procedures");
            else {
              for (const procedure of snapshot.sourceProcedures) {
                await tx.insert(procedures).values({
                  processId: target.id,
                  name: procedure.name,
                  objective: procedure.objective,
                  code: procedure.code,
                  version: procedure.version,
                  createdDate: procedure.createdDate,
                  lastVersion: procedure.lastVersion,
                  procedureFileUrl: null,
                  procedureFileKey: null,
                  procedureFileSizeBytes: 0,
                  flowchartFileUrl: null,
                  flowchartFileKey: null,
                  flowchartFileSizeBytes: 0,
                });
              }
              counts.procedures = snapshot.sourceProcedures.length;
            }
          }
          return { counts, skipped };
        });
        copied.push({
          processId: target.id,
          processName: target.name,
          copied: targetResult.counts,
          skipped: targetResult.skipped,
        });
      }
      return { sourceProcessId: source.id, copied };
    }),
});
