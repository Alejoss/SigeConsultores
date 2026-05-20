import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
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

// Procedure that accepts OAuth users, managers, or process leaders
const requireUserOrManagerOrProcessLeader = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user && !ctx.manager && !ctx.processLeader) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
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
 * Accepts: platform OAuth user, company manager, or process leader.
 * Use `protectedProcedure` only for OAuth-only platform flows.
 * Use `adminProcedure` for platform administration.
 */
export const companyProcedure = t.procedure.use(requireUserOrManagerOrProcessLeader);

/** Alias — same as companyProcedure; prefer companyProcedure in routers. */
export const authenticatedProcedure = companyProcedure;

// Legacy alias for backward compatibility
const requireUserOrManager = requireUserOrManagerOrProcessLeader;
