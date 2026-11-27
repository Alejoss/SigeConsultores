import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAnnualWorkspace } from "@/contexts/AnnualWorkspaceContext";
import { useAnnualExitGuard } from "@/hooks/useAnnualExitGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type HistoricalStatus = "pending" | "completed";
type HistoricalItem = {
  id: string;
  sourceYear: number;
  sourceWorkspaceId: number;
  kind: "program_action" | "inspection_finding";
  sourceTable: string;
  sourceId: number;
  processId: number | null;
  title: string;
  dueDate: string | null;
  status: HistoricalStatus;
  notes: string;
  resolvedYear: number | null;
};
type Values = Pick<HistoricalItem, "status" | "notes">;
type Entry = {
  companyId: number;
  year: number;
  item: HistoricalItem;
  draft: Values;
  saved: Values;
  queued: boolean;
  request: Promise<boolean> | null;
  error: string | null;
  readOnly: boolean;
};
const dirty = (entry: Entry) =>
  entry.draft.notes !== entry.saved.notes ||
  entry.draft.status !== entry.saved.status;

export type AnnualHistoricalPendingPanelProps = {
  companyId: number | null;
  processId?: number | null;
  kind?: HistoricalItem["kind"];
  /** A detail view can read another year, but cannot write outside the selected year. */
  year?: number;
  readOnly?: boolean;
};

/** Historical resolutions only. This list never feeds current activities or indicators.
 * Authorization (including chiefs' own commitments and unlinked corporate sources)
 * belongs to annualHistory.list/resolve, not to client-side source-table lookups.
 */
export function AnnualHistoricalPendingPanel(
  props: AnnualHistoricalPendingPanelProps
) {
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const contentId = useId();
  return (
    <section
      className="my-5 rounded-lg border border-slate-200 bg-slate-50"
      aria-label="Histórico de pendientes"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-800"
        onClick={() => {
          setVisited(true);
          setOpen(value => !value);
        }}
      >
        Pendientes de años anteriores
        {open ? (
          <ChevronUp size={17} aria-hidden="true" />
        ) : (
          <ChevronDown size={17} aria-hidden="true" />
        )}
      </button>
      <div id={contentId} hidden={!open}>
        {/* Once opened, keep editors and their exit guards mounted when collapsed. */}
        {visited && <HistoricalPendingContents {...props} open={open} />}
      </div>
    </section>
  );
}

function HistoricalPendingContents({
  companyId,
  processId,
  kind,
  year: detailYear,
  readOnly = false,
  open,
}: AnnualHistoricalPendingPanelProps & { open: boolean }) {
  const annual = useAnnualWorkspace();
  const year = detailYear ?? annual.year;
  const [, redraw] = useState(0);
  const contentId = useId();
  const entries = useRef(new Map<string, Entry>());
  const scope = `${companyId}:${year}:`;
  const latestAnnual = useRef(annual);
  latestAnnual.current = annual;
  const list = trpc.annualHistory.list.useQuery(
    { companyId: companyId || 0, year, ...(processId ? { processId } : {}) },
    {
      enabled: Boolean(open && companyId),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const resolve = trpc.annualHistory.resolve.useMutation();
  const latestResolve = useRef(resolve);
  latestResolve.current = resolve;
  const notify = () => redraw(value => value + 1);
  const editable = (entry: Entry) =>
    !entry.readOnly &&
    !latestAnnual.current.closed &&
    entry.year === latestAnnual.current.year &&
    (!latestAnnual.current.companyId ||
      entry.companyId === latestAnnual.current.companyId);

  useEffect(() => {
    if (!companyId || list.data?.year !== year) return;
    const seen = new Set<string>();
    for (const item of list.data.items) {
      // Defensive scope/kind checks; the API remains the authority for actor access.
      if (
        item.sourceYear >= year ||
        (kind && item.kind !== kind) ||
        (processId && item.processId !== processId)
      )
        continue;
      const key = scope + item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const previous = entries.current.get(key);
      if (previous) {
        previous.readOnly = readOnly;
        if (!dirty(previous) && !previous.request) {
          previous.item = item;
          previous.draft = { status: item.status, notes: item.notes };
          previous.saved = { ...previous.draft };
        }
      } else {
        entries.current.set(key, {
          companyId,
          year,
          item,
          draft: { status: item.status, notes: item.notes },
          saved: { status: item.status, notes: item.notes },
          queued: false,
          request: null,
          error: null,
          readOnly,
        });
      }
    }
    for (const [key, entry] of Array.from(entries.current)) {
      if (
        key.startsWith(scope) &&
        !seen.has(key) &&
        !dirty(entry) &&
        !entry.request
      )
        entries.current.delete(key);
    }
    notify();
  }, [companyId, year, scope, processId, kind, list.data, readOnly]);

  // Serialize complete status+notes snapshots per identity. A refetch or an earlier
  // response must not replace text currently being edited (or move its cursor).
  async function save(entry: Entry): Promise<boolean> {
    if (entry.request) {
      const inFlight = entry.request;
      if (!(await inFlight)) return false;
      // The owning save may already have started the next queued snapshot.
      if (entry.request && entry.request !== inFlight) return save(entry);
      return entry.queued && dirty(entry) ? save(entry) : true;
    }
    if (!dirty(entry)) {
      entry.queued = false;
      return !entry.error;
    }
    if (!editable(entry)) {
      entry.error =
        "No se pueden guardar cambios históricos en un año cerrado o distinto del seleccionado. Tus notas se conservan.";
      notify();
      return false;
    }
    entry.queued = false;
    const snapshot = { ...entry.draft };
    entry.error = null;
    const request = (async () => {
      try {
        const result = await latestResolve.current.mutateAsync({
          companyId: entry.companyId,
          year: entry.year,
          id: entry.item.id,
          status: snapshot.status,
          notes: snapshot.notes,
        });
        if (result.success !== true)
          throw new Error("El servidor no confirmó el guardado histórico.");
        entry.saved = snapshot;
        entry.item = {
          ...entry.item,
          ...snapshot,
          resolvedYear: snapshot.status === "completed" ? entry.year : null,
        };
        return true;
      } catch (error) {
        entry.error =
          error instanceof Error
            ? error.message
            : "No se pudo guardar la resolución histórica. Tus cambios se conservan.";
        return false;
      }
    })();
    entry.request = request;
    notify();
    const success = await request;
    entry.request = null;
    notify();
    if (success && entry.queued && dirty(entry)) return save(entry);
    return success;
  }

  const queue = (entry: Entry) => {
    entry.queued = true;
    void save(entry);
  };
  useAnnualExitGuard(async () => {
    // The annual frame already blurs and waits. No new debounce or aggressive
    // save is introduced: drain the same onBlur queue, including hidden drafts.
    for (const entry of Array.from(entries.current.values())) {
      if (dirty(entry) || entry.request || entry.error) {
        entry.queued = true;
        if (!(await save(entry))) return false;
      }
    }
    return true;
  });

  const visible = Array.from(entries.current.entries()).filter(
    ([key, entry]) =>
      key.startsWith(scope) &&
      (!kind || entry.item.kind === kind) &&
      (!processId || entry.item.processId === processId)
  );
  const currentReadOnly =
    readOnly ||
    annual.closed ||
    year !== annual.year ||
    Boolean(annual.companyId && annual.companyId !== companyId);
  return (
    <div className="space-y-3 border-t border-slate-200 p-4">
      <p className="text-sm text-slate-600">
        Resoluciones históricas consultadas en {year}. No son acciones nuevas ni
        se incluyen en los indicadores de {year}; el registro del año de origen
        no se modifica.
      </p>
      {currentReadOnly && (
        <p className="text-sm text-amber-900">
          Solo consulta: el año está cerrado o no corresponde al año de gestión
          seleccionado.
        </p>
      )}
      {!companyId ? (
        <p className="text-sm text-slate-600">
          Seleccione una empresa para consultar sus pendientes históricos.
        </p>
      ) : list.isLoading ? (
        <p role="status" className="text-sm text-slate-600">
          Cargando pendientes históricos…
        </p>
      ) : null}
      {list.error && (
        <div role="alert" className="text-sm text-red-700">
          No se pudieron cargar los pendientes históricos: {list.error.message}{" "}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void list.refetch()}
          >
            Reintentar consulta
          </Button>
        </div>
      )}
      {companyId &&
        !list.isLoading &&
        !list.error &&
        list.data?.year === year &&
        !visible.length && (
          <p className="text-sm text-slate-500">
            No hay pendientes de años anteriores para esta consulta.
          </p>
        )}
      {visible.map(([key, entry]) => {
        const notesId = `${contentId}-${entry.item.id}-notes`;
        return (
          <article
            key={key}
            className="space-y-3 rounded-md border border-slate-200 bg-white p-4"
            aria-label={entry.item.title}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Origen {entry.item.sourceYear}</Badge>
              <Badge variant="outline">
                {entry.item.kind === "program_action"
                  ? "Programa · Acción histórica"
                  : "Inspección · Hallazgo histórico"}
              </Badge>
              {entry.saved.status === "completed" &&
              entry.item.resolvedYear !== null ? (
                <Badge variant="outline">
                  Resuelto {entry.item.resolvedYear}
                </Badge>
              ) : (
                <Badge variant="outline">Pendiente</Badge>
              )}
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              {entry.item.title}
            </h3>
            <p className="text-xs text-slate-500">
              Fecha objetivo de origen:{" "}
              {entry.item.dueDate?.slice(0, 10) || "Sin fecha"}
            </p>
            <div>
              <label
                htmlFor={notesId}
                className="mb-1 block text-xs font-semibold text-slate-600"
              >
                Notas de resolución histórica
              </label>
              <Textarea
                id={notesId}
                value={entry.draft.notes}
                readOnly={currentReadOnly}
                onChange={event => {
                  if (currentReadOnly) return;
                  entry.draft = { ...entry.draft, notes: event.target.value };
                  notify();
                }}
                onBlur={() => {
                  if (!currentReadOnly && dirty(entry)) queue(entry);
                }}
                className="min-h-20 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={entry.draft.status === "completed"}
                disabled={currentReadOnly}
                onChange={event => {
                  if (currentReadOnly) return;
                  entry.draft = {
                    ...entry.draft,
                    status: event.target.checked ? "completed" : "pending",
                  };
                  queue(entry);
                }}
              />
              Marcar resolución histórica completada
            </label>
            {entry.request ? (
              <p role="status" className="text-xs text-slate-500">
                Guardando resolución histórica…
              </p>
            ) : dirty(entry) ? (
              <p className="text-xs text-amber-800">
                Cambios sin guardar. Las notas se guardan al salir del campo.
              </p>
            ) : null}
            {entry.error && (
              <div role="alert" className="text-sm text-red-700">
                {entry.error} Tus cambios permanecen aquí.{" "}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentReadOnly || Boolean(entry.request)}
                  onClick={() => queue(entry)}
                >
                  Reintentar resolución
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
