// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TacticalPlanning, { calcPct, calcOOMetrics, calcOTMetrics, getOOResultMetrics, getOTResultMetrics } from "../TacticalPlanning";
import { formatObjectivePercent, formatObjectiveValue } from "@shared/objectiveResultMetrics";

vi.stubGlobal("React", React);
const mocks = vi.hoisted(() => ({
  planning: vi.fn(), narratives: vi.fn(), navigate: vi.fn(), error: vi.fn(),
  plannings: [] as any[], objectives: [] as any[], search: "",
}));
vi.mock("wouter", () => ({ useLocation: () => ["/tactical-planning", mocks.navigate], useSearch: () => mocks.search }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/lib/exportTacticalObjectivesToPDF", () => ({ exportTacticalObjectivesToPDF: vi.fn() }));
vi.mock("@/lib/sessionScope", () => ({
  getProcessIdFromSession: () => 21,
  getCompanyIdFromSession: () => 77,
  getSessionScope: () => ({ processId: 21, companyId: 77, processName: "Área de prueba" }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    processMap: { get: { useQuery: () => ({ data: { companyId: 77 } }) } },
    processTacticalObjectives: {
      savePlanning: { useMutation: () => ({ mutateAsync: mocks.planning }) },
      saveNarratives: { useMutation: () => ({ mutateAsync: mocks.narratives }) },
      list: { useQuery: () => ({ data: mocks.objectives }) },
      loadPlanningData: { useQuery: () => ({ data: mocks.plannings }) },
    },
  },
}));

let objectiveId = 80_000;
function oo(overrides = {}) {
  return {
    id: "oo-metrics", description: "OO de prueba", responsible: "Responsable", startDate: "", endDate: "",
    implementationDate: "", observation: "", tasks: [], ponderacion: 100,
    condicionInicial: 100, meta: 110, condicionActual: 140, ...overrides,
  };
}
function ote(overrides = {}) {
  const id = ++objectiveId;
  return {
    id: `planning_${id}`, objectiveId: id, objectiveName: `OTE de prueba ${id}`,
    objectiveEnunciation: "", objectiveExplanation: "", objectiveResponsible: "",
    situacionInicial: "Contexto", resultadoEsperado: "Resultado esperado", indicador: "Indicador",
    goal: "Meta histórica intacta", resultKeys: [], expanded: false,
    ponderacion: 100, puntoPartida: 100, metaLlegada: 110, unidadMedida: "unidades", avanceMeta: 140,
    // Deliberately stale/clamped: display must recompute from numeric inputs.
    porcentajeMetaAlcanzado: 100, ...overrides,
  };
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function mount(plannings: ReturnType<typeof ote>[]) {
  mocks.plannings = plannings;
  mocks.objectives = plannings.map(item => ({ id: item.objectiveId }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(React.createElement(QueryClientProvider, { client }, React.createElement(TacticalPlanning)));
  await advance(60);
  return view;
}
function metricText(group: HTMLElement, label: string) {
  const row = within(group).getByText(`${label}:`, { exact: false }).closest("p");
  return row?.querySelector("strong")?.textContent;
}
function globalValue(label: string) {
  // The general indicator precedes the individual cards, which repeat these labels.
  const labelNode = screen.getAllByText(label, { exact: true })[0];
  return labelNode.nextElementSibling?.textContent;
}

describe("TacticalPlanning individual result calculations", () => {
  it.each([
    [100, 110, 140, 400],
    [100, 110, 80, -200],
    [100, 50, 40, 120],
    [100, -50, -80, 120],
    [-10, -20, -25, 150],
    [0, 10, 15, 150],
    [10, 10, 20, null],
  ])("returns raw goal progress for %s → %s at %s", (baseline, goal, current, expected) => {
    expect(calcPct(baseline!, goal!, current!)).toBe(expected);
    expect(calcOTMetrics(ote({ puntoPartida: baseline, metaLlegada: goal, avanceMeta: current })).porcentajeMetaAlcanzado).toBe(expected);
    expect(calcOOMetrics(oo({ condicionInicial: baseline, meta: goal, condicionActual: current })).porcentajeAlcanzado).toBe(expected);
  });

  it("separates +40% baseline variation from 400% goal progress", () => {
    expect(getOTResultMetrics(ote())).toMatchObject({ currentValue: 140, variationPercent: 40, goalProgress: 400, trend: "improving", goalStatus: "goal_exceeded" });
    expect(getOOResultMetrics(oo())).toMatchObject({ variationPercent: 40, goalProgress: 400 });
  });

  it.each([
    [100, 50, 80, -20, "improving"],
    [100, 50, 120, 20, "worsening"],
    [100, 150, 80, -20, "worsening"],
  ])("labels direction correctly for %s → %s at %s", (baseline, goal, currentValue, variationPercent, trend) => {
    expect(getOTResultMetrics(ote({ puntoPartida: baseline, metaLlegada: goal, avanceMeta: currentValue }))).toMatchObject({ variationPercent, trend });
    expect(getOOResultMetrics(oo({ condicionInicial: baseline, meta: goal, condicionActual: currentValue }))).toMatchObject({ variationPercent, trend });
  });

  it.each([[0, 10, 5, "zero_baseline"], [-10, -20, -15, "negative_baseline"]])(
    "uses no relative variation with baseline %s", (baseline, goal, currentValue, reason) => {
      const ot = getOTResultMetrics(ote({ puntoPartida: baseline, metaLlegada: goal, avanceMeta: currentValue }));
      const op = getOOResultMetrics(oo({ condicionInicial: baseline, meta: goal, condicionActual: currentValue }));
      for (const metrics of [ot, op]) {
        expect(metrics).toMatchObject({ variationPercent: null, variationUnavailable: reason, absoluteChange: (currentValue as number) - (baseline as number), goalProgress: 50 });
      }
    },
  );

  it("retains monthly sum and the current average rule excluding zeros (not negative months)", () => {
    const values = [0, 20, -10, 0, 40, 0, 0, 0, 0, 0, 0, 0];
    const original = [...values];
    expect(calcOTMetrics(ote({ trackingType: "mensual_sumatoria", monthlyValues: values, puntoPartida: 0, metaLlegada: 25 }))).toEqual({ avanceMeta: 50, porcentajeMetaAlcanzado: 200 });
    expect(calcOOMetrics(oo({ ooTrackingType: "mensual_sumatoria", ooMonthlyValues: values, condicionInicial: 0, meta: 25 }))).toEqual({ condicionActual: 50, porcentajeAlcanzado: 200 });
    expect(calcOTMetrics(ote({ trackingType: "mensual_promedio", monthlyValues: values, puntoPartida: 0, metaLlegada: 10 })).avanceMeta).toBeCloseTo(50 / 3);
    expect(calcOOMetrics(oo({ ooTrackingType: "mensual_promedio", ooMonthlyValues: values, condicionInicial: 0, meta: 10 })).condicionActual).toBeCloseTo(50 / 3);
    expect(calcOTMetrics(ote({ trackingType: "mensual_promedio", monthlyValues: Array(12).fill(0) })).avanceMeta).toBe(0);
    expect(values).toEqual(original);
  });

  it("retains checklist rounding over twelve months without inventing baseline growth", () => {
    const checks = Array.from({ length: 12 }, (_, i) => i < 5);
    for (const metrics of [
      getOTResultMetrics(ote({ trackingType: "mensual_checklist", checklistValues: checks, puntoPartida: 100, metaLlegada: 120 })),
      getOOResultMetrics(oo({ ooTrackingType: "mensual_checklist", ooChecklistValues: checks, condicionInicial: 100, meta: 120 })),
    ]) {
      expect(metrics).toMatchObject({ currentValue: 5, goal: 12, baseline: null, goalProgress: 42, variationPercent: null, variationUnavailable: "not_numeric", absoluteChange: null, trend: "unknown" });
    }
  });
});

describe("TacticalPlanning result UI and unchanged execution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.planning.mockReset().mockResolvedValue(undefined);
    mocks.narratives.mockReset().mockResolvedValue(undefined);
    mocks.navigate.mockReset();
    mocks.error.mockReset();
    mocks.search = "";
    localStorage.clear();
  });
  afterEach(async () => {
    cleanup();
    await advance(0);
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("shows closed-card raw results separately from weighted OO/task execution without saving", async () => {
    const task = { id: "task-a", description: "Tarea", responsible: "", date: "", percentageCompleted: 50, weighting: 100 };
    const planning = ote({ resultKeys: [oo({ ponderacion: 30, tasks: [task] })] });
    await mount([planning]);
    const result = screen.getByRole("group", { name: "Resultado OTE" });
    expect(metricText(result, "Resultado actual")).toBe(`${formatObjectiveValue(140)} unidades`);
    expect(metricText(result, "Variación respecto al inicio")).toBe(formatObjectivePercent(40, true));
    expect(metricText(result, "Avance hacia la meta")).toBe(formatObjectivePercent(400));
    expect(within(result).getByText("Mejora")).toBeTruthy();
    const progress = within(result).getByRole("progressbar");
    expect(progress.getAttribute("aria-valuenow")).toBe("100");
    expect(progress.getAttribute("aria-valuetext")).toContain(formatObjectivePercent(400));
    const execution = screen.getByRole("group", { name: "Ejecución del plan" });
    expect(within(execution).getByText("30%")).toBeTruthy();
    expect(within(execution).getByText("50%")).toBeTruthy();
    expect(within(execution).queryByText(/Variación respecto/)).toBeNull();
    expect(globalValue("Avance ponderado hacia las metas de los OTE")).toBe("100%");
    expect(globalValue("Avance Objetivos Operativos")).toBe("30%");
    fireEvent.click(screen.getByText(planning.objectiveName));
    await advance(900);
    expect(screen.getByLabelText("Valor actual del indicador OTE")).toBeTruthy();
    expect(screen.queryByText("Avance de la Meta")).toBeNull();
    expect(screen.queryByText("% Meta alcanzada")).toBeNull();
    expect(mocks.planning).not.toHaveBeenCalled();
    expect(mocks.narratives).not.toHaveBeenCalled();
  });

  it("does not autosave initial readonly backend metadata or use stale metadata as the result source", async () => {
    const stale = { ...getOTResultMetrics(ote()), currentValue: 1, variationPercent: 1, goalProgress: 1 };
    const planning = ote({ resultMetrics: stale, porcentajeMetaAlcanzadoRaw: 1,
      resultKeys: [oo({ resultMetrics: stale, porcentajeAlcanzadoRaw: 1 })] });
    await mount([planning]);
    await advance(1600);
    const result = screen.getByRole("group", { name: "Resultado OTE" });
    expect(metricText(result, "Avance hacia la meta")).toBe(formatObjectivePercent(400));
    fireEvent.click(screen.getByText(planning.objectiveName));
    await advance(1600);
    expect(metricText(screen.getByRole("group", { name: "Resultado OO" }), "Avance hacia la meta")).toBe(formatObjectivePercent(400));
    expect(mocks.planning).not.toHaveBeenCalled();
    expect(mocks.narratives).not.toHaveBeenCalled();
    expect(planning.resultMetrics).toEqual(stale);
  });

  it.each([
    [0, 10, 5, /inicio igual a cero/, "+5 unidades"],
    [-10, -20, -15, /inicio negativo/, "-5 unidades"],
  ])("explains unavailable variation and absolute delta with baseline %s", async (baseline, goal, current, reason, delta) => {
    await mount([ote({ puntoPartida: baseline, metaLlegada: goal, avanceMeta: current })]);
    const result = screen.getByRole("group", { name: "Resultado OTE" });
    expect(metricText(result, "Variación respecto al inicio")).toBe("No calculable");
    expect(within(result).getByText(reason as RegExp)).toBeTruthy();
    expect(within(result).getByText(new RegExp(`Cambio absoluto: ${String(delta).replace("+", "\\+")}`))).toBeTruthy();
    expect(result.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("handles equal baseline/goal as unavailable progress, not zero or NaN", async () => {
    await mount([ote({ puntoPartida: 10, metaLlegada: 10, avanceMeta: 20 })]);
    const result = screen.getByRole("group", { name: "Resultado OTE" });
    expect(metricText(result, "Avance hacia la meta")).toBe(formatObjectivePercent(null));
    expect(within(result).getByText("Sin avance calculable")).toBeTruthy();
    expect(result.textContent).not.toMatch(/NaN|Infinity/);
    expect(globalValue("Avance ponderado hacia las metas de los OTE")).toBe("0%");
  });

  it("labels falling values as improvement when a negative goal asks for a decrease", async () => {
    await mount([ote({ puntoPartida: 100, metaLlegada: -50, avanceMeta: -80 })]);
    const result = screen.getByRole("group", { name: "Resultado OTE" });
    expect(metricText(result, "Variación respecto al inicio")).toBe(formatObjectivePercent(-180, true));
    expect(metricText(result, "Avance hacia la meta")).toBe(formatObjectivePercent(120));
    expect(within(result).getByText("Mejora")).toBeTruthy();
    expect(result.textContent).toContain("Meta superada");
  });

  it("updates checklist OTE on twelve months without rewriting numeric baseline, goal or buffers", async () => {
    const planning = ote({ expanded: true, trackingType: "mensual_checklist", checklistValues: Array(12).fill(false),
      monthlyValues: [9, ...Array(11).fill(0)] });
    await mount([planning]);
    const result = screen.getAllByRole("group", { name: "Resultado OTE" })[1];
    expect(within(result).getByText(/No aplica al seguimiento por cumplimiento/)).toBeTruthy();
    expect(result.textContent).not.toContain("Cambio absoluto");
    const january = screen.getByText("Ene").parentElement!;
    fireEvent.click(within(january).getByRole("button"));
    await advance(800);
    expect(metricText(result, "Avance hacia la meta")).toBe(formatObjectivePercent(8));
    expect(screen.getByText("Meses cumplidos: 1 / 12")).toBeTruthy();
    expect(mocks.planning).toHaveBeenCalledWith(expect.objectContaining({
      puntoPartida: 100, metaLlegada: 110, avanceMeta: 1, trackingType: "mensual_checklist",
      goal: "Meta histórica intacta", monthlyValues: planning.monthlyValues,
      checklistValues: [true, ...Array(11).fill(false)],
    }));
  });

  it("keeps focus-link expansion view-only with all target IDs intact", async () => {
    const resultKey = oo();
    const planning = ote({ resultKeys: [resultKey] });
    mocks.search = `?focusObjectiveId=${planning.objectiveId}&focusResultKeyId=${resultKey.id}`;
    // jsdom has no native layout or scrolling; this only observes the focus hook.
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scroll, configurable: true });
    await mount([planning]);
    await advance(1200);
    expect(screen.getByLabelText("Valor actual del indicador OTE")).toBeTruthy();
    expect(document.getElementById(`ote-result-${planning.objectiveId}-0-${encodeURIComponent(resultKey.id)}`)).toBeTruthy();
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(mocks.planning).not.toHaveBeenCalled();
    expect(mocks.narratives).not.toHaveBeenCalled();
  });

  it("preserves signed negative raw progress and caps only aggregate contributions", async () => {
    await mount([ote({ avanceMeta: 80, ponderacion: 40, resultKeys: [oo({ condicionActual: 80, ponderacion: 30 })] })]);
    const result = screen.getByRole("group", { name: "Resultado OTE" });
    expect(metricText(result, "Avance hacia la meta")).toBe(formatObjectivePercent(-200));
    expect(within(result).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(within(result).getByText("Retroceso")).toBeTruthy();
    expect(globalValue("Avance ponderado hacia las metas de los OTE")).toBe("-40%");
    expect(globalValue("Avance Objetivos Operativos")).toBe("-12%");
  });

  it("keeps the legacy total's unrounded contribution until final rounding", async () => {
    // Individual: 0.83%; old unrounded 0.834 * 60% = 0.5004 → total 1%.
    await mount([ote({ puntoPartida: 0, metaLlegada: 100, avanceMeta: 0.834, ponderacion: 60,
      resultKeys: [oo({ condicionInicial: 0, meta: 100, condicionActual: 0.834, ponderacion: 60 })] })]);
    expect(metricText(screen.getByRole("group", { name: "Resultado OTE" }), "Avance hacia la meta")).toBe(formatObjectivePercent(0.83));
    expect(globalValue("Avance ponderado hacia las metas de los OTE")).toBe("1%");
    expect(within(screen.getByRole("group", { name: "Ejecución del plan" })).getByText("1%")).toBeTruthy();
  });

  it("autosaves current values and keeps legacy goal, weights, tasks and monthly buffers intact", async () => {
    const task = { id: "task-original", description: "Tarea original", responsible: "R", date: "2026-11-09", percentageCompleted: 62, weighting: 45 };
    const resultKey = oo({ ponderacion: 30, tasks: [task], ooMonthlyValues: [7, ...Array(11).fill(0)] });
    const planning = ote({ expanded: true, resultKeys: [resultKey], monthlyValues: [3, ...Array(11).fill(0)], checklistValues: Array(12).fill(false) });
    await mount([planning]);
    fireEvent.change(screen.getByLabelText("Valor actual del indicador OTE"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Valor actual del indicador OO"), { target: { value: "160" } });
    await advance(800);
    expect(mocks.planning).toHaveBeenCalledTimes(1);
    expect(mocks.planning).toHaveBeenCalledWith(expect.objectContaining({
      objectiveId: planning.objectiveId, goal: "Meta histórica intacta", avanceMeta: 150,
      puntoPartida: 100, metaLlegada: 110, unidadMedida: "unidades", ponderacion: 100,
      monthlyValues: planning.monthlyValues, checklistValues: planning.checklistValues,
      resultKeys: [expect.objectContaining({ condicionActual: 160, porcentajeAlcanzado: 600, ponderacion: 30, tasks: [task], ooMonthlyValues: resultKey.ooMonthlyValues })],
    }));
    expect(mocks.narratives).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Guardar$/ })).toBeNull();
    const cached = JSON.parse(localStorage.getItem("tactical_planning_21")!)[0];
    expect(cached.porcentajeMetaAlcanzado).toBe(500);
    expect(cached.goal).toBe(planning.goal);
    expect(cached.resultKeys[0].tasks).toEqual([task]);
  });

  it("shows OO no-relative-variation and checklist no-growth semantics", async () => {
    const planning = ote({ expanded: true, resultKeys: [oo({ condicionInicial: 0, meta: 10, condicionActual: 5 })] });
    await mount([planning]);
    let result = screen.getByRole("group", { name: "Resultado OO" });
    expect(metricText(result, "Variación respecto al inicio")).toBe("No calculable");
    expect(within(result).getByText(/inicio igual a cero/)).toBeTruthy();
    const selectors = screen.getAllByRole("combobox");
    fireEvent.change(selectors[1], { target: { value: "mensual_checklist" } });
    result = screen.getByRole("group", { name: "Resultado OO" });
    expect(within(result).getByText(/No aplica al seguimiento por cumplimiento/)).toBeTruthy();
    expect(result.textContent).not.toContain("Cambio absoluto");
    expect(metricText(result, "Avance hacia la meta")).toBe(formatObjectivePercent(0));
  });

  it("retains no-OO-weight fallback to task mean and task weighting semantics", async () => {
    const taskA = { id: "a", description: "", responsible: "", date: "", percentageCompleted: 20, weighting: 25 };
    const taskB = { id: "b", description: "", responsible: "", date: "", percentageCompleted: 80, weighting: 75 };
    await mount([ote({ resultKeys: [oo({ ponderacion: 0, tasks: [taskA, taskB] })] })]);
    const execution = screen.getByRole("group", { name: "Ejecución del plan" });
    expect(within(execution).getByText("50%")).toBeTruthy(); // OO fallback = simple mean of task percentages.
    expect(within(execution).getByText("65%")).toBeTruthy(); // Task section = weighted task mean.
    expect(globalValue("Avance Objetivos Operativos")).toBe("50%");
    expect(globalValue("Avance de Tareas")).toBe("65%");
  });
});
