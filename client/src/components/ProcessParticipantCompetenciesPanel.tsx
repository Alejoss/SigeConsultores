import { useEffect, useMemo, useState } from "react";
import { Lightbulb, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { trpc } from "@/lib/trpc";
import {
  PROCESS_PARTICIPANT_COMPETENCY_LEVEL_DETAILS,
  PROCESS_PARTICIPANT_COMPETENCY_LEVELS,
  PROCESS_PARTICIPANT_COMPETENCY_SUGGESTIONS,
  PROCESS_PARTICIPANT_COMPETENCY_TYPE_DETAILS,
  PROCESS_PARTICIPANT_COMPETENCY_TYPES,
  type ProcessParticipantCompetencyLevel,
  type ProcessParticipantCompetencyType,
} from "../../../shared/processParticipantCompetencies";

type Competency = {
  id: number;
  name: string;
  competencyType: ProcessParticipantCompetencyType;
  competencyLevel: ProcessParticipantCompetencyLevel;
};

type CompetencyDraft = {
  name: string;
  competencyType: ProcessParticipantCompetencyType | "";
  competencyLevel: ProcessParticipantCompetencyLevel | "";
};

const EMPTY_DRAFT: CompetencyDraft = {
  name: "",
  competencyType: "",
  competencyLevel: "",
};

const toDraft = (competency: Competency): CompetencyDraft => ({
  name: competency.name,
  competencyType: competency.competencyType,
  competencyLevel: competency.competencyLevel,
});

const isComplete = (
  draft: CompetencyDraft
): draft is {
  name: string;
  competencyType: ProcessParticipantCompetencyType;
  competencyLevel: ProcessParticipantCompetencyLevel;
} =>
  Boolean(draft.name.trim() && draft.competencyType && draft.competencyLevel);

export function ProcessParticipantCompetenciesPanel({
  companyId,
  participantId,
  competencies,
  onSaved,
}: {
  companyId: number;
  participantId: number;
  competencies: Competency[];
  onSaved: () => void | Promise<void>;
}) {
  const [newDraft, setNewDraft] = useState<CompetencyDraft>(EMPTY_DRAFT);
  const [drafts, setDrafts] = useState<Record<number, CompetencyDraft>>({});
  const [savingIds, setSavingIds] = useState<Set<number | "new">>(
    () => new Set()
  );
  const [error, setError] = useState("");
  const utils = trpc.useUtils();

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        competencies.map(competency => [competency.id, toDraft(competency)])
      )
    );
  }, [participantId, competencies]);

  const suggestionsByType = useMemo(
    () =>
      PROCESS_PARTICIPANT_COMPETENCY_TYPES.map(type => ({
        type,
        suggestions: PROCESS_PARTICIPANT_COMPETENCY_SUGGESTIONS.filter(
          suggestion => suggestion.type === type
        ),
      })),
    []
  );

  const refresh = async () => {
    await utils.processParticipants.list.invalidate();
    await onSaved();
  };

  const createMutation =
    trpc.processParticipants.createCompetency.useMutation();
  const updateMutation =
    trpc.processParticipants.updateCompetency.useMutation();
  const deleteMutation =
    trpc.processParticipants.deleteCompetency.useMutation();

  const setSaving = (id: number | "new", isSaving: boolean) => {
    setSavingIds(current => {
      const next = new Set(current);
      if (isSaving) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const saveNew = async (draft = newDraft) => {
    if (!isComplete(draft) || savingIds.has("new")) return;
    setError("");
    setSaving("new", true);
    try {
      await createMutation.mutateAsync({
        companyId,
        processParticipantId: participantId,
        name: draft.name.trim(),
        competencyType: draft.competencyType,
        competencyLevel: draft.competencyLevel,
      });
      setNewDraft(EMPTY_DRAFT);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible guardar la competencia."
      );
    } finally {
      setSaving("new", false);
    }
  };

  const saveExisting = async (id: number, draft?: CompetencyDraft) => {
    const nextDraft = draft || drafts[id];
    if (!nextDraft || !isComplete(nextDraft) || savingIds.has(id)) return;
    setError("");
    setSaving(id, true);
    try {
      await updateMutation.mutateAsync({
        companyId,
        competencyId: id,
        name: nextDraft.name.trim(),
        competencyType: nextDraft.competencyType,
        competencyLevel: nextDraft.competencyLevel,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible guardar la competencia."
      );
    } finally {
      setSaving(id, false);
    }
  };

  const patchExisting = (
    id: number,
    patch: Partial<CompetencyDraft>,
    saveNow = false
  ) => {
    const nextDraft = { ...(drafts[id] || EMPTY_DRAFT), ...patch };
    setDrafts(current => ({ ...current, [id]: nextDraft }));
    if (saveNow) void saveExisting(id, nextDraft);
  };

  const remove = async (competency: Competency) => {
    if (
      !window.confirm(
        `¿Eliminar la competencia “${competency.name}” de este puesto?`
      )
    ) {
      return;
    }
    setError("");
    setSaving(competency.id, true);
    try {
      await deleteMutation.mutateAsync({
        companyId,
        competencyId: competency.id,
      });
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible eliminar la competencia."
      );
    } finally {
      setSaving(competency.id, false);
    }
  };

  return (
    <section className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-emerald-950">Competencias</h4>
          <p className="mt-1 text-xs leading-5 text-emerald-900">
            Registra las capacidades necesarias para este puesto. Se guardan
            automáticamente al completar los tres datos.
          </p>
        </div>
        <span
          aria-live="polite"
          className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-emerald-800"
        >
          {savingIds.size ? "Guardando…" : "Guardado"}
        </span>
      </div>

      <div className="mt-4 rounded-md border border-emerald-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-emerald-700" />
          <p className="text-sm font-semibold text-slate-800">
            Escribe una competencia propia
          </p>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Esta es siempre la primera opción. Las sugerencias son solo una ayuda.
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_190px]">
          <div className="space-y-1">
            <Label htmlFor={`competency-name-${participantId}`}>
              Competencia
            </Label>
            <Input
              id={`competency-name-${participantId}`}
              value={newDraft.name}
              onChange={event =>
                setNewDraft(current => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              onBlur={() => void saveNew()}
              placeholder="Ej.: Manejo de equipos de refrigeración"
              maxLength={255}
              disabled={savingIds.has("new")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`competency-type-${participantId}`}>Tipo</Label>
            <NativeSelect
              id={`competency-type-${participantId}`}
              value={newDraft.competencyType}
              onChange={event => {
                const nextDraft = {
                  ...newDraft,
                  competencyType: event.target
                    .value as ProcessParticipantCompetencyType,
                };
                setNewDraft(nextDraft);
                void saveNew(nextDraft);
              }}
              disabled={savingIds.has("new")}
            >
              <option value="">Seleccionar tipo…</option>
              {PROCESS_PARTICIPANT_COMPETENCY_TYPES.map(type => (
                <option key={type} value={type}>
                  {PROCESS_PARTICIPANT_COMPETENCY_TYPE_DETAILS[type].label}
                </option>
              ))}
            </NativeSelect>
            {newDraft.competencyType && (
              <p className="text-xs leading-4 text-slate-500">
                {
                  PROCESS_PARTICIPANT_COMPETENCY_TYPE_DETAILS[
                    newDraft.competencyType
                  ].description
                }
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`competency-level-${participantId}`}>
              Nivel requerido
            </Label>
            <NativeSelect
              id={`competency-level-${participantId}`}
              value={newDraft.competencyLevel}
              onChange={event => {
                const nextDraft = {
                  ...newDraft,
                  competencyLevel: event.target
                    .value as ProcessParticipantCompetencyLevel,
                };
                setNewDraft(nextDraft);
                void saveNew(nextDraft);
              }}
              disabled={savingIds.has("new")}
            >
              <option value="">Seleccionar nivel…</option>
              {PROCESS_PARTICIPANT_COMPETENCY_LEVELS.map(level => (
                <option key={level} value={level}>
                  {PROCESS_PARTICIPANT_COMPETENCY_LEVEL_DETAILS[level].label}
                </option>
              ))}
            </NativeSelect>
            {newDraft.competencyLevel && (
              <p className="text-xs leading-4 text-slate-500">
                {
                  PROCESS_PARTICIPANT_COMPETENCY_LEVEL_DETAILS[
                    newDraft.competencyLevel
                  ].description
                }
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-dashed border-emerald-200 bg-white/80 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Sugerencias opcionales
        </div>
        <div className="mt-3 space-y-2">
          {suggestionsByType.map(({ type, suggestions }) => (
            <div key={type}>
              <p className="text-xs font-medium text-slate-600">
                {PROCESS_PARTICIPANT_COMPETENCY_TYPE_DETAILS[type].label}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {suggestions.map(suggestion => (
                  <Button
                    key={suggestion.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-emerald-200 bg-white px-2 text-xs text-emerald-800 hover:bg-emerald-50"
                    onClick={() =>
                      setNewDraft(current => ({
                        ...current,
                        name: suggestion.name,
                        competencyType: suggestion.type,
                      }))
                    }
                    disabled={savingIds.has("new")}
                  >
                    {suggestion.name}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {competencies.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-sm text-slate-500">
            Aún no hay competencias registradas para este puesto.
          </p>
        ) : (
          competencies.map(competency => {
            const draft = drafts[competency.id] || toDraft(competency);
            const isSaving = savingIds.has(competency.id);
            return (
              <div
                key={competency.id}
                className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_190px_190px_auto]"
              >
                <div className="space-y-1">
                  <Label htmlFor={`saved-competency-name-${competency.id}`}>
                    Competencia
                  </Label>
                  <Input
                    id={`saved-competency-name-${competency.id}`}
                    value={draft.name}
                    onChange={event =>
                      patchExisting(competency.id, {
                        name: event.target.value,
                      })
                    }
                    onBlur={() => void saveExisting(competency.id)}
                    maxLength={255}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`saved-competency-type-${competency.id}`}>
                    Tipo
                  </Label>
                  <NativeSelect
                    id={`saved-competency-type-${competency.id}`}
                    value={draft.competencyType}
                    onChange={event =>
                      patchExisting(
                        competency.id,
                        {
                          competencyType: event.target
                            .value as ProcessParticipantCompetencyType,
                        },
                        true
                      )
                    }
                    disabled={isSaving}
                  >
                    {PROCESS_PARTICIPANT_COMPETENCY_TYPES.map(type => (
                      <option key={type} value={type}>
                        {
                          PROCESS_PARTICIPANT_COMPETENCY_TYPE_DETAILS[type]
                            .label
                        }
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`saved-competency-level-${competency.id}`}>
                    Nivel requerido
                  </Label>
                  <NativeSelect
                    id={`saved-competency-level-${competency.id}`}
                    value={draft.competencyLevel}
                    onChange={event =>
                      patchExisting(
                        competency.id,
                        {
                          competencyLevel: event.target
                            .value as ProcessParticipantCompetencyLevel,
                        },
                        true
                      )
                    }
                    disabled={isSaving}
                  >
                    {PROCESS_PARTICIPANT_COMPETENCY_LEVELS.map(level => (
                      <option key={level} value={level}>
                        {
                          PROCESS_PARTICIPANT_COMPETENCY_LEVEL_DETAILS[level]
                            .label
                        }
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex items-end gap-2">
                  <span
                    className="pb-2 text-xs text-slate-500"
                    aria-live="polite"
                  >
                    {isSaving ? "Guardando…" : "Guardado"}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Eliminar competencia: ${competency.name}`}
                    onClick={() => void remove(competency)}
                    disabled={isSaving}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
    </section>
  );
}
