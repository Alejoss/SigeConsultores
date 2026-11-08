// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TacticalPlanning from "../TacticalPlanning";

vi.stubGlobal("React", React);
const mocks = vi.hoisted(() => ({
  planning: vi.fn(),
  narratives: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
  plannings: [] as any[],
  objectives: [] as any[],
  process: { data: { companyId: 77 } as { companyId: number } | undefined, error: null as Error | null },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/tactical-planning", mocks.navigate], useSearch: () => "" }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/lib/exportTacticalObjectivesToPDF", () => ({ exportTacticalObjectivesToPDF: vi.fn() }));
vi.mock("@/lib/sessionScope", () => ({
  getProcessIdFromSession: () => 21,
  getCompanyIdFromSession: () => 77,
  getSessionScope: () => ({ processId: 21, companyId: 77, processName: "Área ficticia" }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    processMap: { get: { useQuery: () => mocks.process } },
    processTacticalObjectives: {
      savePlanning: { useMutation: () => ({ mutateAsync: mocks.planning }) },
      saveNarratives: { useMutation: () => ({ mutateAsync: mocks.narratives }) },
      list: { useQuery: () => ({ data: mocks.objectives }) },
      loadPlanningData: { useQuery: () => ({ data: mocks.plannings }) },
    },
  },
}));

let objectiveId = 50_000;
function fixture() {
  const id = ++objectiveId;
  return {
    id: `planning_${id}`, objectiveId: id, objectiveName: `Objetivo ficticio ${id}`,
    objectiveEnunciation: "", objectiveExplanation: "", objectiveResponsible: "",
    situacionInicial: "Contexto leído", resultadoEsperado: "Resultado leído", indicador: "Indicador leído",
    goal: "Meta inicial", resultKeys: [], expanded: true,
    ponderacion: 100, puntoPartida: 0, metaLlegada: 10, unidadMedida: "unidades",
    avanceMeta: 4, porcentajeMetaAlcanzado: 40,
  };
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function mount(plannings = [fixture()]) {
  mocks.plannings = plannings;
  mocks.objectives = plannings.map(item => ({ id: item.objectiveId }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(React.createElement(QueryClientProvider, { client }, React.createElement(TacticalPlanning)));
  await advance(60);
  return view;
}
async function clickExit(label = "VOLVER") {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await advance(60);
}
function editGoal(value: string) {
  fireEvent.change(screen.getAllByPlaceholderText("Ingrese la meta del objetivo")[0], { target: { value } });
}
function editNarrative(value: string, label = "Situación inicial") {
  fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("TacticalPlanning quick navigation and safe exit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.planning.mockReset().mockResolvedValue(undefined);
    mocks.narratives.mockReset().mockResolvedValue(undefined);
    mocks.navigate.mockReset();
    mocks.error.mockReset();
    mocks.process = { data: { companyId: 77 }, error: null };
    localStorage.clear();
  });
  afterEach(async () => {
    cleanup();
    await advance(0);
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps both verified-scope shortcuts visible even without objectives", async () => {
    await mount([]);
    expect(screen.getByRole("button", { name: "Ir a Indicadores OTE" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ir a Cronograma Consolidado" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Exportar a PDF" })).toBeNull();
    await clickExit("Ir a Indicadores OTE");
    expect(mocks.navigate).toHaveBeenCalledWith("/process-indicators?processId=21&companyId=77&oeReturnTab=overview&panel=ote");
    expect(mocks.planning).not.toHaveBeenCalled();
    expect(mocks.narratives).not.toHaveBeenCalled();
  });

  it("leaves the shared RBAC/company mismatch guard in control", async () => {
    mocks.process = { data: { companyId: 88 }, error: null };
    await mount();
    expect((screen.getByRole("button", { name: "Ir a Indicadores OTE" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Ir a Cronograma Consolidado" }) as HTMLButtonElement).disabled).toBe(true);
    await clickExit("Ir a Indicadores OTE");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("flushes the latest planning before the 800ms debounce and cancels duplicate saves", async () => {
    const planning = fixture();
    await mount([planning]);
    editGoal("Meta más reciente");
    await clickExit("Ir a Cronograma Consolidado");
    expect(mocks.planning).toHaveBeenCalledTimes(1);
    expect(mocks.planning).toHaveBeenCalledWith(expect.objectContaining({ objectiveId: planning.objectiveId, goal: "Meta más reciente", avanceMeta: 4 }));
    expect(mocks.navigate).toHaveBeenCalledWith("/consolidated-schedule?processId=21&companyId=77&oeReturnTab=overview&restore=1");
    await advance(2000);
    expect(mocks.planning).toHaveBeenCalledTimes(1);
  });

  it("checks every planning result, blocks partial failure and restores pending for retry", async () => {
    await mount([fixture(), fixture()]);
    editGoal("Meta pendiente");
    mocks.planning.mockRejectedValueOnce(new Error("fallo ficticio")).mockResolvedValueOnce(undefined);
    await clickExit();
    expect(mocks.planning).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
    await clickExit();
    expect(mocks.planning).toHaveBeenCalledTimes(4);
    expect(mocks.navigate).toHaveBeenCalledWith("/process-tactical-objectives");
  });

  it("flushes only edited narrative keys and never saves/replaces numeric planning for text", async () => {
    const planning = fixture();
    await mount([planning]);
    editNarrative("");
    await clickExit("Ir a Indicadores OTE");
    expect(mocks.narratives).toHaveBeenCalledTimes(1);
    expect(mocks.narratives).toHaveBeenCalledWith({ objectiveId: planning.objectiveId, situacionInicial: "" });
    expect(mocks.planning).not.toHaveBeenCalled();
    await clickExit();
    await advance(1500);
    expect(mocks.narratives).toHaveBeenCalledTimes(1);
  });

  it("does not rewrite a narrative draft already saved by its own debounce", async () => {
    await mount();
    editNarrative("Contexto guardado");
    await advance(1200);
    expect(mocks.narratives).toHaveBeenCalledTimes(1);
    await clickExit();
    expect(mocks.narratives).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/process-tactical-objectives");
    expect(mocks.planning).not.toHaveBeenCalled();
  });

  it("blocks swallowed narrative queue failures and preserves the draft for retry", async () => {
    const planning = fixture();
    await mount([planning]);
    editNarrative("Contexto pendiente");
    mocks.narratives.mockRejectedValueOnce(new Error("fallo narrativo ficticio"));
    await clickExit("Ir a Cronograma Consolidado");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.narratives).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/No se pudieron guardar los textos/)).toBeTruthy();
    await clickExit("Ir a Cronograma Consolidado");
    expect(mocks.narratives).toHaveBeenCalledTimes(2);
    expect(mocks.narratives).toHaveBeenLastCalledWith({ objectiveId: planning.objectiveId, situacionInicial: "Contexto pendiente" });
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Textos guardados")).toBeTruthy();
  });

  it("waits an active planning save and then sends changes made during that save from latest refs", async () => {
    const active = deferred();
    mocks.planning.mockReturnValueOnce(active.promise);
    await mount();
    editGoal("Primera versión");
    await advance(800);
    expect(mocks.planning).toHaveBeenCalledTimes(1);
    await clickExit("Ir a Indicadores OTE");
    expect(mocks.navigate).not.toHaveBeenCalled();
    editGoal("Versión durante guardado");
    await act(async () => { active.resolve(); });
    await advance(50);
    expect(mocks.planning).toHaveBeenCalledTimes(2);
    expect(mocks.planning).toHaveBeenLastCalledWith(expect.objectContaining({ goal: "Versión durante guardado" }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("blocks a failure from the planning save already active when exiting", async () => {
    const active = deferred();
    mocks.planning.mockReturnValueOnce(active.promise);
    await mount();
    editGoal("Meta activa");
    await advance(800);
    await clickExit();
    await act(async () => { active.reject(new Error("fallo activo ficticio")); });
    await advance(50);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.planning).toHaveBeenCalledTimes(1);
    await clickExit();
    expect(mocks.planning).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).toHaveBeenCalledWith("/process-tactical-objectives");
  });

  it("drains a newer narrative edit after an older request without overlapping writes", async () => {
    const active = deferred();
    mocks.narratives.mockReturnValueOnce(active.promise);
    await mount();
    editNarrative("Contexto anterior");
    await advance(1200);
    editNarrative("Contexto último");
    await clickExit("Ir a Indicadores OTE");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.narratives).toHaveBeenCalledTimes(1);
    await act(async () => { active.resolve(); });
    await advance(50);
    expect(mocks.narratives).toHaveBeenCalledTimes(2);
    expect(mocks.narratives).toHaveBeenLastCalledWith(expect.objectContaining({ situacionInicial: "Contexto último" }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.planning).not.toHaveBeenCalled();
  });

  it("normalizes the active NumericInput on blur and saves the updated ref before navigating", async () => {
    await mount();
    const input = screen.getByPlaceholderText("Avance actual") as HTMLInputElement;
    input.focus();
    // DOM-only input state (e.g. an unfinished number) is normalized by NumericInput's blur.
    input.value = "9";
    await clickExit("Ir a Indicadores OTE");
    expect(mocks.planning).toHaveBeenLastCalledWith(expect.objectContaining({ avanceMeta: 9 }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("retries a pending narrative in a collapsed card before exiting", async () => {
    const planning = fixture();
    await mount([planning]);
    editNarrative("Texto de tarjeta colapsada");
    mocks.narratives.mockRejectedValueOnce(new Error("fallo al colapsar ficticio"));
    fireEvent.click(screen.getByText(planning.objectiveName));
    await advance(0);
    expect(screen.queryByLabelText(/Situación inicial/)).toBeNull();
    expect(mocks.narratives).toHaveBeenCalledTimes(1);
    await clickExit();
    expect(mocks.narratives).toHaveBeenCalledTimes(2);
    expect(mocks.narratives).toHaveBeenLastCalledWith({ objectiveId: planning.objectiveId, situacionInicial: "Texto de tarjeta colapsada" });
    expect(mocks.navigate).toHaveBeenCalledWith("/process-tactical-objectives");
    expect(mocks.planning).not.toHaveBeenCalled();
  });

  it("restores pending planning if localStorage fails instead of silently exiting", async () => {
    await mount();
    editGoal("Meta sin caché");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("caché ficticia no disponible"); });
    await clickExit();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.planning).not.toHaveBeenCalled();
    setItem.mockRestore();
    await clickExit();
    expect(mocks.planning).toHaveBeenCalledTimes(1);
    expect(mocks.planning).toHaveBeenCalledWith(expect.objectContaining({ goal: "Meta sin caché" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/process-tactical-objectives");
  });
});
