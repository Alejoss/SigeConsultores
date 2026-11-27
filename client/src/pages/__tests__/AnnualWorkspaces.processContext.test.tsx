// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnnualWorkspaces from "../AnnualWorkspaces";
const mocks = vi.hoisted(() => ({ create: vi.fn(), incorporate: vi.fn(), close: vi.fn(), invalidate: vi.fn(), navigate: vi.fn(), manager: true, status: "open", error: null as Error | null }));
vi.mock("wouter", () => ({ useLocation: () => ["/annual-workspaces", mocks.navigate] }));
vi.mock("@/_core/hooks/useManagerAuth", () => ({ useManagerAuth: () => ({ isManagerLogin: mocks.manager, isLoading: false }) }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/contexts/AnnualWorkspaceContext", () => ({ useAnnualWorkspace: () => ({ companyId: 7, year: 2026 }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ annualWorkspaces: { invalidate: mocks.invalidate } }),
  annualWorkspaces: {
    list: { useQuery: () => ({ data: { workspaces: [{ id: 1, year: 2026, status: "open" }, { id: 2, year: 2027, status: "open" }] }, isLoading: false, error: null }) },
    overview: { useQuery: () => ({ data: { workspace: { status: mocks.status }, incorporatedCount: 1, totalCount: 3, processes: [{ id: 11, name: "Proceso ya incorporado", status: "incorporated", approved: true }, { id: 12, name: "Proceso aprobado", status: "pending", approved: true }, { id: 13, name: "Proceso pendiente", status: "pending", approved: false }] }, isLoading: false, error: mocks.error }) },
    create: { useMutation: () => ({ mutateAsync: mocks.create, isPending: false }) },
    incorporateProcess: { useMutation: () => ({ mutateAsync: mocks.incorporate, isPending: false }) },
    close: { useMutation: () => ({ mutateAsync: mocks.close, isPending: false }) },
  },
} }));
beforeEach(() => { vi.clearAllMocks(); mocks.manager = true; mocks.status = "open"; mocks.error = null; mocks.create.mockResolvedValue({ year: 2028 }); mocks.incorporate.mockResolvedValue({ alreadyIncorporated: false }); mocks.close.mockResolvedValue({ status: "closed" }); });
afterEach(cleanup);
describe("Gestión anual con contrato tRPC real", () => {
  it("presenta las seis decisiones y crea sin cerrar el año fuente", async () => {
    render(<AnnualWorkspaces />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    fireEvent.change(screen.getByLabelText("Año nuevo"), { target: { value: "2028" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Conservar misión" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear 2028" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ companyId: 7, year: 2028, sourceYear: 2026, strategy: { purpose: true, mission: false, vision: true, values: true, policy: true, strategicObjectives: true } }));
    expect(mocks.close).not.toHaveBeenCalled(); expect(mocks.incorporate).not.toHaveBeenCalled();
  });
  it("solo incorpora un proceso aprobado y comunica incorporación parcial", async () => {
    render(<AnnualWorkspaces />);
    expect(screen.getByText(/1 de 3 procesos incorporados/)).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Incorporar aprobado" });
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false); expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(mocks.incorporate).toHaveBeenCalledWith({ companyId: 7, year: 2026, processId: 12 }));
  });
  it("requiere confirmación exacta de cierre y permite cancelar sin mutación", async () => {
    render(<AnnualWorkspaces />); fireEvent.click(screen.getByRole("button", { name: "Revisar cierre" }));
    const confirmation = screen.getByLabelText("Escribe exactamente CERRAR 2026");
    const close = screen.getByRole("button", { name: "Confirmar cierre 2026" }) as HTMLButtonElement;
    expect(close.disabled).toBe(true); fireEvent.change(confirmation, { target: { value: "cerrar 2026" } }); expect(close.disabled).toBe(true);
    fireEvent.change(confirmation, { target: { value: "CERRAR 2026" } }); expect(close.disabled).toBe(false);
    fireEvent.click(close); await waitFor(() => expect(mocks.close).toHaveBeenCalledWith({ companyId: 7, year: 2026, confirmation: "CERRAR 2026" }));
  });
  it("no presenta acciones de gestión a un jefe ni cierre/incorporación en closed", () => {
    mocks.manager = false; const first = render(<AnnualWorkspaces />); expect(screen.queryByRole("button", { name: "Crear 2027" })).toBeNull(); expect(screen.queryByRole("button", { name: "Incorporar aprobado" })).toBeNull(); first.unmount();
    mocks.manager = true; mocks.status = "closed"; render(<AnnualWorkspaces />); expect(screen.queryByRole("button", { name: "Revisar cierre" })).toBeNull(); expect(screen.getAllByRole("button", { name: "Incorporar aprobado" }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
