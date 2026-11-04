export const OBJECTIVE_NARRATIVE_KEYS = [
  "situacionInicial",
  "resultadoEsperado",
  "indicador",
] as const;
export type ObjectiveNarrativeKey = (typeof OBJECTIVE_NARRATIVE_KEYS)[number];
export type ObjectiveNarratives = Partial<
  Record<ObjectiveNarrativeKey, string>
>;
export const OBJECTIVE_NARRATIVE_MAX_LENGTH = 10_000;

/** Only explicitly edited keys belong in a write; an empty string deliberately clears a field. */
export function editedObjectiveNarratives(
  values: ObjectiveNarratives,
  edited: ObjectiveNarrativeKey[] = []
): ObjectiveNarratives {
  const patch: ObjectiveNarratives = {};
  for (const key of edited) {
    if (typeof values[key] === "string") patch[key] = values[key];
  }
  return patch;
}

/** Opening a card or editing descriptive text cannot trigger a generic planning write. */
export function objectivePlanningSaveSignature<
  T extends ObjectiveNarratives & { expanded?: boolean },
>(plannings: T[]): string {
  return JSON.stringify(
    plannings.map(
      ({
        expanded,
        situacionInicial,
        resultadoEsperado,
        indicador,
        ...planning
      }) => planning
    )
  );
}

export type NarrativeSaveStatus = "pending" | "saving" | "saved" | "error";

/** Debounces edited keys and serializes writes. Newer edits always win over a pending/failed snapshot. */
export function createNarrativeAutosave(
  save: (patch: ObjectiveNarratives) => Promise<unknown>,
  onStatus: (status: NarrativeSaveStatus) => void = () => {},
  delay = 1200
) {
  let pending: ObjectiveNarratives = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let ready = false;

  const hasPending = () => Object.keys(pending).length > 0;
  const flush = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    ready = true;
    if (active) return active;
    if (!hasPending()) return Promise.resolve();
    const snapshot = pending;
    pending = {};
    ready = false;
    onStatus("saving");
    let succeeded = false;
    active = Promise.resolve()
      .then(() => save(snapshot))
      .then(() => {
        succeeded = true;
        onStatus(hasPending() ? "pending" : "saved");
      })
      .catch(() => {
        pending = { ...snapshot, ...pending };
        onStatus("error");
      })
      .finally(() => {
        active = undefined;
        // If debounce/blur elapsed during the request, drain the most recent edits next.
        // Failed requests stay pending for the next edit/blur, without an endless retry loop.
        if (succeeded && ready && hasPending()) void flush();
      });
    return active;
  };

  return {
    enqueue(patch: ObjectiveNarratives) {
      if (Object.keys(patch).length === 0) return;
      pending = { ...pending, ...patch };
      ready = false;
      onStatus("pending");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void flush();
      }, delay);
    },
    flush,
  };
}

// A collapsed card unmounts its editor. Keep that objective's serial queue so reopening
// it (or editing it on another OTE screen) cannot race a still-running older write.
const objectiveQueues = new Map<
  string,
  {
    save: (patch: ObjectiveNarratives) => Promise<unknown>;
    onStatus: (status: NarrativeSaveStatus) => void;
    queue: ReturnType<typeof createNarrativeAutosave>;
  }
>();

export function objectiveNarrativeAutosaveQueue(
  key: string,
  save: (patch: ObjectiveNarratives) => Promise<unknown>,
  onStatus: (status: NarrativeSaveStatus) => void
) {
  let entry = objectiveQueues.get(key);
  if (!entry) {
    const callbacks = { save, onStatus };
    entry = {
      ...callbacks,
      queue: createNarrativeAutosave(
        patch => objectiveQueues.get(key)!.save(patch),
        status => objectiveQueues.get(key)!.onStatus(status)
      ),
    };
    objectiveQueues.set(key, entry);
  }
  entry.save = save;
  entry.onStatus = onStatus;
  return entry.queue;
}
