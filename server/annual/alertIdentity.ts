import type { ConsolidatedScheduleActivity } from "../lib/consolidatedScheduleActivities";

export type YearScopedActivity = { year: number; activity: ConsolidatedScheduleActivity };

/** Stable entity IDs win over dates/hashes: a later closure supersedes its origin. */
export function annualActivityIdentity(activity: ConsolidatedScheduleActivity): string {
  const nav = activity.navigation;
  if (!nav) return `${activity.type}:${activity.id}`;
  switch (nav.destination) {
    case "stakeholder": return `stakeholder:${nav.criticalityId}`;
    case "foda": return `foda:${nav.fodaRecordId}:${nav.fodaRowId ?? nav.fodaRowIndex}`;
    case "objective": return `objective:${nav.objectiveId}:${nav.resultKeyId ?? nav.resultKeyIndex}:${nav.taskId ?? nav.taskIndex ?? "result"}`;
    case "compliance": return `compliance:${nav.activityId}:${nav.occurrenceDate}`;
    case "linked_commitment": return `commitment:${nav.commitmentId}`;
    case "output_release": return `release:${nav.controlId}:${nav.periodId}`;
  }
}

export function mergeAnnualAlertActivities(scoped: YearScopedActivity[]): ConsolidatedScheduleActivity[] {
  const byIdentity = new Map<string, YearScopedActivity>();
  for (const item of scoped) {
    const identity = annualActivityIdentity(item.activity);
    const existing = byIdentity.get(identity);
    if (!existing || item.year >= existing.year) byIdentity.set(identity, item);
  }
  return Array.from(byIdentity.values()).map(({ year, activity }) => ({
    ...activity,
    // Show provenance, not a blended percentage or an implicit current year.
    badge: `${activity.badge} · ${year}`,
  }));
}
