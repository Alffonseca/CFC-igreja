/**
 * Utilitário Universal de Impressão e Visualização A4
 * Suporta Desktop (Windows, Mac), Celular (Android, iOS) e contorna
 * bloqueios de sandbox em iframes de pré-visualização.
 */

export interface PrintOptions {
  title?: string;
  pageBreakBetween?: boolean;
}

export function printHtmlElements(
  elementsOrIds: (HTMLElement | string)[],
  options: PrintOptions = {}
): void {
  const nodes: HTMLElement[] = [];

  for (const item of elementsOrIds) {
    const el = typeof item === 'string' ? document.getElementById(item) : item;
    if (el) {
      nodes.push(el);
    }
  }

  if (nodes.length === 0) {
    console.warn('Nenhum elemento encontrado para impressão.');
    return;
  }

  const docTitle = options.title || document.title || 'Relatório Oficial IEQ';

  // Coleta todos os estilos da página atual para replicar com 100% de precisão visual
  let stylesHtml = '';
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((styleTag) => {
    stylesHtml += styleTag.outerHTML + '\n';
  });

  // Monta o HTML das folhas A4
  let sheetsHtml = '';
  nodes.forEach((node, index) => {
    const clone = node.cloneNode(true) as HTMLElement;
    clone.classList.remove('hidden', 'print:hidden');
    clone.style.display = 'block';
    clone.style.visibility = 'visible';
    clone.style.transform = 'none';
    clone.style.margin = '0 auto';
    clone.style.width = '210mm';
    clone.style.minWidth = '210mm';
    clone.style.maxWidth = '210mm';
    clone.style.minHeight = '297mm';
    clone.style.boxSizing = 'border-box';
    clone.style.boxShadow = 'none';
    clone.style.pageBreakInside = 'avoid';
    clone.style.breakInside = 'avoid';
    clone.style.overflow = 'visible';
    clone.style.backgroundColor = '#ffffff';
    clone.style.color = '#000000';

    const isNotLast = index < nodes.length - 1;
    const breakClass = (options.pageBreakBetween !== false && isNotLast) ? 'sheet-page-break' : '';

    sheetsHtml += `
      <div class="a4-sheet-wrapper ${breakClass}">
        ${clone.outerHTML}
      </div>
    `;
  });

  const fullPrintPageHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${docTitle}</title>
      ${stylesHtml}
      <style>
        @page {
          size: A4 portrait;
          margin: 6mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        html, body {
          margin: 0;
          padding: 0;
          background-color: #27272a;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #000000;
        }
        .screen-toolbar {
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          background: #18181b;
          color: #ffffff;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          z-index: 99999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          border-bottom: 1px solid #3f3f46;
        }
        .toolbar-title {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .toolbar-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .btn-print {
          background-color: #2563eb;
          color: #ffffff;
          border: none;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.15s ease;
        }
        .btn-print:hover {
          background-color: #1d4ed8;
        }
        .btn-close {
          background-color: #3f3f46;
          color: #ffffff;
          border: none;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
        }
        .btn-close:hover {
          background-color: #52525b;
        }
        .sheets-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
          padding: 24px 16px;
        }
        .a4-sheet-wrapper {
          width: 210mm;
          min-height: 297mm;
          background: #ffffff;
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
          overflow: hidden;
        }
        .sheet-page-break {
          page-break-after: always !important;
          break-after: page !important;
        }
        @media print {
          .screen-toolbar {
            display: none !important;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .sheets-container {
            padding: 0 !important;
            margin: 0 !important;
            gap: 0 !important;
            display: block !important;
          }
          .a4-sheet-wrapper {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="screen-toolbar">
        <div class="toolbar-title">🖨️ ${docTitle}</div>
        <div class="toolbar-actions">
          <button class="btn-print" onclick="window.print()">
            Imprimir Documento / Salvar PDF
          </button>
          <button class="btn-close" onclick="window.close()">
            Fechar
          </button>
        </div>
      </div>
      <div class="sheets-container">
        ${sheetsHtml}
      </div>
      <script>
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            try {
              window.focus();
              window.print();
            } catch(e) {
              console.log(e);
            }
          }, 350);
        });
      </script>
    </body>
    </html>
  `;

  // Tenta abrir janela popup de impressão limpa
  try {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(fullPrintPageHtml);
      printWindow.document.close();
      return;
    }
  } catch (err) {
    console.warn('Popup de impressão bloqueado pelo navegador:', err);
  }

  // Fallback: caso popup seja bloqueado, injeta iframe temporário ou dispara window.print() direto
  const printBlob = new Blob([fullPrintPageHtml], { type: 'text/html' });
  const printBlobUrl = URL.createObjectURL(printBlob);
  const fallbackWindow = window.open(printBlobUrl, '_blank');
  if (!fallbackWindow) {
    // Se ainda assim bloqueado, tenta direto
    window.print();
  }
}

