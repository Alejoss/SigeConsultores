/**
 * Resolves company/process context for pages used by platform users, managers, and process leaders.
 * Prefer these helpers over reading a single localStorage key.
 */

export type SessionScope = {
  companyId: number | null;
  processId: number | null;
  companyName: string | null;
  processName: string | null;
};

/** Returns the processLeaderSession object from storage, or null if not found. */
function getProcessLeaderSessionFromStorage(): Record<string, unknown> | null {
  try {
    // ProcessLeaderAuthContext persists to localStorage; sessionStorage is a fallback
    const raw =
      localStorage.getItem("processLeaderSession") ||
      sessionStorage.getItem("processLeaderSession");
    if (raw) return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // ignore
  }
  return null;
}

export function getCompanyIdFromSession(): number | null {
  if (typeof window === "undefined") return null;

  const urlParams = new URLSearchParams(window.location.search);
  const urlCompanyId = urlParams.get("companyId");
  if (urlCompanyId) return parseInt(urlCompanyId, 10);

  const plSession = getProcessLeaderSessionFromStorage();
  if (plSession?.companyId) return Number(plSession.companyId);

  const managerId = localStorage.getItem("managerCompanyId");
  if (managerId) return parseInt(managerId, 10);

  const selected = localStorage.getItem("selectedCompanyId");
  return selected ? parseInt(selected, 10) : null;
}

export function getProcessIdFromSession(): number | null {
  if (typeof window === "undefined") return null;

  const urlParams = new URLSearchParams(window.location.search);
  const urlProcessId = urlParams.get("processId");
  if (urlProcessId) return parseInt(urlProcessId, 10);

  const plSession = getProcessLeaderSessionFromStorage();
  if (plSession?.processId) return Number(plSession.processId);

  const stored = localStorage.getItem("selectedProcessId");
  return stored ? parseInt(stored, 10) : null;
}

/**
 * Returns the correct back path based on the axis origin stored in localStorage.
 * If axisOrigin is set, returns the axis page path; otherwise falls back to the dashboard.
 */
export function getAxisBackPath(fallback: string = "/manager-dashboard"): string {
  const axis = localStorage.getItem("axisOrigin");
  if (axis === "estrategia") return "/axis-estrategia";
  if (axis === "gestion") return "/axis-gestion";
  if (axis === "desempeno") return "/axis-desempeno";
  return fallback;
}

export function getSessionScope(): SessionScope {
  return {
    companyId: getCompanyIdFromSession(),
    processId: getProcessIdFromSession(),
    companyName:
      localStorage.getItem("selectedCompanyName") ||
      localStorage.getItem("managerCompanyName") ||
      null,
    processName: localStorage.getItem("selectedProcessName") || null,
  };
}
