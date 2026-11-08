// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProcessStakeholderCriticality from "../ProcessStakeholderCriticality";

const mocks = vi.hoisted(() => ({
  getOrCreate: vi.fn(),
  upsert: vi.fn(),
  otherMutation: vi.fn(),
  refetch: vi.fn(),
  navigate: vi.fn(),
  search: "?processId=990001&companyId=990010",
  subprocessMap: null as null | { entrada: { partesInteresadas: string }[]; subprocesos: never[] },
  beforeNavigate: undefined as undefined | (() => Promise<boolean>),
  navigationProps: undefined as undefined | { processId: string; companyId: number | null; indicatorPanel: string },
}));

vi.mock("wouter", () => ({ useLocation: () => ["/process-stakeholder-criticality", mocks.navigate], useSearch: () => mocks.search }));
vi.mock("@/contexts/ProcessLeaderAuthContext", () => ({ useProcessLeaderAuth: () => ({ session: null, isLoading: false }) }));
vi.mock("@/components/ActivePlanningCycleBadge", () => ({ ActivePlanningCycleBadge: () => null }));
vi.mock("@/components/AIChatPanel", () => ({ AIChatPanel: () => null }));
vi.mock("@/components/ProcessQuickNavigation", () => ({
  ProcessQuickNavigation: (props: { processId: string; companyId: number | null; indicatorPanel: string; beforeNavigate: () => Promise<boolean> }) => {
    mocks.beforeNavigate = props.beforeNavigate;
    mocks.navigationProps = props;
    return React.createElement("div", { "data-testid": "quick-navigation" },
      React.createElement("button", null, "Ir a Indicadores de Partes Interesadas"),
      React.createElement("button", null, "Ir a Cronograma Consolidado"));
  },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    ai: { query: { useMutation: () => ({ mutateAsync: mocks.otherMutation }) } },
    processStakeholderCriticality: {
      uploadExcelMatrix: { useMutation: () => ({ mutateAsync: mocks.otherMutation }) },
      getExcelMatrix: { useQuery: () => ({ data: null, refetch: mocks.refetch }) },
    },
    criticalityMatrix: {
      getOrCreateStakeholder: { useMutation: () => ({ mutateAsync: mocks.getOrCreate }) },
      upsert: { useMutation: () => ({ mutateAsync: mocks.upsert }) },
      getWithStakeholders: { useQuery: () => ({ data: undefined, isLoading: false }) },
    },
    subprocessMap: { get: { useQuery: () => ({ data: mocks.subprocessMap, isLoading: false, error: null }) } },
    stakeholderSurveys: {
      list: { useQuery: () => ({ data: undefined, refetch: mocks.refetch }) },
      create: { useMutation: () => ({ mutateAsync: mocks.otherMutation }) },
      update: { useMutation: () => ({ mutateAsync: mocks.otherMutation }) },
      delete: { useMutation: () => ({ mutateAsync: mocks.otherMutation }) },
    },
  },
}));

const stakeholder = (id: string, name: string) => ({
  id, dbId: Number(id), name, internalExternal: "Externo", clienteProveedor: "cliente",
  needsSolicita: "", needsEntrega: "", incidenceCriteria: [], incidenceValue: [1],
  riskCriteria: [], riskValue: ["C"], criticityScore: "1C", existingDefenses: "",
  actionToTake: "Acción inicial", observations: "", startDate: "", endDate: "",
  completed: "No", actionSource: "Iniciativa propia", surveyId: null,
});

function loadPage(rows = [stakeholder("990100", "Asociado ficticio")]) {
  localStorage.setItem("criticalityData_990001", JSON.stringify({ processId: "990001", stakeholders: rows }));
  render(React.createElement(ProcessStakeholderCriticality));
}

function editAction(value: string, name = "Asociado ficticio") {
  fireEvent.change(screen.getByLabelText(`Acción a tomar para ${name}`), { target: { value } });
}

async function flush() {
  let result: boolean | undefined;
  await act(async () => { result = await mocks.beforeNavigate!(); });
  return result;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  localStorage.clear();
  window.history.replaceState({}, "", "/process-stakeholder-criticality?processId=990001&companyId=990010");
  vi.clearAllMocks();
  mocks.subprocessMap = null;
  mocks.beforeNavigate = undefined;
  mocks.search = "?processId=990001&companyId=990010";
  mocks.navigationProps = undefined;
  mocks.getOrCreate.mockResolvedValue({ id: 990200 });
  mocks.upsert.mockResolvedValue({ id: 990100 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProcessStakeholderCriticality: flush antes de navegación rápida", () => {
  it("muestra los accesos junto a exportar, conserva partes/ámbito y no guarda la carga sin cambios", async () => {
    loadPage();
    const navigation = screen.getByTestId("quick-navigation");
    expect(navigation.parentElement?.textContent).toContain("Exportar HTML");
    expect(navigation.parentElement?.textContent).toContain("VOLVER");
    expect(mocks.navigationProps).toMatchObject({ processId: "990001", companyId: 990010, indicatorPanel: "partes" });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(await flush()).toBe(true);
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("no escribe por la carga automática inicial desde el mapa", async () => {
    mocks.subprocessMap = { entrada: [{ partesInteresadas: "Asociado ficticio" }], subprocesos: [] };
    loadPage([]);
    expect(screen.getByLabelText("Acción a tomar para Asociado ficticio")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(await flush()).toBe(true);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("completa el debounce una sola vez y no repite después del guardado confirmado", async () => {
    loadPage();
    editAction("Borrador pendiente");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(await flush()).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].actionToTake).toBe("Borrador pendiente");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(await flush()).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("persiste campos borrados explícitamente, sin omitirlos del payload", async () => {
    loadPage();
    editAction("");
    expect(await flush()).toBe(true);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      actionToTake: "", observations: "", existingDefenses: "", startDate: "", endDate: "",
    });
  });

  it("conserva error y bloquea la salida si falla la copia local aun con mutaciones exitosas", async () => {
    loadPage();
    editAction("Borrador local");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Cuota agotada"); });
    expect(await flush()).toBe(false);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("No se pudo conservar el borrador local");
    expect((screen.getByLabelText("Acción a tomar para Asociado ficticio") as HTMLTextAreaElement).value).toBe("Borrador local");
  });

  it("no guarda si la edición se revierte al valor cargado antes del debounce", async () => {
    loadPage();
    editAction("Cambio temporal");
    editAction("Acción inicial");
    expect(await flush()).toBe(true);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("comparte el guardado activo y espera su resultado sin duplicarlo", async () => {
    const pending = deferred<{ id: number }>();
    mocks.upsert.mockReturnValueOnce(pending.promise);
    loadPage();
    editAction("Guardado en curso");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    let completed = false;
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = mocks.beforeNavigate!().then(result => { completed = true; return result; });
      second = mocks.beforeNavigate!();
      await Promise.resolve();
    });
    expect(completed).toBe(false);
    await act(async () => { pending.resolve({ id: 990100 }); await first; await second; });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("completa también el borrador editado durante una mutación sin contaminar la copia en curso", async () => {
    const pending = deferred<{ id: number }>();
    mocks.getOrCreate.mockReturnValueOnce(pending.promise);
    loadPage();
    editAction("Primer borrador");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    editAction("Último borrador");
    let navigation!: Promise<boolean>;
    await act(async () => {
      navigation = mocks.beforeNavigate!();
      pending.resolve({ id: 990200 });
      await navigation;
    });
    expect(await navigation).toBe(true);
    expect(mocks.upsert.mock.calls.map(call => call[0].actionToTake)).toEqual(["Primer borrador", "Último borrador"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });

  it("acumula fallos de varias filas, bloquea la salida y conserva borrador/error para reintentar", async () => {
    mocks.upsert.mockRejectedValueOnce(new Error("Fallo A")).mockRejectedValueOnce(new Error("Fallo B"));
    loadPage([stakeholder("990100", "Asociado A"), stakeholder("990101", "Asociado B")]);
    editAction("Cambio A", "Asociado A");
    editAction("Cambio B", "Asociado B");
    expect(await flush()).toBe(false);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status").textContent).toContain("Fallo A");
    expect(screen.getByRole("status").textContent).toContain("Fallo B");
    expect((screen.getByLabelText("Acción a tomar para Asociado A") as HTMLTextAreaElement).value).toBe("Cambio A");
    expect(localStorage.getItem("criticalityData_990001")).toContain("Cambio B");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole("status").textContent).not.toContain("✓ Cambios guardados");
    expect(await flush()).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledTimes(4);
    expect(screen.getByRole("status").textContent).toBe("✓ Cambios guardados");
  });

  it("devuelve false ante un fallo del guardado que ya estaba activo", async () => {
    const pending = deferred<{ id: number }>();
    mocks.upsert.mockReturnValueOnce(pending.promise);
    loadPage();
    editAction("Cambio pendiente");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    let navigation!: Promise<boolean>;
    await act(async () => {
      navigation = mocks.beforeNavigate!();
      pending.reject(new Error("Fallo en curso"));
      await navigation;
    });
    expect(await navigation).toBe(false);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Fallo en curso");
  });

  it("bloquea la salida si getOrCreate no confirma el asociado", async () => {
    mocks.getOrCreate.mockResolvedValue(null);
    loadPage();
    editAction("No confirmado");
    expect(await flush()).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("No se pudo obtener el asociado");
  });

  it("bloquea la salida si upsert no confirma el registro", async () => {
    mocks.upsert.mockResolvedValue({ id: null });
    loadPage();
    editAction("No confirmado");
    expect(await flush()).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("No se confirmó el guardado");
  });

  it("mantiene visibles los accesos también en encuestas y cuando falta el proceso", async () => {
    loadPage();
    fireEvent.click(screen.getByRole("button", { name: "Encuestas" }));
    expect(screen.getByText("Ir a Cronograma Consolidado")).toBeTruthy();
    cleanup();
    mocks.search = "";
    localStorage.clear();
    render(React.createElement(ProcessStakeholderCriticality));
    expect(screen.getByText("Ir a Indicadores de Partes Interesadas")).toBeTruthy();
    expect(await flush()).toBe(false);
    mocks.search = "?processId=990001&companyId=990010";
  });
});
