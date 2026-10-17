import React, { useState } from 'react';
import { Cloud, CheckCircle2, ShieldCheck, Zap, AlertCircle, X } from 'lucide-react';
import { auth } from '../../lib/auth';

interface GoogleDriveRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
  actionTitle?: string;
  actionDescription?: string;
}

export function GoogleDriveRequiredModal({
  isOpen,
  onClose,
  onConnected,
  actionTitle = 'Google Account Required',
  actionDescription = 'To upload camera cards or download raw footage directly to/from the Baawaray Films Shared Drive, you must connect your Google account.',
}: GoogleDriveRequiredModalProps): React.JSX.Element | null {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async (): Promise<void> => {
    setConnecting(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Please sign in to the studio first.');
      }
      const token = await user.getIdToken();
      const status = await window.api.connectDrive(token);
      if (status.connected) {
        onConnected?.();
        onClose();
      } else if (status.error) {
        setError(status.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete Google sign-in.');
    } finally {
      setConnecting(false);
    }
  };

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
        if (e.target === e.currentTarget && !connecting) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          backgroundColor: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Header with gradient accent */}
        <div
          style={{
            padding: '24px 24px 16px 24px',
            borderBottom: '1px solid #f1f5f9',
            position: 'relative',
            background: 'linear-gradient(180deg, #fdfbf7 0%, #ffffff 100%)',
          }}
        >
          <button
            onClick={onClose}
            disabled={connecting}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: 'transparent',
              border: 'none',
              cursor: connecting ? 'not-allowed' : 'pointer',
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
                backgroundColor: '#fef2f2',
                color: '#831843',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #fecdd3',
                flexShrink: 0,
              }}
            >
              <Cloud size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                {actionTitle}
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
                {actionDescription}
              </p>
            </div>
          </div>
        </div>

        {/* Informational feature list */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: 12,
              backgroundColor: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #f1f5f9',
            }}
          >
            <ShieldCheck size={20} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>
                0% Personal Storage Used
              </div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
                All shoot files are stored inside Baawaray Films' Shared Drive. Zero bytes are deducted from your personal 15 GB Google quota.
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: 12,
              backgroundColor: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #f1f5f9',
            }}
          >
            <Zap size={20} color="#ca8a04" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>
                Full Speed 750 GB/Day Bandwidth
              </div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
                Each connected shooter gets their own 750 GB/day upload quota, so multiple camera cards upload simultaneously without slowdowns.
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: 12,
              backgroundColor: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #f1f5f9',
            }}
          >
            <CheckCircle2 size={20} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>
                Instant Shared Drive Contributor Access
              </div>
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
                Our studio automation automatically enrolls your Google account as a Contributor so you never have to wait for manual email invites.
              </div>
            </div>
          </div>

          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                backgroundColor: '#fef2f2',
                borderRadius: 8,
                border: '1px solid #fecdd3',
                color: '#991b1b',
                fontSize: 13,
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Action footer */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={connecting}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: connecting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={connecting}
            style={{
              padding: '9px 20px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#831843',
              color: '#ffffff',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: connecting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 4px rgba(131, 24, 67, 0.2)',
            }}
          >
            <Cloud size={16} />
            {connecting ? 'Connecting Google Account…' : 'Connect Google Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
