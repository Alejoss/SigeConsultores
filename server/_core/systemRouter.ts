import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, protectedProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  debugUserInfo: protectedProcedure.query(({ ctx }) => {
    return {
      userId: ctx.user?.id,
      name: ctx.user?.name,
      email: ctx.user?.email,
      openId: ctx.user?.openId,
      role: ctx.user?.role,
      isAdmin: ctx.user?.role === 'admin',
    };
  }),
});
