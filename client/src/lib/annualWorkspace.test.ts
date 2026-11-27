// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { annualHeaders, captureAnnualDocumentScope, createAnnualBusinessStorage, groupTrainingOrigins, persistManagementYear } from "./annualWorkspace";
import { createAnnualFetch, flushAnnualExitGuards, registerAnnualExitGuard, waitForAnnualRequests } from "./annualNavigation";
afterEach(() => localStorage.clear());
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
describe("contexto anual del documento", () => {
  it("usa 2026 explícito, no reloj, y persiste selección por empresa", () => {
    persistManagementYear(localStorage, 10, 2027);
    const company10 = captureAnnualDocumentScope(10, localStorage);
    const company20 = captureAnnualDocumentScope(20, localStorage);
    expect(company10.year).toBe(2027); expect(company20.year).toBe(2026);
    expect(annualHeaders(company10, 20)).toEqual({ "x-isge-company-id": "20", "x-isge-year": "2026" });
    expect(Object.isFrozen(company10)).toBe(true); expect(Object.isFrozen(company10.years)).toBe(true);
  });
  it("una request antigua conserva empresa/año aunque cambie storage mientras sigue pendiente", async () => {
    persistManagementYear(localStorage, 10, 2026);
    const old = captureAnnualDocumentScope(10, localStorage);
    const pending = deferred<Response>();
    const fetcher = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(new Response("ok"));
    const fetch2026 = createAnnualFetch(old, fetcher);
    const first = fetch2026("/api/upload/procedure-file", { method: "POST", body: new FormData(), headers: { "x-isge-year": "9999" } });
    persistManagementYear(localStorage, 10, 2027);
    await fetch2026("/api/trpc/processMap.list");
    const newScope = captureAnnualDocumentScope(10, localStorage);
    await createAnnualFetch(newScope, fetcher)("/api/trpc/processMap.list");
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("x-isge-year")).toBe("2026");
    expect(new Headers(fetcher.mock.calls[1][1].headers).get("x-isge-year")).toBe("2026");
    expect(new Headers(fetcher.mock.calls[2][1].headers).get("x-isge-year")).toBe("2027");
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("x-isge-company-id")).toBe("10");
    let done = false; const waiting = waitForAnnualRequests().then(result => { done = true; return result; });
    await Promise.resolve(); expect(done).toBe(false);
    pending.resolve(new Response("ok")); await first; expect(await waiting).toBe(true);
  });
  it("timeout de solicitud no autoriza salida ni cancela escrituras", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise);
    const request = createAnnualFetch(captureAnnualDocumentScope(10, localStorage), fetcher)("/api/upload/meeting-file");
    expect(await waitForAnnualRequests(5)).toBe(false);
    pending.resolve(new Response("ok")); await request;
  });
});
describe("caché empresarial por company/year", () => {
  it("lee 2026 legacy intacto, escribe namespace, no lo usa en 2027", () => {
    localStorage.setItem("processSchedule_5", "histórico");
    const base = createAnnualBusinessStorage(localStorage, captureAnnualDocumentScope(10, localStorage));
    expect(base.getItem("processSchedule_5")).toBe("histórico");
    base.setItem("processSchedule_5", "edición2026");
    expect(localStorage.getItem("processSchedule_5")).toBe("histórico");
    persistManagementYear(localStorage, 10, 2027);
    const next = createAnnualBusinessStorage(localStorage, captureAnnualDocumentScope(10, localStorage));
    expect(next.getItem("processSchedule_5")).toBeNull(); next.setItem("processSchedule_5", "nuevo2027");
    expect(base.getItem("processSchedule_5")).toBe("edición2026");
    expect(next.getItem("processSchedule_5")).toBe("nuevo2027");
    expect(createAnnualBusinessStorage(localStorage, captureAnnualDocumentScope(20, localStorage)).getItem("processSchedule_5")).toBe("histórico");
  });
  it("no anualiza autenticación, acceso, roles o selección de empresa", () => {
    persistManagementYear(localStorage, 10, 2027);
    const storage = createAnnualBusinessStorage(localStorage, captureAnnualDocumentScope(10, localStorage));
    for (const key of ["managerCompanyId", "processLeaderSession", "selectedCompanyId", "managerEmail", "axisOrigin"]) { storage.setItem(key, "original"); expect(localStorage.getItem(key)).toBe("original"); }
    storage.setItem("criticalityData_5", "matriz"); storage.setItem("tactical_planning_5", "plan");
    expect(localStorage.getItem("criticalityData_5")).toBeNull(); expect(localStorage.getItem("tactical_planning_5")).toBeNull();
  });
});
describe("capacitaciones históricas sin reinicio", () => {
  it("agrupa por procedencia real aun sin plannedDate; nunca por fecha ni completed", () => {
    const records = [{ id: 1, plannedDate: null, completed: "SI", actualAttendees: 18 }, { id: 2, plannedDate: "2027-01-01", completed: "SI", actualAttendees: 10 }, { id: 3, sourceYear: 2027, completed: "NO" }];
    const groups = groupTrainingOrigins(records, { 1: 2026, 2: 2026, 3: 2027 }, 2027);
    expect(groups.historical.get(2026)).toEqual(records.slice(0, 2)); expect(groups.current).toEqual([records[2]]);
    expect(groups.historical.get(2026)?.[0]).toBe(records[0]); expect(records[0].completed).toBe("SI");
  });
});
describe("salida anual segura", () => {
  it("espera el autosave activo y permite salir solo después de éxito real", async () => {
    const saving = deferred<boolean>(); const unregister = registerAnnualExitGuard(() => saving.promise);
    let done = false; const exit = flushAnnualExitGuards().then(value => { done = true; return value; });
    await Promise.resolve(); expect(done).toBe(false); saving.resolve(true); expect(await exit).toBe(true); unregister();
  });
  it("no abandona borradores cuando una guarda falla o rechaza", async () => {
    const unregister = registerAnnualExitGuard(() => false); expect(await flushAnnualExitGuards()).toBe(false); unregister();
    const remove = registerAnnualExitGuard(() => Promise.reject(new Error("sin conexión"))); expect(await flushAnnualExitGuards()).toBe(false); remove();
    expect(await flushAnnualExitGuards()).toBe(true);
  });
});
