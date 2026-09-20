/** The pieces every Utilities tool is built from. */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Copy, Folder, FolderPlus } from 'lucide-react';

/** The dashed "drop a folder here" panel every tool starts with. */
export function DropZone({ folder, detail, emptyTitle, emptyDetail, disabled, onChoose, onPick }: {
  folder: string | null;
  detail: string;
  emptyTitle: string;
  emptyDetail: string;
  disabled?: boolean;
  onChoose: () => void;
  onPick: (path: string) => void;
}): React.JSX.Element {
  const [hovering, setHovering] = useState(false);

  async function dropped(event: React.DragEvent): Promise<void> {
    event.preventDefault();
    setHovering(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (!file) return;
    // A dropped item may be a file — the main process hands back its folder.
    const path = window.api.pathForFile(file);
    const resolved = path ? await window.api.folderOfPath(path) : null;
    if (resolved) onPick(resolved);
  }

  const name = folder ? folder.split('/').filter(Boolean).pop() ?? folder : null;
  return (
    <button
      type="button"
      className={`drop-zone${hovering ? ' hovering' : ''}${folder ? ' filled' : ''}`}
      disabled={disabled}
      onClick={onChoose}
      onDragOver={event => { event.preventDefault(); if (!disabled) setHovering(true); }}
      onDragLeave={() => setHovering(false)}
      onDrop={event => { void dropped(event); }}
    >
      {folder ? <Folder size={26} strokeWidth={1.4} /> : <FolderPlus size={26} strokeWidth={1.4} />}
      <span className="title">{name ?? emptyTitle}</span>
      <span className="detail">{folder ? detail : emptyDetail}</span>
    </button>
  );
}

export function StatBlock({ value, label, tone }: { value: string; label: string; tone?: 'warn' | 'stop' }): React.JSX.Element {
  return (
    <div className={`stat-block${tone ? ' ' + tone : ''}`}>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export function ToolSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <section className="tool-section">
      <div className="head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span>{title}</span>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A copy button that confirms itself for a moment, as the utility app's did. */
export function CopyButton({ text, label, className, title }: {
  text: string | (() => string); label?: string; className?: string; title?: string;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className ?? 'icon-button'}
      title={title ?? 'Copy'}
      onClick={event => {
        event.stopPropagation();
        const value = typeof text === 'function' ? text() : text;
        void window.api.copyToClipboard(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {label ? <span style={{ marginLeft: 6 }}>{copied ? 'Copied' : label}</span> : null}
    </button>
  );
}

export function ProgressBar({ fraction, indeterminate }: { fraction: number; indeterminate?: boolean }): React.JSX.Element {
  return (
    <div className={`bar${indeterminate ? ' indeterminate' : ''}`}>
      <span style={indeterminate ? undefined : { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
    </div>
  );
}
