import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { payrollEmployees } from "../../drizzle/schema";
import { getDb } from "../db";
import { companyProcedure, router } from "../_core/trpc";

const employeeInput = z.object({
  companyId: z.number(),
  fullName: z.string().trim().min(2).max(255),
  identityCard: z.string().trim().min(5).max(20),
  hireDate: z.string().min(8),
  area: z.string().trim().min(1).max(255),
  position: z.string().trim().min(1).max(255),
});

const normalizeIdentityCard = (identityCard: string) => identityCard.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
const toDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`);

export const payrollRouter = router({
  list: companyProcedure
    .input(z.object({ companyId: z.number(), status: z.enum(["activo", "pasivo"]).default("activo") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, input.status)))
        .orderBy(asc(payrollEmployees.fullName));
    }),

  create: companyProcedure
    .input(employeeInput)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      const identityCard = normalizeIdentityCard(input.identityCard);
      const existing = await db
        .select({ id: payrollEmployees.id, status: payrollEmployees.status })
        .from(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.identityCard, identityCard)));
      if (existing.length > 0) {
        throw new Error(existing[0].status === "pasivo"
          ? "La C.I. ya pertenece a personal pasivo. No se puede duplicar el historial."
          : "Ya existe un trabajador activo con esta C.I.");
      }
      const result = await db.insert(payrollEmployees).values({
        companyId: input.companyId,
        fullName: input.fullName.trim(),
        identityCard,
        hireDate: toDate(input.hireDate),
        area: input.area.trim(),
        position: input.position.trim(),
        status: "activo",
      });
      return { success: true, id: Number(result[0].insertId) };
    }),

  update: companyProcedure
    .input(employeeInput.extend({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      const identityCard = normalizeIdentityCard(input.identityCard);
      const duplicate = await db
        .select({ id: payrollEmployees.id })
        .from(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.identityCard, identityCard)));
      if (duplicate.some((employee) => employee.id !== input.id)) {
        throw new Error("Ya existe un trabajador registrado con esta C.I.");
      }
      await db
        .update(payrollEmployees)
        .set({
          fullName: input.fullName.trim(),
          identityCard,
          hireDate: toDate(input.hireDate),
          area: input.area.trim(),
          position: input.position.trim(),
          updatedAt: new Date(),
        })
        .where(and(eq(payrollEmployees.id, input.id), eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));
      return { success: true };
    }),

  passToInactive: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), terminationDate: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      await db
        .update(payrollEmployees)
        .set({ status: "pasivo", terminationDate: toDate(input.terminationDate), updatedAt: new Date() })
        .where(and(eq(payrollEmployees.id, input.id), eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));
      return { success: true };
    }),

  deleteActive: companyProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      await db
        .delete(payrollEmployees)
        .where(and(eq(payrollEmployees.id, input.id), eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));
      return { success: true };
    }),

  clearActive: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      await db
        .delete(payrollEmployees)
        .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.status, "activo")));
      return { success: true };
    }),

  importBulk: companyProcedure
    .input(z.object({ companyId: z.number(), rows: z.array(employeeInput.omit({ companyId: true })).min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("No DB");
      let inserted = 0;
      let updated = 0;
      let skippedInactive = 0;
      for (const row of input.rows) {
        const identityCard = normalizeIdentityCard(row.identityCard);
        const existing = await db
          .select({ id: payrollEmployees.id, status: payrollEmployees.status })
          .from(payrollEmployees)
          .where(and(eq(payrollEmployees.companyId, input.companyId), eq(payrollEmployees.identityCard, identityCard)));
        const data = {
          fullName: row.fullName.trim(),
          identityCard,
          hireDate: toDate(row.hireDate),
          area: row.area.trim(),
          position: row.position.trim(),
          updatedAt: new Date(),
        };
        if (existing.length === 0) {
          await db.insert(payrollEmployees).values({ companyId: input.companyId, ...data, status: "activo" });
          inserted++;
        } else if (existing[0].status === "activo") {
          await db.update(payrollEmployees).set(data).where(eq(payrollEmployees.id, existing[0].id));
          updated++;
        } else {
          skippedInactive++;
        }
      }
      return { success: true, inserted, updated, skippedInactive };
    }),
});
