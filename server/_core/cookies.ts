import type { CookieOptions, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/**
 * Parent domain so one session cookie is sent to isge360.com and its subdomains.
 * Domain must be the registrable domain. Using the request host would keep
 * capacitaciones.isge360.com from sharing the cookie with the apex.
 */
export function sharedCookieDomain(hostname: string | undefined, configured?: string): string | undefined {
  const host = (hostname || "").split(":")[0].trim().toLowerCase().replace(/\.$/, "");
  if (!host || LOCAL_HOSTS.has(host) || isIpAddress(host)) return undefined;
  const fromEnv = (configured ?? process.env.COOKIE_DOMAIN ?? "").trim().replace(/^\./, "").toLowerCase();
  if (fromEnv) {
    if (host === fromEnv || host.endsWith(`.${fromEnv}`)) return fromEnv;
    return undefined;
  }
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return undefined;
  return labels.slice(-2).join(".");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const secure = isSecureRequest(req);
  const domain = sharedCookieDomain(req.hostname);
  // SameSite=None exige Secure; en http://localhost Chrome rechaza la cookie. Usar Lax en desarrollo HTTP.
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? ("none" as const) : ("lax" as const),
    secure,
    ...(domain ? { domain } : {}),
  };
}

/** Writes the shared session cookie and drops an older host-only copy of the same name. */
export function applySessionCookie(res: Response, req: Request, token: string, maxAge: number) {
  const options = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, token, { ...options, maxAge });
  if (options.domain) {
    const { domain: _domain, ...hostOnly } = options;
    res.clearCookie(COOKIE_NAME, { ...hostOnly, maxAge: -1 });
  }
}

/** Removes both the shared cookie and a host-only cookie left from before the domain was set. */
export function clearSessionCookie(res: Response, req: Request) {
  const options = getSessionCookieOptions(req);
  res.clearCookie(COOKIE_NAME, { ...options, maxAge: -1 });
  if (options.domain) {
    const { domain: _domain, ...hostOnly } = options;
    res.clearCookie(COOKIE_NAME, { ...hostOnly, maxAge: -1 });
  }
}
