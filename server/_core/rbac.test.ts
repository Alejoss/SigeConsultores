import { describe, it, expect } from "vitest";
import {
  getUserRole,
  canAccessCompany,
  canEditCompany,
  canAccessProcess,
  canEditProcess,
  UserRole,
} from "./rbac";
import type { User } from "../../drizzle/schema";

// Mock users
const adminUser: User = {
  id: 1,
  openId: "admin-001",
  name: "Admin User",
  email: "admin@example.com",
  loginMethod: "oauth",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const regularUser: User = {
  id: 2,
  openId: "user-001",
  name: "Regular User",
  email: "user@example.com",
  loginMethod: "oauth",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("RBAC - Role-Based Access Control", () => {
  describe("getUserRole", () => {
    it("should return ADMIN for admin users", () => {
      const role = getUserRole(adminUser);
      expect(role).toBe(UserRole.ADMIN);
    });

    it("should return GENERAL_MANAGER for regular OAuth users", () => {
      const role = getUserRole(regularUser);
      expect(role).toBe(UserRole.GENERAL_MANAGER);
    });

    it("should return COLLABORATOR for null user", () => {
      const role = getUserRole(null);
      expect(role).toBe(UserRole.COLLABORATOR);
    });
  });

  describe("canAccessCompany", () => {
    it("should allow admin to access any company", () => {
      expect(canAccessCompany(adminUser, 1, 2)).toBe(true);
      expect(canAccessCompany(adminUser, 999, 1)).toBe(true);
    });

    it("should allow general manager to access their own company", () => {
      expect(canAccessCompany(regularUser, 5, 5)).toBe(true);
    });

    it("should deny general manager access to other companies", () => {
      expect(canAccessCompany(regularUser, 5, 10)).toBe(false);
    });

    it("should deny null user access", () => {
      expect(canAccessCompany(null, 1, 1)).toBe(false);
    });
  });

  describe("canEditCompany", () => {
    it("should allow admin to edit any company", () => {
      expect(canEditCompany(adminUser, 1, 2)).toBe(true);
      expect(canEditCompany(adminUser, 999, 1)).toBe(true);
    });

    it("should allow general manager to edit their own company", () => {
      expect(canEditCompany(regularUser, 5, 5)).toBe(true);
    });

    it("should deny general manager edit access to other companies", () => {
      expect(canEditCompany(regularUser, 5, 10)).toBe(false);
    });

    it("should deny null user edit access", () => {
      expect(canEditCompany(null, 1, 1)).toBe(false);
    });
  });

  describe("canAccessProcess", () => {
    it("should allow admin to access any process", () => {
      expect(canAccessProcess(adminUser, 1, 2)).toBe(true);
      expect(canAccessProcess(adminUser, 999, 1)).toBe(true);
    });

    it("should allow general manager to access any process in their company", () => {
      // General managers can access all processes (they manage the company)
      expect(canAccessProcess(regularUser, 1, 5)).toBe(true);
      expect(canAccessProcess(regularUser, 999, 5)).toBe(true);
    });

    it("should deny null user access", () => {
      expect(canAccessProcess(null, 1, 1)).toBe(false);
    });
  });

  describe("canEditProcess", () => {
    it("should allow admin to edit any process", () => {
      expect(canEditProcess(adminUser, 1, 2)).toBe(true);
      expect(canEditProcess(adminUser, 999, 1)).toBe(true);
    });

    it("should allow general manager to edit any process in their company", () => {
      // General managers can edit all processes
      expect(canEditProcess(regularUser, 1, 5)).toBe(true);
      expect(canEditProcess(regularUser, 999, 5)).toBe(true);
    });

    it("should deny null user edit access", () => {
      expect(canEditProcess(null, 1, 1)).toBe(false);
    });
  });
});
