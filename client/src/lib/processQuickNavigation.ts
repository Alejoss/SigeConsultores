export type ProcessIndicatorPanel = "ote" | "otg" | "partes" | "cumplimientos" | "compromisos" | "salidas";
export type OEReturnTab = "overview" | "heatmap" | "timeline" | "areas";
export function positiveScopeId(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
export function getOEReturnTab(search: string): OEReturnTab {
  const tab = new URLSearchParams(search).get("oeReturnTab");
  return tab === "areas" || tab === "heatmap" || tab === "timeline" ? tab : "overview";
}
/** Update only selection keys, never login/session/role keys; called with server-authorized process data. */
export function selectNavigationProcess(process: { id: number; companyId: number; name: string }): void {
  if (!positiveScopeId(process.id) || !positiveScopeId(process.companyId) || typeof window === "undefined") return;
  try {
    localStorage.setItem("selectedProcessId", String(process.id));
    localStorage.setItem("selectedCompanyId", String(process.companyId));
    localStorage.setItem("selectedProcessName", process.name);
  } catch { /* URL scope remains authoritative when storage is unavailable. */ }
}
export function getOEHref(companyId: number, tab: OEReturnTab = "overview"): string {
  const params = new URLSearchParams({ companyId: String(companyId), view: "oe", tab });
  return `/strategic-trends?${params}`;
}
export function getProcessQuickHref(destination: "indicators" | "planning" | "schedule", processId: number, companyId: number, panel?: ProcessIndicatorPanel, returnTab: OEReturnTab = "overview"): string {
  if (!positiveScopeId(processId) || !positiveScopeId(companyId)) throw new Error("Selecciona una empresa y un área válidas.");
  const params = new URLSearchParams({ processId: String(processId), companyId: String(companyId), oeReturnTab: returnTab });
  const path = destination === "indicators" ? "/process-indicators" : destination === "planning" ? "/tactical-planning" : "/consolidated-schedule";
  if (destination === "indicators" && panel) params.set("panel", panel);
  if (destination === "schedule") params.set("restore", "1");
  return `${path}?${params}`;
}
export type ScheduleViewState = { month: number; year: number; gantt: boolean };
export function scheduleViewKey(processId: number, companyId?: number | null): string {
  return `isge:schedule-view:${companyId || 0}:${processId}`;
}
export function readScheduleView(raw: string | null): ScheduleViewState | null {
  try {
    const value = JSON.parse(raw || "null");
    if (value && Number.isInteger(value.month) && value.month >= 0 && value.month <= 11 && Number.isInteger(value.year) && value.year >= 1900 && value.year <= 9999 && typeof value.gantt === "boolean") return value;
  } catch { /* Invalid session state is ignored, never executed or followed as a URL. */ }
  return null;
}
