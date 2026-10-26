import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { ONE_YEAR_MS } from "@shared/const";
import { applySessionCookie, getSessionCookieOptions, sharedCookieDomain } from "../_core/cookies";

function request(hostname: string, protocol = "https"): Request {
  return { hostname, protocol, headers: {} } as Request;
}

describe("shared session cookie", () => {
  it("uses the parent domain for the apex and the course subdomain", () => {
    expect(sharedCookieDomain("isge360.com", "")).toBe("isge360.com");
    expect(sharedCookieDomain("capacitaciones.isge360.com", "")).toBe("isge360.com");
    expect(sharedCookieDomain("www.isge360.com", "")).toBe("isge360.com");
    expect(sharedCookieDomain("localhost", "")).toBeUndefined();
    expect(sharedCookieDomain("127.0.0.1", "")).toBeUndefined();
    expect(sharedCookieDomain("capacitaciones.isge360.com", "isge360.com")).toBe("isge360.com");
    expect(sharedCookieDomain("evil.example", "isge360.com")).toBeUndefined();
  });

  it("sets Domain on the production session cookie and clears the old host-only copy", () => {
    const options = getSessionCookieOptions(request("capacitaciones.isge360.com"));
    expect(options.domain).toBe("isge360.com");
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);

    const calls: Array<{ kind: string; args: unknown[] }> = [];
    const res = {
      cookie(...args: unknown[]) {
        calls.push({ kind: "set", args });
      },
      clearCookie(...args: unknown[]) {
        calls.push({ kind: "clear", args });
      },
    } as Response;
    applySessionCookie(res, request("isge360.com"), "token-1", ONE_YEAR_MS);
    expect(calls[0]).toMatchObject({ kind: "set", args: ["app_session_id", "token-1", expect.objectContaining({ domain: "isge360.com" })] });
    expect(calls[1]).toMatchObject({ kind: "clear", args: ["app_session_id", expect.not.objectContaining({ domain: "isge360.com" })] });
    expect(getSessionCookieOptions(request("localhost", "http")).domain).toBeUndefined();
  });
});
