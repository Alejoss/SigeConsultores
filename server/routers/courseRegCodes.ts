import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, companyProcedure, router } from "../_core/trpc";
import { getCompanyRegCode, listCompanyRegCodes, saveCompanyRegCode } from "../onlineCourses/service";

const codeInput = z.string().max(32);

function managerCompanyId(ctx: { manager: { companyId: number } | null }): number {
  if (!ctx.manager?.companyId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo el gerente de la empresa cambia este código." });
  }
  return ctx.manager.companyId;
}

/** Course registration code, edited from the ISGE 360 manager and admin dashboards. */
export const courseRegCodesRouter = router({
  mine: companyProcedure.query(({ ctx }) => getCompanyRegCode(managerCompanyId(ctx))),

  setMine: companyProcedure
    .input(z.object({ regCode: codeInput }))
    .mutation(({ ctx, input }) => saveCompanyRegCode(managerCompanyId(ctx), input.regCode)),

  list: adminProcedure.query(() => listCompanyRegCodes()),

  set: adminProcedure
    .input(z.object({ companyId: z.number().int().positive(), regCode: codeInput.optional() }))
    .mutation(({ input }) => saveCompanyRegCode(input.companyId, input.regCode, { generateIfBlank: true })),
});
