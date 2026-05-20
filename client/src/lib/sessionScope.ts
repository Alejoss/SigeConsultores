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

export function getCompanyIdFromSession(): number | null {
  if (typeof window === "undefined") return null;

  const urlParams = new URLSearchParams(window.location.search);
  const urlCompanyId = urlParams.get("companyId");
  if (urlCompanyId) return parseInt(urlCompanyId, 10);

  try {
    const sessionStr = sessionStorage.getItem("processLeaderSession");
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      if (session.companyId) return Number(session.companyId);
    }
  } catch {
    // ignore
  }

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

  try {
    const sessionStr = sessionStorage.getItem("processLeaderSession");
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      if (session.processId) return Number(session.processId);
    }
  } catch {
    // ignore
  }

  const stored = localStorage.getItem("selectedProcessId");
  return stored ? parseInt(stored, 10) : null;
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
