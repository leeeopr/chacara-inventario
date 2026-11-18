export interface CompressedImageResult {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
  extension: string;
  mimeType: string;
}

/**
 * Compresses and resizes a photograph for mobile uploads without significantly
 * reducing visual quality. Converts high-res camera captures (5-12MB) to
 * crisp ~120-300KB JPEGs suitable for rapid Supabase Storage uploads.
 */
export async function compressImageForUpload(
  file: File | Blob,
  maxDimension = 1280,
  quality = 0.82
): Promise<CompressedImageResult> {
  const originalBytes = file.size;

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Não foi possível inicializar o processador de imagem.'));
          return;
        }

        // Fill white background for transparent PNGs converted to JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error('Falha ao comprimir a fotografia.'));
              return;
            }
            const previewUrl = URL.createObjectURL(blob);
            resolve({
              blob,
              previewUrl,
              width,
              height,
              originalBytes,
              compressedBytes: blob.size,
              extension: 'jpg',
              mimeType: 'image/jpeg',
            });
          },
          'image/jpeg',
          quality
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Arquivo de imagem inválido ou formato não suportado pelo dispositivo.'));
    };

    img.src = objectUrl;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}
