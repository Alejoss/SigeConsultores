export const BASE_MANAGEMENT_YEAR = 2026;
export type AnnualStrategy = { purpose: boolean; mission: boolean; vision: boolean; values: boolean; policy: boolean; strategicObjectives: boolean };
export type AnnualWorkspaceRecord = { id: number; companyId: number; year: number; sourceYear: number | null; status: "open" | "closed"; storage: "base" | "namespace"; strategy: AnnualStrategy };
export type AnnualOverview = { workspace: AnnualWorkspaceRecord; processes: Array<{ id: number; name: string; status: "pending" | "incorporated"; approved: boolean }>; incorporatedCount: number; totalCount: number; trainingOrigins: Record<number, number> };
export type AnnualDocumentScope = Readonly<{ companyId: number | null; year: number; years: Readonly<Record<number, number>> }>;
const selectionPrefix = "isge:annual-selection:";
function validId(value: unknown): number | null { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null; }
function validYear(value: unknown): number { const n = Number(value); return Number.isInteger(n) && n >= BASE_MANAGEMENT_YEAR && n <= 9999 ? n : BASE_MANAGEMENT_YEAR; }
export function captureAnnualDocumentScope(companyId: number | null, storage?: Pick<Storage, "length" | "key" | "getItem">): AnnualDocumentScope {
  const years: Record<number, number> = {};
  if (storage) for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(selectionPrefix)) { const id = validId(key.slice(selectionPrefix.length)); if (id) years[id] = validYear(storage.getItem(key)); }
  }
  return Object.freeze({ companyId: validId(companyId), year: companyId ? years[companyId] || BASE_MANAGEMENT_YEAR : BASE_MANAGEMENT_YEAR, years: Object.freeze(years) });
}
let documentScope: AnnualDocumentScope | undefined;
/** Installed once before React/tRPC start. Storage changes never mutate an old document's requests. */
export function initializeAnnualDocumentScope(scope: AnnualDocumentScope): void {
  if (documentScope) throw new Error("El contexto anual del documento ya está fijado.");
  documentScope = scope;
}
export function getAnnualDocumentScope(): AnnualDocumentScope {
  return documentScope || Object.freeze({ companyId: null, year: BASE_MANAGEMENT_YEAR, years: Object.freeze({}) });
}
export function getSelectedManagementYear(companyId?: number | null): number {
  const scope = getAnnualDocumentScope();
  return companyId && companyId !== scope.companyId ? scope.years[companyId] || BASE_MANAGEMENT_YEAR : scope.year;
}
export function annualHeaders(scope: AnnualDocumentScope, companyId: number | null = scope.companyId): Record<string, string> {
  return companyId ? { "x-isge-company-id": String(companyId), "x-isge-year": String(companyId === scope.companyId ? scope.year : scope.years[companyId] || BASE_MANAGEMENT_YEAR) } : {};
}
export function persistManagementYear(storage: Pick<Storage, "setItem">, companyId: number, year: number): void {
  if (!validId(companyId) || validYear(year) !== year) throw new Error("Selecciona una empresa y un año válidos.");
  storage.setItem(`${selectionPrefix}${companyId}`, String(year));
}
export function annualBusinessKey(key: string, scope = getAnnualDocumentScope()): string {
  return `isge:annual:${scope.companyId || 0}:${scope.year}:${key}`;
}
const businessKey = /^(criticalityData_|tactical_planning_|processSchedule_|processTacticalObjectives_|processes_|foda_enterprise_versions_|isge:schedule-view:|selectedPolicyId$)/;
/** Only business keys; auth, company selection and role keys retain their canonical names. */
export function createAnnualBusinessStorage(storage: Storage, scope: AnnualDocumentScope) {
  return {
    getItem(key: string): string | null {
      if (!businessKey.test(key)) return storage.getItem(key);
      return storage.getItem(annualBusinessKey(key, scope)) ?? (scope.year === BASE_MANAGEMENT_YEAR ? storage.getItem(key) : null);
    },
    setItem(key: string, value: string) { storage.setItem(businessKey.test(key) ? annualBusinessKey(key, scope) : key, value); },
    removeItem(key: string) { storage.removeItem(businessKey.test(key) ? annualBusinessKey(key, scope) : key); },
  };
}
export const annualBusinessStorage = {
  getItem: (key: string) => createAnnualBusinessStorage(localStorage, getAnnualDocumentScope()).getItem(key),
  setItem: (key: string, value: string) => createAnnualBusinessStorage(localStorage, getAnnualDocumentScope()).setItem(key, value),
  removeItem: (key: string) => createAnnualBusinessStorage(localStorage, getAnnualDocumentScope()).removeItem(key),
};
/** Provenance from the API, never a planned date or today's clock. */
export function groupTrainingOrigins<T extends { id: number; sourceYear?: number | null }>(trainings: T[], origins: Record<number, number>, selectedYear: number) {
  const current: T[] = [], historical = new Map<number, T[]>();
  for (const training of trainings) {
    const origin = origins[training.id] ?? training.sourceYear ?? selectedYear;
    if (origin === selectedYear) current.push(training);
    else historical.set(origin, [...(historical.get(origin) || []), training]);
  }
  return { current, historical };
}
