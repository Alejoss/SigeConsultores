import { describe, expect, it } from "vitest";
import {
  mergePendingPatch,
  mergeProtectedDraft,
  shouldHydrateRemoteSnapshot,
} from "./autosaveDraft";

describe("protección de borrador para autosave", () => {
  it("conserva el texto local activo cuando llega un valor anterior del servidor", () => {
    const current = {
      finding: "Texto que el usuario sigue escribiendo",
      closureTask: "Cierre local",
      targetDate: "2026-10-27",
    };
    const server = {
      finding: "Texto anterior",
      closureTask: "Cierre confirmado por el servidor",
      targetDate: "2026-10-30",
    };

    expect(mergeProtectedDraft(current, server, new Set(["finding"]))).toEqual({
      finding: "Texto que el usuario sigue escribiendo",
      closureTask: "Cierre confirmado por el servidor",
      targetDate: "2026-10-30",
    });
  });

  it("agrupa ediciones del mismo campo y conserva la última versión", () => {
    const first = mergePendingPatch<{ finding: string; closureTask: string }>(
      null,
      { finding: "Primera" }
    );
    const latest = mergePendingPatch(first, {
      finding: "Primera versión completa",
      closureTask: "Nueva tarea",
    });

    expect(latest).toEqual({
      finding: "Primera versión completa",
      closureTask: "Nueva tarea",
    });
  });

  it("solo acepta la hidratación remota al cargar y nunca sobre un borrador local", () => {
    expect(
      shouldHydrateRemoteSnapshot({
        hasSnapshot: true,
        hasHydrated: false,
        hasLocalDraft: false,
      })
    ).toBe(true);
    expect(
      shouldHydrateRemoteSnapshot({
        hasSnapshot: true,
        hasHydrated: true,
        hasLocalDraft: false,
      })
    ).toBe(false);
    expect(
      shouldHydrateRemoteSnapshot({
        hasSnapshot: true,
        hasHydrated: false,
        hasLocalDraft: true,
      })
    ).toBe(false);
  });
});
