import { describe, expect, it } from "vitest";
import { assertAnnualIntegrationDatabase, isSafeAnnualIntegrationDatabase } from "./helpers/annualTestSafety";

describe("Guarda de bases efímeras para integración anual", () => {
  it.each([
    ["mysql://test:test@127.0.0.1:3307/isge_annual_test", undefined, true],
    ["mysql://test:test@127.0.0.1:3307/isge_annual_test", "true", true],
    ["mysql://sige:sige@127.0.0.1:3306/sige_platform_test", "true", true],
    ["mysql://sige:sige@127.0.0.1:3306/sige_platform_test", undefined, false],
    ["mysql://sige:sige@127.0.0.1:3306/sige_platform_test", "false", false],
    ["mysql://test:test@127.0.0.1:3307/isge_annual_review", "true", false],
    ["mysql://test:test@127.0.0.1:3307/isge_training_review", "true", false],
    ["mysql://test:test@127.0.0.1:3306/sige_platform", "true", false],
    ["mysql://test:test@mysql:3306/sige_platform_test", "true", false],
    ["mysql://test:test@example.invalid:3307/isge_annual_test", "true", false],
    ["postgres://test:test@127.0.0.1:3307/isge_annual_test", "true", false],
    ["", "true", false],
  ] as const)("valida %s (CI=%s)", (url, ci, expected) => {
    expect(isSafeAnnualIntegrationDatabase(url, ci ?? "false")).toBe(expected);
    if (expected) expect(() => assertAnnualIntegrationDatabase(url, ci ?? "false")).not.toThrow();
    else expect(() => assertAnnualIntegrationDatabase(url, ci ?? "false")).toThrow(/prohibidas/);
  });
});
