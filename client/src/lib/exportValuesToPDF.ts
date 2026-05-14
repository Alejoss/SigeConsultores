import jsPDF from 'jspdf';

interface CompanyValue {
  id: number;
  value: string;
  description?: string | null;
}

export const exportValuesToPDF = (values: CompanyValue[], companyName: string) => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;
    const margin = 15;
    const maxWidth = pageWidth - 2 * margin;

    // Title
    doc.setFontSize(18);
    doc.setTextColor(25, 55, 109);
    doc.text('VALORES EMPRESARIALES', margin, yPosition);
    yPosition += 10;

    // Company name
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Empresa: ${companyName}`, margin, yPosition);
    yPosition += 6;

    // Date
    const date = new Date().toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Fecha de generación: ${date}`, margin, yPosition);
    yPosition += 8;

    // Total values
    doc.setFontSize(10);
    doc.setTextColor(25, 55, 109);
    doc.text(`Total de Valores: ${values.length}`, margin, yPosition);
    yPosition += 10;

    // Values list
    values.forEach((value, index) => {
      // Check if we need a new page
      if (yPosition > pageHeight - 30) {
        doc.addPage();
        yPosition = 20;
      }

      // Value number and name
      doc.setFontSize(11);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(25, 55, 109);
      const valueLines = doc.splitTextToSize(`${index + 1}. ${value.value}`, maxWidth - 10);
      doc.text(valueLines as string[], margin + 5, yPosition);
      yPosition += valueLines.length * 5 + 2;

      // Description if available
      if (value.description) {
        doc.setFontSize(9);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        const descLines = doc.splitTextToSize(value.description, maxWidth - 10);
        doc.text(descLines as string[], margin + 5, yPosition);
        yPosition += descLines.length * 4 + 4;
      }

      yPosition += 2;
    });

    // Save PDF
    doc.save(`Valores_${companyName}.pdf`);
  } catch (error) {
    console.error('Error exporting values to PDF:', error);
    throw error;
  }
};
