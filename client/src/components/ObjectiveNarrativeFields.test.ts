// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosavingObjectiveNarratives } from "./ObjectiveNarrativeFields";

// The unit project does not enable the React Vite plugin; provide classic JSX's runtime.
vi.stubGlobal("React", React);

function field(label = "Situación inicial") {
  return screen.getByLabelText(new RegExp(label)) as HTMLTextAreaElement;
}

describe("AutosavingObjectiveNarratives", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders optional historic fields without a mount/unmount save and limits input length", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const view = render(
      React.createElement(AutosavingObjectiveNarratives, {
        initialValues: {},
        save,
      })
    );
    expect(field().value).toBe("");
    expect(field().maxLength).toBe(10_000);
    expect(
      screen.getByText(
        /El % de avance se calcula sólo con la medición numérica/
      )
    ).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    view.unmount();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves only edited text, keeps focus and ignores stale refetch props", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();
    const view = render(
      React.createElement(AutosavingObjectiveNarratives, {
        initialValues: { situacionInicial: "Histórico", indicador: "Leído" },
        save,
        onChange,
      })
    );
    const input = field();
    input.focus();
    fireEvent.change(input, { target: { value: "Nuevo texto" } });
    expect(onChange).toHaveBeenLastCalledWith({
      situacionInicial: "Nuevo texto",
    });
    view.rerender(
      React.createElement(AutosavingObjectiveNarratives, {
        initialValues: {
          situacionInicial: "Refetch antiguo",
          indicador: "Leído",
        },
        save,
        onChange,
      })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ situacionInicial: "Nuevo texto" });
    expect(field()).toBe(input);
    expect(input.value).toBe("Nuevo texto");
    expect(document.activeElement).toBe(input);
  });

  it("preserves text typed before creation when the dedicated save becomes available, without remount", async () => {
    const onChange = vi.fn();
    const view = render(
      React.createElement(AutosavingObjectiveNarratives, {
        initialValues: {},
        onChange,
      })
    );
    const input = field("Resultado esperado");
    input.focus();
    fireEvent.change(input, { target: { value: "Resultado de creación" } });
    const save = vi.fn().mockResolvedValue(undefined);
    view.rerender(
      React.createElement(AutosavingObjectiveNarratives, {
        initialValues: {},
        onChange,
        save,
      })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(field("Resultado esperado")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(save).toHaveBeenCalledWith({
      resultadoEsperado: "Resultado de creación",
    });
  });

  it("keeps the same serial queue when a card is collapsed and reopened during an older request", async () => {
    let finish!: () => void;
    const first = new Promise<void>(resolve => {
      finish = resolve;
    });
    const save = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue(undefined);
    const autosaveKey = "test:reopen-objective";
    const oldView = render(
      React.createElement(AutosavingObjectiveNarratives, {
        initialValues: {},
        save,
        autosaveKey,
      })
    );
    fireEvent.change(field("Indicador"), { target: { value: "Anterior" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    oldView.unmount();
    render(
      React.createElement(AutosavingObjectiveNarratives, {
        initialValues: { indicador: "Anterior" },
        save,
        autosaveKey,
      })
    );
    fireEvent.change(field("Indicador"), { target: { value: "Último" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(save.mock.calls).toEqual([
      [{ indicador: "Anterior" }],
      [{ indicador: "Último" }],
    ]);
  });

  it("flushes text on blur while keeping it independent from the generic objective save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      React.createElement(AutosavingObjectiveNarratives, {
        initialValues: {},
        save,
      })
    );
    fireEvent.change(field("Indicador"), {
      target: { value: "Medición descriptiva" },
    });
    await act(async () => {
      fireEvent.blur(field("Indicador"));
    });
    expect(save).toHaveBeenCalledWith({ indicador: "Medición descriptiva" });
  });
});
