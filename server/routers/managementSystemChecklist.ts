import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  linkedCommitments,
  managementSystemChecklistActions,
  managementSystemChecklistItems,
  managementSystems,
} from "../../drizzle/schema";

const verificationModeSchema = z.enum(["vigencia", "planificacion", "ambas"]);

const optionalText = z.string().trim().max(500000).optional();
const optionalDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
  .optional();

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function checklistImportKey(standardCode?: string, standardName?: string) {
  const code = normalizeKey(standardCode || "");
  return code ? `code:${code}` : `name:${normalizeKey(standardName || "")}`;
}

function inputDate(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function dateValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calculateItemStatus(item: any, actions: any[]) {
  if (!item.applicable) {
    return {
      status: "no_aplicable" as const,
      compliant: false,
      daysRemaining: null,
    };
  }

  const today = todayIso();
  const validFrom = dateValue(item.validFrom);
  const validUntil = dateValue(item.validUntil);
  const hasVigencyDates = Boolean(validFrom && validUntil);
  const vigencyMet =
    hasVigencyDates && validFrom! <= today && today <= validUntil!;
  const planningMet =
    actions.length > 0 && actions.every(action => Boolean(action.completed));

  const compliant =
    item.verificationMode === "vigencia"
      ? vigencyMet
      : item.verificationMode === "planificacion"
        ? planningMet
        : vigencyMet && planningMet;

  const daysRemaining = validUntil
    ? Math.floor(
        (Date.parse(`${validUntil}T00:00:00Z`) -
          Date.parse(`${today}T00:00:00Z`)) /
          86400000
      )
    : null;

  let status: "cumplido" | "pendiente" | "vencido" = "pendiente";
  if (compliant) status = "cumplido";
  else if (
    (item.verificationMode === "vigencia" ||
      item.verificationMode === "ambas") &&
    validUntil &&
    validUntil < today
  )
    status = "vencido";

  return {
    status,
    compliant,
    daysRemaining,
    vigencyMet,
    planningMet,
    hasVigencyDates,
  };
}

async function assertManagementSystemOwnership(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  managementSystemId: number,
  companyId: number
) {
  const [system] = await db
    .select()
    .from(managementSystems)
    .where(
      and(
        eq(managementSystems.id, managementSystemId),
        eq(managementSystems.companyId, companyId)
      )
    );
  if (!system) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Sistema de gestión no encontrado para esta empresa",
    });
  }
  return system;
}

const checklistItemInput = z.object({
  standardCode: z.string().trim().max(120).optional(),
  standardName: z.string().trim().min(1).max(500), // El texto extenso se conserva en description.
  description: optionalText,
  verificationMode: verificationModeSchema.optional(),
  applicable: z.boolean().optional(),
  notApplicableReason: optionalText,
  validFrom: optionalDate,
  validUntil: optionalDate,
  responsible: z.string().trim().max(255).optional(),
  action: z.string().trim().max(4000).optional(),
  actionResponsible: z.string().trim().max(255).optional(),
  implementationDate: optionalDate,
  completed: z.boolean().optional(),
});

export const managementSystemChecklistRouter = router({
  getChecklist: companyProcedure
    .input(z.object({ managementSystemId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const system = await assertManagementSystemOwnership(
        db,
        input.managementSystemId,
        input.companyId
      );
      const items = await db
        .select()
        .from(managementSystemChecklistItems)
        .where(
          and(
            eq(
              managementSystemChecklistItems.managementSystemId,
              input.managementSystemId
            ),
            eq(managementSystemChecklistItems.companyId, input.companyId)
          )
        )
        .orderBy(
          asc(managementSystemChecklistItems.orderIndex),
          asc(managementSystemChecklistItems.id)
        );

      const itemIds = items.map(item => item.id);
      const actions = itemIds.length
        ? await db
            .select()
            .from(managementSystemChecklistActions)
            .where(
              inArray(managementSystemChecklistActions.checklistItemId, itemIds)
            )
            .orderBy(
              asc(managementSystemChecklistActions.orderIndex),
              asc(managementSystemChecklistActions.id)
            )
        : [];
      const actionsByItem = new Map<number, any[]>();
      for (const action of actions) {
        actionsByItem.set(action.checklistItemId, [
          ...(actionsByItem.get(action.checklistItemId) || []),
          action,
        ]);
      }

      const decoratedItems = items.map(item => {
        const itemActions = actionsByItem.get(item.id) || [];
        return {
          ...item,
          actions: itemActions,
          ...calculateItemStatus(item, itemActions),
        };
      });
      const applicableItems = decoratedItems.filter(item => item.applicable);
      const compliantItems = applicableItems.filter(item => item.compliant);
      const expiringLimit = plusDaysIso(30);
      const summary = {
        total: decoratedItems.length,
        applicable: applicableItems.length,
        compliant: compliantItems.length,
        percentage: applicableItems.length
          ? Math.round((compliantItems.length / applicableItems.length) * 100)
          : 0,
        pending: applicableItems.filter(
          item => !item.compliant && item.status !== "vencido"
        ).length,
        expired: applicableItems.filter(item => item.status === "vencido")
          .length,
        expiringSoon: applicableItems.filter(item => {
          const validUntil = dateValue(item.validUntil);
          return (
            validUntil &&
            validUntil >= todayIso() &&
            validUntil <= expiringLimit
          );
        }).length,
        nonApplicable: decoratedItems.filter(item => !item.applicable).length,
        pendingActions: actions.filter(action => !action.completed).length,
      };

      return { system, items: decoratedItems, summary };
    }),

  getChecklistSummaries: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      const systems = await db
        .select({ id: managementSystems.id })
        .from(managementSystems)
        .where(eq(managementSystems.companyId, input.companyId));
      if (!systems.length) return [];
      const systemIds = systems.map(system => system.id);
      const items = await db
        .select()
        .from(managementSystemChecklistItems)
        .where(
          and(
            eq(managementSystemChecklistItems.companyId, input.companyId),
            inArray(
              managementSystemChecklistItems.managementSystemId,
              systemIds
            )
          )
        );
      const itemIds = items.map(item => item.id);
      const actions = itemIds.length
        ? await db
            .select()
            .from(managementSystemChecklistActions)
            .where(
              inArray(managementSystemChecklistActions.checklistItemId, itemIds)
            )
        : [];
      const actionsByItem = new Map<number, any[]>();
      for (const action of actions)
        actionsByItem.set(action.checklistItemId, [
          ...(actionsByItem.get(action.checklistItemId) || []),
          action,
        ]);
      return systemIds.map(managementSystemId => {
        const systemItems = items
          .filter(item => item.managementSystemId === managementSystemId)
          .map(item => ({
            ...item,
            ...calculateItemStatus(item, actionsByItem.get(item.id) || []),
          }));
        const applicable = systemItems.filter(item => item.applicable);
        const compliant = applicable.filter(item => item.compliant);
        return {
          managementSystemId,
          total: systemItems.length,
          applicable: applicable.length,
          compliant: compliant.length,
          percentage: applicable.length
            ? Math.round((compliant.length / applicable.length) * 100)
            : 0,
          pending: applicable.filter(
            item => !item.compliant && item.status !== "vencido"
          ).length,
          expired: applicable.filter(item => item.status === "vencido").length,
        };
      });
    }),

  createChecklistItem: companyProcedure
    .input(
      z
        .object({ managementSystemId: z.number(), companyId: z.number() })
        .merge(checklistItemInput)
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      await assertManagementSystemOwnership(
        db,
        input.managementSystemId,
        input.companyId
      );
      const existing = await db
        .select({ id: managementSystemChecklistItems.id })
        .from(managementSystemChecklistItems)
        .where(
          and(
            eq(
              managementSystemChecklistItems.managementSystemId,
              input.managementSystemId
            ),
            eq(managementSystemChecklistItems.companyId, input.companyId)
          )
        );
      const importKey = checklistImportKey(
        input.standardCode,
        input.standardName
      );
      const result = await db.insert(managementSystemChecklistItems).values({
        managementSystemId: input.managementSystemId,
        companyId: input.companyId,
        importKey,
        standardCode: input.standardCode || null,
        standardName: input.standardName,
        description: input.description || null,
        verificationMode: input.verificationMode || "planificacion",
        applicable: input.applicable ?? true,
        notApplicableReason: input.notApplicableReason || null,
        validFrom: inputDate(input.validFrom),
        validUntil: inputDate(input.validUntil),
        responsible: input.responsible || null,
        orderIndex: existing.length,
      });
      const itemId = Number(result[0].insertId);
      if (input.action) {
        await db.insert(managementSystemChecklistActions).values({
          checklistItemId: itemId,
          action: input.action,
          responsible: input.actionResponsible || null,
          implementationDate: inputDate(input.implementationDate),
          completed: input.completed ?? false,
          completedAt: input.completed ? new Date() : null,
          orderIndex: 0,
        });
      }
      return { id: itemId };
    }),

  updateChecklistItem: companyProcedure
    .input(
      z
        .object({
          id: z.number(),
          companyId: z.number(),
          managementSystemId: z.number(),
        })
        .merge(checklistItemInput.partial())
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      await assertManagementSystemOwnership(
        db,
        input.managementSystemId,
        input.companyId
      );
      const [item] = await db
        .select()
        .from(managementSystemChecklistItems)
        .where(
          and(
            eq(managementSystemChecklistItems.id, input.id),
            eq(
              managementSystemChecklistItems.managementSystemId,
              input.managementSystemId
            ),
            eq(managementSystemChecklistItems.companyId, input.companyId)
          )
        );
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Estándar no encontrado",
        });
      if (input.validFrom !== undefined || input.validUntil !== undefined) {
        const links = await db
          .select({ id: linkedCommitments.id })
          .from(linkedCommitments)
          .where(
            and(
              eq(linkedCommitments.companyId, input.companyId),
              eq(linkedCommitments.sourceType, "checklist_vigency"),
              eq(linkedCommitments.sourceId, item.id),
              eq(linkedCommitments.sourceSubId, item.id)
            )
          )
          .limit(1);
        if (links[0])
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Esta vigencia está vinculada a procesos. La renovación se actualiza desde Compromisos vinculados.",
          });
      }
      const standardCode =
        input.standardCode !== undefined
          ? input.standardCode
          : item.standardCode || undefined;
      const standardName =
        input.standardName !== undefined
          ? input.standardName
          : item.standardName;
      await db
        .update(managementSystemChecklistItems)
        .set({
          ...(input.standardCode !== undefined && {
            standardCode: input.standardCode || null,
          }),
          ...(input.standardName !== undefined && {
            standardName: input.standardName,
          }),
          ...(input.description !== undefined && {
            description: input.description || null,
          }),
          ...(input.verificationMode !== undefined && {
            verificationMode: input.verificationMode,
          }),
          ...(input.applicable !== undefined && {
            applicable: input.applicable,
          }),
          ...(input.notApplicableReason !== undefined && {
            notApplicableReason: input.notApplicableReason || null,
          }),
          ...(input.validFrom !== undefined && {
            validFrom: inputDate(input.validFrom),
          }),
          ...(input.validUntil !== undefined && {
            validUntil: inputDate(input.validUntil),
          }),
          ...(input.responsible !== undefined && {
            responsible: input.responsible || null,
          }),
          importKey: checklistImportKey(standardCode, standardName),
        })
        .where(eq(managementSystemChecklistItems.id, item.id));
      return { success: true };
    }),

  deleteChecklistItem: companyProcedure
    .input(
      z.object({
        id: z.number(),
        companyId: z.number(),
        managementSystemId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      await assertManagementSystemOwnership(
        db,
        input.managementSystemId,
        input.companyId
      );
      const [item] = await db
        .select({ id: managementSystemChecklistItems.id })
        .from(managementSystemChecklistItems)
        .where(
          and(
            eq(managementSystemChecklistItems.id, input.id),
            eq(
              managementSystemChecklistItems.managementSystemId,
              input.managementSystemId
            ),
            eq(managementSystemChecklistItems.companyId, input.companyId)
          )
        );
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Estándar no encontrado",
        });
      const vigencyLinks = await db
        .select({ id: linkedCommitments.id })
        .from(linkedCommitments)
        .where(
          and(
            eq(linkedCommitments.companyId, input.companyId),
            eq(linkedCommitments.sourceType, "checklist_vigency"),
            eq(linkedCommitments.sourceId, item.id),
            eq(linkedCommitments.sourceSubId, item.id)
          )
        )
        .limit(1);
      if (vigencyLinks[0])
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No se puede eliminar un estándar con una vigencia vinculada. Retire primero sus vínculos.",
        });
      const itemActions = await db
        .select({ id: managementSystemChecklistActions.id })
        .from(managementSystemChecklistActions)
        .where(eq(managementSystemChecklistActions.checklistItemId, item.id));
      for (const action of itemActions) {
        const actionLinks = await db
          .select({ id: linkedCommitments.id })
          .from(linkedCommitments)
          .where(
            and(
              eq(linkedCommitments.companyId, input.companyId),
              eq(linkedCommitments.sourceType, "checklist_action"),
              eq(linkedCommitments.sourceId, action.id),
              eq(linkedCommitments.sourceSubId, item.id)
            )
          )
          .limit(1);
        if (actionLinks[0])
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "No se puede eliminar un estándar con acciones vinculadas. Retire primero sus vínculos.",
          });
      }
      await db
        .delete(managementSystemChecklistActions)
        .where(eq(managementSystemChecklistActions.checklistItemId, item.id));
      await db
        .delete(managementSystemChecklistItems)
        .where(eq(managementSystemChecklistItems.id, item.id));
      return { success: true };
    }),

  createChecklistAction: companyProcedure
    .input(
      z.object({
        checklistItemId: z.number(),
        managementSystemId: z.number(),
        companyId: z.number(),
        action: z.string().trim().min(1).max(4000),
        responsible: z.string().trim().max(255).optional(),
        implementationDate: optionalDate,
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      await assertManagementSystemOwnership(
        db,
        input.managementSystemId,
        input.companyId
      );
      const [item] = await db
        .select({ id: managementSystemChecklistItems.id })
        .from(managementSystemChecklistItems)
        .where(
          and(
            eq(managementSystemChecklistItems.id, input.checklistItemId),
            eq(
              managementSystemChecklistItems.managementSystemId,
              input.managementSystemId
            ),
            eq(managementSystemChecklistItems.companyId, input.companyId)
          )
        );
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Estándar no encontrado",
        });
      const existing = await db
        .select({ id: managementSystemChecklistActions.id })
        .from(managementSystemChecklistActions)
        .where(eq(managementSystemChecklistActions.checklistItemId, item.id));
      const result = await db.insert(managementSystemChecklistActions).values({
        checklistItemId: item.id,
        action: input.action,
        responsible: input.responsible || null,
        implementationDate: inputDate(input.implementationDate),
        orderIndex: existing.length,
      });
      return { id: Number(result[0].insertId) };
    }),

  updateChecklistAction: companyProcedure
    .input(
      z.object({
        id: z.number(),
        checklistItemId: z.number(),
        managementSystemId: z.number(),
        companyId: z.number(),
        action: z.string().trim().min(1).max(4000).optional(),
        responsible: z.string().trim().max(255).optional(),
        implementationDate: optionalDate,
        completed: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      await assertManagementSystemOwnership(
        db,
        input.managementSystemId,
        input.companyId
      );
      const [item] = await db
        .select({ id: managementSystemChecklistItems.id })
        .from(managementSystemChecklistItems)
        .where(
          and(
            eq(managementSystemChecklistItems.id, input.checklistItemId),
            eq(
              managementSystemChecklistItems.managementSystemId,
              input.managementSystemId
            ),
            eq(managementSystemChecklistItems.companyId, input.companyId)
          )
        );
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Estándar no encontrado",
        });
      const [action] = await db
        .select()
        .from(managementSystemChecklistActions)
        .where(
          and(
            eq(managementSystemChecklistActions.id, input.id),
            eq(managementSystemChecklistActions.checklistItemId, item.id)
          )
        );
      if (!action)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Acción no encontrada",
        });
      if (input.completed !== undefined) {
        const links = await db
          .select({ id: linkedCommitments.id })
          .from(linkedCommitments)
          .where(
            and(
              eq(linkedCommitments.companyId, input.companyId),
              eq(linkedCommitments.sourceType, "checklist_action"),
              eq(linkedCommitments.sourceId, action.id),
              eq(linkedCommitments.sourceSubId, item.id)
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
        .update(managementSystemChecklistActions)
        .set({
          ...(input.action !== undefined && { action: input.action }),
          ...(input.responsible !== undefined && {
            responsible: input.responsible || null,
          }),
          ...(input.implementationDate !== undefined && {
            implementationDate: inputDate(input.implementationDate),
          }),
          ...(input.completed !== undefined && {
            completed: input.completed,
            completedAt: input.completed ? new Date() : null,
          }),
        })
        .where(eq(managementSystemChecklistActions.id, action.id));
      return { success: true };
    }),

  deleteChecklistAction: companyProcedure
    .input(
      z.object({
        id: z.number(),
        checklistItemId: z.number(),
        managementSystemId: z.number(),
        companyId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      await assertManagementSystemOwnership(
        db,
        input.managementSystemId,
        input.companyId
      );
      const [item] = await db
        .select({ id: managementSystemChecklistItems.id })
        .from(managementSystemChecklistItems)
        .where(
          and(
            eq(managementSystemChecklistItems.id, input.checklistItemId),
            eq(
              managementSystemChecklistItems.managementSystemId,
              input.managementSystemId
            ),
            eq(managementSystemChecklistItems.companyId, input.companyId)
          )
        );
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Estándar no encontrado",
        });
      const links = await db
        .select({ id: linkedCommitments.id })
        .from(linkedCommitments)
        .where(
          and(
            eq(linkedCommitments.companyId, input.companyId),
            eq(linkedCommitments.sourceType, "checklist_action"),
            eq(linkedCommitments.sourceId, input.id),
            eq(linkedCommitments.sourceSubId, item.id)
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
        .delete(managementSystemChecklistActions)
        .where(
          and(
            eq(managementSystemChecklistActions.id, input.id),
            eq(managementSystemChecklistActions.checklistItemId, item.id)
          )
        );
      return { success: true };
    }),

  importChecklist: companyProcedure
    .input(
      z.object({
        managementSystemId: z.number(),
        companyId: z.number(),
        items: z.array(checklistItemInput).min(1).max(2000),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB no disponible",
        });
      await assertManagementSystemOwnership(
        db,
        input.managementSystemId,
        input.companyId
      );
      const existingItems = await db
        .select()
        .from(managementSystemChecklistItems)
        .where(
          and(
            eq(
              managementSystemChecklistItems.managementSystemId,
              input.managementSystemId
            ),
            eq(managementSystemChecklistItems.companyId, input.companyId)
          )
        );
      const itemByKey = new Map<string, { id: number }>(
        existingItems.map(item => [item.importKey, { id: item.id }])
      );
      let created = 0;
      let updated = 0;
      let actionsAdded = 0;

      for (const source of input.items) {
        const importKey = checklistImportKey(
          source.standardCode,
          source.standardName
        );
        const existing = itemByKey.get(importKey);
        let itemId: number;
        if (existing) {
          await db
            .update(managementSystemChecklistItems)
            .set({
              ...(source.standardCode !== undefined &&
                source.standardCode !== "" && {
                  standardCode: source.standardCode,
                }),
              ...(source.standardName !== undefined &&
                source.standardName !== "" && {
                  standardName: source.standardName,
                }),
              ...(source.description !== undefined &&
                source.description !== "" && {
                  description: source.description,
                }),
              ...(source.verificationMode !== undefined && {
                verificationMode: source.verificationMode,
              }),
              ...(source.applicable !== undefined && {
                applicable: source.applicable,
              }),
              ...(source.notApplicableReason !== undefined &&
                source.notApplicableReason !== "" && {
                  notApplicableReason: source.notApplicableReason,
                }),
              ...(source.validFrom !== undefined && {
                validFrom: inputDate(source.validFrom),
              }),
              ...(source.validUntil !== undefined && {
                validUntil: inputDate(source.validUntil),
              }),
              ...(source.responsible !== undefined &&
                source.responsible !== "" && {
                  responsible: source.responsible,
                }),
            })
            .where(eq(managementSystemChecklistItems.id, existing.id));
          itemId = existing.id;
          updated += 1;
        } else {
          const result = await db
            .insert(managementSystemChecklistItems)
            .values({
              managementSystemId: input.managementSystemId,
              companyId: input.companyId,
              importKey,
              standardCode: source.standardCode || null,
              standardName: source.standardName,
              description: source.description || null,
              verificationMode: source.verificationMode || "planificacion",
              applicable: source.applicable ?? true,
              notApplicableReason: source.notApplicableReason || null,
              validFrom: inputDate(source.validFrom),
              validUntil: inputDate(source.validUntil),
              responsible: source.responsible || null,
              orderIndex: existingItems.length + created,
            });
          itemId = Number(result[0].insertId);
          itemByKey.set(importKey, { id: itemId });
          created += 1;
        }

        if (source.action) {
          const existingActions = await db
            .select()
            .from(managementSystemChecklistActions)
            .where(
              eq(managementSystemChecklistActions.checklistItemId, itemId)
            );
          const matchingAction = existingActions.find(
            action =>
              normalizeKey(action.action) === normalizeKey(source.action!)
          );
          if (matchingAction) {
            await db
              .update(managementSystemChecklistActions)
              .set({
                ...(source.actionResponsible !== undefined &&
                  source.actionResponsible !== "" && {
                    responsible: source.actionResponsible,
                  }),
                ...(source.implementationDate !== undefined && {
                  implementationDate: inputDate(source.implementationDate),
                }),
                ...(source.completed !== undefined && {
                  completed: source.completed,
                  completedAt: source.completed ? new Date() : null,
                }),
              })
              .where(
                eq(managementSystemChecklistActions.id, matchingAction.id)
              );
          } else {
            await db.insert(managementSystemChecklistActions).values({
              checklistItemId: itemId,
              action: source.action,
              responsible: source.actionResponsible || null,
              implementationDate: inputDate(source.implementationDate),
              completed: source.completed ?? false,
              completedAt: source.completed ? new Date() : null,
              orderIndex: existingActions.length,
            });
            actionsAdded += 1;
          }
        }
      }
      return { created, updated, actionsAdded };
    }),
});
