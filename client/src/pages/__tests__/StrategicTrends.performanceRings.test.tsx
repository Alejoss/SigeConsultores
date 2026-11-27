// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import StrategicTrends from "../StrategicTrends";
import { PerformanceSummaryRing } from "@/components/PerformanceSummaryRing";
import { formatObjectivePercent } from "@shared/objectiveResultMetrics";

const mocks = vi.hoisted(() => ({
  deniedModules: [] as string[],
  manager: { isManagerLogin: true, managerCompanyId: 71001 as number | null },
  processLeader: null as null | { companyId: number; processId: number },
  queries: {} as Record<string, { data?: any; isLoading: boolean; error?: unknown; isPlaceholderData?: boolean; isFetching?: boolean }>,
  calls: vi.fn(),
  refetch: vi.fn(),
  empty: [] as any[],
}));

vi.mock("@/contexts/TeamAccessContext", () => ({ useTeamAccessState: () => ({ isProcessLeader: mocks.deniedModules.length > 0, isChecking: false, access: { moduleAccess: { strategy: mocks.deniedModules.includes("strategy") ? "none" : "read", management_systems: mocks.deniedModules.includes("management_systems") ? "none" : "read", organization_personnel: mocks.deniedModules.includes("organization_personnel") ? "none" : "read" } } }) }));
vi.mock("@/_core/hooks/useManagerAuth", () => ({ useManagerAuth: () => mocks.manager }));
vi.mock("@/contexts/ProcessLeaderAuthContext", () => ({ useProcessLeaderAuth: () => ({ session: mocks.processLeader }) }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/hooks/useCompanyManagementPermission", () => ({
  useCompanyManagementPermission: () => ({ canManageCompany: mocks.manager.isManagerLogin }),
  CompanyReadOnlyNotice: () => <p>Modo de consulta</p>,
}));
// Keep the actual StrategicMeasurementOverview and its global indicator. Only its
// unrelated edit/timeline/area children are isolated; no mock calculates the OE aggregate.
vi.mock("@/components/strategic-measurement/StrategicObjectiveDetail", () => ({
  StrategicObjectiveDetail: () => null,
  strategicMeasurementLabel: () => "Medido",
}));
vi.mock("@/components/strategic-measurement/StrategicMeasurementTimeline", () => ({ StrategicMeasurementTimeline: () => null }));
vi.mock("@/components/strategic-measurement/OTEByArea", () => ({ OTEByArea: () => null }));
vi.mock("@/components/PerformanceAreaDetail", () => ({ PerformanceAreaDetail: () => null }));
vi.mock("recharts", () => {
  const Container = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    BarChart: Container, RadarChart: Container, RadialBarChart: Container, ResponsiveContainer: Container,
    Bar: Container, Radar: Empty, RadialBar: Empty, Cell: Empty, XAxis: Empty, YAxis: Empty,
    CartesianGrid: Empty, Tooltip: Empty, Legend: Empty, PolarGrid: Empty, PolarAngleAxis: Empty,
  };
});
vi.mock("@/lib/trpc", () => {
  const query = (key: string) => ({ useQuery: (input: unknown, options?: { enabled?: boolean }) => {
    mocks.calls(key, input, options);
    // The same arrays/objects are returned across renders to avoid artificial loops.
    return { ...(mocks.queries[key] ?? { data: mocks.empty, isLoading: false }), refetch: mocks.refetch };
  } });
  return { trpc: {
    strategicObjectives: { getMeasurementOverview: query("strategicObjectives.getMeasurementOverview") },
    strategicTrends: {
      getOtgByArea: query("strategicTrends.getOtgByArea"),
      getStakeholdersByArea: query("strategicTrends.getStakeholdersByArea"),
      getStrategicObjectivesBreakdown: query("strategicTrends.getStrategicObjectivesBreakdown"),
    },
    managementPrograms: { list: query("managementPrograms.list") },
    auditsInspections: { listAudits: query("auditsInspections.listAudits"), listInspections: query("auditsInspections.listInspections") },
    companyCompliances: { list: query("companyCompliances.list") },
    companyTrainings: { list: query("companyTrainings.list") },
    payroll: { analytics: query("payroll.analytics") },
    processParticipants: { performanceByArea: query("processParticipants.performanceByArea") },
    processMap: { list: query("processMap.list") },
  } };
});

const COMPANY = 71001;
const HOME_KEYS = [
  "strategicObjectives.getMeasurementOverview", "strategicTrends.getOtgByArea",
  "strategicTrends.getStakeholdersByArea", "payroll.analytics", "managementPrograms.list",
  "auditsInspections.listAudits", "auditsInspections.listInspections", "companyCompliances.list", "companyTrainings.list",
];
const SGI_KEYS = ["managementPrograms.list", "auditsInspections.listAudits", "auditsInspections.listInspections", "companyCompliances.list", "companyTrainings.list"];
const CARDS = [
  { view: "oe", label: "Objetivos Estratégicos", value: 37.25, detail: "Avance global ponderado hacia las metas de OE", keys: ["strategicObjectives.getMeasurementOverview"] },
  { view: "otg", label: "Objetivos de Gestión", value: 10, detail: "Proporción marcada como lograda", keys: ["strategicTrends.getOtgByArea"] },
  { view: "gpi", label: "Gestión con Partes Interesadas", value: 10, detail: "% Implementado", keys: ["strategicTrends.getStakeholdersByArea"] },
  { view: "sgi", label: "Sistemas de Gestión", value: 60, detail: "Promedio General Sistemas de Gestión", keys: SGI_KEYS },
  { view: "staff", label: "Desempeño de personal", value: 72.35, detail: "Cumplimiento global", keys: ["payroll.analytics", "processParticipants.performanceByArea"] },
];

function measuredObjective(id: number, weight: number, value: number) {
  return {
    id, name: `OE sintético ${id}`, objective: "Objetivo sintético", description: "Medición de software",
    target: "Meta sintética", responsible: "Responsable ficticio", deadline: "2026-12-31", orderIndex: id,
    measurementConfig: { initialSituation: "Inicio", expectedResult: "Meta", indicator: "Indicador sintético", weight, baseline: 0, goal: 100, unit: "unidades", deadline: "2026-12-31" },
    measurementStatus: "measured", percent: value,
    latestMeasurement: { id, objectiveId: id, measurementDate: "2026-11-25", value, percent: value, observation: "Fixture sintético", evidence: "Sin datos de clientes" },
  };
}
function ready(data: any) { return { data, isLoading: false, isPlaceholderData: false }; }
function seed() {
  mocks.queries = {
    // Authoritative weighted OE response; deliberately different from OTE execution below.
    "strategicObjectives.getMeasurementOverview": ready({
      objectives: [measuredObjective(1, 75, 40.25), measuredObjective(2, 25, 28.25)],
      globalPercent: 37.25, totalWeight: 100, configuredCount: 2, measuredCount: 2, totalCount: 2, status: "complete",
    }),
    "strategicTrends.getStrategicObjectivesBreakdown": ready({
      globalPercent: 100, objectives: [{ id: 1, name: "OTE no es OE", contributions: [{ processId: 1, processName: "Área sintética", percent: 100 }] }],
    }),
    "strategicTrends.getOtgByArea": ready([
      { processId: 1, processName: "Área sintética A", totalOTG: 1, logrados: 1, comunicados: 1, percent: 100 },
      { processId: 2, processName: "Área sintética B", totalOTG: 9, logrados: 0, comunicados: 0, percent: 0 },
    ]),
    "strategicTrends.getStakeholdersByArea": ready([
      { processId: 1, processName: "Área sintética A", totalStakeholders: 1, implemented: 1, internalCount: 1, externalCount: 0, plannedActions: 20, percentImplemented: 100 },
      { processId: 2, processName: "Área sintética B", totalStakeholders: 9, implemented: 0, internalCount: 3, externalCount: 6, plannedActions: 1, percentImplemented: 0 },
    ]),
    "managementPrograms.list": ready([{ plannedActions: 2, completedActions: 1 }]),
    "auditsInspections.listAudits": ready([{ findingsMajorNC: 1, closuresMajorNC: 1 }]),
    "auditsInspections.listInspections": ready([{ findings: 2, closures: 1 }]),
    "companyCompliances.list": ready([{ evaluationMode: "meses", plannedMonths: "1,2", completedMonths: "1" }]),
    "companyTrainings.list": ready([{ completed: "SI" }, { completed: "NO" }]),
    "payroll.analytics": ready({ averagePerformance: 72.35, activeCount: 4 }),
    // Deliberately not the payroll average; home must not recalculate from areas.
    "processParticipants.performanceByArea": ready({ areas: [{ processId: 1, processName: "Área sintética", evaluatedWorkers: 2, performance: 15 }], withoutEvaluation: 0 }),
    "processMap.list": ready(mocks.empty),
  };
}
function mount(path = `/strategic-trends?companyId=${COMPANY}`) {
  const location = memoryLocation({ path, record: true });
  const tree = () => <Router hook={location.hook} searchHook={location.searchHook}><StrategicTrends /></Router>;
  const rendered = render(tree());
  return { ...rendered, location, refresh: () => rendered.rerender(tree()) };
}
function card(label: string) { return screen.getByRole("button", { name: new RegExp(label, "i") }); }
function ring(label: string) { return screen.getByRole("img", { name: new RegExp(`^Avance general de ${label}:`) }); }
function queryRing(label: string) { return screen.queryByRole("img", { name: new RegExp(`^Avance general de ${label}:`) }); }
function activeCalls() { return mocks.calls.mock.calls.filter(([, , options]) => options?.enabled !== false); }
function percentNumber(text: string) { return Number(text.replace(/\s|%/g, "").replace(",", ".")); }
function detailPercent(view: string, label: string) {
  if (view === "oe") {
    const section = screen.getByRole("region", { name: label });
    return percentNumber(section.querySelector(".text-3xl")!.textContent!);
  }
  const labelNode = screen.getByText(label, { exact: true });
  const metric = view === "staff"
    ? labelNode.parentElement!.querySelector("span.font-bold")
    : labelNode.parentElement!.querySelector(".text-3xl");
  expect(metric).not.toBeNull();
  return percentNumber(metric!.textContent!);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear(); sessionStorage.clear();
  mocks.manager = { isManagerLogin: true, managerCompanyId: COMPANY };
  mocks.processLeader = null;
  mocks.deniedModules = [];
  seed();
});
afterEach(cleanup);

describe("StrategicTrends: five discreet rings using exactly the detail sources", () => {
  it("shows five two-decimal accessible indicators without extra controls or a new KPI", () => {
    mount();
    expect(screen.getAllByRole("img")).toHaveLength(5);
    for (const { label, value } of CARDS) {
      const indicator = ring(label);
      expect(indicator).toHaveAccessibleName(`Avance general de ${label}: ${formatObjectivePercent(value)}`);
      expect(within(indicator).getByText(formatObjectivePercent(value))).toBeVisible();
      expect(indicator).toHaveAttribute("title", expect.stringContaining(formatObjectivePercent(value)));
      expect(indicator.querySelector("[data-visual-progress]")).toHaveAttribute("data-visual-progress", String(value));
      expect(indicator.querySelector("button, a, input, [tabindex]")).toBeNull();
      expect(indicator.closest("button")).toBe(card(label));
    }
    expect(screen.getAllByRole("button")).toHaveLength(6); // five existing cards and Back
  });

  it("uses exactly nine company-level home query keys, with current-year payroll and no N+1", () => {
    mount();
    const calls = activeCalls();
    expect(calls).toHaveLength(9);
    expect(calls.map(([key]) => key).sort()).toEqual([...HOME_KEYS].sort());
    for (const [key, input] of calls) {
      expect(input).toEqual(key === "payroll.analytics"
        ? { companyId: COMPANY, performanceYear: new Date().getFullYear() } : { companyId: COMPANY });
    }
    expect(mocks.calls.mock.calls.some(([key]) => key === "processParticipants.performanceByArea")).toBe(false);
    expect(mocks.calls.mock.calls.some(([key]) => key === "strategicTrends.getStrategicObjectivesBreakdown")).toBe(false);
  });

  it.each(CARDS)("keeps $label identical to its real detail when navigating by clicking the ring", async ({ view, label, value, detail, keys }) => {
    const user = userEvent.setup();
    const mounted = mount();
    const displayedHome = percentNumber(within(ring(label)).getByText(formatObjectivePercent(value)).textContent!);
    mocks.calls.mockClear();
    await user.click(ring(label));
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(detailPercent(view, detail)).toBe(displayedHome);
    const route = new URL(mounted.location.history!.at(-1)!, "https://synthetic.invalid");
    expect(route.searchParams.get("companyId")).toBe(String(COMPANY));
    expect(route.searchParams.get("view")).toBe(view);
    expect(route.searchParams.get("tab")).toBe("overview");
    const detailKeys = [...new Set(activeCalls().map(([key]) => key))].sort();
    expect(detailKeys).toEqual([...keys].sort()); // home queries unmounted, not hidden-but-still-fetching
    if (view === "staff") {
      expect(activeCalls().find(([key]) => key === "payroll.analytics")![1]).toEqual({ companyId: COMPANY, performanceYear: new Date().getFullYear() });
      expect(activeCalls().find(([key]) => key === "processParticipants.performanceByArea")![1]).toEqual({ companyId: COMPANY, year: new Date().getFullYear() });
    }
    await user.click(screen.getAllByRole("button", { name: /Volver/ })[0]);
    expect(screen.getAllByRole("img")).toHaveLength(5);
    expect(ring(label)).toHaveAccessibleName(`Avance general de ${label}: ${formatObjectivePercent(value)}`);
  });

  it("takes the authoritative weighted OE globalPercent, never the OTE aggregate or the mean of per-OE percentages", () => {
    mount();
    expect(ring("Objetivos Estratégicos")).toHaveAccessibleName("Avance general de Objetivos Estratégicos: 37,25 %");
    expect(within(card("Objetivos Estratégicos")).queryByText("100,00 %")).toBeNull();
    // Perturb only the source response to catch any client-side aggregate reconstruction.
    const overview = mocks.queries["strategicObjectives.getMeasurementOverview"].data;
    expect(overview.globalPercent).not.toBe((overview.objectives[0].percent + overview.objectives[1].percent) / 2);
    expect(overview.globalPercent).not.toBe(mocks.queries["strategicTrends.getStrategicObjectivesBreakdown"].data.globalPercent);
  });

  it.each(["{Enter}", " "])("allows keyboard card navigation via %s without introducing a second focus target", async key => {
    const user = userEvent.setup();
    const mounted = mount();
    await user.tab();
    expect(screen.getByRole("button", { name: /Volver/ })).toHaveFocus();
    await user.tab();
    expect(card("Objetivos Estratégicos")).toHaveFocus();
    await user.keyboard(key);
    expect(screen.getByRole("region", { name: "Avance global ponderado hacia las metas de OE" })).toBeVisible();
    expect(mounted.location.history!.at(-1)).toContain("view=oe");
  });

  it("keeps the card body clickable independently of its ring", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(within(card("Objetivos de Gestión")).getByText("Objetivos de Gestión", { exact: true }));
    expect(screen.getByText("Proporción marcada como lograda")).toBeVisible();
  });
});

describe("StrategicTrends: absence is not a measured zero", () => {
  it.each(CARDS)("hides only $label during loading, error, or placeholder data; card navigation remains available", ({ label, keys }) => {
    for (const state of [{ isLoading: true }, { error: new Error("fallo sintético") }, { isPlaceholderData: true }]) {
      mocks.queries[keys[0]] = { ...mocks.queries[keys[0]], isLoading: false, error: undefined, isPlaceholderData: false, ...state };
      const mounted = mount();
      expect(queryRing(label)).toBeNull();
      expect(screen.getAllByRole("img")).toHaveLength(4);
      expect(card(label)).toBeEnabled();
      mounted.unmount();
    }
  });

  it.each(SGI_KEYS)("withholds SGI until all five are ready, even if only %s is incomplete", key => {
    for (const state of [{ isLoading: true }, { error: new Error("fallo SGI sintético") }, { isPlaceholderData: true }]) {
      mocks.queries[key] = { ...mocks.queries[key], isLoading: false, error: undefined, isPlaceholderData: false, ...state };
      const mounted = mount();
      expect(queryRing("Sistemas de Gestión")).toBeNull();
      expect(screen.getAllByRole("img")).toHaveLength(4);
      mocks.queries[key] = { ...mocks.queries[key], isLoading: false, error: undefined, isPlaceholderData: false };
      mounted.refresh();
      expect(ring("Sistemas de Gestión")).toHaveAccessibleName("Avance general de Sistemas de Gestión: 60,00 %");
      mounted.unmount();
    }
  });

  it("withholds every indicator for absent data while preserving all five access cards", () => {
    for (const key of HOME_KEYS) mocks.queries[key] = ready(undefined);
    mount();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    for (const { label } of CARDS) expect(card(label)).toBeEnabled();
    expect(screen.queryByText("0,00 %")).toBeNull();
  });

  it("hides null OE/payroll and registrations without an evaluable base", () => {
    mocks.queries["strategicObjectives.getMeasurementOverview"].data.globalPercent = null;
    mocks.queries["payroll.analytics"].data.averagePerformance = null;
    mocks.queries["strategicTrends.getOtgByArea"] = ready([{ processId: 1, processName: "Área vacía", totalOTG: 0, logrados: 0, percent: 0 }]);
    mocks.queries["strategicTrends.getStakeholdersByArea"].data.forEach((area: any) => { area.plannedActions = 0; });
    for (const key of SGI_KEYS) mocks.queries[key] = ready(mocks.empty);
    mount();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.queryByText("0,00 %")).toBeNull();
  });

  it("shows five real zeros with evaluable sources, including one SGI base and an unimplemented PI plan", () => {
    mocks.queries["strategicObjectives.getMeasurementOverview"].data.globalPercent = 0;
    mocks.queries["payroll.analytics"].data.averagePerformance = 0;
    mocks.queries["strategicTrends.getOtgByArea"].data.forEach((area: any) => { area.logrados = 0; });
    mocks.queries["strategicTrends.getStakeholdersByArea"].data.forEach((area: any) => { area.implemented = 0; });
    for (const key of SGI_KEYS) mocks.queries[key] = ready(mocks.empty);
    mocks.queries["managementPrograms.list"] = ready([{ plannedActions: 2, completedActions: 0 }]);
    mount();
    expect(screen.getAllByRole("img")).toHaveLength(5);
    for (const { label } of CARDS) {
      expect(ring(label)).toHaveAccessibleName(`Avance general de ${label}: 0,00 %`);
      expect(ring(label).querySelector("[data-visual-progress]")).toHaveAttribute("data-visual-progress", "0");
    }
  });

  it.each([NaN, Infinity, -Infinity])("does not render nonfinite OE/payroll response %s", value => {
    mocks.queries["strategicObjectives.getMeasurementOverview"].data.globalPercent = value;
    mocks.queries["payroll.analytics"].data.averagePerformance = value;
    mount();
    expect(queryRing("Objetivos Estratégicos")).toBeNull();
    expect(queryRing("Desempeño de personal")).toBeNull();
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("retains the last ready percentage during background fetching, not during a query failure", () => {
    mocks.queries["payroll.analytics"].isFetching = true;
    const mounted = mount();
    expect(ring("Desempeño de personal")).toHaveAccessibleName("Avance general de Desempeño de personal: 72,35 %");
    mocks.queries["payroll.analytics"].error = new Error("fallo de recarga sintético");
    mounted.refresh();
    expect(queryRing("Desempeño de personal")).toBeNull();
  });
});

describe("StrategicTrends: company scope and conditional mounting", () => {
  it.each([
    { role: "manager", companyId: 71002, leaderCompanyId: 71003 },
    { role: "process leader", companyId: 71004, leaderCompanyId: 71004 },
  ])("scopes the nine queries and navigation to the $role company, ignoring a conflicting URL", async ({ role, companyId, leaderCompanyId }) => {
    mocks.manager = { isManagerLogin: role === "manager", managerCompanyId: role === "manager" ? companyId : null };
    mocks.processLeader = { companyId: leaderCompanyId, processId: 81001 };
    const user = userEvent.setup();
    const mounted = mount("/strategic-trends?companyId=79999");
    expect(activeCalls()).toHaveLength(9);
    for (const [, input] of activeCalls()) {
      expect(input.companyId).toBe(companyId);
      expect(input.processId).toBeUndefined();
    }
    await user.click(ring("Objetivos de Gestión"));
    expect(mounted.location.history!.at(-1)).toContain(`companyId=${companyId}`);
    if (role === "process leader") {
      await user.click(screen.getAllByRole("button", { name: /Volver/ })[0]);
      await user.click(ring("Objetivos Estratégicos"));
      expect(screen.getByText("Modo de consulta")).toBeVisible();
    }
  });

  it.each(CARDS)("does not mount unrelated home queries on direct entry to $view", ({ view, keys }) => {
    mount(`/strategic-trends?companyId=${COMPANY}&view=${view}&tab=overview`);
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect([...new Set(activeCalls().map(([key]) => key))].sort()).toEqual([...keys].sort());
  });

  it("disables all nine home queries when no company scope is available", () => {
    mocks.manager = { isManagerLogin: false, managerCompanyId: null };
    // The real session scope reads the browser URL/storage, not the memory router.
    window.history.replaceState(null, "", "/strategic-trends");
    for (const key of HOME_KEYS) mocks.queries[key] = { isLoading: true };
    mount("/strategic-trends");
    expect(mocks.calls).toHaveBeenCalledTimes(9);
    expect(activeCalls()).toHaveLength(0);
    for (const [, input, options] of mocks.calls.mock.calls) {
      expect(input.companyId).toBe(0);
      expect(options.enabled).toBe(false);
    }
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});

describe("PerformanceSummaryRing: bound the drawing, never the displayed result", () => {
  it.each([
    { value: -125.75, text: "-125,75 %", visual: "0", explanation: /negativo.*no representa avance positivo/i },
    { value: 250.125, text: "250,13 %", visual: "100", explanation: /supera el 100.*completo/i },
    { value: 0, text: "0,00 %", visual: "0", explanation: /Indicador sintético/ },
    { value: 72.35, text: "72,35 %", visual: "72.35", explanation: /Indicador sintético/ },
  ])("shows $text but draws $visual and explains the result", ({ value, text, visual, explanation }) => {
    render(<PerformanceSummaryRing value={value} color="#123456" label="Prueba sintética" description="Indicador sintético" />);
    const indicator = screen.getByRole("img", { name: `Avance general de Prueba sintética: ${text}` });
    expect(within(indicator).getByText(text)).toBeVisible();
    expect(indicator.querySelector("[data-visual-progress]")).toHaveAttribute("data-visual-progress", visual);
    expect(indicator).toHaveAttribute("title", expect.stringMatching(explanation));
    expect(indicator.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(indicator.querySelector("svg")).toHaveAttribute("focusable", "false");
    expect(indicator.querySelector("button, a, input, [tabindex]")).toBeNull();
  });

  it.each([null, NaN, Infinity, -Infinity])("does not fabricate a ring for %s", value => {
    const mounted = render(<PerformanceSummaryRing value={value} color="#123456" label="Prueba sintética" description="Indicador sintético" />);
    expect(mounted.container).toBeEmptyDOMElement();
  });

  it.each([-125.75, 250.125])("keeps extreme real response %s on home and its detail, while the drawing stays safe", async value => {
    mocks.queries["strategicObjectives.getMeasurementOverview"].data.globalPercent = value;
    mocks.queries["payroll.analytics"].data.averagePerformance = value;
    const user = userEvent.setup();
    mount();
    for (const label of ["Objetivos Estratégicos", "Desempeño de personal"]) {
      expect(ring(label)).toHaveAccessibleName(`Avance general de ${label}: ${formatObjectivePercent(value)}`);
      expect(ring(label).querySelector("[data-visual-progress]")).toHaveAttribute("data-visual-progress", value < 0 ? "0" : "100");
    }
    await user.click(ring("Objetivos Estratégicos"));
    expect(detailPercent("oe", "Avance global ponderado hacia las metas de OE")).toBe(percentNumber(formatObjectivePercent(value)));
    await user.click(screen.getAllByRole("button", { name: /Volver/ })[0]);
    await user.click(ring("Desempeño de personal"));
    expect(detailPercent("staff", "Cumplimiento global")).toBe(value);
  });
});

describe("granular dashboard restrictions", () => {
  it("hides systems/personnel cards and disables their summary queries without blocking process OTG/GPI", () => {
    mocks.deniedModules = ["management_systems", "organization_personnel"]; mount();
    expect(screen.queryByRole("button", { name: /Sistemas de Gestión/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Desempeño de personal/i })).toBeNull();
    expect(card("Objetivos de Gestión")).toBeTruthy(); expect(card("Gestión con Partes Interesadas")).toBeTruthy();
    const active = activeCalls().map(([name]) => name);
    expect(active).not.toContain("payroll.analytics"); expect(active).not.toContain("managementPrograms.list"); expect(active).not.toContain("auditsInspections.listAudits");
  });
  it("hides strategy OE and does not fetch its corporate measurement when strategy is restricted", () => {
    mocks.deniedModules = ["strategy"]; mount();
    expect(screen.queryByRole("button", { name: /Objetivos Estratégicos/i })).toBeNull();
    expect(activeCalls().map(([name]) => name)).not.toContain("strategicObjectives.getMeasurementOverview");
  });
});
