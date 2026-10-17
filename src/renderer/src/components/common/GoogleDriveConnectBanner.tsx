import React from 'react';
import { Cloud, AlertTriangle, ChevronRight } from 'lucide-react';

interface GoogleDriveConnectBannerProps {
  connected: boolean;
  onConnect: () => void;
  connecting?: boolean;
  compact?: boolean;
}

export function GoogleDriveConnectBanner({
  connected,
  onConnect,
  connecting = false,
  compact = false,
}: GoogleDriveConnectBannerProps): React.JSX.Element | null {
  if (connected) return null;

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          backgroundColor: '#fef3c7',
          borderBottom: '1px solid #fde68a',
          color: '#92400e',
          fontSize: 12.5,
          fontWeight: 500,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} color="#b45309" style={{ flexShrink: 0 }} />
          <span>
            <strong>Google Account Not Connected:</strong> Connect your Google account to upload cards or download raw footage from the Baawaray Films Shared Drive.
          </span>
        </div>
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            border: 'none',
            backgroundColor: '#831843',
            color: '#ffffff',
            cursor: connecting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            marginLeft: 12,
          }}
        >
          <Cloud size={13} />
          {connecting ? 'Connecting…' : 'Connect Account'}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: '16px 20px 0 20px',
        padding: '14px 18px',
        backgroundColor: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: '#fef3c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#b45309',
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          <Cloud size={20} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>
            Google Account Required for Direct Ingest & Raw Downloads
          </div>
          <div style={{ fontSize: 13, color: '#b45309', marginTop: 2, lineHeight: 1.4 }}>
            Connect your Google account once to automatically receive Contributor access on the Baawaray Films Shared Drive. Zero bytes used from your personal quota.
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onConnect}
        disabled={connecting}
        style={{
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 8,
          border: 'none',
          backgroundColor: '#831843',
          color: '#ffffff',
          cursor: connecting ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          boxShadow: '0 2px 4px rgba(131, 24, 67, 0.15)',
        }}
      >
        <Cloud size={15} />
        {connecting ? 'Connecting…' : 'Connect Google Account'}
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
