import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type LinkableSourceType =
  | "checklist_action"
  | "checklist_vigency"
  | "program_action"
  | "company_compliance"
  | "audit_finding"
  | "inspection_finding";

export function ProcessLinkDialog({
  companyId,
  sourceType,
  sourceId,
  title,
  onClose,
  onLinked,
}: {
  companyId: number;
  sourceType: LinkableSourceType;
  sourceId: number;
  title: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const { data: processes = [], isLoading } = trpc.processMap.list.useQuery({
    companyId,
  });
  const progress = trpc.linkedCommitments.listSourceProgress.useQuery({
    companyId,
    sourceType,
    sourceId,
  });
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const createLinks = trpc.linkedCommitments.createLinks.useMutation({
    onSuccess: result => {
      onLinked();
      toast.success(
        result.created
          ? `${result.created} compromiso(s) vinculado(s) correctamente.`
          : "Los procesos seleccionados ya tenían este compromiso vinculado."
      );
      onClose();
    },
    onError: error => toast.error(error.message),
  });
  const existingIds = new Set(progress.data?.processIds || []);
  const selectedIds = Object.entries(selected)
    .filter(([, value]) => value)
    .map(([id]) => Number(id));
  const allSelected =
    processes.length > 0 &&
    processes.every(
      process => selected[process.id] || existingIds.has(process.id)
    );

  const selectAll = (value: boolean) => {
    const values: Record<number, boolean> = {};
    processes.forEach(process => {
      if (!existingIds.has(process.id)) values[process.id] = value;
    });
    setSelected(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Vincular a procesos
              </h2>
              <p className="mt-1 text-sm text-slate-600">{title}</p>
              <p className="mt-2 text-xs text-slate-500">
                Los Jefes verán este compromiso en Caracterización. El origen se
                actualizará sólo cuando todos los procesos vinculados cumplan.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
          </div>
          {progress.data && progress.data.total > 0 && (
            <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
              Avance actual:{" "}
              <strong>
                {progress.data.fulfilled} de {progress.data.total}
              </strong>{" "}
              procesos cumplidos.
            </div>
          )}
          <div className="mt-4 flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2">
            <span className="text-sm font-medium text-slate-700">
              Procesos del Mapa
            </span>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={event => selectAll(event.target.checked)}
              />
              Seleccionar todos
            </label>
          </div>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {isLoading ? (
              <p className="py-5 text-center text-sm text-slate-500">
                Cargando procesos...
              </p>
            ) : processes.length === 0 ? (
              <p className="py-5 text-center text-sm text-slate-500">
                Primero registre procesos en el Mapa de Procesos.
              </p>
            ) : (
              processes.map(process => {
                const exists = existingIds.has(process.id);
                return (
                  <label
                    key={process.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${exists ? "border-teal-200 bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <span>
                      <strong className="text-slate-800">{process.name}</strong>
                      <span className="ml-2 text-xs capitalize text-slate-500">
                        {process.processType}
                      </span>
                    </span>
                    {exists ? (
                      <span className="text-xs font-semibold text-teal-700">
                        Ya vinculado
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={Boolean(selected[process.id])}
                        onChange={event =>
                          setSelected(current => ({
                            ...current,
                            [process.id]: event.target.checked,
                          }))
                        }
                      />
                    )}
                  </label>
                );
              })
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="bg-teal-700 hover:bg-teal-800"
              disabled={!selectedIds.length || createLinks.isPending}
              onClick={() =>
                createLinks.mutate({
                  companyId,
                  sourceType,
                  sourceId,
                  processIds: selectedIds,
                })
              }
            >
              {createLinks.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Link2 className="mr-1 h-4 w-4" />
              Vincular seleccionados
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
