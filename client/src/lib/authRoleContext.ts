const MANAGER_CONTEXT_KEYS = [
  "managerCompanyId",
  "managerCompanyName",
  "managerEmail",
  "managerName",
  "managerPassword",
] as const;

const COMPANY_SELECTION_KEYS = ["selectedCompanyId", "selectedCompanyName"] as const;

const PROCESS_LEADER_SESSION_KEY = "processLeaderSession";

/**
 * Elimina cualquier resto local asociado a una sesión de Jefe de Proceso.
 * Los datos de autenticación y alcance siempre se confirman desde el servidor.
 */
export function clearProcessLeaderClientContext() {
  localStorage.removeItem(PROCESS_LEADER_SESSION_KEY);
  sessionStorage.removeItem(PROCESS_LEADER_SESSION_KEY);
}

/**
 * Elimina el contexto local auxiliar del Gerente. No revoca la cookie de sesión.
 */
export function clearManagerClientContext() {
  for (const key of MANAGER_CONTEXT_KEYS) localStorage.removeItem(key);
}

/**
 * Limpia una selección de empresa que pertenecía a una identidad anterior.
 * La selección del Administrador se vuelve a establecer únicamente después de
 * validar sus empresas disponibles en el servidor.
 */
export function clearCompanySelectionClientContext() {
  for (const key of COMPANY_SELECTION_KEYS) localStorage.removeItem(key);
}

/**
 * Elimina todo contexto local dependiente de un rol antes de cambiar de identidad
 * o al cerrar sesión. No elimina preferencias visuales independientes del usuario.
 */
export function clearAllAuthRoleClientContext() {
  clearProcessLeaderClientContext();
  clearManagerClientContext();
  clearCompanySelectionClientContext();
}

/**
 * Sincroniza únicamente datos auxiliares de visualización para pantallas antiguas.
 * No autentica al Gerente: el rol real proviene siempre de /api/auth/session/me.
 */
export function syncManagerClientContext(manager: {
  companyId: number;
  companyName: string;
  managerEmail: string;
}) {
  clearProcessLeaderClientContext();
  localStorage.setItem("managerCompanyId", String(manager.companyId));
  localStorage.setItem("managerCompanyName", manager.companyName);
  localStorage.setItem("managerEmail", manager.managerEmail);
  localStorage.setItem("managerName", manager.managerEmail);
  localStorage.setItem("selectedCompanyId", String(manager.companyId));
  localStorage.setItem("selectedCompanyName", manager.companyName);
}
