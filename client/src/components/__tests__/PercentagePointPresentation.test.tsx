// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObjectiveResultSummary } from "../ObjectiveResultSummary";
import { calculateObjectiveResultMetrics } from "@shared/objectiveResultMetrics";

vi.stubGlobal("React", React);
afterEach(cleanup);

const metrics = (baseline: number | null, goal: number | null, currentValue: number | null, numericComparison?: boolean) =>
  calculateObjectiveResultMetrics({ baseline, goal, currentValue, numericComparison });

const renderSummary = (
  baseline: number | null,
  goal: number | null,
  currentValue: number | null,
  unit: string,
  options: { compact?: boolean; numericComparison?: boolean } = {},
) => render(React.createElement(ObjectiveResultSummary, {
  metrics: metrics(baseline, goal, currentValue, options.numericComparison),
  unit,
  compact: options.compact,
}));

const result = () => within(screen.getByRole("group", { name: "Resultado del objetivo" }));

describe("presentación de cambio en puntos porcentuales", () => {
  it("muestra primero puntos porcentuales y debajo la variación relativa para un indicador porcentual", () => {
    renderSummary(5, 15, 10, "%");
    const panel = result();
    expect(panel.getByText("Cambio respecto al inicio")).toBeTruthy();
    expect(panel.getByText("+5 puntos porcentuales")).toBeTruthy();
    expect(panel.getByText("Variación relativa: +100 %")).toBeTruthy();
    const text = screen.getByRole("group", { name: "Resultado del objetivo" }).textContent ?? "";
    expect(text.indexOf("+5 puntos porcentuales")).toBeLessThan(text.indexOf("Variación relativa: +100 %"));
  });

  it("presenta un descenso porcentual sin invertir el signo del cambio", () => {
    renderSummary(20, 4, 16, "%");
    const panel = result();
    expect(panel.getByText("Cambio respecto al inicio")).toBeTruthy();
    expect(panel.getByText("-4 puntos porcentuales")).toBeTruthy();
    expect(panel.getByText("Variación relativa: -20 %")).toBeTruthy();
    expect(panel.getByText("25 %")).toBeTruthy();
    expect(panel.getByText("Mejora")).toBeTruthy();
  });

  it.each(["porcentaje", "Porcentajes", "percent", "por ciento"])(
    "reconoce la unidad porcentual %s",
    (unit) => {
      renderSummary(5, 15, 10, unit);
      const panel = result();
      expect(panel.getByText("+5 puntos porcentuales")).toBeTruthy();
      expect(panel.getByText("Variación relativa: +100 %")).toBeTruthy();
    },
  );

  it("conserva la matemática y usa variación relativa para una unidad no porcentual", () => {
    renderSummary(150, 210, 190, "tallos");
    const panel = result();
    expect(panel.getByText("Variación respecto al inicio")).toBeTruthy();
    expect(panel.getByText("+26,67 %")).toBeTruthy();
    expect(panel.queryByText("+40 puntos porcentuales")).toBeNull();
  });

  it("no muestra puntos porcentuales para una métrica de checklist no numérica", () => {
    renderSummary(0, 10, 5, "%", { numericComparison: false });
    const panel = result();
    expect(panel.getByText("No aplica")).toBeTruthy();
    expect(panel.queryByText(/puntos porcentuales/)).toBeNull();
    expect(panel.queryByText(/Variación relativa:/)).toBeNull();
  });

  it("no calcula porcentaje desde un inicio igual a cero, aunque el indicador sea porcentual", () => {
    renderSummary(0, 30, 30, "%");
    const panel = result();
    expect(panel.getByText("Cambio respecto al inicio")).toBeTruthy();
    expect(panel.getByText("+30 puntos porcentuales")).toBeTruthy();
    expect(panel.getByText("Variación relativa: No calculable")).toBeTruthy();
    expect(panel.getByText(/inicio igual a cero/i)).toBeTruthy();
  });

  it("mantiene el cambio absoluto y evita una variación relativa para un inicio negativo", () => {
    renderSummary(-5, 5, -2, "porcentaje");
    const panel = result();
    expect(panel.getByText("Cambio respecto al inicio")).toBeTruthy();
    expect(panel.getByText("+3 puntos porcentuales")).toBeTruthy();
    expect(panel.getByText("Variación relativa: No calculable")).toBeTruthy();
    expect(panel.getByText(/inicio negativo/i)).toBeTruthy();
  });

  it("no convierte una medición actual nula en cero ni inventa puntos porcentuales", () => {
    renderSummary(5, 15, null, "%");
    const panel = result();
    expect(panel.getByText("Resultado actual")).toBeTruthy();
    expect(panel.getAllByText("—").length).toBeGreaterThan(0);
    expect(panel.getByText("Sin medición registrada.")).toBeTruthy();
    expect(panel.queryByText(/puntos porcentuales/)).toBeNull();
  });

  it("distingue una medición actual cero de una medición ausente", () => {
    renderSummary(5, 15, 0, "%");
    const panel = result();
    expect(panel.getByText("0 %")).toBeTruthy();
    expect(panel.getByText("-5 puntos porcentuales")).toBeTruthy();
    expect(panel.getByText("Variación relativa: -100 %")).toBeTruthy();
  });

  it.each([false, true])("mantiene el avance del 50%% en modo %s sin alterar la presentación dual", (compact) => {
    renderSummary(5, 15, 10, "%", { compact });
    const panel = result();
    expect(panel.getByText("50 %")).toBeTruthy();
    expect(panel.getByText("+5 puntos porcentuales")).toBeTruthy();
    expect(panel.getByText("Variación relativa: +100 %")).toBeTruthy();
    expect(panel.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
  });
});
