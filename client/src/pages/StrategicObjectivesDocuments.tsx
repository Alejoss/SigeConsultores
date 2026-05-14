import DashboardLayout from "@/components/DashboardLayout";
import DocumentManager from "@/components/DocumentManager";

export default function StrategicObjectivesDocuments() {
  return (
    <DashboardLayout>
      <DocumentManager
        documentType="StrategicObjectives"
        title="Documentos de Objetivos Estratégicos"
        description="Carga todos los documentos relacionados con los objetivos estratégicos de"
        backUrl="/strategic-objectives?companyId="
        infoTitle="Información"
        infoContent={
          <div className="space-y-2">
            <p>
              <strong>¿Qué incluir?</strong> Documentación relacionada con los objetivos estratégicos:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Plan estratégico de la empresa</li>
              <li>Matriz de objetivos y metas</li>
              <li>Indicadores clave de desempeño (KPIs)</li>
              <li>Planes de acción estratégicos</li>
              <li>Análisis de alineación estratégica</li>
            </ul>
            <p className="mt-3">
              <strong>Formato:</strong> Puedes cargar un archivo Word (.doc, .docx) o PDF con la documentación de tus objetivos estratégicos.
            </p>
          </div>
        }
      />
    </DashboardLayout>
  );
}
