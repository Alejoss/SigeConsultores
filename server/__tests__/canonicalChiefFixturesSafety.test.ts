import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCanonicalFixtureDatabase } from "./helpers/canonicalChiefFixtures";

const accepted = [
  ["TEST local", "mysql://test:test@127.0.0.1:3307/isge_annual_test", "false"],
  ["CI exacto", "mysql://test:test@127.0.0.1:3306/sige_platform_test", "true"],
] as const;
const rejected = [
  ["revisión aunque CI=true", "mysql://test:test@127.0.0.1:3307/isge_annual_review", "true"],
  ["base empresarial aunque CI=true", "mysql://test:test@127.0.0.1:3306/sige_platform", "true"],
  ["CI sin bandera explícita", "mysql://test:test@127.0.0.1:3306/sige_platform_test", "false"],
  ["host remoto aunque tenga nombre TEST", "mysql://test:test@db.example.invalid:3306/sige_platform_test", "true"],
  ["puerto no autorizado", "mysql://test:test@127.0.0.1:3307/sige_platform_test", "true"],
  ["URL ausente", "", "true"],
] as const;

afterEach(() => vi.unstubAllEnvs());

describe("seguridad de fixtures canónicos en local y CI", () => {
  it.each(accepted)("acepta %s sin conectar a MySQL", (_label, url, ci) => {
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("CI", ci);
    expect(() => assertCanonicalFixtureDatabase()).not.toThrow();
  });

  it.each(rejected)("rechaza %s antes de cualquier SQL", (_label, url, ci) => {
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("CI", ci);
    expect(() => assertCanonicalFixtureDatabase()).toThrow("Revisión y producción están prohibidas");
  });
});
