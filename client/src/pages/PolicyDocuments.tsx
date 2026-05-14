import DashboardLayout from "@/components/DashboardLayout";
import DocumentManager from "@/components/DocumentManager";

export default function PolicyDocuments() {
  return (
    <DashboardLayout>
      <DocumentManager
        documentType="Policy"
        title="Documentos de Políticas"
        description="Carga todos los documentos de políticas de"
        backUrl="/policy?companyId="
        infoTitle="Información"
        infoContent={
          <div className="space-y-2">
            <p>
              <strong>¿Qué incluir?</strong> Todas tus políticas internas en un único documento:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Política de edificio libre de humo</li>
              <li>Política VIH/SIDA</li>
              <li>Políticas de recursos humanos</li>
              <li>Políticas de seguridad</li>
              <li>Otras políticas internas</li>
            </ul>
            <p className="mt-3">
              <strong>Formato:</strong> Puedes cargar un archivo Word (.doc, .docx) o PDF con todas tus políticas organizadas.
            </p>
          </div>
        }
      />
    </DashboardLayout>
  );
}
