import { describe, expect, it } from "vitest";
import { getOEHref, getOEReturnTab, getProcessQuickHref, positiveScopeId, readScheduleView, scheduleViewKey } from "../processQuickNavigation";

describe("Direct process navigation", () => {
  it("preserves company and process in indicator, planning and schedule links", () => {
    for (const destination of ["indicators", "planning", "schedule"] as const) {
      const url = new URL(getProcessQuickHref(destination, 11, 7, "ote", "areas"), "https://review.example");
      expect(url.searchParams.get("processId")).toBe("11");
      expect(url.searchParams.get("companyId")).toBe("7");
      expect(url.searchParams.get("oeReturnTab")).toBe("areas");
    }
  });
  it("opens the requested indicator directly, but generic links open the area summary", () => {
    expect(getProcessQuickHref("indicators", 11, 7, "otg")).toContain("panel=otg");
    expect(getProcessQuickHref("indicators", 11, 7)).not.toContain("panel=");
    expect(getProcessQuickHref("planning", 11, 7)).toMatch(/^\/tactical-planning\?/);
  });
  it("returns to OE and its chosen tab, rather than the dashboard", () => {
    const url = new URL(getOEHref(7, "areas"), "https://review.example");
    expect(url.pathname).toBe("/strategic-trends");
    expect(url.searchParams.get("view")).toBe("oe");
    expect(url.searchParams.get("tab")).toBe("areas");
  });
  it("rejects invalid process/company scope", () => {
    for (const value of [null, undefined, 0, -1, NaN, Infinity, 1.2, "abc"]) expect(positiveScopeId(value)).toBeNull();
    expect(positiveScopeId("11")).toBe(11);
    expect(() => getProcessQuickHref("indicators", 0, 7)).toThrow();
    expect(() => getProcessQuickHref("schedule", 11, -7)).toThrow();
  });
  it("accepts only known return tabs and never follows an external return URL", () => {
    expect(getOEReturnTab("?oeReturnTab=areas")).toBe("areas");
    expect(getOEReturnTab("?oeReturnTab=https://evil.example")).toBe("overview");
    expect(getOEReturnTab("?returnTo=https://evil.example")).toBe("overview");
  });
  it("requests restoring the schedule view without altering persisted activities", () => {
    expect(getProcessQuickHref("schedule", 11, 7)).toContain("restore=1");
    expect(scheduleViewKey(11, 7)).not.toBe(scheduleViewKey(11, 8));
    expect(scheduleViewKey(11, 7)).not.toBe(scheduleViewKey(12, 7));
  });
  it("validates stored month/year/Gantt state and ignores malformed or out-of-range data", () => {
    expect(readScheduleView(JSON.stringify({ month: 10, year: 2026, gantt: true }))).toEqual({ month: 10, year: 2026, gantt: true });
    for (const raw of [null, "broken", "null", '{"month":12,"year":2026,"gantt":true}', '{"month":10,"year":1,"gantt":true}', '{"month":10,"year":2026,"gantt":"true"}']) expect(readScheduleView(raw)).toBeNull();
  });
});
