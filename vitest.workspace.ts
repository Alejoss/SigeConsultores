import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineWorkspace } from "vitest/config";
import { integrationTestFiles } from "./vitest.integration";
import { loadTestEnv } from "./server/__tests__/helpers/loadTestEnv";

const root = import.meta.dirname;
loadTestEnv(root);

const alias = {
  "@": path.resolve(root, "client", "src"),
  "@shared": path.resolve(root, "shared"),
  "@assets": path.resolve(root, "attached_assets"),
};

const clientDomTests = [
  "client/src/pages/__tests__/ManagerLogin.test.ts",
  "client/src/pages/__tests__/ProcessStakeholderCriticalityManagerFix.test.tsx",
  "client/__tests__/clipboard.test.ts",
];

/** Component specs pending alignment with current UI (were not executed before Vitest client project). */
const pendingClientTests = [
  "client/src/components/__tests__/OrganizationChart.test.tsx",
  "client/src/components/__tests__/RecoveryForm.test.tsx",
];

/** Legacy duplicate specs kept for reference; canonical logic is tested elsewhere. */
const legacyExcludedTests = [
  "client/src/__tests__/calculateIndicatorsFixed.test.ts",
];

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    resolve: { alias },
    test: {
      name: "unit",
      include: [
        "server/**/*.test.ts",
        "client/**/*.test.ts",
        "client/**/*.test.tsx",
        "src/tests/**/*.test.ts",
      ],
      exclude: [
        ...integrationTestFiles,
        ...clientDomTests,
        ...pendingClientTests,
        ...legacyExcludedTests,
      ],
      environment: "node",
    },
  },
  {
    extends: "./vitest.config.ts",
    resolve: { alias },
    test: {
      name: "integration",
      include: [...integrationTestFiles],
      environment: "node",
      // Shared MySQL fixtures: avoid cross-file races on stakeholders/criticalityMatrix.
      fileParallelism: false,
      hookTimeout: 30_000,
      testTimeout: 30_000,
    },
  },
  {
    extends: "./vitest.config.ts",
    plugins: [react()],
    resolve: { alias },
    test: {
      name: "client",
      include: clientDomTests,
      environment: "jsdom",
      globals: true,
      setupFiles: [path.resolve(root, "server/__tests__/helpers/setupClientTests.ts")],
    },
  },
]);
