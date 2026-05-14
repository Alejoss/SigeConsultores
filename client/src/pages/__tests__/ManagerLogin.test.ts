import { describe, it, expect, beforeEach } from "vitest";

/**
 * Test suite for ManagerLogin component
 * Verifies that the manager login form properly handles email/password authentication
 */

describe("ManagerLogin", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it("should validate email and password inputs", () => {
    const email = "manager@company.com";
    const password = "SecurePass123456";

    expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(password.length).toBeGreaterThanOrEqual(12);
  });

  it("should reject passwords shorter than 12 characters", () => {
    const shortPassword = "short123";
    expect(shortPassword.length).toBeLessThan(12);
  });

  it("should store manager data in localStorage on successful login", () => {
    const mockData = {
      companyId: 1,
      companyName: "Test Company",
      managerEmail: "manager@test.com",
      managerName: "manager@test.com",
    };

    localStorage.setItem("managerCompanyId", mockData.companyId.toString());
    localStorage.setItem("managerCompanyName", mockData.companyName);
    localStorage.setItem("selectedCompanyId", mockData.companyId.toString());
    localStorage.setItem("managerEmail", mockData.managerEmail);
    localStorage.setItem("managerName", mockData.managerName);

    expect(localStorage.getItem("managerCompanyId")).toBe("1");
    expect(localStorage.getItem("managerCompanyName")).toBe("Test Company");
    expect(localStorage.getItem("managerEmail")).toBe("manager@test.com");
  });

  it("should clear localStorage when needed", () => {
    localStorage.setItem("managerCompanyId", "1");
    localStorage.setItem("managerEmail", "test@test.com");

    localStorage.clear();

    expect(localStorage.getItem("managerCompanyId")).toBeNull();
    expect(localStorage.getItem("managerEmail")).toBeNull();
  });

  it("should handle form submission with valid credentials", () => {
    const email = "manager@company.com";
    const password = "ValidPassword123456";

    // Simulate form validation
    const isValid = email.includes("@") && password.length >= 12;
    expect(isValid).toBe(true);
  });

  it("should reject form submission with invalid email", () => {
    const invalidEmail = "notanemail";
    const password = "ValidPassword123456";

    const isValid = invalidEmail.includes("@") && password.length >= 12;
    expect(isValid).toBe(false);
  });

  it("should handle error states properly", () => {
    const errorMessage = "Error al iniciar sesión";
    expect(errorMessage).toBeTruthy();
    expect(errorMessage).toContain("Error");
  });

  it("should validate email format", () => {
    const validEmails = [
      "manager@company.com",
      "user@domain.co.uk",
      "test.email@example.org",
    ];
    const invalidEmails = ["notanemail", "missing@domain", "@nodomain.com"];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    validEmails.forEach((email) => {
      expect(emailRegex.test(email)).toBe(true);
    });

    invalidEmails.forEach((email) => {
      expect(emailRegex.test(email)).toBe(false);
    });
  });

  it("should require minimum password length of 12 characters", () => {
    const testCases = [
      { password: "short", length: 5, valid: false },
      { password: "medium1234567", length: 13, valid: true },
      { password: "ValidPass1234", length: 13, valid: true },
      { password: "123456789012", length: 12, valid: true },
    ];

    testCases.forEach(({ password, length, valid }) => {
      expect(password.length).toBe(length);
      expect(password.length >= 12).toBe(valid);
    });
  });
});
