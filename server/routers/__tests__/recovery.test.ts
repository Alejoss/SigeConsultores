import { describe, it, expect, beforeEach, vi } from "vitest";
import { recoveryRouter } from "../recovery";
import { getDb } from "../../db";
import { recoveryAudit, companies as companies_table, processes as processes_table } from "../../../drizzle/schema";

// Mock the database
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

describe("Recovery Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCompanies", () => {
    it("should return list of active companies", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { id: 1, name: "Empresa A" },
          { id: 2, name: "Empresa B" },
        ]),
      };

      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = recoveryRouter.createCaller({} as any);
      const result = await caller.getCompanies();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("name");
    });

    it("should return empty array if database is not available", async () => {
      vi.mocked(getDb).mockResolvedValue(null);

      const caller = recoveryRouter.createCaller({} as any);
      const result = await caller.getCompanies();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it("should return empty array on error", async () => {
      const mockDb = {
        select: vi.fn().mockImplementation(() => {
          throw new Error("Database error");
        }),
      };

      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = recoveryRouter.createCaller({} as any);
      const result = await caller.getCompanies();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe("getProcesses", () => {
    it("should return processes for a company", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { id: 1, name: "Proceso 1", code: "P001" },
          { id: 2, name: "Proceso 2", code: "P002" },
        ]),
      };

      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = recoveryRouter.createCaller({} as any);
      const result = await caller.getProcesses({ companyId: 1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("name");
      expect(result[0]).toHaveProperty("code");
    });

    it("should return empty array if database is not available", async () => {
      vi.mocked(getDb).mockResolvedValue(null);

      const caller = recoveryRouter.createCaller({} as any);
      const result = await caller.getProcesses({ companyId: 1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it("should return empty array on error", async () => {
      const mockDb = {
        select: vi.fn().mockImplementation(() => {
          throw new Error("Database error");
        }),
      };

      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = recoveryRouter.createCaller({} as any);
      const result = await caller.getProcesses({ companyId: 1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe("logRecovery", () => {
    it("should require authentication", async () => {
      const caller = recoveryRouter.createCaller({
        user: null,
      } as any);

      try {
        await caller.logRecovery({
          companyId: 1,
          companyName: "Empresa A",
          backupFile: "backup_2026-04-25.sql",
          backupDate: new Date("2026-04-25"),
          modulesRecovered: ["purpose", "values"],
          recordsCount: 0,
          status: "success",
          performedByUserId: 1,
          performedByName: "Admin",
        });
        expect.fail("Should have thrown UNAUTHORIZED error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("should log recovery with valid input", async () => {
      const mockDb = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue([1]),
      };

      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = recoveryRouter.createCaller({
        user: { id: 1, role: "admin" },
      } as any);

      const result = await caller.logRecovery({
        companyId: 1,
        companyName: "Empresa A",
        backupFile: "backup_2026-04-25.sql",
        backupDate: new Date("2026-04-25"),
        modulesRecovered: ["purpose", "values"],
        recordsCount: 0,
        status: "success",
        performedByUserId: 1,
        performedByName: "Admin",
      });

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("recoveryId");
    });

    it("should throw error if database is not available", async () => {
      vi.mocked(getDb).mockResolvedValue(null);

      const caller = recoveryRouter.createCaller({
        user: { id: 1, role: "admin" },
      } as any);

      try {
        await caller.logRecovery({
          companyId: 1,
          companyName: "Empresa A",
          backupFile: "backup_2026-04-25.sql",
          backupDate: new Date("2026-04-25"),
          modulesRecovered: ["purpose", "values"],
          recordsCount: 0,
          status: "success",
          performedByUserId: 1,
          performedByName: "Admin",
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).toBe("Database not available");
      }
    });
  });

  describe("listRecoveries", () => {
    it("should require authentication", async () => {
      const caller = recoveryRouter.createCaller({
        user: null,
      } as any);

      try {
        await caller.listRecoveries({});
        expect.fail("Should have thrown UNAUTHORIZED error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("should return recoveries with pagination", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          {
            id: 1,
            companyId: 1,
            companyName: "Empresa A",
            modulesRecovered: '["purpose", "values"]',
            status: "success",
          },
        ]),
      };

      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = recoveryRouter.createCaller({
        user: { id: 1, role: "user" },
      } as any);

      const result = await caller.listRecoveries({ limit: 10, offset: 0 });

      expect(result).toHaveProperty("recoveries");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.recoveries)).toBe(true);
    });
  });

  describe("getRecovery", () => {
    it("should require authentication", async () => {
      const caller = recoveryRouter.createCaller({
        user: null,
      } as any);

      try {
        await caller.getRecovery({ recoveryId: 1 });
        expect.fail("Should have thrown UNAUTHORIZED error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("should return recovery by id", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: 1,
            companyId: 1,
            companyName: "Empresa A",
            modulesRecovered: '["purpose", "values"]',
            status: "success",
          },
        ]),
      };

      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = recoveryRouter.createCaller({
        user: { id: 1, role: "user" },
      } as any);

      const result = await caller.getRecovery({ recoveryId: 1 });

      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("companyName");
    });

    it("should return null if recovery not found", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = recoveryRouter.createCaller({
        user: { id: 1, role: "user" },
      } as any);

      const result = await caller.getRecovery({ recoveryId: 999 });

      expect(result).toBeNull();
    });
  });

  describe("authorizeRecovery", () => {
    it("should require admin role", async () => {
      const caller = recoveryRouter.createCaller({
        user: { id: 1, role: "user" },
      } as any);

      try {
        await caller.authorizeRecovery({
          recoveryId: 1,
          authorizedByUserId: 1,
          authorizedByName: "Admin",
        });
        expect.fail("Should have thrown FORBIDDEN error");
      } catch (error: any) {
        expect(error.code).toBe("FORBIDDEN");
      }
    });

    it("should authorize recovery with admin role", async () => {
      const mockDb = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const caller = recoveryRouter.createCaller({
        user: { id: 1, role: "admin" },
      } as any);

      const result = await caller.authorizeRecovery({
        recoveryId: 1,
        authorizedByUserId: 1,
        authorizedByName: "Admin",
      });

      expect(result).toHaveProperty("success", true);
    });

    it("should throw error if database is not available", async () => {
      vi.mocked(getDb).mockResolvedValue(null);

      const caller = recoveryRouter.createCaller({
        user: { id: 1, role: "admin" },
      } as any);

      try {
        await caller.authorizeRecovery({
          recoveryId: 1,
          authorizedByUserId: 1,
          authorizedByName: "Admin",
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).toBe("Database not available");
      }
    });
  });
});
