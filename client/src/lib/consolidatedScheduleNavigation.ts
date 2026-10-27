export type ScheduleNavigation =
  | {
      destination: "stakeholder";
      criticalityId: number;
    }
  | {
      destination: "foda";
      fodaRecordId: number;
      fodaRowId?: number | string;
      fodaRowIndex: number;
    }
  | {
      destination: "objective";
      objectiveId: number;
      resultKeyId?: string;
      taskId?: string;
      resultKeyIndex: number;
      taskIndex?: number;
    }
  | {
      destination: "compliance";
      activityId: number;
      occurrenceDate: string;
    }
  | {
      destination: "linked_commitment";
      commitmentId: number;
    };

export type SchedulableActivity = {
  id: string;
  navigation?: ScheduleNavigation;
};

function withScope(
  pathname: string,
  processId: number,
  companyId: number | null | undefined,
  values: Record<string, string | number | undefined>
): string {
  const params = new URLSearchParams({ processId: String(processId) });
  if (companyId && companyId > 0) params.set("companyId", String(companyId));
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return `${pathname}?${params.toString()}`;
}

/** Construye un acceso directo usando la identidad persistente del registro. */
export function getConsolidatedActivityHref(
  activity: SchedulableActivity,
  processId: number,
  companyId?: number | null
): string | null {
  if (!processId || !activity.navigation) return null;

  switch (activity.navigation.destination) {
    case "stakeholder":
      return withScope("/process-stakeholder-criticality", processId, companyId, {
        focusCriticalityId: activity.navigation.criticalityId,
      });
    case "foda":
      return withScope("/process-risk-matrix", processId, companyId, {
        focusFodaRecordId: activity.navigation.fodaRecordId,
        focusFodaRowId: activity.navigation.fodaRowId,
        focusFodaRowIndex: activity.navigation.fodaRowIndex,
      });
    case "objective":
      return withScope("/tactical-planning", processId, companyId, {
        focusObjectiveId: activity.navigation.objectiveId,
        focusResultKeyId: activity.navigation.resultKeyId,
        focusTaskId: activity.navigation.taskId,
        focusResultKeyIndex: activity.navigation.resultKeyIndex,
        focusTaskIndex: activity.navigation.taskIndex,
      });
    case "compliance":
      return withScope("/process-compliances", processId, companyId, {
        focusActivityId: activity.navigation.activityId,
        focusOccurrenceDate: activity.navigation.occurrenceDate,
      });
    case "linked_commitment":
      return withScope("/linked-commitments", processId, companyId, {
        focusCommitmentId: activity.navigation.commitmentId,
      });
  }
}
