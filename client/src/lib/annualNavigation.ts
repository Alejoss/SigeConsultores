import { annualHeaders, getAnnualDocumentScope, type AnnualDocumentScope } from "./annualWorkspace";
export type AnnualExitGuard = () => boolean | Promise<boolean>;
const guards = new Set<AnnualExitGuard>();
export function registerAnnualExitGuard(guard: AnnualExitGuard): () => void { guards.add(guard); return () => { guards.delete(guard); }; }
export function hasAnnualExitGuards(): boolean { return guards.size > 0; }
export async function flushAnnualExitGuards(): Promise<boolean> {
  for (const guard of Array.from(guards)) { try { if (!(await guard())) return false; } catch { return false; } }
  return true;
}
const inFlight = new Set<Promise<unknown>>();
export function createAnnualFetch(scope: AnnualDocumentScope, fetcher: typeof fetch = globalThis.fetch.bind(globalThis), companyId = scope.companyId): typeof fetch {
  const capturedHeaders = Object.freeze(annualHeaders(scope, companyId));
  return (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    Object.entries(capturedHeaders).forEach(([name, value]) => headers.set(name, value));
    const request = fetcher(input, { ...init, credentials: "include", headers });
    inFlight.add(request);
    void request.finally(() => inFlight.delete(request)).catch(() => undefined);
    return request;
  };
}
/** Scope is immutable for the document; delayed file reads keep using the old annual scope. */
export const annualFetch: typeof fetch = (input, init) => createAnnualFetch(getAnnualDocumentScope())(input, init);
export async function waitForAnnualRequests(timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (inFlight.size) {
    if (Date.now() >= deadline) return false;
    await Promise.race([Promise.allSettled(Array.from(inFlight)), new Promise(resolve => setTimeout(resolve, Math.min(100, deadline - Date.now())))]);
  }
  return true;
}

let editedDraft = false;
export function markAnnualDraftEdited(): void { editedDraft = true; }
export function markAnnualDraftSaved(): void { editedDraft = false; }
export function hasUnsafeAnnualDraft(): boolean { return editedDraft && !hasAnnualExitGuards(); }
export function trackAnnualRequest<T>(request: Promise<T>): Promise<T> {
  inFlight.add(request); void request.finally(() => inFlight.delete(request)).catch(() => undefined); return request;
}
