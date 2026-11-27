import path from 'node:path';
import { defineWorkspace } from 'vitest/config';
const root = path.resolve(import.meta.dirname, '../..');
const alias = { '@shared': path.join(root, 'shared'), '@': path.join(root, 'client/src') };
export default defineWorkspace([
  { root, resolve: { alias }, test: { name: 'history-unit', include: ['server/annual/history.unit.test.ts'], environment: 'node' } },
  { root, resolve: { alias }, test: { name: 'history-integration', include: ['server/annual/history.integration.test.ts'], environment: 'node', testTimeout: 30000, hookTimeout: 30000, env: { TZ: 'UTC' } } },
]);
