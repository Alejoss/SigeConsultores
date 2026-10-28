import { describe, expect, it } from "vitest";
import {
  canonicalizePayrollAreas,
  isPayrollAreaEligible,
  resolvePayrollAreaSelection,
  serializePayrollAreaSelection,
} from "./payrollAreaSelection";

describe("selección de áreas de Nómina para Participantes", () => {
  it("conserva como selección específica el área única de procesos históricos", () => {
    expect(resolvePayrollAreaSelection(null, "Operaciones")).toEqual({
      mode: "selected",
      areas: ["Operaciones"],
    });
  });

  it("prioriza una selección múltiple nueva sin alterar el valor histórico", () => {
    const persisted = serializePayrollAreaSelection({
      mode: "selected",
      areas: ["Operaciones", "Logística"],
    });

    expect(resolvePayrollAreaSelection(persisted, "Calidad")).toEqual({
      mode: "selected",
      areas: ["Operaciones", "Logística"],
    });
  });

  it("normaliza áreas seleccionadas, respeta el orden y rechaza duplicados equivalentes", () => {
    expect(
      canonicalizePayrollAreas(
        ["logistica", "OPERACIONES"],
        ["Operaciones", "Logística", "Comercial"]
      )
    ).toEqual(["Logística", "Operaciones"]);

    expect(() =>
      canonicalizePayrollAreas(["Operaciones", "operaciones"], ["Operaciones"])
    ).toThrow("No repitas");
  });

  it("incluye todas las áreas activas solo en el modo global", () => {
    const selected = {
      mode: "selected" as const,
      areas: ["Calidad", "Comercial"],
    };
    expect(isPayrollAreaEligible(selected, "calidad")).toBe(true);
    expect(isPayrollAreaEligible(selected, "Operaciones")).toBe(false);
    expect(isPayrollAreaEligible({ mode: "all" }, "Operaciones")).toBe(true);
    expect(isPayrollAreaEligible({ mode: "none" }, "Operaciones")).toBe(false);
  });

  it("trata un valor persistido corrupto de forma conservadora", () => {
    expect(resolvePayrollAreaSelection("{incorrecto", null)).toEqual({
      mode: "none",
    });
    expect(resolvePayrollAreaSelection("{incorrecto", "Comercial")).toEqual({
      mode: "selected",
      areas: ["Comercial"],
    });
  });
});
