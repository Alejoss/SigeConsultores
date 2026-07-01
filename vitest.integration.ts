/**
 * Server tests that require a live MySQL database (DATABASE_URL).
 * Run with: pnpm test:integration
 */
export const integrationTestFiles = [
  "server/__tests__/consolidatedIndicators.test.ts",
  "server/__tests__/criticalityDuplicationFix.test.ts",
  "server/__tests__/getUserCompaniesFix.test.ts",
  "server/__tests__/hierarchicalAccess.test.ts",
  "server/__tests__/labelMappingFix.test.ts",
  "server/__tests__/matrixFODAPDF.test.ts",
  "server/__tests__/moduleCustomization.test.ts",
  "server/__tests__/moduleCustomizationDataMapping.test.ts",
  "server/__tests__/moduleCustomizationFix.test.ts",
  "server/__tests__/moduleCustomizationIntegration.test.ts",
  "server/__tests__/processOwnerInvitationAccept.test.ts",
  "server/__tests__/processStakeholderCriticality.test.ts",
  "server/__tests__/resourcesPDF.test.ts",
  "server/__tests__/uniqueConstraintTest.test.ts",
  "server/__tests__/upsertUser.test.ts",
  "server/routers/__tests__/consolidatedIndicators.test.ts",
  "server/routers/__tests__/consolidatedSchedule.test.ts",
  "server/routers/__tests__/criticalityMatrix.test.ts",
  "server/routers/__tests__/criticalityMatrixWithStakeholders.test.ts",
  "server/routers/__tests__/macroIndicators.test.ts",
  "server/routers/__tests__/managerCredentials.test.ts",
  "server/routers/__tests__/processTacticalObjectives.test.ts",
  "server/__tests__/consolidatedIndicatorsMetaAlcanzada.test.ts",
  "server/__tests__/fixes.test.ts",
  "server/__tests__/procedures.test.ts",
  "server/__tests__/tacticalObjectivesFixed.test.ts",
] as const;
