import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


/**
 * Get companyId from URL params or localStorage
 * Useful for pages accessed by managers who pass companyId via URL params
 * @returns companyId as number or null
 */
export function getCompanyIdFromLocationOrStorage(): number | null {
  // First try to get from URL params using window.location.search
  const urlParams = new URLSearchParams(window.location.search);
  const urlCompanyId = urlParams.get('companyId');
  if (urlCompanyId) return parseInt(urlCompanyId);
  
  // Then try Process Leader session from sessionStorage
  try {
    const sessionStr = sessionStorage.getItem('processLeaderSession');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      if (session.companyId) return session.companyId;
    }
  } catch (e) {
    // Silently fail if session parsing fails
  }
  
  // Then try localStorage
  const stored = localStorage.getItem("selectedCompanyId");
  return stored ? parseInt(stored) : null;
}
