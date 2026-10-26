import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import { assertCompanyAccess } from "../_core/sessionScope";

const platformUser = {
  id: 42,
  openId: "platform-user",
  name: "Usuario",
  email: "usuario@example.test",
  role: "user" as const,
};

function callerFor(user: typeof platformUser | null) {
  return appRouter.createCaller({
    user,
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  });
}

describe("normal login company gate", () => {
  it("refuses company mission data", async () => {
    await expect(callerFor(platformUser).companyInfo.get({ companyId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses reading a company by id", async () => {
    await expect(
      callerFor(platformUser).adminOperations.getCompanyById({ companyId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses deleting a company", async () => {
    await expect(callerFor(platformUser).process.delete({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses the company directory", async () => {
    await expect(callerFor(platformUser).recovery.getCompanies()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(platformUser).managerAuth.listCompanies()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses an anonymous caller", async () => {
    await expect(callerFor(null).companyInfo.get({ companyId: 1 })).rejects.toBeInstanceOf(
      TRPCError
    );
    await expect(callerFor(null).companyInfo.get({ companyId: 1 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("refuses a normal login in the shared company check", () => {
    expect(() =>
      assertCompanyAccess(
        { user: platformUser, manager: null, processLeader: null, req: {} as never, res: {} as never },
        1
      )
    ).toThrow(TRPCError);
  });
});
