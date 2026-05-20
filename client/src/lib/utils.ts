import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


import { getCompanyIdFromSession, getProcessIdFromSession } from "./sessionScope";

/**
 * @deprecated Use getCompanyIdFromSession() from sessionScope.ts
 */
export function getCompanyIdFromLocationOrStorage(): number | null {
  return getCompanyIdFromSession();
}

export { getCompanyIdFromSession, getProcessIdFromSession, getSessionScope } from "./sessionScope";
