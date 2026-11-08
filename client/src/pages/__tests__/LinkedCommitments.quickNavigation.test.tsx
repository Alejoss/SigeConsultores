// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LinkedCommitments from "../LinkedCommitments";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  update: vi.fn(),
  createOwn: vi.fn(),
  deleteCommitment: vi.fn(),
  deleteEvidence: vi.fn(),
  refetch: vi.fn(),
  toastError: vi.fn(),
  loading: false,
  verifiedCompany: 12,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/linked-commitments", mocks.navigate],
  useSearch: () => "?processId=34&companyId=12",
}));
vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/_core/hooks/useManagerAuth", () => ({
  useManagerAuth: () => ({ isManagerLogin: true, managerCompanyId: 12, isLoading: false }),
}));
vi.mock("@/contexts/ProcessLeaderAuthContext", () => ({
  useProcessLeaderAuth: () => ({ session: null, isLoading: false }),
}));
vi.mock("@/lib/sessionScope", () => ({ getCompanyIdFromSession: () => 12 }));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn(), loading: vi.fn() },
}));
vi.mock("@/lib/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  const mutation = (mutationFn: (...args: any[]) => any) => ({
    useMutation: (options: any) => useMutation({ mutationFn: (values: any) => mutationFn(values), ...options }),
  });
  return {
    trpc: {
      processMap: {
        get: { useQuery: () => ({ data: { companyId: mocks.verifiedCompany }, error: null }) },
      },
      linkedCommitments: {
        listByProcess: {
          useQuery: () => ({
            isLoading: mocks.loading,
            refetch: mocks.refetch,
            data: [{
              id: 56, processId: 34, sourceType: "checklist_action", kind: "action",
              title: "Compromiso ficticio", description: null, dueDate: null,
              referenceResponsible: null, status: "pending", completedAt: null,
              renewedValidFrom: null, renewedValidUntil: null, notes: null,
              evidenceCount: 0, sourceProgress: null,
            }],
          }),
        },
        listEvidence: { useQuery: () => ({ data: [], isLoading: false, refetch: mocks.refetch }) },
        updateProgress: mutation(mocks.update),
        createOwn: mutation(mocks.createOwn),
        delete: mutation(mocks.deleteCommitment),
        deleteEvidence: mutation(mocks.deleteEvidence),
      },
    },
  };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={client}><LinkedCommitments /></QueryClientProvider>
  );
  return { ...rendered, client };
}

beforeEach(() => {
  // This exclusive spec runs in the existing unit project, without changing its JSX config.
  vi.stubGlobal("React", React);
  window.history.replaceState({}, "", "/linked-commitments?processId=34&companyId=12");
  vi.clearAllMocks();
  mocks.loading = false;
  mocks.verifiedCompany = 12;
  mocks.update.mockResolvedValue({ ok: true });
  mocks.createOwn.mockResolvedValue({ ok: true });
  mocks.refetch.mockResolvedValue({ data: [] });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("LinkedCommitments quick navigation", () => {
  it("keeps both generic shortcuts visible while loading and preserves company/process scope", async () => {
    mocks.loading = true;
    renderPage();
    expect(screen.getByRole("button", { name: "Volver" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir a Indicadores del Área" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
      "/process-indicators?processId=34&companyId=12&oeReturnTab=overview"
    ));
    expect(mocks.navigate.mock.calls[0][0]).not.toContain("panel=");
    fireEvent.click(screen.getByRole("button", { name: "Ir a Cronograma Consolidado" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
      "/consolidated-schedule?processId=34&companyId=12&oeReturnTab=overview&restore=1"
    ));
    expect(mocks.createOwn).not.toHaveBeenCalled();
  });

  it("uses shared RBAC scope verification and disables both shortcuts for a company mismatch", () => {
    mocks.verifiedCompany = 99;
    renderPage();
    expect((screen.getByRole("button", { name: "Ir a Indicadores del Área" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Ir a Cronograma Consolidado" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("blurs the active notes field and waits for its actual save before navigating", async () => {
    let finish!: (value: unknown) => void;
    mocks.update.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderPage();
    const notes = screen.getByPlaceholderText("Observaciones, avance o explicación para el origen");
    fireEvent.change(notes, { target: { value: "Avance ficticio" } });
    notes.focus();
    fireEvent.click(screen.getByRole("button", { name: "Ir a Cronograma Consolidado" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(
      { id: 56, companyId: 12, notes: "Avance ficticio" }
    ));
    expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => finish({ ok: true }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
  });

  it("blocks navigation for a settled field error until that same field is saved successfully", async () => {
    mocks.update.mockRejectedValueOnce(new Error("Fallo ficticio"));
    renderPage();
    const notes = screen.getByPlaceholderText("Observaciones, avance o explicación para el origen");
    fireEvent.change(notes, { target: { value: "Nota pendiente" } });
    fireEvent.blur(notes);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Fallo ficticio"));
    fireEvent.click(screen.getByRole("button", { name: "Ir a Indicadores del Área" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("No se pudo completar el guardado")));
    expect(mocks.navigate).not.toHaveBeenCalled();
    // Saving a different field must not erase the failed notes guard.
    const dueDate = document.querySelector('input[type="date"]')!;
    fireEvent.change(dueDate, { target: { value: "2026-11-09" } });
    fireEvent.blur(dueDate);
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Ir a Indicadores del Área" }));
    await waitFor(() => expect(mocks.toastError.mock.calls.filter(([message]) => String(message).includes("No se pudo completar el guardado"))).toHaveLength(2));
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.blur(notes);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Ir a Indicadores del Área" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
  });

  it("retains an uncreated activity, including a collapsed form, and only creates through its explicit button", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Añadir actividad" }));
    fireEvent.change(screen.getByPlaceholderText("Actividad a planificar *"), { target: { value: "Borrador ficticio" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Ir a Cronograma Consolidado" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("actividad sin agregar")));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.createOwn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Añadir actividad" }));
    expect((screen.getByPlaceholderText("Actividad a planificar *") as HTMLInputElement).value).toBe("Borrador ficticio");
    fireEvent.click(screen.getByRole("button", { name: "Agregar a planificación" }));
    await waitFor(() => expect(mocks.createOwn).toHaveBeenCalledWith(
      { companyId: 12, processId: 34, title: "Borrador ficticio", description: "", dueDate: "" }
    ));
    await waitFor(() => expect(screen.queryByPlaceholderText("Actividad a planificar *")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Ir a Cronograma Consolidado" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
  });
});
