export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Identidad corporativa fija de ISGE 360. */
export const APP_TITLE = "ISGE 360";
export const APP_TAGLINE = "La estrategia hecha gestión.";
export const APP_LOGO = "/isge360-logo.png";
export const APP_ICON = "/isge360-icon.png";

/** True si hay App ID y portal OAuth reales (evita redirigir con placeholders de .env.example). */
export function isManusOAuthReady(): boolean {
  const appId = (import.meta.env.VITE_APP_ID as string | undefined)?.trim() ?? "";
  const portal = (import.meta.env.VITE_OAUTH_PORTAL_URL as string | undefined)?.trim() ?? "";
  if (!appId || !portal) return false;
  const lower = appId.toLowerCase();
  if (lower.includes("replace_with") || lower.includes("example") || lower === "proj_abc123def456") {
    return false;
  }
  try {
    const u = new URL(portal);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  if (!isManusOAuthReady()) {
    return "/login";
  }
  const oauthPortalUrl = (
    import.meta.env.VITE_OAUTH_PORTAL_URL as string
  ).trim().replace(/\/$/, "");
  const appId = (import.meta.env.VITE_APP_ID as string).trim();
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
