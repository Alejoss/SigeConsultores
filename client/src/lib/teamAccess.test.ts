import { afterEach, describe, expect, it } from "vitest";
import {
  defaultModuleAccess,
  routeAccess,
  routeModule,
  processAccessLevel,
  changedModules,
  setClientTeamPolicy,
  clientMutationDenied,
  type DetailedTeamAccess,
} from "./teamAccess";
const access = (): DetailedTeamAccess => ({
  moduleAccess: defaultModuleAccess(),
  processAccess: [
    { processId: 12, accessLevel: "read" },
    { processId: 13, accessLevel: "write" },
  ],
  ownProcessId: 11,
  fullAccess: false,
});
afterEach(() => setClientTeamPolicy(null));
describe("granular client policy", () => {
  it("preserves own process duties even when corporate systems and personnel are denied", () => {
    const policy = access();
    policy.moduleAccess.management_systems = "none";
    policy.moduleAccess.organization_personnel = "none";
    expect(routeAccess(policy, "/process-participants", 11)).toBe("write");
    expect(routeAccess(policy, "/process-compliances", 11)).toBe("write");
    expect(routeAccess(policy, "/audits-inspections", 11)).toBe("none");
    expect(routeAccess(policy, "/payroll", 11)).toBe("none");
    expect(routeAccess(policy, "/process-map", 11)).toBe("write");
  });
  it("allows only selected additional processes with explicit read/write levels", () => {
    expect(processAccessLevel(access(), 11)).toBe("write");
    expect(processAccessLevel(access(), 12)).toBe("read");
    expect(routeAccess(access(), "/process-characterization", 13)).toBe(
      "write"
    );
    expect(routeAccess(access(), "/process-foda", 99)).toBe("none");
    expect(routeAccess(undefined, "/process-characterization", 11)).toBe(
      "none"
    );
  });
  it("nested denies beat strategy writes and performance URL panels use their exact module", () => {
    const policy = access();
    policy.moduleAccess.strategy = "write";
    policy.moduleAccess.company_foda = "none";
    expect(routeAccess(policy, "/company-info", 11)).toBe("write");
    expect(routeAccess(policy, "/foda", 11)).toBe("none");
    expect(routeModule("/strategic-trends?view=sgi&tab=areas")).toBe(
      "management_systems"
    );
    expect(routeModule("/strategic-trends?view=staff")).toBe(
      "organization_personnel"
    );
    expect(routeModule("/strategic-trends?view=otg")).toBeNull();
  });
  it("unrestricting restores read and changedModules never revokes untouched legacy coordinator grants", () => {
    const before = defaultModuleAccess(true);
    before.company_foda = "none";
    expect(changedModules(before, before)).toEqual([]);
    expect(changedModules(before, { ...before, company_foda: "read" })).toEqual(
      [{ module: "company_foda", accessLevel: "read" }]
    );
  });
  it("blocks autosave in read-only process, foreign company and annual closed mode while online remains independent", () => {
    setClientTeamPolicy({ access: access(), companyId: 7, readOnly: true });
    expect(clientMutationDenied("procedures.create", { processId: 12 })).toBe(
      true
    );
    expect(
      clientMutationDenied("processParticipants.update", { companyId: 7 })
    ).toBe(true);
    expect(clientMutationDenied("onlineCourses.create", { companyId: 7 })).toBe(
      false
    );
    setClientTeamPolicy({ access: access(), companyId: 7, readOnly: false });
    expect(clientMutationDenied("procedures.create", { processId: 11 })).toBe(
      false
    );
    expect(clientMutationDenied("procedures.create", { processId: 12 })).toBe(
      true
    );
    expect(
      clientMutationDenied("procedures.create", { companyId: 8, processId: 11 })
    ).toBe(true);
  });
});
