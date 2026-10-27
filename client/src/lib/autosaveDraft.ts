export function mergeProtectedDraft<
  T extends Record<string, unknown>,
  K extends keyof T,
>(current: T, server: T, protectedFields: ReadonlySet<K>): T {
  return Object.assign(
    {},
    server,
    ...Array.from(protectedFields).map(field => ({ [field]: current[field] }))
  ) as T;
}

export function mergePendingPatch<T extends Record<string, unknown>>(
  current: Partial<T> | null,
  next: Partial<T>
): Partial<T> {
  return { ...current, ...next };
}

export function shouldHydrateRemoteSnapshot({
  hasSnapshot,
  hasHydrated,
  hasLocalDraft,
}: {
  hasSnapshot: boolean;
  hasHydrated: boolean;
  hasLocalDraft: boolean;
}): boolean {
  return hasSnapshot && !hasHydrated && !hasLocalDraft;
}
