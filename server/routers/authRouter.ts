import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { revokeAuthSessionByPlainToken } from "../authSessionRepository";
import { getSessionCookieOptions } from "../_core/cookies";
import { publicProcedure, router, protectedProcedure } from "../_core/trpc";
import {
  getProcessOwnerInvitationsByEmail,
  getProcessOwner,
  createProcessOwner,
  getDb,
} from "../db";
import { eq } from "drizzle-orm";
import { processOwnerInvitations } from "../../drizzle/schema";

export const authRouter = router({
  me: publicProcedure.query(opts => opts.ctx.user),
  logout: publicProcedure.mutation(({ ctx }) => {
    const raw = ctx.req.headers.cookie;
    if (raw) {
      const cookies = parseCookieHeader(raw);
      const plain = cookies[COOKIE_NAME];
      if (typeof plain === "string" && plain.length > 0) {
        void revokeAuthSessionByPlainToken(plain);
      }
    }
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return {
      success: true,
    } as const;
  }),
  processAcceptedInvitations: protectedProcedure.mutation(async ({ ctx }) => {
    const user = ctx.user;
    if (!user || !user.email) {
      console.log('[processAcceptedInvitations] No user or email found');
      return { processed: 0 };
    }

    console.log('[processAcceptedInvitations] Processing for user:', user.email, 'ID:', user.id);
    
    const invitations = await getProcessOwnerInvitationsByEmail(user.email);
    console.log('[processAcceptedInvitations] Found invitations:', invitations.length);
    const acceptedInvitations = invitations.filter(inv => inv.status === 'accepted');

    let processed = 0;
    for (const invitation of acceptedInvitations) {
      const existing = await getProcessOwner(invitation.processId, user.id);
      if (!existing) {
        console.log('[processAcceptedInvitations] Creating processOwner for process:', invitation.processId);
        await createProcessOwner(
          invitation.companyId,
          invitation.processId,
          user.id,
          invitation.accessCode
        );
        processed++;
      }
    }

    console.log('[processAcceptedInvitations] Processed:', processed);
    return { processed };
  }),

  processInvitationByToken: protectedProcedure.input((input: any) => input).mutation(async ({ ctx, input }) => {
    const user = ctx.user;
    const token = input?.token;

    if (!user || !token) {
      console.log('[processInvitationByToken] No user or token found');
      return { processed: 0, success: false };
    }

    console.log('[processInvitationByToken] Processing token for user:', user.id);

    const db = await getDb();
    if (!db) return { processed: 0, success: false };

    const invitation = await db
      .select()
      .from(processOwnerInvitations)
      .where(eq(processOwnerInvitations.invitationToken, token))
      .limit(1);

    if (!invitation || invitation.length === 0) {
      console.log('[processInvitationByToken] Invitation not found for token');
      return { processed: 0, success: false };
    }

    const inv = invitation[0];
    if (inv.status !== 'accepted') {
      console.log('[processInvitationByToken] Invitation not accepted');
      return { processed: 0, success: false };
    }

    // Check if processOwner already exists
    const existing = await getProcessOwner(inv.processId, user.id);
    if (existing) {
      console.log('[processInvitationByToken] ProcessOwner already exists');
      return { processed: 0, success: true };
    }

    // Create processOwner
    console.log('[processInvitationByToken] Creating processOwner for process:', inv.processId);
    await createProcessOwner(
      inv.companyId,
      inv.processId,
      user.id,
      inv.accessCode
    );

    return { processed: 1, success: true };
  }),
});
