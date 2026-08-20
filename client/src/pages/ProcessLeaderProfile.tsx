import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, KeyRound, Loader2, Mail, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useProcessLeaderAuth } from "@/contexts/ProcessLeaderAuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ProcessLeaderProfile() {
  const [, setLocation] = useLocation();
  const { session, updateSession } = useProcessLeaderAuth();
  const processId = session?.processId || 0;
  const profileQuery = trpc.teamAccess.getMyProfile.useQuery(
    { processId },
    { enabled: processId > 0 }
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (profileQuery.data?.name) setName(profileQuery.data.name);
    if (profileQuery.data?.email) setEmail(profileQuery.data.email);
  }, [profileQuery.data?.name, profileQuery.data?.email]);

  const updateNameMutation = trpc.teamAccess.updateMyName.useMutation({
    onSuccess: data => {
      if (session) updateSession({ ...session, leaderName: data.name });
      toast.success("Nombre actualizado correctamente.");
    },
    onError: error => toast.error(error.message),
  });

  const updateEmailMutation = trpc.teamAccess.updateMyEmail.useMutation({
    onSuccess: data => {
      if (session) updateSession({ ...session, leaderEmail: data.email });
      toast.success("Correo actualizado correctamente.");
    },
    onError: error => toast.error(error.message),
  });

  const changePasswordMutation = trpc.processLeaderInvitations.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Contraseña actualizada correctamente.");
    },
    onError: error => toast.error(error.message),
  });

  const saveName = () => {
    const next = name.trim();
    if (!next || next === profileQuery.data?.name) return;
    updateNameMutation.mutate({ processId, name: next });
  };

  const saveEmail = () => {
    const next = email.trim().toLowerCase();
    if (!next || next === profileQuery.data?.email?.toLowerCase()) return;
    updateEmailMutation.mutate({ processId, email: next });
  };

  const changePassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    changePasswordMutation.mutate({ processId, currentPassword, newPassword, confirmPassword });
  };

  if (!session || !processId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md"><CardHeader><CardTitle>Sesión no disponible</CardTitle></CardHeader><CardContent><Button onClick={() => setLocation("/login")}>Ir al inicio de sesión</Button></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" onClick={() => setLocation(`/process-leader-dashboard?processId=${processId}`)} aria-label="Volver al panel">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mi cuenta</h1>
            <p className="text-sm text-slate-600">Actualice sus datos de ingreso de forma segura.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-blue-600" /> Datos de acceso</CardTitle>
            <CardDescription>{profileQuery.data?.companyName || session.companyName} · {profileQuery.data?.processName || session.processName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="leader-name" className="flex items-center gap-2"><UserRound className="h-4 w-4" /> Nombre completo</Label>
              <Input id="leader-name" value={name} onChange={event => setName(event.target.value)} onBlur={saveName} disabled={profileQuery.isLoading || updateNameMutation.isPending} />
              <p className="text-xs text-muted-foreground">El nombre se actualiza automáticamente al salir del campo.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="leader-email" className="flex items-center gap-2"><Mail className="h-4 w-4" /> Correo electrónico</Label>
              <Input id="leader-email" type="email" value={email} onChange={event => setEmail(event.target.value)} onBlur={saveEmail} disabled={profileQuery.isLoading || updateEmailMutation.isPending} />
              <p className="text-xs text-muted-foreground">El correo se actualiza automáticamente al salir del campo.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-blue-600" /> Cambiar contraseña</CardTitle>
            <CardDescription>Por seguridad, confirme su contraseña actual antes de crear una nueva.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={changePassword}>
              <div className="space-y-2"><Label htmlFor="current-password">Contraseña actual</Label><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="new-password">Nueva contraseña</Label><Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required minLength={8} /><p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p></div>
              <div className="space-y-2"><Label htmlFor="confirm-password">Confirmar nueva contraseña</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required minLength={8} /></div>
              <Button type="submit" disabled={changePasswordMutation.isPending}>{changePasswordMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Actualizando...</> : "Actualizar contraseña"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
