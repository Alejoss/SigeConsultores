import path from "node:path";
import { defineConfig } from "vitest/config";

const selectedProjects = process.argv.flatMap((argument, index, args) =>
  argument === "--project" ? [args[index + 1] || ""] :
  argument.startsWith("--project=") ? [argument.slice("--project=".length)] : []
);
const runsIntegration = selectedProjects.length === 0 || selectedProjects.some(project =>
  project === "integration" || project.includes("*") || project.includes("?")
);

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  // Vitest 2 reads this option from the root runner, not a workspace project.
  // Integration fixtures share canonical tables and must never run concurrently.
  test: { fileParallelism: runsIntegration ? false : undefined },
});
