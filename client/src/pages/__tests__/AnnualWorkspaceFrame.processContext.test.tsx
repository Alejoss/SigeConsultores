// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnualWorkspaceFrame } from "@/contexts/AnnualWorkspaceContext";
import { registerAnnualExitGuard } from "@/lib/annualNavigation";
import { captureAnnualDocumentScope, initializeAnnualDocumentScope } from "@/lib/annualWorkspace";
const mocks = vi.hoisted(() => ({ readonly: false, status: "open", route: "/process-risk-matrix", error: vi.fn(), pending: false, navigate: vi.fn() }));
vi.mock("@/contexts/TeamAccessContext", () => ({ useTeamAccessState: () => ({ isProcessLeader: mocks.readonly, readOnly: mocks.readonly, isChecking: false, companyId: 7, access: { ownProcessId: 10, moduleAccess: {}, processAccess: [{ processId: 11, accessLevel: "read" }], fullAccess: false } }) }));
vi.mock("wouter", () => ({ useLocation: () => [mocks.route, mocks.navigate], useSearch: () => "?companyId=7&processId=11" }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/_core/hooks/useManagerAuth", () => ({ useManagerAuth: () => ({ isManagerLogin: true }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/lib/trpc", () => ({ trpc: { annualWorkspaces: {
  list: { useQuery: () => ({ data: { workspaces: [{ id: 1, year: 2026, status: mocks.status }, { id: 2, year: 2027, status: "open" }] }, isLoading: false, error: null }) },
  overview: { useQuery: () => ({ data: { workspace: { year: 2026, companyId: 7, status: mocks.status }, incorporatedCount: mocks.pending ? 0 : 1, totalCount: 2, processes: [{ id: 11, name: "Área", status: mocks.pending ? "pending" : "incorporated", approved: false }] }, isLoading: false, error: null }) },
} } }));
initializeAnnualDocumentScope(captureAnnualDocumentScope(7, localStorage));
beforeEach(() => { vi.clearAllMocks(); mocks.readonly = false; mocks.status = "open"; mocks.pending = false; mocks.route = "/process-risk-matrix"; window.history.replaceState(null, "", "/process-risk-matrix?companyId=7&processId=11"); localStorage.clear(); });
afterEach(cleanup);
function mount() { const client = new QueryClient(); return render(<QueryClientProvider client={client}><AnnualWorkspaceFrame><div><h1>Matriz existente</h1><input aria-label="Editor" /><button>Guardar cambios</button><button>Descargar</button></div></AnnualWorkspaceFrame></QueryClientProvider>); }
describe("barra anual universal", () => {
  it("presenta años reales, abierto/cerrado e incorporación parcial sin reinventar la matriz", () => {
    mount(); expect(screen.getByLabelText("Año de gestión")).toBeTruthy(); expect(screen.getByRole("option", { name: "2027 · Abierto" })).toBeTruthy(); expect(screen.getByText(/Incorporación parcial: 1 de 2 procesos/)).toBeTruthy(); expect(screen.getByText("Matriz existente")).toBeTruthy(); expect(screen.getByRole("button", { name: "Gestionar años" })).toBeTruthy();
  });
  it("espera un autosave activo, bloquea edición y conserva selección cuando ese guardado falla", async () => {
    let resolve!: (saved: boolean) => void; const pending = new Promise<boolean>(done => { resolve = done; });
    const unregister = registerAnnualExitGuard(() => pending); mount();
    fireEvent.change(screen.getByLabelText("Año de gestión"), { target: { value: "2027" } });
    await waitFor(() => expect(screen.getByText(/Guardando y esperando solicitudes del año 2026/)).toBeTruthy());
    expect((screen.getByLabelText("Año de gestión") as HTMLSelectElement).disabled).toBe(true);
    expect(localStorage.getItem("isge:annual-selection:7")).toBeNull();
    await act(async () => resolve(false));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(localStorage.getItem("isge:annual-selection:7")).toBeNull(); expect(screen.getByText("Matriz existente")).toBeTruthy(); unregister();
  });
  it("cerrado mantiene consulta/descarga pero deshabilita acciones de edición", async () => {
    mocks.status = "closed"; mount();
    expect(screen.getByText(/El año 2026 está cerrado/)).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByLabelText("Editor") as HTMLInputElement).disabled).toBe(true); expect((screen.getByRole("button", { name: "Descargar" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("pending conserva acceso a mapa y organización, sin montar matrices ni fallback 2026", () => {
    mocks.pending = true; mount(); expect(screen.getByText("Proceso pendiente de incorporación en 2026")).toBeTruthy(); expect(screen.queryByText("Matriz existente")).toBeNull(); expect(screen.getByRole("button", { name: "Ver mapa de procesos" })).toBeTruthy(); expect(screen.getByRole("button", { name: "Ver organización" })).toBeTruthy();
  });
  it("additional process Solo consulta disables fields/actions globally while preserving downloads", async () => {
    mocks.readonly = true; mount();
    expect(screen.getByText(/Acceso de Solo consulta/)).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByLabelText("Editor") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Descargar" }) as HTMLButtonElement).disabled).toBe(false);
  });

});
