// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProcessIndicators from "../ProcessIndicators";
import { calculateOtgResultMetrics } from "@shared/otgResultMetrics";
vi.stubGlobal("React", React);

const mocks = vi.hoisted(() => ({
  search: "?processId=21&companyId=7&panel=otg",
  data: [] as any[],
  navigate: vi.fn(),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/process-indicators", mocks.navigate], useSearch: () => mocks.search }));
vi.mock("@/lib/sessionScope", () => ({ getProcessIdFromSession: () => 21, getCompanyIdFromSession: () => 7 }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  processMap: { get: { useQuery: () => ({ data: { id: 21, companyId: 7, name: "Proceso ficticio" } }) } },
  consolidatedIndicators: { getConsolidatedIndicators: { useQuery: () => ({ data: mocks.data, isLoading: false }) } },
  linkedCommitments: { listByProcess: { useQuery: () => ({ data: [], isLoading: false }) } },
} }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function metrics(baseline = 160, goal = 200, current = 180) {
  return calculateOtgResultMetrics({ puntoPartida: baseline, puntoLlegada: goal, alcanzado: current });
}
function fixture(overrides: Record<string, any> = {}) {
  return {
    id: "otg-1", name: "Mejorar el resultado empresarial", comunicado: true, objetivoLogrado: true,
    pctOTG: 100, resultMetrics: metrics(), unidadMedida: "unidades",
    tareas: [{ id: "task-1", description: "Preparar el informe", ponderacion: 100, porcentajeAlcanzado: 100 }],
    ...overrides,
  };
}
function seed(otg = fixture(), compliance = 100, completed = 1) {
  mocks.data = [{ id: "total_alcanzado", value: completed, compliance, otgRows: [otg] }, { id: "comunicado", value: 100 }];
}
const mount = () => render(React.createElement(ProcessIndicators));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = "?processId=21&companyId=7&panel=otg";
  seed();
});
afterEach(cleanup);

describe("ProcessIndicators OTG: numeric result and task execution remain separate", () => {
  it("reuses the five-field green result summary rather than the giant task percentage", () => {
    const view = mount();
    const result = within(screen.getByRole("group", { name: "Resultado del OTG" }));
    for (const label of ["Punto de partida", "Resultado actual", "Meta", "Variación respecto al inicio", "Avance hacia la meta"]) {
      expect(result.getByText(label)).toBeTruthy();
    }
    expect(result.getByText("160 unidades")).toBeTruthy();
    expect(result.getByText("180 unidades")).toBeTruthy();
    expect(result.getByText("200 unidades")).toBeTruthy();
    expect(result.getByText("+12,5 %")).toBeTruthy();
    expect(result.getByText("50 %")).toBeTruthy();
    expect(screen.queryByText("% Cumplimiento OTG")).toBeNull();
    expect(view.container.querySelector(".text-4xl")).toBeNull();
    expect(result.getByText("Resultado actual").parentElement!.querySelector(".text-2xl")).toBeTruthy();
    expect(result.getByText("Resultado del OTG").closest(".md\\:col-span-2")!.getAttribute("style")).toContain("background-color: rgb(20, 83, 45)");
  });

  it("shows a completed plan and 100% task without asserting a numeric result reached at 40%", () => {
    seed(fixture({ resultMetrics: metrics(100, 200, 140) }));
    mount();
    const execution = within(screen.getByRole("region", { name: "Ejecución del plan (tareas)" }));
    expect(execution.getByText("Avance ponderado de tareas completadas")).toBeTruthy();
    expect(execution.getByText("100%")).toBeTruthy();
    expect(execution.getByText("Completar tareas no equivale a lograr el resultado numérico del OTG.")).toBeTruthy();
    const result = within(screen.getByRole("group", { name: "Resultado del OTG" }));
    expect(result.getByText("40 %")).toBeTruthy();
    expect(result.getByText("En camino a la meta")).toBeTruthy();
    expect(screen.queryByText("Meta alcanzada")).toBeNull();
    expect(screen.queryByText("Logrado")).toBeNull();
    expect(screen.getByText("Plan completado")).toBeTruthy();
    expect(screen.getByText("Planes completados")).toBeTruthy();
    expect(screen.getByText("Comunicado")).toBeTruthy();
    const task = within(screen.getByText("Preparar el informe").closest(".rounded-lg")!);
    expect(task.getByText("100%")).toBeTruthy();
    expect(task.getByText("Pond. 100%")).toBeTruthy();
  });

  it("labels the legacy false boolean as a plan in process, keeping communication badges", () => {
    seed(fixture({ objetivoLogrado: false, comunicado: false, pctOTG: 25 }), 25, 0);
    mount();
    expect(screen.getByText("Plan en proceso")).toBeTruthy();
    expect(screen.getByText("No comunicado")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Ejecución del plan (tareas)" })).getByText("25%")).toBeTruthy();
  });

  it.each([
    { current: 25, percentage: "150 %", signed: "+150 %", bounded: "100" },
    { current: 29, percentage: "190 %", signed: "+190 %", bounded: "100" },
    { current: 35, percentage: "250 %", signed: "+250 %", bounded: "100" },
    { current: -5, percentage: "-150 %", signed: "-150 %", bounded: "0" },
  ])("renders raw $percentage result while bounding only the visual bar", ({ current, percentage, signed, bounded }) => {
    seed(fixture({ resultMetrics: metrics(10, 20, current) }));
    mount();
    const result = within(screen.getByRole("group", { name: "Resultado del OTG" }));
    expect(within(result.getByText("Avance hacia la meta").parentElement!).getByText(percentage)).toBeTruthy();
    expect(within(result.getByText("Variación respecto al inicio").parentElement!).getByText(signed)).toBeTruthy();
    expect(result.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(bounded);
    expect(result.getByRole("progressbar").getAttribute("aria-valuetext")).toContain(percentage);
  });

  it("puts percentage points first for percentage units and relative change second", () => {
    seed(fixture({ resultMetrics: metrics(10, 20, 25), unidadMedida: "%" }));
    mount();
    const result = within(screen.getByRole("group", { name: "Resultado del OTG" }));
    const change = within(result.getByText("Cambio respecto al inicio").parentElement!);
    expect(change.getByText("+15 puntos porcentuales", { exact: false })).toBeTruthy();
    expect(change.getByText("Variación relativa: +150 %")).toBeTruthy();
    expect(result.getByText("25 %")).toBeTruthy();
    expect(within(result.getByText("Avance hacia la meta").parentElement!).getByText("150 %")).toBeTruthy();
  });

  it.each([
    { baseline: 0, goal: 10, current: 5, explanation: /inicio igual a cero/i },
    { baseline: -10, goal: 10, current: 0, explanation: /inicio negativo/i },
  ])("explains variation unavailable for baseline $baseline and preserves absolute change", ({ baseline, goal, current, explanation }) => {
    seed(fixture({ resultMetrics: metrics(baseline, goal, current) }));
    mount();
    const result = within(screen.getByRole("group", { name: "Resultado del OTG" }));
    expect(result.getByText(explanation)).toBeTruthy();
    expect(result.getByText(/Cambio absoluto/)).toBeTruthy();
    expect(result.getByText("50 %")).toBeTruthy();
  });

  it("keeps missing result data missing even with 100% tasks and a completed plan", () => {
    seed(fixture({ resultMetrics: calculateOtgResultMetrics({ puntoPartida: " ", puntoLlegada: null, alcanzado: undefined }) }));
    mount();
    const result = within(screen.getByRole("group", { name: "Resultado del OTG" }));
    expect(within(result.getByText("Resultado actual").parentElement!).getByText("—")).toBeTruthy();
    expect(result.getByText("Sin medición registrada.")).toBeTruthy();
    expect(result.getByText("Sin avance calculable")).toBeTruthy();
    expect(result.queryByText("0 unidades")).toBeNull();
    expect(screen.queryByText("Meta alcanzada")).toBeNull();
  });

  it("marks the historical fallback as historical, without inventing tasks or completed-result claims", () => {
    seed(fixture({ tareas: [], pctOTG: 56, objetivoLogrado: false, resultMetrics: calculateOtgResultMetrics({}) }), 56, 0);
    mount();
    const execution = within(screen.getByRole("region", { name: "Ejecución del plan (tareas)" }));
    expect(execution.getByText("Porcentaje histórico registrado")).toBeTruthy();
    expect(execution.getByText("Sin tareas actuales")).toBeTruthy();
    expect(execution.getByText("56%")).toBeTruthy();
    expect(execution.queryByText("Avance ponderado de tareas completadas")).toBeNull();
    expect(screen.queryByText("Preparar el informe")).toBeNull();
    expect(screen.queryByText("Plan completado")).toBeNull();
    expect(screen.queryByText("Meta alcanzada")).toBeNull();
  });

  it("does not use legacy pctOTG as a fallback numeric result when result metadata is absent", () => {
    seed(fixture({ resultMetrics: undefined, pctOTG: 82, tareas: [], objetivoLogrado: false }), 82, 0);
    mount();
    const result = within(screen.getByRole("group", { name: "Resultado del OTG" }));
    expect(result.getByText("Sin avance calculable")).toBeTruthy();
    expect(result.queryByText("82 %")).toBeNull();
    expect(result.queryByText("Meta alcanzada")).toBeNull();
  });

  it("stacks OTG columns, wraps header badges and leaves task descriptions shrinkable at mobile widths", () => {
    const view = mount();
    expect(view.container.querySelector(".grid-cols-1.md\\:grid-cols-5")).toBeTruthy();
    expect(view.container.querySelector(".min-w-0.md\\:col-span-2")).toBeTruthy();
    expect(view.container.querySelector(".min-w-0.md\\:col-span-3")).toBeTruthy();
    expect(screen.getByText(/Objetivo Táctico de Gestión · OTG 1/).parentElement!.className).toContain("flex-wrap");
    expect(screen.getByText("Comunicado").parentElement!.className).toContain("flex-wrap");
    expect(screen.getByText("Preparar el informe").className).toContain("min-w-0");
    expect(screen.getByText("Preparar el informe").className).toContain("break-words");
    expect(screen.getByText("Planes completados").closest(".grid")!.className).toContain("grid-cols-1");
  });

  it("renames the overview OTG plan percentage without changing its supplied aggregate", () => {
    mocks.search = "?processId=21&companyId=7";
    seed(fixture(), 73);
    mount();
    const overview = within(screen.getByText("Cumplimiento del plan OTG").closest("button")!);
    expect(overview.getByText("73%")).toBeTruthy();
    expect(overview.getByText(/El resultado individual se mide aparte/)).toBeTruthy();
    expect(overview.queryByText("50 %")).toBeNull();
  });
});
