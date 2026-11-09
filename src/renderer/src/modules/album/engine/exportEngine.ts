import { jsPDF } from 'jspdf';
import { AlbumProject, SpreadItem, PhotoItem } from '../album';

/**
 * Loads an image from a URL into an HTMLImageElement
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

/**
 * Render a single spread or half-sheet to an HTML Canvas
 */
export async function renderSpreadToCanvas(
  spread: SpreadItem,
  project: AlbumProject,
  options: {
    targetWidth?: number;
    showBleed?: boolean;
    showGutterLine?: boolean;
    isWatermarked?: boolean;
    watermarkText?: string;
  } = {}
): Promise<HTMLCanvasElement> {
  const isHalfSheet = spread.sheetType === 'front_cover' || 
                      spread.sheetType === 'back_cover' || 
                      spread.sheetType === 'first_half' || 
                      spread.sheetType === 'last_half';

  const sheetWidthInches = isHalfSheet 
    ? project.sizePreset.singlePageWidth 
    : project.sizePreset.spreadWidth;
  const sheetHeightInches = project.sizePreset.spreadHeight;
  const sheetAspect = sheetWidthInches / sheetHeightInches;

  const dpi = project.targetDpi || 300;
  // If targetWidth is explicitly specified (e.g. proofing preview), use it; otherwise compute from exact DPI!
  const targetW = options.targetWidth || Math.round(sheetWidthInches * dpi);
  const targetH = Math.round(targetW / sheetAspect);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas 2D context');

  // 1. Draw Background (Solid or Blurred Image Background)
  const bgConfig = spread.backgroundConfig;
  if (bgConfig && bgConfig.type === 'image' && bgConfig.imageUrl) {
    try {
      const bgImg = await loadImage(bgConfig.imageUrl);
      ctx.save();

      // Apply blur & brightness filter
      const blurRadius = Math.round((bgConfig.blur || 24) * (targetW / 1200));
      const brightnessPct = bgConfig.brightness || 95;
      ctx.filter = `blur(${blurRadius}px) brightness(${brightnessPct}%)`;

      // Scale slightly up (1.1x) to prevent blur fringing around edges
      const scale = 1.1;
      const bw = targetW * scale;
      const bh = targetH * scale;
      const bx = (targetW - bw) / 2;
      const by = (targetH - bh) / 2;

      ctx.drawImage(bgImg, bx, by, bw, bh);
      ctx.restore();

      // Draw overlay tint
      const overlayOpacity = bgConfig.overlayOpacity ?? 0.4;
      if (overlayOpacity > 0) {
        ctx.save();
        ctx.fillStyle = bgConfig.overlayColor || '#000000';
        ctx.globalAlpha = overlayOpacity;
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.restore();
      }
    } catch {
      ctx.fillStyle = spread.backgroundColor || '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
    }
  } else {
    ctx.fillStyle = spread.backgroundColor || '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
  }

  // 2. Pre-fetch photos
  const photoMap = new Map<string, PhotoItem>();
  project.photos.forEach(p => photoMap.set(p.id, p));

  // 3. Render frames
  for (const frame of spread.frames) {
    if (!frame.photoId) continue;
    const photo = photoMap.get(frame.photoId);
    if (!photo) continue;

    const fx = (frame.x / 100) * targetW;
    const fy = (frame.y / 100) * targetH;
    const fw = (frame.width / 100) * targetW;
    const fh = (frame.height / 100) * targetH;

    ctx.save();

    // Clip to frame boundary
    ctx.beginPath();
    ctx.rect(fx, fy, fw, fh);
    ctx.clip();

    try {
      const img = await loadImage(photo.url);

      // Apply Filter if any
      if (frame.filter === 'bw') {
        ctx.filter = 'grayscale(100%) contrast(110%)';
      } else if (frame.filter === 'sepia') {
        ctx.filter = 'sepia(80%)';
      } else if (frame.filter === 'warm') {
        ctx.filter = 'sepia(25%) saturate(120%)';
      } else if (frame.filter === 'cool') {
        ctx.filter = 'hue-rotate(180deg) saturate(90%)';
      }

      // Calculate object-fit: cover with crop zoom and pan
      const imgAspect = img.width / img.height;
      const frameAspect = fw / fh;
      let drawW = fw;
      let drawH = fh;
      let offsetX = 0;
      let offsetY = 0;

      if (imgAspect > frameAspect) {
        drawH = fh;
        drawW = fh * imgAspect;
        offsetX = (fw - drawW) / 2;
      } else {
        drawW = fw;
        drawH = fw / imgAspect;
        offsetY = (fh - drawH) / 2;
      }

      const zoom = frame.crop?.zoom || 1.0;
      const panX = ((frame.crop?.panX || 0) / 100) * fw;
      const panY = ((frame.crop?.panY || 0) / 100) * fh;

      const finalW = drawW * zoom;
      const finalH = drawH * zoom;
      const finalX = fx + offsetX + (fw - finalW) / 2 + panX;
      const finalY = fy + offsetY + (fh - finalH) / 2 + panY;

      ctx.drawImage(img, finalX, finalY, finalW, finalH);
    } catch {
      ctx.fillStyle = '#2A2D35';
      ctx.fillRect(fx, fy, fw, fh);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(photo.fileName, fx + fw / 2, fy + fh / 2);
    }

    ctx.restore();

    // Frame border if specified
    if (frame.borderWidth && frame.borderWidth > 0) {
      ctx.strokeStyle = frame.borderColor || '#FFFFFF';
      ctx.lineWidth = frame.borderWidth;
      ctx.strokeRect(fx, fy, fw, fh);
    }
  }

  // 4. Render Text Blocks
  for (const tb of spread.textBlocks) {
    ctx.save();
    const tx = (tb.x / 100) * targetW;
    const ty = (tb.y / 100) * targetH;
    const tw = (tb.width / 100) * targetW;

    ctx.fillStyle = tb.color || '#FFFFFF';
    ctx.font = `${tb.fontStyle === 'italic' ? 'italic ' : ''}${tb.fontWeight} ${Math.round(tb.fontSize * (targetW / 1200))}px ${tb.fontFamily}, serif`;

    if (tb.alignment === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(tb.text, tx + tw / 2, ty);
    } else if (tb.alignment === 'right') {
      ctx.textAlign = 'right';
      ctx.fillText(tb.text, tx + tw, ty);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(tb.text, tx, ty);
    }
    ctx.restore();
  }

  // 5. Draw Optional Gutter Crease Line for Full Spreads
  if (options.showGutterLine && !isHalfSheet) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(targetW / 2, 0);
    ctx.lineTo(targetW / 2, targetH);
    ctx.stroke();
    ctx.restore();
  }

  // 6. Draw Watermark for Client Proofing
  if (options.isWatermarked) {
    ctx.save();
    ctx.font = `600 ${Math.round(targetW / 24)}px 'The Seasons', Vidaloka, serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(targetW / 2, targetH / 2);
    ctx.rotate(-Math.PI / 12);
    ctx.fillText(options.watermarkText || 'BAVARE ALBUM STUDIO • CLIENT PROOF ONLY', 0, 0);
    ctx.restore();

    // Spread numbering badge in corner
    ctx.save();
    ctx.fillStyle = 'rgba(17, 20, 23, 0.7)';
    ctx.fillRect(20, targetH - 60, 260, 40);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText(spread.name, 35, targetH - 35);
    ctx.restore();
  }

  return canvas;
}

/**
 * Export all sheets as a High-Res Print PDF
 */
export async function exportProjectToPDF(
  project: AlbumProject,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const total = project.spreads.length;
  let pdf: jsPDF | null = null;

  for (let i = 0; i < total; i++) {
    if (onProgress) onProgress(i + 1, total);

    const spread = project.spreads[i];
    const isHalfSheet = spread.sheetType === 'front_cover' || 
                        spread.sheetType === 'back_cover' || 
                        spread.sheetType === 'first_half' || 
                        spread.sheetType === 'last_half';

    const sheetW = isHalfSheet ? project.sizePreset.singlePageWidth : project.sizePreset.spreadWidth;
    const sheetH = project.sizePreset.spreadHeight;

    const canvas = await renderSpreadToCanvas(spread, project);
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    if (!pdf) {
      pdf = new jsPDF({
        orientation: sheetW > sheetH ? 'landscape' : 'portrait',
        unit: 'in',
        format: [sheetW, sheetH]
      });
    } else {
      pdf.addPage([sheetW, sheetH], sheetW > sheetH ? 'landscape' : 'portrait');
    }

    pdf.addImage(imgData, 'JPEG', 0, 0, sheetW, sheetH);
  }

  if (!pdf) throw new Error('No spreads to export');
  return pdf.output('blob');
}

/**
 * Export Client Proofing PDF (Watermarked, compressed)
 */
export async function exportClientProofingPDF(
  project: AlbumProject,
  watermarkText = 'BAVARE ALBUM STUDIO • CLIENT PROOF',
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const total = project.spreads.length;
  let pdf: jsPDF | null = null;

  for (let i = 0; i < total; i++) {
    if (onProgress) onProgress(i + 1, total);

    const spread = project.spreads[i];
    const isHalfSheet = spread.sheetType === 'front_cover' || 
                        spread.sheetType === 'back_cover' || 
                        spread.sheetType === 'first_half' || 
                        spread.sheetType === 'last_half';

    const sheetW = isHalfSheet ? project.sizePreset.singlePageWidth : project.sizePreset.spreadWidth;
    const sheetH = project.sizePreset.spreadHeight;

    const canvas = await renderSpreadToCanvas(spread, project, {
      targetWidth: isHalfSheet ? 1200 : 2000,
      isWatermarked: true,
      watermarkText: watermarkText
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.85);

    if (!pdf) {
      pdf = new jsPDF({
        orientation: sheetW > sheetH ? 'landscape' : 'portrait',
        unit: 'in',
        format: [sheetW, sheetH]
      });
    } else {
      pdf.addPage([sheetW, sheetH], sheetW > sheetH ? 'landscape' : 'portrait');
    }

    pdf.addImage(imgData, 'JPEG', 0, 0, sheetW, sheetH);
  }

  if (!pdf) throw new Error('No spreads to export');
  return pdf.output('blob');
}
