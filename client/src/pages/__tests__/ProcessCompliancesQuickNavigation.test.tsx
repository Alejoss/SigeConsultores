// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProcessCompliances from "../ProcessCompliances";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  occurrence: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  activities: [] as any[],
}));

vi.mock("wouter", () => ({
  useLocation: () => [window.location.pathname, mocks.navigate],
  useSearch: () => window.location.search.slice(1),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/components/ActivePlanningCycleBadge", () => ({ ActivePlanningCycleBadge: () => null }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    processMap: { get: { useQuery: () => ({ data: { companyId: 9002 } }) } },
    processCompliances: {
      list: { useQuery: () => ({ data: mocks.activities, isLoading: false }) },
      create: { useMutation: () => ({ mutateAsync: mocks.create, isPending: false }) },
      update: { useMutation: () => ({ mutateAsync: mocks.update, isPending: false }) },
      delete: { useMutation: () => ({ mutateAsync: mocks.remove, isPending: false }) },
      setOccurrenceCompleted: { useMutation: () => ({ mutateAsync: mocks.occurrence, isPending: false }) },
    },
    useUtils: () => ({ processCompliances: { list: { invalidate: mocks.invalidate } } }),
  },
}));

function fixture() {
  return {
    id: 9100,
    processId: 9001,
    requirement: "Actividad sintética",
    description: "Descripción",
    responsible: "Responsable de prueba",
    observations: "",
    dueDate: "2026-11-09",
    scheduleType: "weekly",
    scheduleStartDate: "2026-11-09",
    scheduleEndDate: "2026-12-28",
    scheduleWeekday: 1,
    scheduleDayOfMonth: null,
    trackingType: "puntual",
    trackingStartValue: 0,
    trackingTargetValue: 100,
    trackingCurrentValue: 10,
    trackingUnit: "%",
    monthlyTrackingValues: null,
    monthlyChecklistValues: null,
    progress: 10,
    trackingSummary: "Puntual",
    scheduleSummary: "Semanal",
    occurrences: [],
    occurrenceCompleted: 0,
    occurrenceTotal: 0,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProcessCompliances /></QueryClientProvider>);
  return client;
}

function editRequirement(value: string) {
  fireEvent.click(screen.getByRole("button", { name: /Actividad sintética/ }));
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  fireEvent.change(screen.getByPlaceholderText("Nombre o título de la actividad"), { target: { value } });
}

async function go(name = "Ir a Indicadores del Área") {
  fireEvent.click(screen.getByRole("button", { name }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // The unit project does not install the React plugin; support its classic JSX transform.
  vi.stubGlobal("React", React);
  window.history.replaceState({}, "", "/process-compliances?processId=9001&companyId=9002");
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  mocks.activities = [fixture()];
  mocks.create.mockResolvedValue({ id: 9101 });
  mocks.update.mockResolvedValue({ id: 9100 });
  mocks.invalidate.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProcessCompliances — accesos rápidos y cierre de debounce", () => {
  it("abre el resumen de indicadores sin panel y el cronograma con alcance verificado", async () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Ir a Cronograma Consolidado" })).toBeTruthy();
    await go();
    expect(mocks.navigate).toHaveBeenLastCalledWith("/process-indicators?processId=9001&companyId=9002&oeReturnTab=overview");
    expect(mocks.navigate.mock.lastCall?.[0]).not.toContain("panel=");
    await go("Ir a Cronograma Consolidado");
    expect(mocks.navigate).toHaveBeenLastCalledWith("/consolidated-schedule?processId=9001&companyId=9002&oeReturnTab=overview&restore=1");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("mantiene ambos accesos visibles y deshabilitados sin proceso", () => {
    window.history.replaceState({}, "", "/process-compliances");
    renderPage();
    expect((screen.getByRole("button", { name: "Ir a Indicadores del Área" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Ir a Cronograma Consolidado" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("resuelve la empresa de la sesión de jefe de proceso cuando no hay companyId en URL", async () => {
    window.history.replaceState({}, "", "/process-compliances?processId=9001");
    localStorage.setItem("processLeaderSession", JSON.stringify({ companyId: 9002, processId: 9001 }));
    renderPage();
    await go();
    expect(mocks.navigate).toHaveBeenCalledWith("/process-indicators?processId=9001&companyId=9002&oeReturnTab=overview");
  });

  it("completa el debounce antes de navegar sin duplicarlo y conserva fechas y recurrencia", async () => {
    renderPage();
    editRequirement("Actividad editada");
    expect(mocks.update).not.toHaveBeenCalled();
    await go();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: 9100,
      processId: 9001,
      requirement: "Actividad editada",
      dueDate: "2026-11-09",
      scheduleType: "weekly",
      scheduleStartDate: "2026-11-09",
      scheduleEndDate: "2026-12-28",
      scheduleWeekday: 1,
      scheduleDayOfMonth: null,
    }));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("bloquea la navegación si el borrador no pasa la validación", async () => {
    renderPage();
    editRequirement("");
    await go();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("Escriba el nombre de la actividad.");
  });

  it("bloquea ante error, conserva el borrador y permite reintentar el guardado", async () => {
    mocks.update.mockRejectedValueOnce(new Error("Fallo sintético"));
    renderPage();
    editRequirement("Borrador conservado");
    await go();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText("Nombre o título de la actividad") as HTMLTextAreaElement).value).toBe("Borrador conservado");
    expect(mocks.error).toHaveBeenCalledWith("Fallo sintético");
    await go();
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("espera el autoguardado activo y después persiste el borrador más reciente", async () => {
    let resolveFirst!: () => void;
    mocks.update.mockImplementationOnce(() => new Promise<void>(resolve => { resolveFirst = resolve; }));
    renderPage();
    editRequirement("Primer borrador");
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByPlaceholderText("Nombre o título de la actividad"), { target: { value: "Último borrador" } });
    await go();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFirst(); });
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update.mock.calls[1][0].requirement).toBe("Último borrador");
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it("devuelve false si el autoguardado que estaba activo falla", async () => {
    let rejectFirst!: (error: Error) => void;
    mocks.update.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectFirst = reject; }));
    renderPage();
    editRequirement("Borrador con fallo");
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    await go();
    await act(async () => { rejectFirst(new Error("Fallo en vuelo")); });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.error).toHaveBeenCalled();
  });

  it("no convierte un formulario de nueva actividad en creación automática al navegar", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("Nombre o título de la actividad"), { target: { value: "Nueva actividad aún sin agregar" } });
    await go();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });
});
