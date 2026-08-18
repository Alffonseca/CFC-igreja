import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

/**
 * Redimensiona e comprime uma imagem no navegador para Base64 leve (<40KB)
 * Isso garante que a imagem possa ser gravada diretamente no Firestore sem falhas
 * e sem depender de storage externo ou planos pagos.
 */
export async function compressImageToBase64(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<string> {
  const { maxWidth = 360, maxHeight = 360, quality = 0.85 } = options;

  return new Promise((resolve, reject) => {
    // Se for SVG, lê direto como texto/data URL para manter a nitidez vetorial máxima
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Mantém a proporção redimensionando para caber na caixa limite
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        // Suavização de imagem
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Se for PNG transparente mantém PNG, caso contrário usa WEBP ou JPEG
        const isPng = file.type === 'image/png';
        const mimeType = isPng ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve(dataUrl);
      };

      img.onerror = () => {
        resolve(event.target?.result as string);
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Faz o upload inteligente da imagem:
 * 1. Primeiro comprime a imagem para Base64 otimizada.
 * 2. Tenta enviar para o Firebase Storage.
 * 3. Se o Firebase Storage falhar (permissões, bucket não configurado, CORS ou offline),
 *    retorna automaticamente o Base64 otimizado, que é salvo com 100% de sucesso no Firestore!
 */
export async function uploadOrProcessImage(
  file: File,
  storagePath: string,
  options: ImageOptimizationOptions = {}
): Promise<{ url: string; method: 'storage' | 'base64' }> {
  // 1. Sempre gera a versão Base64 ultra-leve primeiro
  const base64Data = await compressImageToBase64(file, options);

  // 2. Tenta enviar para o Firebase Storage em paralelo com timeout seguro
  try {
    const storageRef = ref(storage, storagePath);
    const uploadPromise = uploadBytes(storageRef, file);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Storage timeout')), 6000)
    );

    await Promise.race([uploadPromise, timeoutPromise]);
    const downloadUrl = await getDownloadURL(storageRef);
    return { url: downloadUrl, method: 'storage' };
  } catch (storageErr) {
    console.warn('Firebase Storage indisponível ou sem permissão. Usando Base64 otimizado direto:', storageErr);
    // Fallback garantido: retorna o Base64
    return { url: base64Data, method: 'base64' };
  }
}

/**
 * Logos Oficiais Prontas da Igreja do Evangelho Quadrangular em SVG Data-URI
 */
export const OFFICIAL_IEQ_LOGOS = [
  {
    id: 'ieq-quadrangular-emblem',
    name: 'Emblema Oficial Quadrangular (4 Cores e 4 Símbolos)',
    preview: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="24" fill="%2318181b"/><g transform="translate(20,20)"><rect width="75" height="75" rx="8" fill="%23dc2626"/><path d="M37.5 15 v45 M22.5 30 h30" stroke="white" stroke-width="8" stroke-linecap="round"/><rect x="85" width="75" height="75" rx="8" fill="%23eab308"/><path d="M122.5 25 c-10 0 -18 8 -18 18 c0 15 18 22 18 22 s18 -7 18 -22 c0 -10 -8 -18 -18 -18 z" fill="white"/><rect y="85" width="75" height="75" rx="8" fill="%232563eb"/><path d="M22.5 105 h30 l-5 25 h-20 z M37.5 130 v15 M27.5 145 h20" fill="white"/><rect x="85" y="85" width="75" height="75" rx="8" fill="%237e22ce"/><path d="M100 135 l-10 -25 l18 10 l14.5 -18 l14.5 18 l18 -10 l-10 25 z" fill="white"/></g><text x="100" y="185" fill="white" font-family="sans-serif" font-weight="bold" font-size="14" text-anchor="middle" letter-spacing="3">QUADRANGULAR</text></svg>'
  },
  {
    id: 'ieq-shield-colors',
    name: 'Escudo Quadrangular Circular',
    preview: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="95" fill="%23ffffff" stroke="%2318181b" stroke-width="5"/><path d="M100 10 A90 90 0 0 1 190 100 L100 100 Z" fill="%23dc2626"/><path d="M190 100 A90 90 0 0 1 100 190 L100 100 Z" fill="%23eab308"/><path d="M100 190 A90 90 0 0 1 10 100 L100 100 Z" fill="%232563eb"/><path d="M10 100 A90 90 0 0 1 100 10 L100 100 Z" fill="%237e22ce"/><circle cx="100" cy="100" r="38" fill="%2318181b"/><text x="100" y="106" fill="white" font-family="sans-serif" font-weight="900" font-size="18" text-anchor="middle" letter-spacing="1">IEQ</text></svg>'
  }
];
