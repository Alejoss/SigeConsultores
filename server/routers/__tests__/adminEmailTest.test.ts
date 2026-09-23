import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmailStrictMock } = vi.hoisted(() => ({
  sendEmailStrictMock: vi.fn(),
}));

vi.mock("../../_core/emailService", () => ({
  sendEmailStrict: sendEmailStrictMock,
}));

import { adminOperationsRouter } from "../adminOperations";

function callerFor(user: { id: number; role: string; email?: string | null }) {
  return adminOperationsRouter.createCaller({
    user: user as any,
    manager: null,
    processLeader: null,
    req: {} as any,
    res: {} as any,
  });
}

describe("Admin email test", () => {
  beforeEach(() => {
    sendEmailStrictMock.mockReset();
  });

  it("sends only to the authenticated administrator address and reports SES acceptance", async () => {
    sendEmailStrictMock.mockResolvedValue(true);

    const result = await callerFor({
      id: 981_001,
      role: "admin",
      email: "admin.test@isge360.com",
    }).testTransactionalEmail();

    expect(sendEmailStrictMock).toHaveBeenCalledTimes(1);
    expect(sendEmailStrictMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin.test@isge360.com",
        subject: "Prueba de correo Amazon SES - ISGE 360",
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        recipient: "ad***@isge360.com",
      })
    );
  });

  it("reports failure truthfully when SES does not accept the message", async () => {
    sendEmailStrictMock.mockResolvedValue(false);

    const result = await callerFor({
      id: 981_002,
      role: "admin",
      email: "admin.failure@isge360.com",
    }).testTransactionalEmail();

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining("no confirmó"),
      })
    );
  });

  it("rejects a non-administrator before sending a message", async () => {
    await expect(
      callerFor({ id: 981_003, role: "user", email: "user@isge360.com" }).testTransactionalEmail()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(sendEmailStrictMock).not.toHaveBeenCalled();
  });
});
