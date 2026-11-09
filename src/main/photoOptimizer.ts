import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export interface PhotoOptimizeResult {
  sourcePath: string;
  outputPath4k: string;
  thumbnailPath: string;
  originalBytes: number;
  optimizedBytes: number;
  savingsPercent: number;
  width: number;
  height: number;
}

export class PhotoOptimizerEngine {
  private watermarkBuffer: Buffer | null = null;

  constructor() {
    this.findWatermark();
  }

  private findWatermark(): void {
    const candidates = [
      path.join(__dirname, '../../resources/watermark.png'),
      path.join(process.cwd(), 'brand-assets/watermark-br-white.png'),
      path.join(process.cwd(), 'COMMON/Brand Assets/Logos/2026/Square/PNG/Monogram_White_Square.png')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          this.watermarkBuffer = fs.readFileSync(p);
          break;
        } catch {}
      }
    }
  }

  async optimize(sourcePath: string, outputDir: string): Promise<PhotoOptimizeResult> {
    const originalStats = await fsp.stat(sourcePath);
    const originalBytes = originalStats.size;

    const baseName = path.parse(sourcePath).name;
    const output4k = path.join(outputDir, `${baseName}_4k.webp`);
    const outputThumb = path.join(outputDir, `${baseName}_thumb.webp`);

    await fsp.mkdir(outputDir, { recursive: true });

    // 1. Process 4K WebP
    let pipeline4k = sharp(sourcePath)
      .rotate() // auto-orient based on EXIF
      .resize(3840, 2160, { fit: 'inside', withoutEnlargement: true });

    if (this.watermarkBuffer) {
      try {
        const metadata = await sharp(sourcePath).metadata();
        const targetW = Math.min(metadata.width || 3840, 3840);
        const wmWidth = Math.max(120, Math.round(targetW * 0.12));
        const resizedWm = await sharp(this.watermarkBuffer).resize(wmWidth).toBuffer();

        pipeline4k = pipeline4k.composite([
          {
            input: resizedWm,
            gravity: 'southeast'
          }
        ]);
      } catch {}
    }

    const info4k = await pipeline4k
      .webp({ quality: 85, effort: 4 })
      .toFile(output4k);

    // 2. Process Thumbnail
    await sharp(sourcePath)
      .rotate()
      .resize(450, 450, { fit: 'cover', position: 'attention' })
      .webp({ quality: 75, effort: 2 })
      .toFile(outputThumb);

    const optimizedBytes = info4k.size;
    const savingsPercent = Math.max(0, Math.round(((originalBytes - optimizedBytes) / originalBytes) * 100));

    return {
      sourcePath,
      outputPath4k: output4k,
      thumbnailPath: outputThumb,
      originalBytes,
      optimizedBytes,
      savingsPercent,
      width: info4k.width,
      height: info4k.height
    };
  }
}
