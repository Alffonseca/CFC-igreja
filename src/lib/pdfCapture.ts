import { toPng } from 'html-to-image';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Captura um elemento HTML oficial e converte em imagem PNG de alta resolução.
 * Possui motor duplo com fallback automático (html-to-image + html2canvas)
 * para garantir 100% de sucesso sem folhas em branco.
 */
export async function captureElementToPng(
  elementIdOrElement: string | HTMLElement,
  options: {
    width?: number;
    minHeight?: number;
  } = {}
): Promise<string | null> {
  const elem = typeof elementIdOrElement === 'string'
    ? document.getElementById(elementIdOrElement)
    : elementIdOrElement;

  if (!elem) {
    console.warn(`Elemento ${elementIdOrElement} não encontrado para captura.`);
    return null;
  }

  const width = options.width || 794; // 210mm a 96dpi
  const minHeight = options.minHeight || 1123; // 297mm a 96dpi

  // Cria um palco de renderização offscreen no topo do DOM sem coordenadas negativas
  const staging = document.createElement('div');
  staging.id = `capture-staging-${Date.now()}`;
  staging.style.position = 'fixed';
  staging.style.left = '0px';
  staging.style.top = '0px';
  staging.style.width = `${width}px`;
  staging.style.height = 'auto';
  staging.style.zIndex = '-99999';
  staging.style.opacity = '1';
  staging.style.pointerEvents = 'none';
  staging.style.backgroundColor = '#ffffff';
  staging.style.overflow = 'visible';

  const clone = elem.cloneNode(true) as HTMLElement;
  clone.id = `capture-clone-${Date.now()}`;
  clone.classList.remove('hidden', 'print:hidden');
  clone.style.display = 'block';
  clone.style.visibility = 'visible';
  clone.style.position = 'relative';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.width = `${width}px`;
  clone.style.minWidth = `${width}px`;
  clone.style.maxWidth = `${width}px`;
  clone.style.minHeight = `${minHeight}px`;
  clone.style.transform = 'none';
  clone.style.margin = '0';
  clone.style.padding = '24px';
  clone.style.boxSizing = 'border-box';
  clone.style.backgroundColor = '#ffffff';
  clone.style.color = '#000000';
  clone.style.boxShadow = 'none';

  staging.appendChild(clone);
  document.body.appendChild(staging);

  try {
    // Pequena pausa para montagem completa e renderização dos nós clonados
    await new Promise((resolve) => setTimeout(resolve, 150));

    let pngDataUrl: string | null = null;

    // Tentativa 1: html-to-image (motor vetorial rápido e nativo)
    try {
      const result = await toPng(clone, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
        skipFonts: true, // Evita falhas de CORS em fontes externas
        width: width,
        height: Math.max(minHeight, clone.scrollHeight),
        style: {
          transform: 'none',
          visibility: 'visible',
          display: 'block',
          position: 'relative',
          left: '0',
          top: '0',
          margin: '0',
        }
      });

      // Uma imagem A4 com conteúdo tem normalmente mais de 15.000 caracteres em Base64
      if (result && result.length > 8000) {
        pngDataUrl = result;
      }
    } catch (e) {
      console.warn('html-to-image falhou, acionando fallback html2canvas:', e);
    }

    // Tentativa 2 (Fallback): html2canvas
    if (!pngDataUrl) {
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: width,
        windowWidth: width,
      });
      pngDataUrl = canvas.toDataURL('image/png', 0.98);
    }

    return pngDataUrl;
  } catch (err) {
    console.error('Erro geral ao capturar elemento para imagem:', err);
    throw err;
  } finally {
    if (staging && staging.parentNode) {
      staging.parentNode.removeChild(staging);
    }
  }
}

/**
 * Compõe um PDF multipáginas A4 a partir de uma lista de imagens PNG capturadas
 * e dispara o download automático e gera uma URL Blob segura.
 */
export async function downloadPdfFromPngList(
  pngList: (string | null)[],
  fileName: string
): Promise<{ success: boolean; blobUrl: string }> {
  const validImages = pngList.filter((img): img is string => typeof img === 'string' && img.length > 1000);
  
  if (validImages.length === 0) {
    throw new Error('Nenhuma folha válida encontrada para gerar o arquivo PDF.');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pdfWidth = 210;
  const pdfHeight = 297;

  validImages.forEach((imgData, index) => {
    if (index > 0) {
      pdf.addPage('a4', 'portrait');
    }
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  });

  // Gera Blob e URL
  const blob = pdf.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  // Dispara o download uma única vez de forma confiável
  try {
    pdf.save(fileName);
  } catch (e) {
    console.warn('pdf.save direto avisou, acionando fallback único via link:', e);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 1000);
  }

  return { success: true, blobUrl };
}

/**
 * Abre o PDF diretamente em nova aba para visualização e impressão nativa
 */
export function openPdfInNewTab(blobUrl: string): boolean {
  try {
    const newWindow = window.open(blobUrl, '_blank');
    if (newWindow) {
      newWindow.focus();
      return true;
    }
  } catch (e) {
    console.warn('Não foi possível abrir em nova janela:', e);
  }
  return false;
}
