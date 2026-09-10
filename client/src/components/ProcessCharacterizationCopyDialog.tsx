import { useMemo, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MODULES = [
  {
    id: "participants",
    label: "Participantes",
    description:
      "Puestos y Ver detalles del cargo. No copia trabajadores ni KPI.",
  },
  {
    id: "resources",
    label: "Recursos",
    description: "Recursos asociados a los puestos copiados.",
  },
  {
    id: "subprocessMap",
    label: "Mapa de Subprocesos",
    description: "Entrada, necesidades, subprocesos y salida.",
  },
  {
    id: "procedures",
    label: "Procedimientos",
    description: "Datos del procedimiento, sin archivos ni registros adjuntos.",
  },
] as const;

type ModuleId = (typeof MODULES)[number]["id"];

export function ProcessCharacterizationCopyDialog({
  companyId,
  sourceProcessId,
  sourceProcessName,
}: {
  companyId: number;
  sourceProcessId: number;
  sourceProcessName: string;
}) {
  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState<ModuleId[]>([
    "participants",
    "resources",
    "subprocessMap",
    "procedures",
  ]);
  const [targetProcessIds, setTargetProcessIds] = useState<number[]>([]);
  const [previewRequested, setPreviewRequested] = useState(false);
  const utils = trpc.useUtils();
  const { data: processes = [] } = trpc.processMap.list.useQuery(
    { companyId },
    { enabled: open && companyId > 0 }
  );
  const targets = useMemo(
    () => processes.filter((process: any) => process.id !== sourceProcessId),
    [processes, sourceProcessId]
  );
  const preview = trpc.processCharacterizationCopy.preview.useQuery(
    { companyId, sourceProcessId, targetProcessIds, modules },
    {
      enabled:
        open &&
        previewRequested &&
        modules.length > 0 &&
        targetProcessIds.length > 0,
      retry: false,
    }
  );
  const execute = trpc.processCharacterizationCopy.execute.useMutation({
    onSuccess: async result => {
      const copied = result.copied.reduce(
        (sum: number, row: any) =>
          sum +
          Object.values(row.copied).reduce(
            (subtotal: number, count: any) => subtotal + Number(count || 0),
            0
          ),
        0
      );
      toast.success(
        `Copia completada: ${copied} registros creados en ${result.copied.length} proceso(s).`
      );
      await Promise.all([
        utils.processParticipants.list.invalidate(),
        utils.processResources.list.invalidate(),
        utils.subprocessMap.get.invalidate(),
        utils.procedures.getByProcess.invalidate(),
      ]);
      setOpen(false);
      setPreviewRequested(false);
      setTargetProcessIds([]);
    },
    onError: error =>
      toast.error(error.message || "No fue posible copiar la caracterización."),
  });

  const toggleModule = (module: ModuleId) => {
    setModules(current =>
      current.includes(module)
        ? current.filter(item => item !== module)
        : [...current, module]
    );
    setPreviewRequested(false);
  };
  const toggleTarget = (id: number) => {
    setTargetProcessIds(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id]
    );
    setPreviewRequested(false);
  };
  const selectAll = () => {
    setTargetProcessIds(
      targetProcessIds.length === targets.length
        ? []
        : targets.map((process: any) => process.id)
    );
    setPreviewRequested(false);
  };

  return (
    <>
      <Button
        variant="outline"
        className="gap-2 border-violet-300 text-violet-800 hover:bg-violet-50"
        onClick={() => setOpen(true)}
      >
        <Copy size={16} /> Copiar caracterización a otros procesos
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          setOpen(value);
          if (!value) setPreviewRequested(false);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Copiar caracterización desde {sourceProcessName}
            </DialogTitle>
            <DialogDescription>
              Selecciona qué copiar y a qué procesos. Por seguridad, sólo se
              completan módulos vacíos; nunca se reemplaza información
              existente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold text-slate-900">
                1. Qué elementos de Caracterización copiar
              </h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {MODULES.map(module => (
                  <label
                    key={module.id}
                    className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={modules.includes(module.id)}
                      onChange={() => toggleModule(module.id)}
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {module.label}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {module.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  2. A qué procesos copiar
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                >
                  {targetProcessIds.length === targets.length
                    ? "Quitar todos"
                    : "Seleccionar todos"}
                </Button>
              </div>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {targets.map((process: any) => (
                  <label
                    key={process.id}
                    className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={targetProcessIds.includes(process.id)}
                      onChange={() => toggleTarget(process.id)}
                    />
                    <span className="text-sm">{process.name}</span>
                  </label>
                ))}
                {targets.length === 0 && (
                  <p className="p-2 text-sm text-slate-500">
                    No hay otros procesos disponibles en esta empresa.
                  </p>
                )}
              </div>
            </section>
            {previewRequested && (
              <section className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                <h3 className="text-sm font-semibold text-violet-950">
                  3. Resumen antes de copiar
                </h3>
                {preview.isLoading && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-violet-800">
                    <Loader2 className="animate-spin" size={15} /> Revisando
                    procesos…
                  </p>
                )}
                {preview.error && (
                  <p className="mt-2 text-sm text-red-700">
                    {preview.error.message}
                  </p>
                )}
                {preview.data?.targets.map((target: any) => (
                  <div
                    key={target.id}
                    className="mt-2 rounded border border-violet-100 bg-white p-2 text-xs"
                  >
                    <strong>{target.name}:</strong>{" "}
                    {target.modules
                      .map(
                        (item: any) =>
                          `${MODULES.find(module => module.id === item.module)?.label}: ${item.action === "ready" ? `${item.sourceCount} por crear` : item.action === "skipped_nonempty" ? "se omite, ya tiene información" : "sin datos en origen"}`
                      )
                      .join(" · ")}
                  </div>
                ))}
              </section>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              {!previewRequested ? (
                <Button
                  disabled={!modules.length || !targetProcessIds.length}
                  onClick={() => setPreviewRequested(true)}
                >
                  Revisar copia
                </Button>
              ) : (
                <Button
                  disabled={
                    execute.isPending || preview.isLoading || !!preview.error
                  }
                  onClick={() =>
                    execute.mutate({
                      companyId,
                      sourceProcessId,
                      targetProcessIds,
                      modules,
                    })
                  }
                >
                  {execute.isPending && (
                    <Loader2 className="mr-2 animate-spin" size={15} />
                  )}
                  Confirmar y copiar
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
