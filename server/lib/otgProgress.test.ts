import { describe, expect, it } from "vitest";
import { calculateOtgProgress } from "./otgProgress";

describe("calculateOtgProgress", () => {
  it("lee las acciones del formato actual de OTG", () => {
    expect(calculateOtgProgress({
      acciones: [
        {
          ponderacion: 60,
          tipoSeguimiento: "mensual_checklist",
          checklistValues: [true, true, true, true, true, true, true, true, false, false, false, false],
          porcentajeCompletado: 67,
        },
        {
          ponderacion: 40,
          tipoSeguimiento: "puntual",
          valorPuntual: 7,
          puntoLlegadaAccion: 10,
          porcentajeCompletado: 70,
        },
      ],
    })).toBe(68);
  });

  it("conserva compatibilidad con acciones históricas", () => {
    expect(calculateOtgProgress({
      acciones: [
        { ponderacion: 50, alcanzado: 40 },
        { ponderacion: 50, alcanzado: 80 },
      ],
    })).toBe(60);
  });

  it("usa el porcentaje ya guardado cuando el OTG aún no tiene acciones", () => {
    expect(calculateOtgProgress({ porcentajeAlcanzadoOTG: 82 })).toBe(82);
    expect(calculateOtgProgress({ porcentajeCumplimiento: 56 })).toBe(56);
  });
});
