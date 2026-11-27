import { describe, expect, it, vi } from "vitest";
import { hasAnnualWorkspaceMetadata } from "../../scripts/annual-backfill-guard.mjs";

describe("backfills históricos protegidos", () => {
  it("mantiene compatibilidad si todavía no existe la tabla de espacios anuales", async () => {
    const query = vi.fn().mockResolvedValueOnce([[]]);
    expect(await hasAnnualWorkspaceMetadata({ query })).toBe(false);
    expect(query).toHaveBeenCalledOnce();
  });
  it("bloquea el backfill global cuando cualquier empresa ya tiene años gestionados", async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ TABLE_NAME: "annualWorkspaces" }]])
      .mockResolvedValueOnce([[{ id: 7 }]]);
    expect(await hasAnnualWorkspaceMetadata({ query })).toBe(true);
    expect(query.mock.calls[1][0]).toBe("SELECT id FROM annualWorkspaces LIMIT 1");
  });
  it("limita el backfill estratégico a la empresa y año exactos", async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ TABLE_NAME: "annualWorkspaces" }]])
      .mockResolvedValueOnce([[{ id: 7 }]]);
    expect(await hasAnnualWorkspaceMetadata({ query }, 999801, 2026)).toBe(true);
    expect(query.mock.calls[1]).toEqual(["SELECT id FROM annualWorkspaces WHERE companyId = ? AND year = ? LIMIT 1", [999801, 2026]]);
  });
  it("nunca escribe ni ignora un error de metadatos", async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ TABLE_NAME: "annualWorkspaces" }]])
      .mockRejectedValueOnce(new Error("metadata no disponible"));
    await expect(hasAnnualWorkspaceMetadata({ query })).rejects.toThrow("metadata no disponible");
    expect(query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
  });
});
