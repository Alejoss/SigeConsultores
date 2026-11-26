import { useRef, useState } from "react";
import { Trash2, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type WorkerIdentity = { id: number; name: string; cedula: string };
type Selection = WorkerIdentity & { companyId?: number; retired: boolean };
type Props = {
  worker: WorkerIdentity;
  companyId?: number;
  retired?: boolean;
};

/** Render beside the personnel accordion, never inside its summary. */
export function CourseWorkerStatusButton({ worker, companyId, retired = false }: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // The synchronous guard also covers two clicks before React renders pending.
  const submitting = useRef(false);
  const retireWorker = trpc.onlineCourses.retireWorker.useMutation();
  const reinstateWorker = trpc.onlineCourses.reinstateWorker.useMutation();
  const utils = trpc.useUtils();
  const busy = pending || retireWorker.isPending || reinstateWorker.isPending;

  function changeOpen(open: boolean) {
    if (submitting.current || busy) return;
    setError("");
    // Keep exactly the identity and company shown at the time of selection.
    setSelection(open ? { ...worker, companyId, retired } : null);
  }

  async function confirm() {
    if (!selection || submitting.current || busy) return;
    submitting.current = true;
    setPending(true);
    setError("");
    const selected = selection;
    try {
      const input = {
        workerId: selected.id,
        ...(selected.companyId === undefined ? {} : { companyId: selected.companyId }),
        confirmationCedula: selected.cedula,
        confirmationName: selected.name,
      };
      if (selected.retired) await reinstateWorker.mutateAsync(input);
      else await retireWorker.mutateAsync(input);
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "No se pudo cambiar el estado de esta persona.";
      setError(text);
      toast.error(text);
      submitting.current = false;
      setPending(false);
      return;
    }

    // No optimistic hiding: refresh active/retired lists and catalog counts only after success.
    const refresh = await Promise.allSettled([
      utils.onlineCourses.companyOverview.invalidate(),
      utils.onlineCourses.catalogOverview.invalidate(),
    ]);
    setSelection(null);
    toast.success(selected.retired
      ? `${selected.name} fue reincorporado a capacitaciones.`
      : `${selected.name} fue retirado de capacitaciones; se conservó su historial.`);
    if (refresh.some(result => result.status === "rejected")) {
      toast.error("El estado se guardó, pero no se pudo actualizar el panel. Recarga la página para ver los datos actualizados.");
    }
    submitting.current = false;
    setPending(false);
  }

  return (
    <AlertDialog open={selection !== null} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className={retired
            ? "inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
            : "rounded-md p-2 text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"}
          aria-label={`${retired ? "Reincorporar a" : "Retirar de"} capacitaciones: ${worker.name}, cédula ${worker.cedula}`}
          title={retired ? "Reincorporar a capacitaciones" : "Retirar de capacitaciones"}
          disabled={busy}
        >
          {retired ? <><UserRoundPlus size={16} aria-hidden="true" /> Reincorporar</> : <Trash2 size={16} aria-hidden="true" />}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" aria-busy={busy}>
        <AlertDialogHeader>
          <AlertDialogTitle>{selection?.retired ? "Reincorporar a capacitaciones" : "Retirar de capacitaciones"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>Confirma la acción para <strong className="break-words text-slate-900">{selection?.name}</strong>, cédula <strong className="break-all text-slate-900">{selection?.cedula}</strong>.</p>
              {selection?.retired ? (
                <p>Volverá a aparecer en Personal activo, Excel y Análisis de Avance de esta empresa, conservando su historial. La reincorporación no crea sesiones automáticas: la persona deberá iniciar sesión nuevamente.</p>
              ) : (
                <>
                  <p>Se ocultará de Personal activo, Excel y Análisis de Avance de esta empresa. Se bloqueará el acceso de esta inscripción y el registro con la misma cédula solo en esta empresa.</p>
                  <p>Se conserva su historial de avances, evaluaciones y certificados, disponible en Personal retirado para consulta y posterior reincorporación.</p>
                </>
              )}
              <p>Esta acción no modifica la nómina ni las cuentas de ISGE 360 u otras empresas.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={selection?.retired ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-600 hover:bg-red-700"}
            disabled={busy}
            onClick={event => {
              event.preventDefault();
              void confirm();
            }}
          >
            {busy ? (selection?.retired ? "Reincorporando…" : "Retirando…") : (selection?.retired ? "Sí, reincorporar" : "Sí, retirar")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
