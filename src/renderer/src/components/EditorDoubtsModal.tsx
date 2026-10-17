import { useState } from 'react';
import {
  HelpCircle,
  MessageSquare,
  Music,
  Film,
  RotateCcw,
  Mic,
  CheckCircle2,
  Clock,
  Send,
  X,
  Check,
} from 'lucide-react';
import type { FreelanceJob } from '../types';
import type { FreelanceDoubt } from '../types/freelance';
import { submitEditorDoubt, resolveEditorDoubt } from '../lib/studioRepository';

const CATEGORY_META: Record<
  string,
  { label: string; icon: any; color: string; bg: string }
> = {
  song_music: {
    label: 'Song / Music',
    icon: Music,
    color: '#8b5cf6',
    bg: 'color-mix(in srgb, #8b5cf6 10%, var(--paper))',
  },
  footage_clip: {
    label: 'Footage / Missing Clip',
    icon: Film,
    color: '#3b82f6',
    bg: 'color-mix(in srgb, #3b82f6 10%, var(--paper))',
  },
  revision_feedback: {
    label: 'Changes / Feedback',
    icon: RotateCcw,
    color: '#ec4899',
    bg: 'color-mix(in srgb, #ec4899 10%, var(--paper))',
  },
  audio_sync: {
    label: 'Audio Sync',
    icon: Mic,
    color: '#f59e0b',
    bg: 'color-mix(in srgb, #f59e0b 10%, var(--paper))',
  },
  general: {
    label: 'General Query',
    icon: MessageSquare,
    color: 'var(--muted)',
    bg: 'var(--panel)',
  },
};

interface EditorDoubtsModalProps {
  job: FreelanceJob;
  editorName: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function EditorDoubtsModal({
  job,
  editorName,
  onClose,
  onUpdated,
}: EditorDoubtsModalProps): React.JSX.Element {
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState<FreelanceDoubt['category']>('song_music');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const doubts = job.doubts || [];
  const openDoubts = doubts.filter(d => d.status !== 'resolved');

  async function handleAddDoubt(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!question.trim()) return;
    setError('');
    setNote('');
    setBusy(true);

    try {
      await submitEditorDoubt(job.id, {
        question: question.trim(),
        category,
        askedBy: editorName,
      });
      setQuestion('');
      setNote('✓ Question logged for studio. You will see client response here when answered.');
      onUpdated?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit doubt.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResolve(doubtId: string): Promise<void> {
    setError('');
    setResolvingId(doubtId);
    try {
      await resolveEditorDoubt(job.id, doubtId, editorName);
      setNote('✓ Query marked as resolved.');
      onUpdated?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to resolve doubt.');
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="modal-shade">
      <section
        className="work-modal"
        style={{ width: 'min(760px, 100%)', maxHeight: '90vh' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="doubts-title"
      >
        <header>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="eyebrow">PROJECT COMMUNICATION</span>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 6,
                  fontWeight: 700,
                  background: openDoubts.length > 0 ? '#fef3c7' : '#ecfdf5',
                  color: openDoubts.length > 0 ? '#92400e' : '#065f46',
                }}
              >
                {openDoubts.length > 0 ? `${openDoubts.length} Open Query` : 'All Resolved'}
              </span>
            </div>
            <h2 id="doubts-title" style={{ marginTop: 2 }}>Doubts & Clarifications</h2>
            <p className="sub" style={{ marginTop: 2 }}>
              {job.jobCode ? `${job.jobCode} · ` : ''}{job.title}
            </p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {error && <p className="error" role="alert" style={{ margin: '8px 0' }}>{error}</p>}
        {note && <p className="success" role="status" style={{ margin: '8px 0' }}>{note}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, margin: '12px 0 20px', overflowY: 'auto', maxHeight: '55vh', paddingRight: 4 }}>
          {/* List of existing queries */}
          <div>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: 8 }}>
              Logged Queries ({doubts.length})
            </h3>

            {doubts.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  background: 'var(--panel)',
                  borderRadius: 10,
                  border: '1px dashed var(--line)',
                  color: 'var(--muted)',
                  fontSize: 13,
                }}
              >
                <HelpCircle size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <p style={{ margin: 0, fontWeight: 500 }}>No doubts or questions raised yet.</p>
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                  Need song guidance, missing clips, or clarification on changes? Log your query below.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {doubts.map(d => {
                  const cat = CATEGORY_META[d.category || 'general'] || CATEGORY_META.general;
                  const Icon = cat.icon;
                  const isResolved = d.status === 'resolved';
                  const isShared = d.status === 'shared_with_client';

                  return (
                    <div
                      key={d.id}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: isResolved ? 'var(--paper)' : 'color-mix(in srgb, var(--panel) 70%, var(--paper))',
                        border: `1px solid ${isResolved ? 'var(--line)' : 'color-mix(in srgb, var(--line) 70%, transparent)'}`,
                        opacity: isResolved ? 0.85 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: cat.bg,
                              color: cat.color,
                            }}
                          >
                            <Icon size={12} />
                            {cat.label}
                          </span>
                          <span className="muted" style={{ fontSize: 11 }}>
                            Asked {d.askedAt} {d.askedBy ? `by ${d.askedBy}` : ''}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isResolved ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#15803d' }}>
                              <CheckCircle2 size={13} />
                              Resolved {d.resolvedAt ? `(${d.resolvedAt})` : ''}
                            </span>
                          ) : isShared ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#2563eb' }}>
                              <Clock size={13} />
                              Shared with Client
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#d97706' }}>
                              <Clock size={13} />
                              Open
                            </span>
                          )}

                          {!isResolved && (
                            <button
                              className="text-button"
                              style={{ fontSize: 11, padding: '2px 6px', color: '#15803d' }}
                              disabled={resolvingId === d.id}
                              onClick={() => void handleResolve(d.id)}
                            >
                              {resolvingId === d.id ? 'Resolving…' : 'Mark Resolved'}
                            </button>
                          )}
                        </div>
                      </div>

                      <p style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink)' }}>
                        {d.question}
                      </p>

                      {/* Studio / Client Response Box */}
                      {d.clientResponse && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: '10px 12px',
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            borderRadius: 8,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#065f46', marginBottom: 4 }}>
                            <Check size={13} />
                            <span>Response from Studio / Client</span>
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: '#064e3b', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            {d.clientResponse}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Form to ask new doubt */}
          <form
            onSubmit={handleAddDoubt}
            style={{
              padding: 16,
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 12,
            }}
          >
            <h4 style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 600 }}>Ask a Question or Query</h4>
            
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
                  Category
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: 13,
                    borderRadius: 8,
                    background: 'var(--paper)',
                    border: '1px solid var(--line)',
                    color: 'var(--ink)',
                  }}
                >
                  <option value="song_music">🎵 Song / Music Selection</option>
                  <option value="footage_clip">🎬 Footage / Missing Clip / Corrupt File</option>
                  <option value="revision_feedback">🔄 Revision / Timecode Clarification</option>
                  <option value="audio_sync">🎙️ Audio Sync / Multi-Mic Query</option>
                  <option value="general">💬 General Question</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
                Your Doubt / Question
              </label>
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Explain what is unclear (e.g., 'Clip 0451 is missing ceremony audio', or 'Should the trailer end with bride or couple portraits?')"
                rows={3}
                style={{
                  width: '100%',
                  padding: 10,
                  fontSize: 13,
                  borderRadius: 8,
                  background: 'var(--paper)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                type="submit"
                className="primary"
                disabled={busy || !question.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Send size={13} />
                <span>{busy ? 'Logging…' : 'Submit Query to Studio'}</span>
              </button>
            </div>
          </form>
        </div>

        <div className="actions" style={{ marginTop: 0 }}>
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}
