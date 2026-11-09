import { useRef, useState } from "react";
import { AlertCircle, CheckCircle, Eye, EyeOff, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  mapUrl: string | null;
  fileName: string | null;
  readOnly: boolean;
  loading: boolean;
  loadError: boolean;
  pending: boolean;
  visible: boolean;
  onView: () => void;
  onUpload: (file: File) => Promise<void>;
  onDelete: () => Promise<void>;
  onRetry: () => void;
};

/** La selección no sustituye el mapa: se requiere confirmar el archivo nuevo. */
export default function ProcessMapFileActions(props: Props) {
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [replacement, setReplacement] = useState<File | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const disabled = busy || props.pending || props.loading || props.loadError;
  const pdf = /\.pdf$/i.test(props.fileName || "");

  const execute = async (action: () => Promise<void>) => {
    if (running.current || disabled) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
      setReplacement(null);
      setDeleteOpen(false);
    } catch {
      // El padre muestra el error; el mapa actual y la selección se conservan.
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = ""; // Permite volver a escoger el mismo archivo.
    if (!file || disabled) return;
    if (props.mapUrl) setReplacement(file);
    else void execute(() => props.onUpload(file));
  };

  return (
    <div className="border border-purple-200 bg-purple-50 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {props.mapUrl && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"><CheckCircle size={13} />Mapa cargado</span>}
          {props.loading && <span className="text-sm text-slate-600">Cargando mapa...</span>}
          <Button variant="outline" size="sm" onClick={props.onView} disabled={!props.mapUrl || props.loading} className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-100 disabled:opacity-40">
            {!pdf && props.visible ? <EyeOff size={14} /> : <Eye size={14} />}
            {!pdf && props.visible ? "Ocultar Mapa" : "Ver Mapa"}
          </Button>
          {!props.readOnly && <span className="text-xs text-slate-500">PDF, PNG o JPG</span>}
        </div>
        {!props.readOnly && <div className="ml-auto flex items-center justify-end gap-2 flex-wrap" aria-label="Modificar archivo del mapa">
          <input ref={input} type="file" accept="image/*,application/pdf" onChange={selectFile} disabled={disabled} className="hidden" aria-label="Seleccionar archivo del mapa" />
          <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={disabled} className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-100">
            <Upload size={14} />{busy || props.pending ? "Procesando..." : props.mapUrl ? "Reemplazar Mapa" : "Subir Mapa"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} disabled={!props.mapUrl || disabled} className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40">
            <Trash2 size={14} />Eliminar Mapa
          </Button>
        </div>}
      </div>
      {props.loadError && <div role="alert" className="mt-3 flex items-center gap-2 flex-wrap text-sm text-red-700">
        <AlertCircle size={16} />No se pudo consultar el mapa. Esto no significa que haya sido eliminado.
        <Button variant="outline" size="sm" onClick={props.onRetry}>Reintentar</Button>
      </div>}
      <AlertDialog open={!!replacement} onOpenChange={(open) => { if (!open && !busy && !props.pending) setReplacement(null); }}>
        <AlertDialogContent onEscapeKeyDown={(event) => { if (busy || props.pending) event.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Deseas reemplazar el mapa de procesos?</AlertDialogTitle>
            <AlertDialogDescription>
              El archivo «{replacement?.name}» sustituirá al mapa actual. El mapa anterior se retirará únicamente cuando el nuevo archivo se haya cargado correctamente. Esta acción solo cambia el documento del mapa; no elimina los procesos ni su información.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy || props.pending}>Cancelar</AlertDialogCancel>
            <Button disabled={disabled || !replacement} onClick={() => { if (replacement) void execute(() => props.onUpload(replacement)); }}>
              {busy || props.pending ? "Reemplazando..." : "Sí, reemplazar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!busy && !props.pending) setDeleteOpen(open); }}>
        <AlertDialogContent onEscapeKeyDown={(event) => { if (busy || props.pending) event.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Deseas eliminar el mapa de procesos?</AlertDialogTitle>
            <AlertDialogDescription>
              Se retirará el documento del mapa actual sin sustituirlo por otro. Esta acción no elimina los procesos, subprocesos ni la información registrada en ellos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy || props.pending}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={disabled} onClick={() => void execute(props.onDelete)}>
              {busy || props.pending ? "Eliminando..." : "Sí, eliminar mapa"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
