import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessQuickNavigation, waitForNavigationMutations } from "../ProcessQuickNavigation";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), error: vi.fn(), process: { data: { id: 11, companyId: 7, name: "Área ficticia" } as { id: number; companyId: number; name: string } | null, error: null as Error | null } }));
vi.mock("wouter", () => ({ useLocation: () => ["/tactical-planning", mocks.navigate], useSearch: () => "?processId=11&companyId=7&oeReturnTab=areas" }));
vi.mock("@/lib/trpc", () => ({ trpc: { processMap: { get: { useQuery: () => mocks.process } } } }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
function mount(props: Partial<React.ComponentProps<typeof ProcessQuickNavigation>> = {}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><ProcessQuickNavigation processId={11} companyId={7} {...props} /></QueryClientProvider>);
  return { client, ...view };
}
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mocks.process = { data: { id: 11, companyId: 7, name: "Área ficticia" }, error: null }; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(1); }); }

describe("Process quick navigation", () => {
  it("opens the matching indicator and preserves authorized process/company and OE tab", async () => {
    mount({ indicatorPanel: "ote" });
    fireEvent.click(screen.getByRole("button", { name: "Ir a Indicadores OTE" })); await tick();
    expect(mocks.navigate).toHaveBeenCalledWith("/process-indicators?processId=11&companyId=7&oeReturnTab=areas&panel=ote");
  });
  it("disables links before scope verification and on an inaccessible/mismatched company", () => {
    mocks.process = { data: null, error: new Error("Acceso denegado") };
    const view = mount();
    expect((screen.getByRole("button", { name: "Ir a Indicadores del Área" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("No se pudo verificar el acceso a esta área.")).toBeTruthy();
    view.unmount(); mocks.process = { data: { id: 11, companyId: 8, name: "Otra empresa" }, error: null };
    mount();
    expect((screen.getByRole("button", { name: "Ir a Cronograma Consolidado" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("waits for the page's queued save and prevents double navigation", async () => {
    let finish!: (ok: boolean) => void;
    const before = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    mount({ beforeNavigate: before });
    const button = screen.getByRole("button", { name: "Ir a Cronograma Consolidado" });
    fireEvent.click(button); await tick(); fireEvent.click(button);
    expect(before).toHaveBeenCalledTimes(1); expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => { finish(true); await Promise.resolve(); });
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate.mock.calls[0][0]).toContain("/consolidated-schedule?");
    expect(mocks.navigate.mock.calls[0][0]).toContain("restore=1");
  });
  it("keeps the page open with its draft if the queued save fails", async () => {
    mount({ beforeNavigate: async () => false });
    fireEvent.click(screen.getByRole("button", { name: "Ir a Indicadores del Área" })); await tick();
    expect(mocks.navigate).not.toHaveBeenCalled(); expect(mocks.error).toHaveBeenCalled();
  });
  it("waits for actual active mutations and returns false on a failed write", async () => {
    const client = new QueryClient();
    let finish!: () => void;
    const mutation = client.getMutationCache().build(client, { mutationFn: () => new Promise<void>(resolve => { finish = resolve; }) });
    const execution = mutation.execute(undefined);
    await Promise.resolve(); await Promise.resolve();
    const waiting = waitForNavigationMutations(client); let completed = false;
    void waiting.then(() => { completed = true; }); await Promise.resolve(); expect(completed).toBe(false);
    finish(); await execution; expect(await waiting).toBe(true);
    let fail!: (cause: Error) => void;
    const failed = client.getMutationCache().build(client, { mutationFn: () => new Promise<void>((_, reject) => { fail = reject; }) });
    const failedExecution = failed.execute(undefined).catch(() => {});
    await Promise.resolve(); await Promise.resolve();
    const failedWaiting = waitForNavigationMutations(client);
    fail(new Error("Sin conexión")); await failedExecution; expect(await failedWaiting).toBe(false);
  });
  it("does not wait indefinitely on a stalled mutation", async () => {
    const client = new QueryClient();
    const mutation = client.getMutationCache().build(client, { mutationFn: () => new Promise<void>(() => {}) });
    void mutation.execute(undefined);
    await Promise.resolve(); await Promise.resolve();
    const waiting = waitForNavigationMutations(client, 50);
    await vi.advanceTimersByTimeAsync(50); expect(await waiting).toBe(false);
  });
});
