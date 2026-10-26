import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo guardar el código.";
}

/** Manager dashboard: the code workers of this company type on "Crear cuenta". */
export function CourseRegCodeManagerCard() {
  const mine = trpc.courseRegCodes.mine.useQuery(undefined, { retry: false });
  const save = trpc.courseRegCodes.setMine.useMutation();
  const [code, setCode] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const result = await save.mutateAsync({ regCode: code });
      setCode("");
      await mine.refetch();
      toast.success(`Código guardado: ${result.regCode}`);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="w-5 h-5" />
          Código de inscripción a capacitaciones
        </CardTitle>
        <CardDescription>
          Tu personal lo escribe al crear su cuenta en capacitaciones.isge360.com.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">
          Código actual:{" "}
          <code className="rounded bg-gray-100 px-2 py-1 font-semibold text-gray-900">
            {mine.isLoading ? "…" : mine.data?.regCode || "Sin código"}
          </code>
        </p>
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            value={code}
            onChange={event => setCode(event.target.value)}
            placeholder="Nuevo código"
            aria-label="Nuevo código de inscripción"
            maxLength={32}
          />
          <Button type="submit" disabled={save.isPending || code.trim().length < 4}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar código
          </Button>
        </form>
        <p className="text-xs text-gray-500">Mínimo 4 caracteres. Cada empresa tiene un código distinto.</p>
      </CardContent>
    </Card>
  );
}

/** Admin dashboard: one row per company. A blank save generates a code. */
export function CourseRegCodeAdminCard() {
  const list = trpc.courseRegCodes.list.useQuery();
  const save = trpc.courseRegCodes.set.useMutation();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const submit = async (companyId: number) => {
    setSavingId(companyId);
    try {
      const typed = (drafts[companyId] || "").trim();
      const result = await save.mutateAsync({ companyId, regCode: typed || undefined });
      setDrafts(current => ({ ...current, [companyId]: "" }));
      await list.refetch();
      toast.success(`Código guardado: ${result.regCode}`);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Códigos de inscripción a capacitaciones
        </CardTitle>
        <CardDescription>
          El personal de cada empresa escribe este código al crear su cuenta en capacitaciones.isge360.com.
          Si guardas el campo vacío, se genera un código a partir del nombre de la empresa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {list.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Código actual</TableHead>
                <TableHead>Nuevo código</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data || []).map(row => (
                <TableRow key={row.companyId}>
                  <TableCell className="font-medium">{row.companyName}</TableCell>
                  <TableCell>
                    {row.regCode ? <code className="rounded bg-slate-100 px-2 py-1">{row.regCode}</code> : <span className="text-slate-400">Sin código</span>}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={drafts[row.companyId] || ""}
                      onChange={event => setDrafts(current => ({ ...current, [row.companyId]: event.target.value }))}
                      placeholder={row.regCode ? "Nuevo código" : "Vacío genera uno"}
                      aria-label={`Nuevo código para ${row.companyName}`}
                      maxLength={32}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" disabled={savingId !== null} onClick={() => submit(row.companyId)}>
                      {savingId === row.companyId && <Loader2 className="h-4 w-4 animate-spin" />}
                      Guardar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
