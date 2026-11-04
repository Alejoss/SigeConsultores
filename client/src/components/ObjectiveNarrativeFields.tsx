import { useEffect, useId, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  createNarrativeAutosave,
  objectiveNarrativeAutosaveQueue,
  OBJECTIVE_NARRATIVE_KEYS,
  OBJECTIVE_NARRATIVE_MAX_LENGTH,
  type NarrativeSaveStatus,
  type ObjectiveNarrativeKey,
  type ObjectiveNarratives,
} from "@/lib/objectiveNarratives";

const labels: Record<ObjectiveNarrativeKey, string> = {
  situacionInicial: "Situación inicial",
  resultadoEsperado: "Resultado esperado",
  indicador: "Indicador",
};
const placeholders: Record<ObjectiveNarrativeKey, string> = {
  situacionInicial: "Describe el contexto o la situación de partida...",
  resultadoEsperado: "Describe el cambio o resultado que se espera lograr...",
  indicador: "Describe qué se medirá y cómo se verificará el resultado...",
};

export function ObjectiveNarrativeFields({
  values,
  onChange,
  disabled = false,
  onBlur,
}: {
  values: ObjectiveNarratives;
  onChange: (key: ObjectiveNarrativeKey, value: string) => void;
  disabled?: boolean;
  onBlur?: () => void;
}) {
  const id = useId();
  return (
    <div className="space-y-3">
      <p id={`${id}-help`} className="text-xs text-slate-600">
        Estos textos opcionales dan contexto al objetivo. El % de avance se
        calcula sólo con la medición numérica.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {OBJECTIVE_NARRATIVE_KEYS.map(key => (
          <div key={key}>
            <label
              htmlFor={`${id}-${key}`}
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              {labels[key]}{" "}
              <span className="font-normal text-slate-500">(opcional)</span>
            </label>
            <Textarea
              id={`${id}-${key}`}
              value={values[key] ?? ""}
              onChange={event => onChange(key, event.target.value)}
              onBlur={onBlur}
              disabled={disabled}
              maxLength={OBJECTIVE_NARRATIVE_MAX_LENGTH}
              aria-describedby={`${id}-help`}
              placeholder={placeholders[key]}
              rows={3}
              className="w-full text-sm resize-y"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Local drafts never invalidate/refetch or call the objective's generic/numeric save. */
export function AutosavingObjectiveNarratives({
  initialValues,
  save,
  onChange,
  disabled = false,
  autosaveKey,
}: {
  initialValues: ObjectiveNarratives;
  save?: (patch: ObjectiveNarratives) => Promise<unknown>;
  onChange?: (patch: ObjectiveNarratives) => void;
  disabled?: boolean;
  autosaveKey?: string;
}) {
  const [values, setValues] = useState<ObjectiveNarratives>(() => ({
    ...initialValues,
  }));
  const [status, setStatus] = useState<NarrativeSaveStatus | null>(null);
  const saveRef = useRef(save);
  const mountedRef = useRef(true);
  const newObjectiveEditsRef = useRef<ObjectiveNarratives>({});
  saveRef.current = save;
  const queueRef = useRef<ReturnType<typeof createNarrativeAutosave> | null>(
    null
  );
  const savePatch = (patch: ObjectiveNarratives) =>
    saveRef.current
      ? saveRef.current(patch)
      : Promise.reject(new Error("Objetivo aún no creado"));
  const reportStatus = (next: NarrativeSaveStatus) => {
    if (mountedRef.current) setStatus(next);
  };
  if (autosaveKey && save) {
    queueRef.current = objectiveNarrativeAutosaveQueue(
      autosaveKey,
      savePatch,
      reportStatus
    );
  } else if (!queueRef.current) {
    queueRef.current = createNarrativeAutosave(savePatch, reportStatus);
  }
  const canSave = Boolean(save);
  useEffect(() => {
    // Preserve typing during creation; the same component stays mounted when its database ID arrives.
    if (canSave && Object.keys(newObjectiveEditsRef.current).length > 0) {
      queueRef.current!.enqueue(newObjectiveEditsRef.current);
      newObjectiveEditsRef.current = {};
    }
  }, [canSave]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // A pending edit is still sent when collapsing/navigating; no empty write on initial load.
      if (saveRef.current) void queueRef.current!.flush();
    };
  }, []);

  const change = (key: ObjectiveNarrativeKey, value: string) => {
    const patch = { [key]: value };
    setValues(previous => ({ ...previous, ...patch }));
    onChange?.(patch);
    if (saveRef.current) queueRef.current!.enqueue(patch);
    else
      newObjectiveEditsRef.current = {
        ...newObjectiveEditsRef.current,
        ...patch,
      };
  };
  return (
    <div className="space-y-2">
      <ObjectiveNarrativeFields
        values={values}
        onChange={change}
        disabled={disabled}
        onBlur={() => {
          if (saveRef.current) void queueRef.current!.flush();
        }}
      />
      {status && (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs ${status === "error" ? "text-red-600" : "text-slate-500"}`}
        >
          {status === "pending" && "Textos: cambios pendientes..."}
          {status === "saving" && "Guardando textos..."}
          {status === "saved" && "Textos guardados"}
          {status === "error" &&
            "No se pudieron guardar los textos. Se conservan para reintentar al editar o salir del campo."}
        </p>
      )}
    </div>
  );
}
