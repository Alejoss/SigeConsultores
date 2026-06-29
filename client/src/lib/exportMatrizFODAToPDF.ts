import jsPDF from 'jspdf';
import { MatrizFODARow } from '../types/matrizFODA';

function calcularPorcentajeAlcanzado(
  alcanzado: number | undefined,
  puntoPartida: number | undefined,
  puntoLlegada: number | undefined,
): number {
  const pa = puntoPartida ?? 0;
  const pl = puntoLlegada ?? 0;
  const al = alcanzado ?? 0;
  if (pl === pa) return 0;
  const pct = ((al - pa) / (pl - pa)) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

function calcularPorcentajeTareas(acciones: any[]): number {
  if (!acciones || acciones.length === 0) return 0;
  const totalPonderacion = acciones.reduce((s, a) => s + (Number(a.ponderacion) || 0), 0);
  if (totalPonderacion === 0) return 0;
  const cumplimiento = acciones.reduce((s, a) => {
    const pond = Number(a.ponderacion) || 0;
    const avance = Number(a.porcentajeCompletado) || 0;
    return s + (pond * avance) / 100;
  }, 0);
  return Math.round((cumplimiento / totalPonderacion) * 100);
}

export const exportMatrizFODAToPDF = (matrixRows: MatrizFODARow[], processName: string) => {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 15;
    const ml = 10; // margin left
    const mr = 10; // margin right
    const maxW = pageWidth - ml - mr;

    const checkPage = (needed = 20) => {
      if (y > pageHeight - needed) { doc.addPage(); y = 15; }
    };

    const addTitle = (text: string) => {
      checkPage(30);
      doc.setFontSize(16);
      doc.setTextColor(30, 58, 138);
      doc.setFont('helvetica', 'bold');
      doc.text(text, ml, y);
      y += 8;
    };

    const addSectionHeader = (text: string, rgb: [number, number, number]) => {
      checkPage(20);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(rgb[0], rgb[1], rgb[2]);
      doc.text(text, ml, y);
      y += 6;
      doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
      doc.line(ml, y, pageWidth - mr, y);
      y += 4;
    };

    const addSubHeader = (text: string) => {
      checkPage(15);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 58, 138);
      doc.text(text, ml, y);
      y += 5;
    };

    const addField = (label: string, value: string, indent = 0) => {
      checkPage(10);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80, 80, 80);
      doc.text(`${label}:`, ml + indent, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(value || '-', maxW - 45 - indent);
      doc.text(lines as string[], ml + indent + 45, y);
      y += Math.max(5, (lines as string[]).length * 4);
    };

    const addFieldInline = (pairs: Array<[string, string]>) => {
      checkPage(10);
      const colW = maxW / pairs.length;
      pairs.forEach(([label, value], i) => {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text(`${label}:`, ml + i * colW, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        const lines = doc.splitTextToSize(value || '-', colW - 25);
        doc.text(lines as string[], ml + i * colW + 25, y);
      });
      y += 6;
    };

    const addSeparator = (light = false) => {
      checkPage(5);
      doc.setDrawColor(light ? 220 : 180, light ? 220 : 180, light ? 220 : 180);
      doc.line(ml, y, pageWidth - mr, y);
      y += 3;
    };

    const addBadge = (text: string, rgb: [number, number, number]) => {
      checkPage(10);
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.roundedRect(ml, y - 4, 30, 6, 1, 1, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(text, ml + 2, y);
      y += 5;
    };

    // ── PORTADA ──────────────────────────────────────────────────────────────
    addTitle('OTG - OBJETIVOS TÁCTICOS DE GESTIÓN');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Proceso: ${processName}`, ml, y); y += 4;
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString('es-ES')}`, ml, y); y += 4;

    // Indicadores globales
    const totalRows = matrixRows.length;
    const pctOTG = totalRows > 0
      ? Math.round(matrixRows.reduce((s, r) => s + calcularPorcentajeAlcanzado((r as any).alcanzado, (r as any).puntoPartida, (r as any).puntoLlegada), 0) / totalRows)
      : 0;
    const pctTareas = totalRows > 0
      ? Math.round(matrixRows.reduce((s, r) => s + calcularPorcentajeTareas(r.acciones || []), 0) / totalRows)
      : 0;
    const pctComunicado = totalRows > 0
      ? Math.round((matrixRows.filter(r => r.comunicado === 'SI').length / totalRows) * 100)
      : 0;

    y += 3;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.text(`% Alcanzado OTG: ${pctOTG}%   |   % Alcanzado en Tareas: ${pctTareas}%   |   % Comunicado: ${pctComunicado}%`, ml, y);
    y += 8;
    addSeparator();

    // ── TIPOS ────────────────────────────────────────────────────────────────
    const tipos: Array<{ tipo: string; color: [number, number, number]; label: string }> = [
      { tipo: 'Fortaleza', color: [34, 197, 94], label: 'FORTALEZAS' },
      { tipo: 'Oportunidad', color: [59, 130, 246], label: 'OPORTUNIDADES' },
      { tipo: 'Debilidad', color: [249, 115, 22], label: 'DEBILIDADES' },
      { tipo: 'Amenaza', color: [239, 68, 68], label: 'AMENAZAS' },
    ];

    tipos.forEach(({ tipo, color, label }) => {
      const items = matrixRows.filter(r => r.foda === tipo);
      if (items.length === 0) return;

      addSectionHeader(label, color);

      items.forEach((row, idx) => {
        const isDA = tipo === 'Debilidad' || tipo === 'Amenaza';
        const pctAlcanzado = calcularPorcentajeAlcanzado((row as any).alcanzado, (row as any).puntoPartida, (row as any).puntoLlegada);
        const pctTareasRow = calcularPorcentajeTareas(row.acciones || []);

        // Encabezado del elemento
        checkPage(25);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(color[0], color[1], color[2]);
        const elementoLines = doc.splitTextToSize(`${idx + 1}. ${row.elemento || `OTG #${row.id}`}`, maxW - 40);
        doc.text(elementoLines as string[], ml, y);
        // Badges de % en la misma línea
        doc.setFontSize(7);
        doc.setTextColor(30, 58, 138);
        doc.text(`OTG: ${pctAlcanzado}%  |  Tareas: ${pctTareasRow}%`, pageWidth - mr - 40, y);
        y += (elementoLines as string[]).length * 4 + 2;

        // A. IDENTIFICACIÓN
        addSubHeader('A. IDENTIFICACIÓN');
        addField('Subproceso', row.subproceso || '');
        addField('Objetivo de la Política', row.objetivoPolitica || '');
        addField('Elemento (FODA)', row.elemento || '');
        addFieldInline([['FODA', row.foda], ['Factor', row.factor || ''], ['Sistema de Gestión', row.sistemaGestion || '']]);
        addField('Objetivo Táctico de Gestión', (row as any).objetivoTactico || '');
        addFieldInline([['Punto de Partida', String((row as any).puntoPartida ?? '')], ['Punto de Llegada', String((row as any).puntoLlegada ?? '')], ['Unidad de Medida', (row as any).unidadMedida || ''], ['Responsable', (row as any).responsableOTG || '']]);
        addFieldInline([['Alcanzado', String((row as any).alcanzado ?? '')], ['% Alcanzado', `${pctAlcanzado}%`]]);
        addFieldInline([['Fecha Planificación', row.fechaPlanificacionMejora || ''], ['Fecha Final Prevista', row.fechaFinalPrevista || '']]);

        if (isDA) {
          addField('Consecuencia', row.consecuencia || '');
          addFieldInline([['Probabilidad', row.probabilidad || ''], ['Impacto', String(row.impacto ?? '')], ['Nivel de Riesgo', row.nivelRiesgo || '']]);
        }

        // Tareas
        if (row.acciones && row.acciones.length > 0) {
          addSubHeader(`TAREAS (${row.acciones.length})`);
          row.acciones.forEach((accion: any, ai: number) => {
            checkPage(15);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(60, 60, 60);
            const descLines = doc.splitTextToSize(`${ai + 1}. ${accion.accion || ''}`, maxW - 10);
            doc.text(descLines as string[], ml + 3, y);
            y += (descLines as string[]).length * 4 + 1;
            addFieldInline([
              ['Ponderación', `${accion.ponderacion ?? 0}%`],
              ['Responsable', accion.responsable || ''],
              ['Fecha', accion.fechaImplementacion || ''],
              ['% Avance', `${accion.porcentajeCompletado ?? 0}%`],
            ]);
          });
        }

        // Comunicación
        addSubHeader(isDA ? 'D. COMUNICACIÓN' : 'B. COMUNICACIÓN');
        addFieldInline([['Comunicado', row.comunicado || 'NO'], ['Partes Interesadas', row.partesInteresadas || '']]);
        addField('Evidencia', row.evidencia || '');

        // Planes y simulacros (solo D/A)
        if (isDA) {
          addSubHeader('C. PLANES Y SIMULACROS');
          addField('Plan de Contingencia', row.planContingencia || '');
          addField('Plan de Continuidad del Negocio', row.planContinuidad || '');
          addField('Simulacro', row.simulacro || '');
        }

        // Seguimiento y reevaluación
        addSubHeader(isDA ? 'E. SEGUIMIENTO Y REEVALUACIÓN' : 'C. SEGUIMIENTO Y REEVALUACIÓN');
        addFieldInline([
          ['Implantada la Mejora', row.mejoraImplementada || 'NO'],
          ['Implementación Cumplió su Objetivo', row.objetivoLogrado || 'NO'],
        ]);
        addField('Observación', row.observacion || '');
        addField('Medio de Verificación', row.medioVerificacion || '');
        addField('Fecha de Implementación', row.fechaImplementacion || '');

        if (isDA) {
          addSubHeader('Reevaluación de Riesgo');
          addFieldInline([
            ['Probabilidad Nueva', (row as any).probabilidadNueva || ''],
            ['Nivel de Riesgo Nuevo', (row as any).nivelRiesgoNuevo || ''],
            ['Estimación Nueva', (row as any).estimacionNueva || ''],
          ]);
        }

        addSeparator();
        y += 3;
      });

      y += 4;
    });

    const fileName = `OTG_${processName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    return true;
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return false;
  }
};
