// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ManagerTeamAccess from "../ManagerTeamAccess";
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), navigate: vi.fn(), invalidate: vi.fn(), calls: vi.fn() }));
vi.mock("wouter", () => ({ useLocation: () => ["/manager-team-access", mocks.navigate] }));
vi.mock("@/_core/hooks/useManagerAuth", () => ({ useManagerAuth: () => ({ isManagerLogin: true, managerCompanyId: 7, isLoading: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => {
  const leaders = [{ accountId: 21, accountRoleId: 41, processId: 11, processName: "DDHH", leaderName: "Marítimo", email: "maritimo@example.invalid", status: "active", accessLevel: "standard", onlineCourseAccessLevel: "standard" }, { accountId: 22, accountRoleId: 42, processId: 11, processName: "DDHH", leaderName: "Soporte", email: "soporte@example.invalid", status: "active", accessLevel: "coordinator", onlineCourseAccessLevel: "online_course_manager" }];
  const mutation = { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) };
  const invalidation = { invalidate: mocks.invalidate };
  return { trpc: { useUtils: () => ({ teamAccess: { listProcessLeaders: invalidation, getMyDetailedAccess: invalidation }, processMap: { list: invalidation } }), teamAccess: { listProcessLeaders: { useQuery: (input: unknown) => { mocks.calls(input); return { data: leaders, isLoading: false, isFetching: false }; } }, suspendProcessLeader: mutation, reactivateProcessLeader: mutation, reassignProcessLeader: mutation, setDetailedAccess: mutation, setOnlineCourseManagementAccess: mutation }, processMap: { list: { useQuery: () => ({ data: [{ id: 11, name: "DDHH" }, { id: 12, name: "Finanzas" }, { id: 13, name: "Sin responsable" }], isLoading: false, isFetching: false }) } } } };
});
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("confirm", () => true); });
describe("all-company process/account team access", () => {
  it("groups every process with both distinct DDHH accounts and informative empty processes, no writes on visit", () => {
    render(<ManagerTeamAccess />);
    const ddhh = screen.getByRole("region", { name: "Proceso DDHH" });
    expect(within(ddhh).getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Proceso Finanzas" })).toBeTruthy();
    const unassigned = screen.getByRole("region", { name: "Proceso Sin responsable" });
    expect(within(unassigned).queryByRole("button", { name: "Asignar acceso" })).toBeNull();
    expect(within(ddhh).getAllByRole("button", { name: "Asignar acceso" })).toHaveLength(2);
    expect(within(ddhh).getAllByRole("button", { name: "Restringir acceso" })).toHaveLength(2);
    expect(mocks.mutate).not.toHaveBeenCalled(); expect(mocks.calls).toHaveBeenCalledWith({ companyId: 7 });
  });
  it("edits precisely the chosen account, not every chief of a process", () => {
    render(<ManagerTeamAccess />);
    const account = screen.getByRole("article", { name: "Cuenta soporte@example.invalid" });
    fireEvent.click(within(account).getByRole("button", { name: "Restringir acceso" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "FODA empresarial" }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cambios" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ companyId: 7, accountId: 22, moduleChanges: [{ module: "company_foda", accessLevel: "none" }] });
  });
  it("suspend identifies the account and independent course action carries no detailed permission changes", () => {
    render(<ManagerTeamAccess />);
    const account = screen.getByRole("article", { name: "Cuenta soporte@example.invalid" });
    fireEvent.click(within(account).getByRole("button", { name: "Suspender" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ companyId: 7, processId: 11, accountId: 22 });
    fireEvent.click(within(account).getByRole("button", { name: "Revocar cursos en línea" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ companyId: 7, accountId: 22, accessLevel: "standard" });
  });
});
