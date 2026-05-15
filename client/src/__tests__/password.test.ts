import { describe, expect, it } from "vitest";
import { getApiErrorMessage, validatePasswordStrength } from "../lib/password";

describe("validatePasswordStrength", () => {
  it("rejects passwords without a special character", () => {
    const result = validatePasswordStrength("Abcdef12");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("carácter especial");
  });

  it("accepts passwords that meet all rules", () => {
    const result = validatePasswordStrength("Abcdef12!");
    expect(result.valid).toBe(true);
  });
});

describe("getApiErrorMessage", () => {
  it("parses Zod JSON validation errors into readable Spanish", () => {
    const zodJson = JSON.stringify([
      {
        code: "invalid_format",
        message: "Password must contain uppercase, lowercase, number, and special character",
        path: ["password"],
      },
    ]);

    const message = getApiErrorMessage(new Error(zodJson), "Error genérico");
    expect(message).toContain("carácter especial");
    expect(message).not.toContain("invalid_format");
  });
});
