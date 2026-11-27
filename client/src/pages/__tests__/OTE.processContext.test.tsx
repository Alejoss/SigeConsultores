import { annualBusinessStorage } from "@/lib/annualWorkspace";
// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProcessTacticalObjectives from "../ProcessTacticalObjectives";
import TacticalDefinition from "../TacticalDefinition";
import TacticalPlanning from "../TacticalPlanning";

vi.stubGlobal("React", React);
const mocks = vi.hoisted(() => ({
  processQuery: vi.fn(), listQuery: vi.fn(), loadQuery: vi.fn(),
  create: vi.fn(), update: vi.fn(), remove: vi.fn(), planning: vi.fn(), narratives: vi.fn(),
  exportPDF: vi.fn(), error: vi.fn(),
  process: undefined as any,
  objectives: {} as Record<number, any[] | undefined>,
  plannings: {} as Record<number, any[] | undefined>,
  strategicObjectives: [] as any[],
  placeholder: false,
}));
vi.mock("sonner", () => ({ toast: {
  error: mocks.error, success: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn(),
} }));
vi.mock("@/lib/exportTacticalObjectivesToPDF", () => ({ exportTacticalObjectivesToPDF: mocks.exportPDF }));
vi.mock("@/components/ActivePlanningCycleBadge", () => ({
  ActivePlanningCycleBadge: ({ companyId }: { companyId: number }) => <span data-testid="cycle-company">{companyId}</span>,
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ processTacticalObjectives: { list: { invalidate: vi.fn() } } }),
  processMap: { get: { useQuery: (input: any, options: any) => {
    mocks.processQuery(input, options);
    return mocks.process;
  } } },
  strategicObjectives: { list: { useQuery: () => ({ data: mocks.strategicObjectives }) } },
  policies: { get: { useQuery: () => ({ data: null }) } },
  policyObjectives: { list: { useQuery: () => ({ data: [] }) } },
  processTacticalObjectives: {
    list: { useQuery: (input: any, options: any) => {
      mocks.listQuery(input, options);
      return { data: options.enabled ? mocks.objectives[input.processId] : undefined, isPlaceholderData: mocks.placeholder };
    } },
    loadPlanningData: { useQuery: (input: any, options: any) => {
      mocks.loadQuery(input, options);
      return { data: options.enabled ? mocks.plannings[input.processId] : undefined, isPlaceholderData: mocks.placeholder };
    } },
    create: { useMutation: () => ({ mutateAsync: mocks.create }) },
    update: { useMutation: () => ({ mutateAsync: mocks.update }) },
    delete: { useMutation: () => ({ mutate: mocks.remove }) },
    savePlanning: { useMutation: () => ({ mutateAsync: mocks.planning }) },
    saveNarratives: { useMutation: () => ({ mutateAsync: mocks.narratives }) },
  },
} }));

// Synthetic same-company processes; storage deliberately points to a different area.
const COMPANY = 90001;
const CURRENT = 90006;
const OLD = 90007;
let objectiveSequence = 91000;
function objective(processId = CURRENT) {
  return {
    id: ++objectiveSequence, processId, name: `Objetivo sintético ${objectiveSequence}`,
    description: "Justificación intacta", responsible: "Responsable ficticio",
    strategicObjective: "Estrategia", policyObjective: "Política", ponderacion: 100,
    puntoPartida: 10, metaLlegada: 20, avanceMeta: 15, unidadMedida: "unidades",
    situacionInicial: "Situación intacta", resultadoEsperado: "Resultado intacto", indicador: "Indicador intacto",
  };
}
function planning(obj: ReturnType<typeof objective>) {
  return {
    id: `planning_${obj.id}`, objectiveId: obj.id, objectiveName: obj.name,
    objectiveEnunciation: obj.name, objectiveExplanation: obj.description, objectiveResponsible: obj.responsible,
    goal: "Meta intacta", resultKeys: [], expanded: true,
    ponderacion: 100, puntoPartida: 10, metaLlegada: 20, avanceMeta: 15, porcentajeMetaAlcanzado: 50,
    unidadMedida: "unidades", monthlyValues: [8, ...Array(11).fill(0)],
    situacionInicial: obj.situacionInicial, resultadoEsperado: obj.resultadoEsperado, indicador: obj.indicador,
  };
}
function setupProcess(processId = CURRENT, name = "Coordinación Marítima") {
  mocks.process = { data: { id: processId, companyId: COMPANY, name }, error: null, isLoading: false, isPending: false };
  const obj = objective(processId);
  mocks.objectives[processId] = [obj];
  mocks.plannings[processId] = [planning(obj)];
  return obj;
}
function route(path: string, query = `processId=${CURRENT}&companyId=${COMPANY}`) {
  window.history.replaceState({}, "", `${path}${query ? `?${query}` : ""}`);
}
function Flow() {
  const [path] = useLocation();
  if (path === "/tactical-definition") return <TacticalDefinition />;
  if (path === "/tactical-planning") return <TacticalPlanning />;
  if (path === "/process-characterization") return <p>Caracterización de regreso</p>;
  return <ProcessTacticalObjectives />;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><Flow /></QueryClientProvider>);
  return { ...view, refresh: () => view.rerender(<QueryClientProvider client={client}><Flow /></QueryClientProvider>) };
}
async function advance(ms = 60) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
function noWrites() {
  for (const fn of [mocks.create, mocks.update, mocks.remove, mocks.planning, mocks.narratives]) expect(fn).not.toHaveBeenCalled();
}
function expectScoped(path: string, processId = CURRENT) {
  expect(window.location.pathname).toBe(path);
  expect(window.location.search).toBe(`?processId=${processId}&companyId=${COMPANY}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ id: 99999 });
  mocks.update.mockResolvedValue(undefined);
  mocks.planning.mockResolvedValue(undefined);
  mocks.narratives.mockResolvedValue(undefined);
  mocks.exportPDF.mockReturnValue(true);
  mocks.objectives = {};
  mocks.plannings = {};
  mocks.placeholder = false;
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("selectedCompanyId", String(COMPANY));
  localStorage.setItem("selectedProcessId", String(OLD));
  localStorage.setItem("selectedProcessName", "Financiero Administrativo");
  setupProcess();
});
afterEach(async () => {
  cleanup();
  await advance(0);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("OTE URL-first process identity and scoped navigation", () => {
  it("keeps entry → definition → entry → planning → entry → characterization scoped without writes", async () => {
    route("/process-tactical-objectives");
    mount();
    expect(screen.getByText("Coordinación Marítima")).toBeTruthy();
    expect(screen.queryByText("Financiero Administrativo")).toBeNull();
    expect(screen.getByTestId("cycle-company").textContent).toBe(String(COMPANY));
    expect(mocks.processQuery).toHaveBeenCalledWith({ processId: CURRENT }, expect.objectContaining({ enabled: true }));
    fireEvent.click(screen.getByRole("button", { name: "Ir a Definición" }));
    await advance();
    expectScoped("/tactical-definition");
    expect(screen.getByText("Proceso: Coordinación Marítima")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "VOLVER" }));
    await advance();
    expectScoped("/process-tactical-objectives");
    fireEvent.click(screen.getByRole("button", { name: "Ir a Planificación" }));
    await advance();
    expectScoped("/tactical-planning");
    expect(screen.getByText("Coordinación Marítima")).toBeTruthy();
    await advance(1700);
    fireEvent.click(screen.getByRole("button", { name: "VOLVER" }));
    await advance();
    expectScoped("/process-tactical-objectives");
    fireEvent.click(screen.getByRole("button", { name: "VOLVER" }));
    await advance();
    expectScoped("/process-characterization");
    noWrites();
    expect(localStorage.getItem("selectedProcessName")).toBe("Financiero Administrativo");
  });

  it.each(["/process-tactical-objectives", "/tactical-definition", "/tactical-planning"])(
    "%s never displays the stored name while loading, errored, absent or mismatched", async path => {
      route(path);
      mocks.process = { data: undefined, isLoading: true, isPending: true };
      const view = mount();
      await advance();
      expect(screen.getByText(/Cargando proceso/)).toBeTruthy();
      for (const response of [
        { data: undefined, error: new Error("denegado") },
        { data: null },
        { data: { id: OLD, companyId: COMPANY, name: "Financiero Administrativo" } },
        { data: { id: CURRENT, companyId: COMPANY + 1, name: "Empresa ajena" } },
        { data: { id: CURRENT, companyId: COMPANY, name: "" } },
        { data: { id: CURRENT, companyId: COMPANY, name: "Nombre placeholder" }, isPlaceholderData: true },
      ]) {
        mocks.process = response;
        view.refresh();
        expect(screen.getByText(/Proceso no disponible/)).toBeTruthy();
        expect(screen.queryByText("Financiero Administrativo")).toBeNull();
        const exportButton = screen.queryByRole("button", { name: /EXPORTAR OBJETIVOS|Exportar a PDF/ });
        if (exportButton) expect((exportButton as HTMLButtonElement).disabled).toBe(true);
      }
      noWrites();
    },
  );

  it.each(["/process-tactical-objectives", "/tactical-definition", "/tactical-planning"])(
    "%s without any identity does not query process 0 or display a cached name", async path => {
      localStorage.removeItem("selectedProcessId");
      localStorage.removeItem("selectedCompanyId");
      route(path, "");
      mount();
      await advance(2200);
      expect(screen.getByText(/Sin proceso seleccionado/)).toBeTruthy();
      expect(mocks.processQuery).toHaveBeenCalledWith({ processId: 0 }, expect.objectContaining({ enabled: false }));
      noWrites();
    },
  );

  it.each(["/tactical-definition", "/tactical-planning"])("%s exports the verified current name and untouched narratives", async path => {
    route(path);
    const obj = mocks.objectives[CURRENT]![0];
    mount();
    await advance();
    fireEvent.click(screen.getByRole("button", { name: /EXPORTAR OBJETIVOS|Exportar a PDF/ }));
    expect(mocks.exportPDF).toHaveBeenCalledTimes(1);
    expect(mocks.exportPDF).toHaveBeenCalledWith(
      [expect.objectContaining({ situacionInicial: obj.situacionInicial, indicador: obj.indicador })],
      "Coordinación Marítima",
    );
    noWrites();
  });

  it("updates entry identity and links on a query-only URL change, ignoring the older response", async () => {
    route("/process-tactical-objectives");
    mount();
    await act(async () => route("/process-tactical-objectives", `processId=${OLD}&companyId=${COMPANY}`));
    expect(screen.queryByText("Coordinación Marítima")).toBeNull();
    expect(screen.getByText(/Proceso no disponible/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir a Planificación" }));
    await advance();
    expectScoped("/tactical-planning", OLD);
    noWrites();
  });

  it.each(["/tactical-definition", "/tactical-planning"])(
    "%s rejects a previous area's objectives/planning after a query-only URL change", async path => {
      route(path);
      const oldObj = mocks.objectives[CURRENT]![0];
      const oldPlanning = mocks.plannings[CURRENT]![0];
      const view = mount();
      await advance();
      // Simulate an older request arriving as the new area's response.
      mocks.objectives[OLD] = [oldObj];
      mocks.plannings[OLD] = [oldPlanning];
      await act(async () => route(path, `processId=${OLD}&companyId=${COMPANY}`));
      await advance(2200);
      expect(screen.queryByDisplayValue(oldObj.name)).toBeNull();
      expect(screen.queryByText(oldObj.name)).toBeNull();
      expect(screen.queryByText("Coordinación Marítima")).toBeNull();
      noWrites();
      const nextObj = setupProcess(OLD, "Financiero Administrativo actualizado");
      view.refresh();
      await advance();
      expect(screen.getByText(/Financiero Administrativo actualizado/)).toBeTruthy();
      const nextValue = path === "/tactical-definition" ? screen.getByDisplayValue(nextObj.name) : screen.getByText(nextObj.name);
      expect(nextValue).toBeTruthy();
      noWrites();
    },
  );

  it("refuses planning rows whose objective IDs do not belong to the current process list", async () => {
    route("/tactical-planning");
    mocks.plannings[CURRENT] = [planning(objective(OLD))];
    mount();
    await advance(2000);
    expect(screen.queryByPlaceholderText("Ingrese la meta del objetivo")).toBeNull();
    noWrites();
  });

  it("flushes a rapid planning edit before VOLVER, keeping the same process and narrative/numeric data", async () => {
    route("/tactical-planning");
    const obj = mocks.objectives[CURRENT]![0];
    mount();
    await advance();
    fireEvent.change(screen.getByPlaceholderText("Ingrese la meta del objetivo"), { target: { value: "Meta editada rápida" } });
    fireEvent.click(screen.getByRole("button", { name: "VOLVER" }));
    await advance();
    expectScoped("/process-tactical-objectives");
    expect(mocks.planning).toHaveBeenCalledTimes(1);
    expect(mocks.planning).toHaveBeenCalledWith(expect.objectContaining({
      objectiveId: obj.id, goal: "Meta editada rápida", avanceMeta: 15, puntoPartida: 10, metaLlegada: 20,
      monthlyValues: [8, ...Array(11).fill(0)], resultKeys: [],
    }));
    expect(mocks.narratives).not.toHaveBeenCalled();
    await advance(2200);
    expect(mocks.planning).toHaveBeenCalledTimes(1);
  });

  it("preserves the old process's pending planning cache on URL change without saving it into the new process", async () => {
    route("/tactical-planning");
    const currentObj = mocks.objectives[CURRENT]![0];
    const view = mount();
    await advance();
    fireEvent.change(screen.getByPlaceholderText("Ingrese la meta del objetivo"), { target: { value: "Borrador del proceso anterior" } });
    const nextObj = setupProcess(OLD, "Área siguiente");
    await act(async () => route("/tactical-planning", `processId=${OLD}&companyId=${COMPANY}`));
    view.refresh();
    await advance(2200);
    const cached = JSON.parse(annualBusinessStorage.getItem(`tactical_planning_${CURRENT}`)!);
    expect(cached[0]).toMatchObject({ objectiveId: currentObj.id, goal: "Borrador del proceso anterior" });
    expect(localStorage.getItem(`tactical_planning_${OLD}`)).toBeNull();
    expect(screen.getByText(nextObj.name)).toBeTruthy();
    expect(screen.getByDisplayValue("Meta intacta")).toBeTruthy();
    noWrites();
  });
});
