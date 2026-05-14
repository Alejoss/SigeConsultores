import DashboardLayout from "@/components/DashboardLayout";
import DocumentManager from "@/components/DocumentManager";

export default function ValuesDocuments() {
  return (
    <DashboardLayout>
      <DocumentManager
        documentType="Values"
        title="Documentos de Valores"
        description="Carga todos los documentos relacionados con los valores de"
        backUrl="/values?companyId="
        infoTitle="Información"
        infoContent={
          <div className="space-y-2">
            <p>
              <strong>¿Qué incluir?</strong> Documentación relacionada con los valores empresariales:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Código de ética empresarial</li>
              <li>Guía de valores corporativos</li>
              <li>Políticas de conducta</li>
              <li>Declaración de valores</li>
              <li>Documentación de cultura organizacional</li>
            </ul>
            <p className="mt-3">
              <strong>Formato:</strong> Puedes cargar un archivo Word (.doc, .docx) o PDF con la documentación de tus valores.
            </p>
          </div>
        }
      />
    </DashboardLayout>
  );
}
