import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNarrativeAutosave,
  editedObjectiveNarratives,
  objectivePlanningSaveSignature,
  OBJECTIVE_NARRATIVE_MAX_LENGTH,
} from "./objectiveNarratives";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("objective narrative optional writes", () => {
  it("omits untouched historical text from generic saves and never writes read fallbacks", () => {
    expect(
      editedObjectiveNarratives({
        situacionInicial: "",
        resultadoEsperado: "Leído",
        indicador: "",
      })
    ).toEqual({});
    expect(editedObjectiveNarratives({}, ["indicador"])).toEqual({});
  });

  it("includes only explicitly edited fields, including empty-string clearing", () => {
    expect(
      editedObjectiveNarratives(
        {
          situacionInicial: "Contexto",
          resultadoEsperado: "Leído",
          indicador: "",
        },
        ["situacionInicial", "indicador"]
      )
    ).toEqual({ situacionInicial: "Contexto", indicador: "" });
    expect(OBJECTIVE_NARRATIVE_MAX_LENGTH).toBe(10_000);
  });
});

describe("planning autosave boundaries", () => {
  it("ignores expanding a card and narrative-only drafts while preserving numeric/task edit detection", () => {
    const planning = {
      objectiveId: 1,
      expanded: false,
      avanceMeta: 7,
      resultKeys: [{ tasks: [] }],
      indicador: "Antes",
    };
    const initial = objectivePlanningSaveSignature([planning]);
    expect(
      objectivePlanningSaveSignature([
        { ...planning, expanded: true, indicador: "Nuevo" },
      ])
    ).toBe(initial);
    expect(
      objectivePlanningSaveSignature([{ ...planning, avanceMeta: 8 }])
    ).not.toBe(initial);
    expect(
      objectivePlanningSaveSignature([{ ...planning, resultKeys: [] }])
    ).not.toBe(initial);
  });
});

describe("narrative autosave queue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not write on initial load or empty flush/unmount", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const queue = createNarrativeAutosave(save);
    queue.enqueue({});
    await vi.advanceTimersByTimeAsync(5000);
    await queue.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("debounces typing for 1200ms and sends latest edited keys, not numbers/tasks", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const queue = createNarrativeAutosave(save);
    queue.enqueue({ situacionInicial: "C" });
    await vi.advanceTimersByTimeAsync(1000);
    queue.enqueue({ situacionInicial: "Contexto", indicador: "Unidades" });
    await vi.advanceTimersByTimeAsync(1199);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      situacionInicial: "Contexto",
      indicador: "Unidades",
    });
  });

  it("serializes writes and drains newer edits even when debounce expires during a request", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const queue = createNarrativeAutosave(save);
    queue.enqueue({ indicador: "Antiguo" });
    await vi.advanceTimersByTimeAsync(1200);
    queue.enqueue({ indicador: "Intermedio", resultadoEsperado: "Resultado" });
    queue.enqueue({ indicador: "Último" });
    await vi.advanceTimersByTimeAsync(1200);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.calls).toEqual([
      [{ indicador: "Antiguo" }],
      [{ indicador: "Último", resultadoEsperado: "Resultado" }],
    ]);
  });

  it("flushes a pending edit on blur/navigation without waiting for debounce", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const queue = createNarrativeAutosave(save);
    queue.enqueue({ resultadoEsperado: "Nueva expectativa" });
    await queue.flush();
    await vi.advanceTimersByTimeAsync(1200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      resultadoEsperado: "Nueva expectativa",
    });
  });

  it("retains failed text without endless retries, merging newer changes over the failed snapshot", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const status = vi.fn();
    const queue = createNarrativeAutosave(save, status);
    queue.enqueue({ situacionInicial: "Antes", indicador: "Medición" });
    await vi.advanceTimersByTimeAsync(1200);
    queue.enqueue({ situacionInicial: "Último" });
    await vi.advanceTimersByTimeAsync(1200);
    first.reject(new Error("Network error"));
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toHaveBeenLastCalledWith("error");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    await queue.flush();
    expect(save).toHaveBeenLastCalledWith({
      situacionInicial: "Último",
      indicador: "Medición",
    });
  });

  it("keeps deliberate clearing as the latest edit while another request is running", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const queue = createNarrativeAutosave(save);
    queue.enqueue({ resultadoEsperado: "Anterior" });
    await vi.advanceTimersByTimeAsync(1200);
    queue.enqueue({ resultadoEsperado: "" });
    void queue.flush();
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenLastCalledWith({ resultadoEsperado: "" });
  });
});
