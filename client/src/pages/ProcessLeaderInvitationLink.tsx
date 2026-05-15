import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Copy, ArrowLeft } from "lucide-react";

export default function ProcessLeaderInvitationLink() {
  const [, setLocation] = useLocation();
  const [invitationLink, setInvitationLink] = useState<string>("");
  const [linkCopied, setLinkCopied] = useState(false);

  // Extract token from URL on component mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    
    if (token) {
      const link = `${window.location.origin}/setup-process-leader-password?token=${encodeURIComponent(token)}`;
      setInvitationLink(link);
    }
  }, []);

  const handleCopyLink = () => {
    if (!invitationLink) {
      console.error('Invitation link is empty');
      return;
    }
    
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(invitationLink).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      }).catch(() => {
        // Fallback to old method if modern API fails
        copyToClipboardFallback();
      });
    } else {
      // Fallback for non-secure contexts
      copyToClipboardFallback();
    }
  };

  const copyToClipboardFallback = () => {
    const textarea = document.createElement('textarea');
    textarea.value = invitationLink;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.top = '0';
    textarea.style.left = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
    document.body.removeChild(textarea);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Invitación Creada</CardTitle>
          <CardDescription>
            Comparte este enlace con el Jefe de Proceso
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              ¡Invitación generada exitosamente!
            </AlertDescription>
          </Alert>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
            <p className="text-sm text-slate-700 leading-relaxed">
              Copia el enlace de abajo y envíalo al Jefe de Proceso por WhatsApp, email o el medio que prefieras. Él usará este enlace para crear su contraseña y acceder a la plataforma.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 space-y-3">
            <p className="font-medium text-blue-900 text-sm">Enlace de invitación:</p>
            
            <div className="bg-white border border-blue-300 rounded p-3 break-all text-xs font-mono text-gray-700 max-h-24 overflow-y-auto">
              {invitationLink}
            </div>
            
            <Button
              onClick={handleCopyLink}
              variant="outline"
              className="w-full text-sm"
              size="sm"
            >
              <Copy className="h-4 w-4 mr-2" />
              {linkCopied ? "✓ Copiado" : "Copiar enlace"}
            </Button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <p className="text-xs text-amber-800">
              <strong>Nota:</strong> Este enlace expirará en 7 días. Si el Jefe de Proceso no lo usa en ese tiempo, deberás crear una nueva invitación.
            </p>
          </div>

          <Button
            onClick={() => setLocation("/manager-dashboard")}
            variant="outline"
            className="w-full"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
