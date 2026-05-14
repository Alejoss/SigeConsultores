import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function DebugUserInfo() {
  const { user, loading } = useAuth();
  const debugQuery = trpc.system.debugUserInfo.useQuery(undefined, {
    enabled: !!user,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>No Autenticado</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Debes iniciar sesión para ver esta información
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        <Card>
          <CardHeader>
            <CardTitle>Información de Usuario (Debug)</CardTitle>
            <CardDescription>
              Verifica tu información y estado de admin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Auth Hook Info */}
            <div>
              <h3 className="font-semibold mb-3">Datos de Autenticación (useAuth)</h3>
              <div className="bg-slate-50 p-4 rounded-lg space-y-2 font-mono text-sm">
                <div>
                  <span className="text-slate-600">ID:</span> {user.id}
                </div>
                <div>
                  <span className="text-slate-600">Nombre:</span> {user.name}
                </div>
                <div>
                  <span className="text-slate-600">Email:</span> {user.email}
                </div>
                <div>
                  <span className="text-slate-600">OpenID:</span> {user.openId}
                </div>
                <div>
                  <span className="text-slate-600">Role:</span> {user.role}
                </div>
              </div>
            </div>

            {/* Server Debug Info */}
            {debugQuery.data && (
              <div>
                <h3 className="font-semibold mb-3">Datos del Servidor (debugUserInfo)</h3>
                <div className="bg-slate-50 p-4 rounded-lg space-y-2 font-mono text-sm">
                  <div>
                    <span className="text-slate-600">userId:</span> {debugQuery.data.userId}
                  </div>
                  <div>
                    <span className="text-slate-600">name:</span> {debugQuery.data.name}
                  </div>
                  <div>
                    <span className="text-slate-600">email:</span> {debugQuery.data.email}
                  </div>
                  <div>
                    <span className="text-slate-600">openId:</span> {debugQuery.data.openId}
                  </div>
                  <div>
                    <span className="text-slate-600">role:</span> {debugQuery.data.role}
                  </div>
                  <div>
                    <span className="text-slate-600">isAdmin:</span>{" "}
                    <span className={debugQuery.data.isAdmin ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                      {debugQuery.data.isAdmin ? "SÍ" : "NO"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Status Alert */}
            {debugQuery.data && (
              <Alert className={debugQuery.data.isAdmin ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                {debugQuery.data.isAdmin ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      ✓ Eres ADMIN. Puedes usar el Panel de Administración.
                    </AlertDescription>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      ✗ NO eres admin. No puedes crear invitaciones.
                    </AlertDescription>
                  </>
                )}
              </Alert>
            )}

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">¿Qué significa?</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Si <strong>isAdmin = SÍ</strong>: Puedes crear invitaciones en el Panel</li>
                <li>• Si <strong>isAdmin = NO</strong>: Necesitas ser promovido a admin</li>
                <li>• El openId debe coincidir con OWNER_OPEN_ID para ser admin automáticamente</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
