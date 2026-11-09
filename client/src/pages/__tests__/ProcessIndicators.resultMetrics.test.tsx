// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProcessIndicators from "../ProcessIndicators";
import { calculateObjectiveResultMetrics } from "@shared/objectiveResultMetrics";
vi.stubGlobal("React", React);

const mocks = vi.hoisted(() => ({
  search: "?processId=21&companyId=7&panel=ote",
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

function metrics(baseline = 160, goal = 200, currentValue = 180) {
  return calculateObjectiveResultMetrics({ baseline, goal, currentValue });
}
function fixture(overrides: Record<string, any> = {}) {
  return {
    id: 1, name: "Mejorar resultado empresarial", ponderacion: 100,
    puntoPartida: 160, metaLlegada: 200, avanceMeta: 999, porcentajeMetaAlcanzado: 50,
    resultMetrics: metrics(), trackingType: "puntual", unidadMedida: "unidades",
    pctOO: 14, tasksGlobalAvg: 100, hasOO: true,
    objetivosOperativos: [{
      id: "oo1", description: "Resultado operativo", ponderacion: 80,
      porcentajeAlcanzado: 50, resultMetrics: metrics(200, 160, 180),
      unidadMedida: "días", hasTasks: true, tasksAverage: 100,
      tasks: [{ id: "task1", description: "Preparar el informe", percentageCompleted: 100 }],
    }],
    ...overrides,
  };
}
function seed(ote = fixture(), value = 50) {
  mocks.data = [{ id: "alcanzado", value, oteRows: [ote] }];
}
const mount = () => render(React.createElement(ProcessIndicators));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = "?processId=21&companyId=7&panel=ote";
  seed();
});
afterEach(cleanup);

describe("ProcessIndicators: result and plan execution are separate readings", () => {
  it("renders the five OTE figures with current result primary, not a giant percentage or circle", () => {
    const view = mount();
    const result = within(screen.getByRole("group", { name: "Resultado del OTE" }));
    for (const label of ["Punto de partida", "Resultado actual", "Meta", "Variación respecto al inicio", "Avance hacia la meta"]) {
      expect(result.getByText(label)).toBeTruthy();
    }
    expect(result.getByText("180 unidades")).toBeTruthy();
    expect(result.getByText("+12,5 %")).toBeTruthy();
    expect(result.getByText("50 %")).toBeTruthy();
    expect(result.queryByText("999 unidades")).toBeNull();
    expect(view.container.querySelector(".text-6xl")).toBeNull();
    expect(view.container.querySelector(".recharts-pie")).toBeNull();
  });
  it("keeps OO results, completed tasks and legacy OO aggregate separately labelled", () => {
    mount();
    const execution = within(screen.getByRole("region", { name: "Ejecución del plan (OO y tareas)" }));
    expect(execution.getByText("Avance ponderado hacia las metas OO")).toBeTruthy();
    expect(execution.getByText("14%")).toBeTruthy();
    expect(execution.getByText("Avance ponderado de tareas completadas")).toBeTruthy();
    expect(execution.getByText("100%")).toBeTruthy();
    expect(execution.getByText("Completar tareas no equivale a lograr el resultado numérico del OTE.")).toBeTruthy();
    const oo = within(screen.getByRole("group", { name: "Resultado del OO" }));
    expect(oo.getByText("-10 %")).toBeTruthy();
    expect(oo.getByText("50 %")).toBeTruthy();
    expect(screen.getByText("Avance de tareas completadas: 100%")).toBeTruthy();
    expect(screen.getByText("Completada: 100%")).toBeTruthy();
  });
  it.each([
    { value: 25, progress: "150 %", bounded: "100" },
    { value: -5, progress: "-150 %", bounded: "0" },
  ])("renders $progress without clipping text while bounding the visual bar", ({ value, progress, bounded }) => {
    seed(fixture({ resultMetrics: metrics(10, 20, value), porcentajeMetaAlcanzado: value > 0 ? 100 : -100 }));
    mount();
    const result = within(screen.getByRole("group", { name: "Resultado del OTE" }));
    expect(within(result.getByText("Avance hacia la meta").parentElement!).getByText(progress)).toBeTruthy();
    expect(result.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(bounded);
    expect(result.getByRole("progressbar").getAttribute("aria-valuetext")).toContain(progress);
  });
  it.each([
    { baseline: 0, goal: 10, current: 5, explanation: /inicio igual a cero/i },
    { baseline: -10, goal: 10, current: 0, explanation: /inicio negativo/i },
  ])("explains unavailable variation for baseline $baseline", ({ baseline, goal, current, explanation }) => {
    seed(fixture({ resultMetrics: metrics(baseline, goal, current) }));
    mount();
    const result = within(screen.getByRole("group", { name: "Resultado del OTE" }));
    expect(result.getByText(explanation)).toBeTruthy();
    expect(result.getByText(/Cambio absoluto/)).toBeTruthy();
  });
  it("uses checklist counts and explanation, displaying January at array index zero", () => {
    seed(fixture({
      trackingType: "mensual_checklist", checklistValues: [true, false],
      resultMetrics: calculateObjectiveResultMetrics({ baseline: 0, goal: 12, currentValue: 1, numericComparison: false, goalProgressOverride: 100 / 12 }),
      hasOO: false, objetivosOperativos: [], tasksGlobalAvg: null,
    }));
    mount();
    const result = within(screen.getByRole("group", { name: "Resultado del OTE" }));
    expect(result.getByText("1 meses")).toBeTruthy();
    expect(result.getByText(/No aplica al seguimiento por cumplimiento/)).toBeTruthy();
    const january = screen.getByText("Ene").parentElement!;
    expect(within(january).getByText("✓")).toBeTruthy();
    expect(screen.getByText("Sin tareas")).toBeTruthy();
  });
  it("preserves supplied global OTE value, renames it clearly and stacks OTE columns on mobile", () => {
    seed(fixture(), 70);
    const view = mount();
    expect(screen.getByText("Avance ponderado hacia las metas de los OTE")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy();
    expect(view.container.querySelector(".grid-cols-1.md\\:grid-cols-5")).toBeTruthy();
    expect(view.container.querySelector(".md\\:col-span-2.min-w-0, .min-w-0.md\\:col-span-2")).toBeTruthy();
    expect(view.container.querySelector(".md\\:col-span-3.min-w-0, .min-w-0.md\\:col-span-3")).toBeTruthy();
    expect(screen.getByText("Avance ponderado hacia las metas de los OTE").className).toContain("break-words");
  });
  it("keeps the OO list expandable and preserves tasks on the right", () => {
    const row = fixture();
    row.objetivosOperativos = Array.from({ length: 4 }, (_, index) => ({ ...row.objetivosOperativos[0], id: `oo-${index}`, description: `Operativo ${index + 1}`, hasTasks: false, tasks: [] }));
    seed(row);
    mount();
    expect(screen.queryByText("Operativo 4")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver 1 más/ }));
    expect(screen.getByText("Operativo 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ver menos/ }));
    expect(screen.queryByText("Operativo 4")).toBeNull();
  });
  it("renames the overview OTE card without changing its supplied percentage", () => {
    mocks.search = "?processId=21&companyId=7";
    seed(fixture(), 70);
    mount();
    const label = screen.getByText("Avance ponderado hacia las metas de los OTE");
    expect(within(label.closest("button")!).getByText("70%")).toBeTruthy();
  });
});
