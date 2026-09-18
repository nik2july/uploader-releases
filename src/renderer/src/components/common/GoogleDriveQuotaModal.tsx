import React from 'react';
import { Cloud, FolderOpen, ExternalLink, Play, X, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { FreelanceJob } from '../../types';
import { formatBytes } from '../../utils/uploadFormat';

interface GoogleDriveQuotaModalProps {
  isOpen: boolean;
  job: FreelanceJob | null;
  downloadedBytes: number;
  totalBytes: number;
  onClose: () => void;
  onOpenBrowser: () => void;
  onLocateFolder: () => void;
  onResume?: () => void;
}

export function GoogleDriveQuotaModal({
  isOpen,
  job,
  downloadedBytes,
  totalBytes,
  onClose,
  onOpenBrowser,
  onLocateFolder,
  onResume,
}: GoogleDriveQuotaModalProps): React.JSX.Element | null {
  if (!isOpen || !job) return null;

  const remainingBytes = Math.max(0, totalBytes - downloadedBytes);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          backgroundColor: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 24px 18px 24px',
            borderBottom: '1px solid #f1f5f9',
            position: 'relative',
            background: 'linear-gradient(180deg, #fffbeb 0%, #ffffff 100%)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                backgroundColor: '#fef3c7',
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #fde68a',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                Google Drive 15 GB Quota Reached
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
                {job.title}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Progress summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <ShieldCheck size={14} /> Downloaded Intact
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#14532d', marginTop: 4 }}>
                {formatBytes(downloadedBytes)}
              </div>
              <div style={{ fontSize: 11, color: '#15803d', marginTop: 2 }}>
                Verified & playable on disk
              </div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                backgroundColor: '#fef2f2',
                border: '1px solid #fecdd3',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Cloud size={14} /> Remaining on Cloud
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#7f1d1d', marginTop: 4 }}>
                {totalBytes > 0 ? formatBytes(remainingBytes) : 'Pending…'}
              </div>
              <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
                Requires browser / Drive sync
              </div>
            </div>
          </div>

          {/* Explanation banner */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontSize: 12.5,
              color: '#334155',
              lineHeight: 1.5,
            }}
          >
            Google Drive restricts anonymous public downloads to <strong>~15 GB per 24 hours</strong>. The app protected your files and safely paused without downloading corrupt data.
          </div>

          {/* Option 1: Open in Browser */}
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                  Option 1: Open in Browser (Recommended)
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
                  Log into Google in your browser to view all files, download remaining clips, or click <strong>&quot;Add shortcut to Drive&quot;</strong> to sync via Google Drive for Desktop at full speed.
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenBrowser}
                style={{
                  flexShrink: 0,
                  marginLeft: 12,
                  padding: '7px 14px',
                  borderRadius: 8,
                  backgroundColor: '#831843',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 4px rgba(131, 24, 67, 0.2)',
                }}
              >
                <ExternalLink size={13} />
                Open Drive
              </button>
            </div>
          </div>

          {/* Option 2: Locate Folder on Disk */}
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                  Option 2: Locate Folder on Disk
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
                  Once the remaining files are in your project folder, select it here. The desktop app will verify all files and move your project directly to <strong>In-Process</strong>.
                </div>
              </div>
              <button
                type="button"
                onClick={onLocateFolder}
                style={{
                  flexShrink: 0,
                  marginLeft: 12,
                  padding: '7px 14px',
                  borderRadius: 8,
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <FolderOpen size={13} />
                Locate Folder
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close &amp; Resume Later
          </button>
          {onResume && (
            <button
              type="button"
              onClick={onResume}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Play size={13} />
              Retry Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
