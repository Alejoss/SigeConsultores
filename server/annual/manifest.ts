/**
 * Annual storage manifest v1. The 125 original SQL tables are classified here.
 * Metadata is canonical/global: annualWorkspaces, annualProcessStates,
 * annualEntityLineage, annualFileRetentions (never rewritten by runtime).
 * Identity is (workspaceId, SQL table, local numeric id); JSON/local IDs are
 * preserved, never regex-remapped. Payroll/process snapshots are attributes of
 * canonical logical identities, not newly created people/process identities.
 * CREATE TABLE LIKE intentionally has no physical foreign keys. Schema changes
 * must be applied additively to both originals and aw_* before use; never DROP.
 */
export type AnnualCopyPolicy = 'shared' | 'preserve' | 'strategy' | 'pending' | 'empty' | 'training-history' | 'mixed';
export type Ownership =
  | { kind: 'company'; column?: string }
  | { kind: 'process'; column?: string }
  | { kind: 'parent'; table: string; column: string }
  | { kind: 'characterization'; column: string }
  | { kind: 'finding' };
export interface AnnualTableManifest {
  table: string;
  policy: AnnualCopyPolicy;
  ownership?: Ownership;
  /** Additional dependencies checked even when companyId is present. */
  parents?: Array<{ column: string; table: string }>;
  json?: readonly string[];
  note?: string;
}
const company = { kind: 'company' } as const;
const process = { kind: 'process' } as const;
const parent = (table: string, column: string): Ownership => ({ kind: 'parent', table, column });
const characterization = { kind: 'characterization', column: 'processCharacterizationId' } as const;
const e = (table: string, policy: AnnualCopyPolicy, ownership?: Ownership,
  extra: Omit<AnnualTableManifest, 'table' | 'policy' | 'ownership'> = {}): AnnualTableManifest => ({ table, policy, ownership, ...extra });

export const ANNUAL_TABLE_MANIFEST: readonly AnnualTableManifest[] = [
  ...[
    'accounts','roles','account_roles','companyManagementAccess','companyOnlineCourseAccess',
    'companyTeamModuleAccess','companyTeamProcessAccess','companyTeamAccessAudit',
    'companyOnlineCourseAccessAudit','auth_sessions','companies','processUsers',
    'planningCycleActivations','planningCycles','planningCycleDecisions','planningCycleSnapshots',
    'planningCycleOperationalItems','companyAccessRequests','processAccessKeys','accessAuditLog',
    'passwordResetTokens','auth_invitations','accessInvitations','userCompanyAccess',
    'companyModuleCustomization','companyManagers','processOwnerInvitations','processOwners',
    'aiQueryAudit','recoveryAudit','courseFields','courseModules','courseLessons',
    'courseCompanySettings','courseModuleAccess','courseWorkerOverrides','courseModuleVisits',
    'courseWorkers','courseSessions','courseResults','courseModuleCertificates','courseFieldCertificates',
  ].map(t => e(t, 'shared', undefined, { note: 'Canonical identity/auth/access/control/course; never clone or reset.' })),
  e('companyInfo','strategy',company),
  e('companyValues','strategy',company,{json:['value']}),
  e('policies','strategy',company),
  e('policyObjectives','strategy',parent('policies','policyId'), { note: 'Canonical parent required; legacy policyId=companyId must resolve uniquely, never OR across companies.' }),
  e('strategicObjectives','strategy',company),
  e('strategicObjectiveMeasurementConfigs','strategy',company,{parents:[{column:'objectiveId',table:'strategicObjectives'}]}),
  e('strategicObjectiveMeasurements','empty',company,{parents:[{column:'objectiveId',table:'strategicObjectives'}],json:['definitionSnapshot']}),
  e('processes','preserve',company,{note:'Annual catalogue with canonical logical process IDs.'}),
  e('subprocesses','pending',process),
  e('stakeholders','pending',process,{json:['actions','outputs','documents']}),
  e('criticalityMatrix','pending',process,{parents:[{column:'stakeholderId',table:'stakeholders'},{column:'surveyId',table:'stakeholderSurveys'}]}),
  e('fodaAnalysis','empty',process,{parents:[{column:'subprocessId',table:'subprocesses'},{column:'policyObjectiveId',table:'policyObjectives'}],json:['strengths','opportunities','weaknesses','threats']}),
  e('riskMatrix','empty',process),
  e('tacticalObjectives','empty',process),
  e('operationalObjectives','empty',parent('tacticalObjectives','tacticalObjectiveId')),
  e('compliances','empty',process),
  e('trainings','training-history',process),
  e('documents','mixed',process,{note:'Map retained; strategic section attribution must be exact, ambiguous general documents fail closed.'}),
  e('indicators','empty',company,{parents:[{column:'processId',table:'processes'}]}),
  e('processCharacterizations','preserve',process,{json:['payrollAreaSelection'],note:'Preserve responsible/catalogue/org fields while process is pending; backend blocks editing until approval.'}),
  e('subprocessMaps','pending',process,{json:['entrada','subprocesos','salida'],note:'Internal local IDs and sourceOutputKey remain stable within annual namespace.'}),
  e('processOutputReleaseControls','pending',process),
  e('processOutputReleasePeriods','empty',process,{parents:[{column:'controlId',table:'processOutputReleaseControls'}]}),
  e('processOutputReleaseEvidence','empty',company,{parents:[{column:'periodId',table:'processOutputReleasePeriods'}]}),
  e('subprocessMapEntries','pending',parent('subprocessMaps','subprocessMapId')),
  e('subprocessMapSubprocesses','pending',parent('subprocessMaps','subprocessMapId')),
  e('subprocessMapOutputs','pending',parent('subprocessMaps','subprocessMapId')),
  e('stakeholderCriticalities','empty',process),
  e('processFODA','pending',process,{json:['strengths','opportunities','weaknesses','threats','matrixData'],note:'OTG only selected exact rows/actions; no approximate JSON replacement.'}),
  e('policyObjectiveProcessApplicability','pending',company,{parents:[{column:'processId',table:'processes'},{column:'policyObjectiveId',table:'policyObjectives'}]}),
  e('processRiskMatrices','pending',process),
  e('processTacticalObjectives','pending',process,{parents:[{column:'policyObjectiveId',table:'policyObjectives'}],json:['planningData'],note:'OE text must resolve exactly to one annual retained objective; selected tasks only.'}),
  e('processCompliances','pending',process,{parents:[{column:'tacticalObjectiveId',table:'processTacticalObjectives'}],json:['monthlyTrackingValues','monthlyChecklistValues','completedOccurrenceDates']}),
  e('processTrainings','training-history',process),
  e('processScheduleActivities','empty',process,{parents:[{column:'tacticalObjectiveId',table:'processTacticalObjectives'}]}),
  e('processIndicators','empty',process,{parents:[{column:'tacticalObjectiveId',table:'processTacticalObjectives'}]}),
  e('processParticipants','preserve',characterization,{note:'Legacy characterizationId/processId dual meaning validated for unambiguous company ownership.'}),
  e('processParticipantCompetencies','preserve',parent('processParticipants','processParticipantId')),
  e('participantWorkerAssignments','preserve',parent('processParticipants','processParticipantId'),{parents:[{column:'payrollEmployeeId',table:'payrollEmployees'}]}),
  e('participantWorkerKpis','pending',parent('participantWorkerAssignments','participantWorkerAssignmentId')),
  e('participantWorkerKpiValues','empty',parent('participantWorkerKpis','participantWorkerKpiId')),
  e('processResources','pending',characterization,{parents:[{column:'participantId',table:'processParticipants'}]}),
  e('procedures','pending',process),
  e('procedureRecords','pending',parent('procedures','procedureId')),
  e('companyFODAs','pending',company,{parents:[{column:'processId',table:'processes'}]}),
  e('companyFODASelections','pending',company,{parents:[{column:'processId',table:'processes'},{column:'companyFODAId',table:'companyFODAs'}]}),
  e('payrollEmployees','preserve',company,{parents:[{column:'currentProcessParticipantId',table:'processParticipants'}],note:'Snapshot attributes/positions with same canonical employee ID; never INSERT into canonical payroll.'}),
  e('payrollEmploymentPeriods','preserve',company,{parents:[{column:'payrollEmployeeId',table:'payrollEmployees'}]}),
  e('organizationChart','preserve',company),
  e('organizationChartNodes','preserve',parent('organizationChart','chartId'),{note:'nodeId/parentNodeId are local graph identities, not account/person IDs.'}),
  e('organizationChartFiles','preserve',parent('organizationChart','chartId')),
  e('managementSystems','preserve',company),
  e('managementSystemFiles','preserve',company,{parents:[{column:'managementSystemId',table:'managementSystems'}]}),
  e('managementSystemChecklistItems','preserve',company,{parents:[{column:'managementSystemId',table:'managementSystems'}]}),
  e('managementSystemChecklistActions','preserve',parent('managementSystemChecklistItems','checklistItemId')),
  e('changeManagementRecords','empty',company,{parents:[{column:'responsibleProcessId',table:'processes'}]}),
  e('changeManagementScopeLinks','empty',company,{parents:[{column:'changeId',table:'changeManagementRecords'},{column:'processId',table:'processes'}],json:['snapshotJson'],note:'Polymorphic linkType/referenceId must be resolved by exact type, not text.'}),
  e('changeManagementImpacts','empty',parent('changeManagementRecords','changeId')),
  e('changeManagementActions','empty',company,{parents:[{column:'changeId',table:'changeManagementRecords'},{column:'responsibleProcessId',table:'processes'}]}),
  e('changeManagementIndicators','empty',company,{parents:[{column:'changeId',table:'changeManagementRecords'},{column:'processId',table:'processes'},{column:'indicatorId',table:'processIndicators'}]}),
  e('changeManagementEvents','empty',company,{parents:[{column:'changeId',table:'changeManagementRecords'}]}),
  e('changeManagementSuggestions','empty',company,{parents:[{column:'processId',table:'processes'},{column:'changeId',table:'changeManagementRecords'}]}),
  e('linkedCommitments','mixed',company,{parents:[{column:'processId',table:'processes'}],note:'At creation preserve corporate bindings exactly. Approved schedule decisions may create separate pending execution with sourceWorkspaceId/lineage; never clone program/inspection sources. Close/review preserve corporate facts and leave excluded historical sources untouched.'}),
  e('linkedCommitmentEvidence','mixed',company,{parents:[{column:'linkedCommitmentId',table:'linkedCommitments'}]}),
  e('meetingTypes','pending',company,{parents:[{column:'processId',table:'processes'}]}),
  e('processMeetings','empty',company,{parents:[{column:'processId',table:'processes'},{column:'meetingTypeId',table:'meetingTypes'}],json:['participants']}),
  e('meetingAgreements','empty',company,{parents:[{column:'processId',table:'processes'},{column:'targetProcessId',table:'processes'},{column:'meetingId',table:'processMeetings'}]}),
  e('meetingFiles','empty',company,{parents:[{column:'meetingId',table:'processMeetings'}]}),
  e('meetingAgreementEvidence','empty',company,{parents:[{column:'meetingAgreementId',table:'meetingAgreements'}]}),
  e('programActions','empty',company,{parents:[{column:'programId',table:'managementPrograms'}],note:'ZERO actions at creation, no implicit import from plan attachment.'}),
  e('programActionBaselines','mixed',company,{parents:[{column:'programId',table:'managementPrograms'}],note:'Destination zero baseline, original immutable.'}),
  e('audits','preserve',company),
  e('operationalFindings','mixed',{kind:'finding'}),
  e('operationalFindingBaselines','mixed',{kind:'finding'}),
  e('auditFiles','preserve',company,{parents:[{column:'auditId',table:'audits'}]}),
  e('inspections','empty',company),
  e('inspectionFiles','empty',company,{parents:[{column:'inspectionId',table:'inspections'}]}),
  e('processStakeholderMatrixFiles','pending',process),
  e('managementPrograms','mixed',company,{note:'Structure/general data/plan attachment retained; counters zero.'}),
  e('managementProgramFiles','preserve',company,{parents:[{column:'programId',table:'managementPrograms'}]}),
  e('stakeholderSurveys','empty',process,{json:['linkedActionIds'],note:'Historical survey never presented as a newly conducted survey.'}),
  e('companyTrainings','training-history',company,{note:'Exact unchanged history grouped under sourceYear, not newly delivered training.'}),
  e('companyCompliances','preserve',company),
  e('companyTrends','empty',company,{json:['oePercentsJson']}),
  e('trainingSchedules','training-history',company),
  e('trainingBackups','training-history',company,{parents:[{column:'trainingId',table:'companyTrainings'}]}),
];
export const BUSINESS_TABLE_NAMES: readonly string[] = Object.freeze(ANNUAL_TABLE_MANIFEST.filter(x => x.policy !== 'shared').map(x => x.table));
export const MANIFEST_BY_TABLE = new Map(ANNUAL_TABLE_MANIFEST.map(x => [x.table, x]));
export const COMMITMENT_SOURCE_TABLES: Readonly<Record<string, readonly [string, string]>> = {
  checklist_action:['managementSystemChecklistActions','managementSystemChecklistItems'],
  checklist_vigency:['managementSystemChecklistItems','managementSystemChecklistItems'],
  program_action:['programActions','managementPrograms'],
  audit_finding:['operationalFindings','operationalFindings'],
  inspection_finding:['operationalFindings','operationalFindings'],
  meeting_agreement:['meetingAgreements','processMeetings'],
  change_action:['changeManagementActions','changeManagementRecords'],
  company_compliance:['companyCompliances','companyCompliances'],
};
export function namespaceTable(workspaceId: number, table: string): string {
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0 || !BUSINESS_TABLE_NAMES.includes(table)) throw new Error('Identidad de namespace anual inválida');
  const name = `aw_${workspaceId}_${table}`;
  if (name.length > 64) throw new Error('Nombre de tabla anual demasiado largo');
  return name;
}
export function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(value)) throw new Error('Identificador SQL inválido');
  return '`' + value + '`';
}
