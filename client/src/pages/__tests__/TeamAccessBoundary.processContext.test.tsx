// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamAccessBoundary, useTeamAccessState } from "@/contexts/TeamAccessContext";
import { defaultModuleAccess } from "@/lib/teamAccess";
const mocks = vi.hoisted(() => ({ route: "/company-info", search: "?companyId=7&processId=11", access: undefined as any, loading: false, mounted: vi.fn() }));
vi.mock("wouter", () => ({ useLocation: () => [mocks.route, vi.fn()], useSearch: () => mocks.search }));
vi.mock("@/contexts/ProcessLeaderAuthContext", () => ({ useProcessLeaderAuth: () => ({ session: { processId: 11, companyId: 7 }, isLoading: false }) }));
vi.mock("@/_core/hooks/useManagerAuth", () => ({ useManagerAuth: () => ({ isManagerLogin: false, isLoading: false }) }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { teamAccess: { getMyDetailedAccess: { useQuery: () => ({ data: mocks.access, isLoading: mocks.loading, refetch: vi.fn() }) } } } }));
function Page() { mocks.mounted(); const team = useTeamAccessState(); return <p>Business page · {team.readOnly ? "Solo consulta" : "Consulta y edición"}</p>; }
function mount() { window.history.replaceState(null, "", mocks.route + mocks.search); render(<TeamAccessBoundary><Page /></TeamAccessBoundary>); }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.route = "/company-info"; mocks.search = "?companyId=7&processId=11"; mocks.loading = false; mocks.access = { moduleAccess: defaultModuleAccess(), ownProcessId: 11, processAccess: [{ processId: 12, accessLevel: "read" }], fullAccess: false }; });
afterEach(cleanup);
describe("URL access boundary", () => {
  it("does not mount or fetch the business page when denied corporate URL is entered directly", () => {
    mocks.access.moduleAccess.organization_personnel = "none"; mocks.route = "/payroll"; mount();
    expect(screen.getByRole("alert").textContent).toContain("Acceso restringido"); expect(mocks.mounted).not.toHaveBeenCalled();
  });
  it("permits selected additional process in read-only mode and blocks unselected process even with forged storage", () => {
    mocks.route = "/process-characterization"; mocks.search = "?companyId=7&processId=12"; mount();
    expect(screen.getByText(/Business page · Solo consulta/)).toBeTruthy();
    cleanup(); mocks.mounted.mockClear(); mocks.search = "?companyId=7&processId=99"; localStorage.setItem("selectedProcessId", "99"); mount();
    expect(mocks.mounted).not.toHaveBeenCalled(); expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("never mounts corporate pages while permission loading, and ordinary chief strategy write works", () => {
    mocks.loading = true; mocks.access = undefined; mount(); expect(mocks.mounted).not.toHaveBeenCalled();
    cleanup(); mocks.loading = false; mocks.access = { moduleAccess: { ...defaultModuleAccess(), strategy: "write" }, ownProcessId: 11, processAccess: [], fullAccess: false }; mount(); expect(screen.getByText(/Business page · Consulta y edición/)).toBeTruthy();
  });
  it("does not grant foreign company URL or manager access routes to a chief", () => {
    mocks.search = "?companyId=8&processId=11"; mount(); expect(mocks.mounted).not.toHaveBeenCalled();
    cleanup(); mocks.route = "/manager-team-access"; mocks.search = "?companyId=7"; mount(); expect(mocks.mounted).not.toHaveBeenCalled();
  });
  it("own process duties remain accessible when corporate SIG and personal are restricted", () => {
    mocks.access.moduleAccess.management_systems = "none"; mocks.access.moduleAccess.organization_personnel = "none"; mocks.route = "/process-participants"; mount(); expect(screen.getByText(/Business page · Consulta y edición/)).toBeTruthy();
  });
});
