import { describe, expect, it } from "vitest";
import {
  extractMeetingReportText,
  parseIsgeMeetingTemplateHtml,
} from "./meetingReportExtraction";

describe("extractMeetingReportText", () => {
  it("lee un reporte de texto sin persistir el archivo", async () => {
    const result = await extractMeetingReportText({
      originalname: "acta.txt",
      mimetype: "text/plain",
      buffer: Buffer.from("Acta de reunión\nAcuerdo: Actualizar indicador", "utf8"),
    });

    expect(result).toBe("Acta de reunión\nAcuerdo: Actualizar indicador");
  });

  it("rechaza formatos que no se interpretan como reporte", async () => {
    await expect(
      extractMeetingReportText({
        originalname: "imagen.png",
        mimetype: "image/png",
        buffer: Buffer.from("contenido", "utf8"),
      })
    ).rejects.toThrow("Formato no compatible");
  });
});

describe("parseIsgeMeetingTemplateHtml", () => {
  it("extrae campos y acuerdos de la plantilla oficial sin inferir texto libre", () => {
    const html = `
      <p>PLANTILLA DE ACTA DE REUNIÓN ISGE</p>
      <table>
        <tr><td>Nombre de la reunión</td><td>Revisión mensual de indicadores</td></tr>
        <tr><td>Fecha</td><td>05/10/2026</td></tr>
        <tr><td>Lugar o medio</td><td>Teams</td></tr>
        <tr><td>Objetivo</td><td>Analizar resultados y definir acciones.</td></tr>
        <tr><td>Participantes</td><td>Ana, Luis y Sebastián</td></tr>
        <tr><td>Resumen, desarrollo o decisiones</td><td>Se acordó priorizar los indicadores con desviación.</td></tr>
      </table>
      <table>
        <tr><th>Acción o acuerdo</th><th>Responsable</th><th>Proceso responsable</th><th>Fecha límite</th><th>Observaciones</th></tr>
        <tr><td>Actualizar el tablero comercial</td><td>Luis</td><td>Comercial y Servicio</td><td>12/10/2026</td><td>Validar datos antes de publicar</td></tr>
        <tr><td>[Describa la acción o compromiso]</td><td>[Nombre, si se conoce]</td><td>[Proceso ISGE, si aplica]</td><td>[DD/MM/AAAA]</td><td>[Opcional]</td></tr>
      </table>
    `;

    expect(parseIsgeMeetingTemplateHtml(html)).toEqual({
      title: "Revisión mensual de indicadores",
      meetingDate: "2026-10-05",
      locationOrMedium: "Teams",
      objective: "Analizar resultados y definir acciones.",
      participants: "Ana, Luis y Sebastián",
      notes: "Se acordó priorizar los indicadores con desviación.",
      agreements: [
        {
          description: "Actualizar el tablero comercial",
          responsibleName: "Luis",
          targetProcessName: "Comercial y Servicio",
          dueDate: "2026-10-12",
          notes: "Validar datos antes de publicar",
        },
      ],
    });
  });

  it("no reconoce Word libres como plantilla oficial", () => {
    expect(parseIsgeMeetingTemplateHtml("<p>Acta de una reunión cualquiera</p>")).toBeNull();
  });
});
