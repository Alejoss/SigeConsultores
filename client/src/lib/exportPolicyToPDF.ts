import jsPDF from 'jspdf';

export const exportPolicyToPDF = (policyText: string, companyName: string) => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;
    const margin = 15;
    const maxWidth = pageWidth - 2 * margin;

    // Title
    doc.setFontSize(16);
    doc.setTextColor(25, 55, 109);
    doc.text('POLÍTICA DEL SISTEMA INTEGRADO DE GESTIÓN', margin, yPosition);
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
    yPosition += 10;

    // Policy content
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('Helvetica', 'normal');

    const lines = doc.splitTextToSize(policyText, maxWidth);
    
    lines.forEach((line: string) => {
      // Check if we need a new page
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = 20;
      }

      doc.text(line, margin, yPosition);
      yPosition += 5;
    });

    // Save PDF
    doc.save(`Politica_${companyName}.pdf`);
  } catch (error) {
    console.error('Error exporting policy to PDF:', error);
    throw error;
  }
};
