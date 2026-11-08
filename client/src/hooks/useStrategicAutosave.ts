import { useCallback, useEffect, useRef, useState } from "react";

export type StrategicSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/** Coalesce drafts, serialize writes and never replace the editor's local state. */
export function useStrategicAutosave<T>(save: (value: T) => Promise<unknown>, delay = 900) {
  const [status, setStatus] = useState<StrategicSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const mounted = useRef(true);
  const pending = useRef<{ value: T; version: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const ready = useRef(false);
  const failed = useRef(false);
  const version = useRef(0);
  const flushWaiters = useRef<Array<(saved: boolean) => void>>([]);
  const publish = useCallback((next: StrategicSaveStatus, message: string | null = null) => {
    if (mounted.current) { setStatus(next); setError(message); }
  }, []);

  const drain = useCallback(async () => {
    if (running.current || !ready.current || failed.current || !pending.current) return;
    running.current = true;
    const draft = pending.current;
    pending.current = null;
    ready.current = false;
    publish("saving");
    try {
      await saveRef.current(draft.value);
      // An old response must not mark a newer, not-yet-saved draft as saved.
      if (draft.version === version.current) publish("saved");
      else if (pending.current) publish("pending");
      else publish("idle");
    } catch (cause) {
      if (!pending.current && draft.version === version.current) pending.current = draft;
      failed.current = true;
      publish("error", cause instanceof Error ? cause.message : "No se pudieron guardar los cambios");
    } finally {
      running.current = false;
    }
    if (ready.current && !failed.current) void drain();
    if (!running.current && (failed.current || !pending.current)) {
      flushWaiters.current.splice(0).forEach(resolve => resolve(!failed.current));
    }
  }, [publish]);

  const schedule = useCallback((value: T | null) => {
    version.current++;
    if (timer.current) clearTimeout(timer.current);
    ready.current = false;
    pending.current = value === null ? null : { value, version: version.current };
    if (value === null) {
      if (!running.current && !failed.current) publish("idle");
      return;
    }
    if (!failed.current) publish(running.current ? "saving" : "pending");
    timer.current = setTimeout(() => {
      timer.current = null;
      ready.current = true;
      void drain();
    }, delay);
  }, [delay, drain, publish]);

  const retry = useCallback(() => {
    failed.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    ready.current = true;
    if (pending.current) void drain();
    else publish("idle");
  }, [drain, publish]);

  const flush = useCallback((): Promise<boolean> => {
    if (failed.current) return Promise.resolve(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    ready.current = true;
    if (!running.current && !pending.current) return Promise.resolve(true);
    return new Promise(resolve => {
      flushWaiters.current.push(resolve);
      void drain();
    });
  }, [drain]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      // Closing a panel should not discard a valid debounced draft.
      ready.current = true;
      void drain();
    };
  }, [drain]);

  return { status, error, schedule, retry, flush };
}
