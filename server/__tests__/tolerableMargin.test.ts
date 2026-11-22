import { describe, expect, it } from "vitest";
import { calculateTolerableMargin, calculateTolerableObjectiveResult } from "@shared/tolerableMargin";

describe("calculateTolerableMargin", () => {
  it("incluye los límites -20 y +20, reconoce ideal 0 y conserva cero como medición", () => {
    const lower = calculateTolerableMargin({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: -20 });
    const upper = calculateTolerableMargin({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: 20 });
    const zero = calculateTolerableMargin({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: 0 });

    expect(lower.status).toBe("boundary");
    expect(upper.status).toBe("boundary");
    expect(zero.status).toBe("inside");
    expect(zero.distanceToIdeal).toBe(0);
    expect(zero.sampleCount).toBe(1);
    expect(zero.withinCount).toBe(1);
  });

  it("clasifica ±25 fuera del margen y ±10 como dentro, cerca del ideal", () => {
    expect(calculateTolerableMargin({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: -25 }).status).toBe("below");
    expect(calculateTolerableMargin({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: 25 }).status).toBe("above");
    expect(calculateTolerableMargin({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: -10 }).status).toBe("inside");
    expect(calculateTolerableMargin({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: 10 }).status).toBe("inside");
  });

  it("trata null y ausencia como medición pendiente, sin convertirlos en cero", () => {
    const nullValue = calculateTolerableMargin({ lowerLimit: -20, upperLimit: 20, idealValue: 0, currentValue: null });
    const absent = calculateTolerableMargin({ lowerLimit: -20, upperLimit: 20, idealValue: 0 });

    expect(nullValue.currentValue).toBeNull();
    expect(nullValue.sampleCount).toBe(0);
    expect(nullValue.status).toBe("pending");
    expect(absent.currentValue).toBeNull();
    expect(absent.compliancePercent).toBeNull();
  });

  it("evalúa meses registrados sin cancelar signos: [25,-25,0,10,null...] da 50% y última 10", () => {
    const metrics = calculateTolerableMargin({
      lowerLimit: -20,
      upperLimit: 20,
      idealValue: 0,
      recordingMode: "mensual",
      monthlyValues: [25, -25, 0, 10, null, null, null, null, null, null, null, null],
    });

    expect(metrics.sampleCount).toBe(4);
    expect(metrics.withinCount).toBe(2);
    expect(metrics.compliancePercent).toBe(50);
    expect(metrics.currentValue).toBe(10);
    expect(metrics.latestMonthIndex).toBe(3);
    expect(metrics.samples.map(sample => [sample.value, sample.within])).toEqual([
      [25, false], [-25, false], [0, true], [10, true],
    ]);
  });

  it("marca límites inválidos e ideal fuera del intervalo como invalid", () => {
    expect(calculateTolerableMargin({ lowerLimit: 20, upperLimit: -20, idealValue: 0, currentValue: 0 }).status).toBe("invalid");
    expect(calculateTolerableMargin({ lowerLimit: 20, upperLimit: 20, idealValue: 20, currentValue: 20 }).status).toBe("invalid");
    expect(calculateTolerableMargin({ lowerLimit: -20, upperLimit: 20, idealValue: 25, currentValue: 0 }).status).toBe("invalid");
  });

  it("mantiene configuraciones antiguas sin tracking como puntual", () => {
    const metrics = calculateTolerableMargin({ currentValue: 10 });
    expect(metrics.recordingMode).toBe("puntual");
    expect(metrics.currentValue).toBe(10);
    expect(metrics.status).toBe("pending");
  });
});

describe("calculateTolerableObjectiveResult", () => {
  const config = { lowerLimit: -20, upperLimit: 20, idealValue: 0 };

  it.each([
    [25, 14, 44, "improving"],
    [-25, -14, 44, "improving"],
    [25, -14, 44, "improving"],
    [25, 35, -40, "worsening"],
    [25, -25, 0, "unchanged"],
    [25, 0, 100, "improving"],
  ])("calcula %s → %s como reducción %s%% y tendencia %s", (baseline, currentValue, reductionPercent, trend) => {
    const result = calculateTolerableObjectiveResult(baseline, { ...config, currentValue });

    expect(result.toleranceImprovement).toMatchObject({
      initialDistance: Math.abs(baseline),
      reductionPercent,
      unavailable: null,
    });
    expect(result.trend).toBe(trend);
  });

  it("usa la distancia al ideal cuando el ideal no es cero y conserva la variación convencional", () => {
    const result = calculateTolerableObjectiveResult(5, {
      lowerLimit: 0,
      upperLimit: 20,
      idealValue: 10,
      currentValue: 8,
    });

    expect(result.toleranceImprovement).toMatchObject({ initialDistance: 5, reductionPercent: 60, unavailable: null });
    expect(result.variationPercent).toBe(60);
    expect(result.trend).toBe("improving");
  });

  it("en mensual usa la última medición registrada, sin promediar valores opuestos ni cambiar compliance", () => {
    const result = calculateTolerableObjectiveResult(25, {
      ...config,
      recordingMode: "mensual",
      monthlyValues: [25, -25, 14, null, null, null, null, null, null, null, null, null],
    });

    expect(result.tolerance?.currentValue).toBe(14);
    expect(result.tolerance?.compliancePercent).toBeCloseTo(33.3333333333);
    expect(result.toleranceImprovement).toMatchObject({ initialDistance: 25, reductionPercent: 44, unavailable: null });
    expect(result.trend).toBe("improving");
  });

  it.each([
    [25, { lowerLimit: -20, upperLimit: 20, currentValue: 14 }, "missing_ideal"],
    [null, { ...config, currentValue: 14 }, "missing_baseline"],
    [25, { ...config }, "missing_value"],
    [0, { ...config, currentValue: 0 }, "zero_initial_distance"],
    [25, { lowerLimit: 20, upperLimit: -20, idealValue: 0, currentValue: 14 }, "invalid_config"],
  ])("no fabrica porcentaje cuando falta información (%s)", (baseline, toleranceConfig, unavailable) => {
    const result = calculateTolerableObjectiveResult(baseline, toleranceConfig);

    expect(result.toleranceImprovement?.reductionPercent).toBeNull();
    expect(result.toleranceImprovement?.unavailable).toBe(unavailable);
  });
});
