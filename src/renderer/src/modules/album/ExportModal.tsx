import React, { useState } from 'react';
const triggerConfetti = () => {
  try {
    if (typeof (window as any).confetti === 'function') {
      (window as any).confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  } catch {}
};
import { 
  X, 
  Download, 
  FileText, 
  Image as ImageIcon, 
  Eye, 
  Loader2, 
  Printer,
  Sparkles,
  ShieldCheck,
  Check
} from 'lucide-react';
import { AlbumProject } from './album';
import { exportProjectToPDF, exportClientProofingPDF, renderSpreadToCanvas } from './engine/exportEngine';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: AlbumProject;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project
}) => {
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  if (!isOpen) return null;



  const dpi = project.targetDpi || 300;

  const handleExportPrintPDF = async () => {
    try {
      setExportingType('print-pdf');
      setProgress({ current: 1, total: project.spreads.length });

      const pdfBlob = await exportProjectToPDF(project, (current, total) => {
        setProgress({ current, total });
      });

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title.replace(/\s+/g, '_')}_PrintReady_${dpi}DPI.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      triggerConfetti();
    } catch (err) {
      console.error('Print PDF export failed', err);
      alert('Export failed. Please check browser permissions.');
    } finally {
      setExportingType(null);
      setProgress(null);
    }
  };

  const handleExportProofPDF = async () => {
    try {
      setExportingType('proof-pdf');
      setProgress({ current: 1, total: project.spreads.length });

      const pdfBlob = await exportClientProofingPDF(
        project,
        'BAVARE ALBUM STUDIO • CLIENT PROOF',
        (current, total) => {
          setProgress({ current, total });
        }
      );

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title.replace(/\s+/g, '_')}_ClientProof.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      triggerConfetti();
    } catch (err) {
      console.error('Proof PDF export failed', err);
      alert('Export failed.');
    } finally {
      setExportingType(null);
      setProgress(null);
    }
  };

  const handleExportSpreadJPEGs = async () => {
    try {
      setExportingType('spread-jpegs');
      const total = project.spreads.length;

      for (let i = 0; i < total; i++) {
        setProgress({ current: i + 1, total });
        const spread = project.spreads[i];
        const canvas = await renderSpreadToCanvas(spread, project);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const a = document.createElement('a');
        a.href = dataUrl;
        const prefix = spread.sheetType ? spread.sheetType.replace('_', '-') : 'spread';
        a.download = `${(i + 1).toString().padStart(2, '0')}_${prefix}_${dpi}dpi.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        await new Promise(r => setTimeout(r, 200));
      }

      triggerConfetti();
    } catch (err) {
      console.error('Spread JPEG export failed', err);
      alert('JPEG export failed.');
    } finally {
      setExportingType(null);
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111417]/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#ffffff] border border-[#d4c1a3] rounded-2xl w-full max-w-2xl shadow-[0_25px_70px_rgba(17,20,23,0.18)] overflow-hidden flex flex-col animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#e8dfd8] bg-[#fdfcfb] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#7a2e33] p-0.5 shadow-md flex items-center justify-center">
              <div className="w-full h-full border border-[#d4c1a3]/40 rounded-[9px] flex items-center justify-center bg-[#7a2e33]">
                <Printer className="w-5 h-5 text-[#d4c1a3]" />
              </div>
            </div>
            <div>
              <h2 className="font-serif text-lg font-semibold text-[#111417]">
                Export Album <span className="text-[#7a2e33] font-normal italic">Master Files</span>
              </h2>
              <p className="text-xs text-[#6b6660]">
                Calibrated for professional lab printing & client proofing.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#6b6660] hover:text-[#111417] p-1.5 rounded-full hover:bg-[#f2ede4] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 bg-[#ffffff]">
          {/* Summary Banner */}
          <div className="bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl p-3.5 flex items-center justify-between text-xs">
            <div>
              <div className="font-medium text-[#111417]">{project.title}</div>
              <div className="text-[11px] text-[#6b6660] mt-0.5 font-mono">
                {project.sizePreset.spreadWidth}" × {project.sizePreset.spreadHeight}" • {project.spreads.length} Sheets • {project.photos.length} Photos
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono text-xs font-bold text-[#7a2e33] bg-[#fbf4f4] px-2.5 py-1 rounded-md border border-[#d4c1a3]">
                {dpi} DPI Ready
              </span>
            </div>
          </div>

          {/* Export Options Grid */}
          <div className="space-y-3">
            {/* Option 1: Print-Ready Master PDF */}
            <div className="p-4 rounded-xl border border-[#e8dfd8] hover:border-[#7a2e33] bg-[#fdfcfb] transition-all flex items-start justify-between">
              <div className="space-y-1 pr-4">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-[#7a2e33]" />
                  <span className="font-semibold text-xs text-[#111417]">
                    Print-Ready Master PDF ({dpi} DPI)
                  </span>
                  <span className="text-[9px] bg-[#f2ede4] text-[#7a2e33] font-mono font-medium px-1.5 py-0.2 rounded border border-[#d4c1a3]">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-[#6b6660]">
                  Full-resolution single multi-page PDF containing all covers, first/last halves, and double-page spreads sized to physical lab specifications.
                </p>
              </div>

              <button
                disabled={!!exportingType}
                onClick={handleExportPrintPDF}
                className="flex-shrink-0 flex items-center space-x-1.5 bg-[#7a2e33] hover:bg-[#5a2226] text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-xs disabled:opacity-50"
              >
                {exportingType === 'print-pdf' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Rendering ({progress?.current}/{progress?.total})...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 text-[#d4c1a3]" />
                    <span>Export PDF</span>
                  </>
                )}
              </button>
            </div>

            {/* Option 2: High-Res JPEG Sheets */}
            <div className="p-4 rounded-xl border border-[#e8dfd8] hover:border-[#7a2e33] bg-[#fdfcfb] transition-all flex items-start justify-between">
              <div className="space-y-1 pr-4">
                <div className="flex items-center space-x-2">
                  <ImageIcon className="w-4 h-4 text-[#7a2e33]" />
                  <span className="font-semibold text-xs text-[#111417]">
                    Individual High-Res JPEGs ({dpi} DPI)
                  </span>
                </div>
                <p className="text-[11px] text-[#6b6660]">
                  Downloads each sheet sequentially as an uncompressed {dpi} DPI JPEG, ideal for manual submission to Canvera, Suba, or Millers lab software.
                </p>
              </div>

              <button
                disabled={!!exportingType}
                onClick={handleExportSpreadJPEGs}
                className="flex-shrink-0 flex items-center space-x-1.5 bg-[#ffffff] hover:bg-[#f2ede4] text-[#111417] border border-[#d4c1a3] text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-xs disabled:opacity-50"
              >
                {exportingType === 'spread-jpegs' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7a2e33]" />
                    <span>Saving ({progress?.current}/{progress?.total})...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 text-[#7a2e33]" />
                    <span>Export JPEGs</span>
                  </>
                )}
              </button>
            </div>

            {/* Option 3: Watermarked Client Proof PDF */}
            <div className="p-4 rounded-xl border border-[#e8dfd8] hover:border-[#7a2e33] bg-[#fdfcfb] transition-all flex items-start justify-between">
              <div className="space-y-1 pr-4">
                <div className="flex items-center space-x-2">
                  <Eye className="w-4 h-4 text-[#7a2e33]" />
                  <span className="font-semibold text-xs text-[#111417]">
                    Watermarked Client Proofing PDF
                  </span>
                </div>
                <p className="text-[11px] text-[#6b6660]">
                  Lightweight web-compressed PDF with studio protection watermark and numbered sheet badges for email approval.
                </p>
              </div>

              <button
                disabled={!!exportingType}
                onClick={handleExportProofPDF}
                className="flex-shrink-0 flex items-center space-x-1.5 bg-[#ffffff] hover:bg-[#f2ede4] text-[#111417] border border-[#d4c1a3] text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-xs disabled:opacity-50"
              >
                {exportingType === 'proof-pdf' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7a2e33]" />
                    <span>Building ({progress?.current}/{progress?.total})...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 text-[#7a2e33]" />
                    <span>Export Proof</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#fdfcfb] border-t border-[#e8dfd8] flex items-center justify-between text-xs text-[#6b6660]">
          <span className="flex items-center space-x-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Color Profile: sRGB / AdobeRGB Lab Compatible</span>
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[#6b6660] hover:text-[#111417] hover:bg-[#f2ede4] rounded-lg transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
