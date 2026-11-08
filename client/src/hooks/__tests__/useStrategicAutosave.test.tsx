// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStrategicAutosave } from "../useStrategicAutosave";

async function tick(ms = 900) { await act(async () => { vi.advanceTimersByTime(ms); await Promise.resolve(); }); }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("useStrategicAutosave", () => {
  it("never writes on read/mount and debounces to the latest draft", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useStrategicAutosave(save));
    await tick(); expect(save).not.toHaveBeenCalled();
    act(() => result.current.schedule("draft 1"));
    await tick(600);
    act(() => result.current.schedule("draft 2"));
    await tick(899); expect(save).not.toHaveBeenCalled();
    await tick(1); expect(save).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledWith("draft 2");
    expect(result.current.status).toBe("saved");
  });
  it("serializes writes and does not mark a newer draft saved on an older response", async () => {
    const first = deferred();
    const save = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(undefined);
    const { result } = renderHook(() => useStrategicAutosave(save));
    act(() => result.current.schedule("first")); await tick();
    act(() => result.current.schedule("second")); await tick(300);
    await act(async () => first.resolve());
    expect(save).toHaveBeenCalledTimes(1); expect(result.current.status).toBe("pending");
    await tick(600); expect(save).toHaveBeenNthCalledWith(2, "second");
    expect(result.current.status).toBe("saved");
  });
  it("waits for an active write even if the next debounce has expired", async () => {
    const first = deferred();
    const save = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(undefined);
    const { result } = renderHook(() => useStrategicAutosave(save));
    act(() => result.current.schedule(1)); await tick();
    act(() => result.current.schedule(2)); await tick();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve());
    expect(save).toHaveBeenNthCalledWith(2, 2);
  });
  it("cancels an incomplete/invalid measurement without saving the old draft", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useStrategicAutosave(save));
    act(() => result.current.schedule({ date: "2026-11-01", value: 10 }));
    await tick(400);
    act(() => result.current.schedule(null)); await tick();
    expect(save).not.toHaveBeenCalled(); expect(result.current.status).toBe("idle");
  });
  it("retains the latest draft after failure and retries only when requested", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValue(undefined);
    const { result } = renderHook(() => useStrategicAutosave(save));
    act(() => result.current.schedule("old")); await tick();
    expect(result.current.status).toBe("error"); expect(result.current.error).toBe("Sin conexión");
    act(() => result.current.schedule("new")); await tick(); expect(save).toHaveBeenCalledTimes(1);
    act(() => result.current.retry()); await tick(0);
    expect(save).toHaveBeenNthCalledWith(2, "new"); expect(result.current.status).toBe("saved"); expect(result.current.error).toBeNull();
  });
  it("flushes a valid queued draft on close without writing twice", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useStrategicAutosave(save));
    act(() => result.current.schedule("final"));
    unmount(); await tick();
    expect(save).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledWith("final");
  });
});
