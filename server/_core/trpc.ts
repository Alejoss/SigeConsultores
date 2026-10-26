import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import {
  assertCompanyManagementFromRawInput,
  assertCompanyPersonnelManagementFromRawInput,
  assertCompanyReadFromRawInput,
} from "./companyPermissions";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Company data: platform admin, the company gerente, or a jefe de proceso.
// A normal platform login (role "user") is rejected here.
const requireUserOrManagerOrProcessLeader = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user && !ctx.manager && !ctx.processLeader) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (ctx.user && ctx.user.role !== "admin" && !ctx.manager && !ctx.processLeader) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tiene acceso a la información de la empresa.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      manager: ctx.manager,
      processLeader: ctx.processLeader,
    },
  });
});

/**
 * Standard guard for SIGE business data (read/write).
 * Accepts: platform admin, company manager, or process leader.
 * A normal platform login cannot read or change company data by changing the URL.
 * Use `protectedProcedure` only for OAuth-only platform flows.
 * Use `adminProcedure` for platform administration.
 */
export const companyProcedure = t.procedure.use(requireUserOrManagerOrProcessLeader);

/**
 * Mutation guard for company-wide modules. A process leader may read the
 * company, but may write company data only after the Manager authorizes that
 * account as a Coordinator. Procedures using this guard must receive a root
 * `companyId` in their input.
 */
export const companyManagementProcedure = companyProcedure.use(
  t.middleware(async opts => {
    await assertCompanyManagementFromRawInput(opts.ctx, opts.getRawInput);
    return opts.next();
  })
);

/** Read guard for procedures whose root input carries a companyId. */
export const companyReadProcedure = companyProcedure.use(
  t.middleware(async opts => {
    await assertCompanyReadFromRawInput(opts.ctx, opts.getRawInput);
    return opts.next();
  })
);

/**
 * Mutation guard for employee records and organizational structure. Unlike a
 * Coordinator, only the company Manager or the platform Administrator writes.
 * Procedures using this guard must receive a root `companyId` in their input.
 */
export const companyPersonnelManagementProcedure = companyProcedure.use(
  t.middleware(async opts => {
    await assertCompanyPersonnelManagementFromRawInput(opts.ctx, opts.getRawInput);
    return opts.next();
  })
);

/** Alias — same as companyProcedure; prefer companyProcedure in routers. */
export const authenticatedProcedure = companyProcedure;

// Legacy alias for backward compatibility
const requireUserOrManager = requireUserOrManagerOrProcessLeader;
