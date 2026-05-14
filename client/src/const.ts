export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Branding fijo en código (no configurable por .env). */
export const APP_TITLE = "SIGE Platform";

export const APP_LOGO =
  "https://placehold.co/128x128/E1E7EF/1F2937?text=SIGE";

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