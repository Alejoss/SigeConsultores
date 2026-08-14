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

  analytics: companyProcedure
    .input(z.object({ companyId: z.number(), area: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          activeCount: 0,
          inactiveCount: 0,
          averagePerformance: null as number | null,
          areas: [] as string[],
          recentTerminations: 0,
          periodRotationRate: 0,
          months: [] as Array<{ month: string; exits: number; averageHeadcount: number; rotationRate: number }>,
        };
      }

      const allEmployees = await db
        .select()
        .from(payrollEmployees)
        .where(eq(payrollEmployees.companyId, input.companyId));

      const areas = Array.from(new Set(allEmployees.map((employee) => employee.area).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
      const activeCount = allEmployees.filter((employee) => employee.status === "activo").length;
      const inactiveCount = allEmployees.filter((employee) => employee.status === "pasivo").length;
      const filteredEmployees = input.area ? allEmployees.filter((employee) => employee.area === input.area) : allEmployees;
      // MySQL devuelve los campos DATE como objetos Date; convertirlos con String(Date)
      // produce valores como "Wed Jul 15" que no son fechas válidas. Normalizamos ambos formatos.
      const asDate = (value: Date | string | null) => {
        if (!value) return null;
        if (value instanceof Date) {
          return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
        }
        const isoDate = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
        return isoDate ? new Date(`${isoDate}T12:00:00`) : null;
      };
      const today = new Date();
      const months: Array<{ month: string; exits: number; averageHeadcount: number; rotationRate: number }> = [];

      for (let offset = 11; offset >= 0; offset--) {
        const monthStart = new Date(today.getFullYear(), today.getMonth() - offset, 1, 12, 0, 0, 0);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - offset + 1, 0, 12, 0, 0, 0);
        const presentAtStart = filteredEmployees.filter((employee) => {
          const hired = asDate(employee.hireDate);
          const terminated = asDate(employee.terminationDate);
          return hired && hired <= monthStart && (!terminated || terminated >= monthStart);
        }).length;
        const presentAtEnd = filteredEmployees.filter((employee) => {
          const hired = asDate(employee.hireDate);
          const terminated = asDate(employee.terminationDate);
          return hired && hired <= monthEnd && (!terminated || terminated > monthEnd);
        }).length;
        const exits = filteredEmployees.filter((employee) => {
          const terminated = asDate(employee.terminationDate);
          return terminated && terminated >= monthStart && terminated <= monthEnd;
        }).length;
        const averageHeadcount = (presentAtStart + presentAtEnd) / 2;
        const rotationRate = averageHeadcount > 0 ? Number(((exits / averageHeadcount) * 100).toFixed(1)) : 0;
        months.push({
          month: new Intl.DateTimeFormat("es-EC", { month: "short", year: "numeric" }).format(monthStart).replace(".", ""),
          exits,
          averageHeadcount: Number(averageHeadcount.toFixed(1)),
          rotationRate,
        });
      }

      const recentTerminations = months.reduce((sum, month) => sum + month.exits, 0);
      const averagePeriodHeadcount = months.length > 0 ? months.reduce((sum, month) => sum + month.averageHeadcount, 0) / months.length : 0;
      const periodRotationRate = averagePeriodHeadcount > 0
        ? Number(((recentTerminations / averagePeriodHeadcount) * 100).toFixed(1))
        : 0;

      return {
        activeCount,
        inactiveCount,
        // Se conectará cuando esté disponible la evaluación de desempeño en Caracterización de Procesos.
        averagePerformance: null as number | null,
        areas,
        recentTerminations,
        periodRotationRate,
        months,
      };
    }),
});
