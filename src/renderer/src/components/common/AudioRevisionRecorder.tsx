import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Upload,
  Play,
  Pause,
  Trash2,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Volume2,
} from 'lucide-react';
import {
  AudioRecorderController,
  fileToAudioPayload,
  extractRevisionPointsWithGemini,
  ExtractedRevisionResult,
} from '../../services/geminiRevisionService';

interface AudioRevisionRecorderProps {
  jobTitle?: string;
  clientName?: string;
  serviceType?: string;
  onExtracted: (result: {
    points: string;
    timecodes: string;
    audioBase64?: string;
    audioBlob?: Blob;
    mimeType?: string;
    summary?: string;
  }) => void;
  rawTextNotes?: string;
}

export function AudioRevisionRecorder({
  jobTitle,
  clientName,
  serviceType,
  onExtracted,
  rawTextNotes = '',
}: AudioRevisionRecorderProps): React.JSX.Element {
  const [mode, setMode] = useState<'mic' | 'upload'>('mic');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState('audio/webm');
  const [audioFileName, setAudioFileName] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedSummary, setExtractedSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorderController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.cleanup();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    setError(null);
    setExtractedSummary(null);
    try {
      const recorder = new AudioRecorderController();
      recorderRef.current = recorder;
      await recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (err: any) {
      setError(err?.message || 'Could not access microphone.');
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);

    try {
      if (!recorderRef.current) return;
      const res = await recorderRef.current.stop();
      setHasAudio(true);
      setAudioUrl(res.audioUrl);
      setAudioBase64(res.base64);
      setAudioBlob(res.blob);
      setMimeType(res.mimeType);
      setAudioFileName(`VoiceNote_${new Date().toISOString().slice(0, 10)}.webm`);
    } catch (err: any) {
      setError(err?.message || 'Failed to finish audio recording.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setExtractedSummary(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await fileToAudioPayload(file);
      setHasAudio(true);
      setAudioUrl(res.audioUrl);
      setAudioBase64(res.base64);
      setAudioBlob(res.blob);
      setMimeType(res.mimeType);
      setAudioFileName(res.fileName);
    } catch (err: any) {
      setError(err?.message || 'Could not read audio file.');
    }
  };

  const clearAudio = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setHasAudio(false);
    setAudioUrl(null);
    setAudioBase64(null);
    setAudioBlob(null);
    setAudioFileName(null);
    setIsPlaying(false);
    setError(null);
    setExtractedSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current || !audioUrl) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleExtractWithGemini = async (useTextOnly = false) => {
    setError(null);
    setIsExtracting(true);
    setExtractedSummary(null);

    try {
      let payload: any = {
        jobTitle,
        clientName,
        serviceType,
      };

      if (!useTextOnly && audioBase64) {
        payload.audioBase64 = audioBase64;
        payload.mimeType = mimeType;
      } else if (rawTextNotes.trim()) {
        payload.rawText = rawTextNotes.trim();
      } else {
        throw new Error('Please record audio, upload an audio file, or enter raw notes first.');
      }

      const result: ExtractedRevisionResult = await extractRevisionPointsWithGemini(payload);

      if (result.success && result.points) {
        setExtractedSummary(result.summary || 'Points extracted successfully.');
        onExtracted({
          points: result.points,
          timecodes: result.timecodes,
          audioBase64: audioBase64 || undefined,
          audioBlob: audioBlob || undefined,
          mimeType,
          summary: result.summary,
        });
      } else {
        throw new Error('Gemini could not identify specific revision points.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to extract revisions with Gemini.');
    } finally {
      setIsExtracting(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        backgroundColor: '#ffffff',
        padding: '12px 14px',
        marginBottom: 14,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      {/* Tab Switcher Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
          <Volume2 size={15} color="#831843" />
          <span>Voice Note / Audio Feedback</span>
        </div>

        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 2, borderRadius: 8 }}>
          <button
            type="button"
            onClick={() => { setMode('mic'); clearAudio(); }}
            disabled={isRecording || isExtracting}
            style={{
              padding: '3px 10px',
              fontSize: 11.5,
              fontWeight: 600,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: mode === 'mic' ? '#ffffff' : 'transparent',
              color: mode === 'mic' ? '#831843' : '#64748b',
              boxShadow: mode === 'mic' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Mic size={12} />
            Record Mic
          </button>
          <button
            type="button"
            onClick={() => { setMode('upload'); clearAudio(); }}
            disabled={isRecording || isExtracting}
            style={{
              padding: '3px 10px',
              fontSize: 11.5,
              fontWeight: 600,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: mode === 'upload' ? '#ffffff' : 'transparent',
              color: mode === 'upload' ? '#831843' : '#64748b',
              boxShadow: mode === 'upload' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Upload size={12} />
            Upload File
          </button>
        </div>
      </div>

      {/* Main Body */}
      {mode === 'mic' ? (
        <div>
          {!hasAudio ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {isRecording ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: '#ef4444',
                        animation: 'pulse 1s infinite',
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>
                      Recording: {formatTimer(recordingSeconds)}
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Record client feedback or phone call directly
                  </span>
                )}
              </div>

              <div>
                {isRecording ? (
                  <button
                    type="button"
                    onClick={() => void stopRecording()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    <Square size={13} />
                    Stop Recording
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startRecording()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: '1px solid #fecdd3',
                      backgroundColor: '#fff1f2',
                      color: '#9f1239',
                      cursor: 'pointer',
                    }}
                  >
                    <Mic size={13} />
                    Start Voice Recording
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          {!hasAudio ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Upload WhatsApp voice note or audio file (.m4a, .mp3, .wav, .webm, .ogg)
              </span>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm,.aac"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={13} />
                  Choose Audio File
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Audio Player & Gemini Extract Action */}
      {hasAudio && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: '#f8fafc',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            gap: 12,
            marginTop: 4,
          }}
        >
          {audioUrl && (
            <audio
              ref={audioPlayerRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              style={{ display: 'none' }}
            />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <button
              type="button"
              onClick={togglePlayback}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: '#831843',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} style={{ marginLeft: 2 }} />}
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {audioFileName || 'Voice note recorded'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {recordingSeconds > 0 ? `Duration: ${formatTimer(recordingSeconds)}` : 'Audio ready to process'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={clearAudio}
              disabled={isExtracting}
              title="Remove audio"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                padding: 4,
                cursor: 'pointer',
                borderRadius: 4,
              }}
            >
              <Trash2 size={15} />
            </button>

            <button
              type="button"
              onClick={() => void handleExtractWithGemini(false)}
              disabled={isExtracting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #831843 0%, #be185d 100%)',
                color: '#ffffff',
                cursor: isExtracting ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(131, 24, 67, 0.25)',
              }}
            >
              {isExtracting ? (
                <>
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  Extracting Points…
                </>
              ) : (
                <>
                  <Sparkles size={13} color="#fde047" />
                  Extract with Gemini
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Optional helper to refine typed text if audio is not recorded */}
      {!hasAudio && rawTextNotes.trim().length > 15 && (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => void handleExtractWithGemini(true)}
            disabled={isExtracting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              fontSize: 11.5,
              fontWeight: 600,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              backgroundColor: '#f8fafc',
              color: '#475569',
              cursor: isExtracting ? 'not-allowed' : 'pointer',
            }}
          >
            <Sparkles size={12} color="#ca8a04" />
            Format rough typed notes with Gemini
          </button>
        </div>
      )}

      {/* Success / Summary Banner */}
      {extractedSummary && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 10px',
            borderRadius: 6,
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#065f46',
            fontSize: 11.5,
          }}
        >
          <CheckCircle2 size={14} color="#10b981" style={{ flexShrink: 0 }} />
          <span>{extractedSummary}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 10px',
            borderRadius: 6,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecdd3',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#991b1b',
            fontSize: 11.5,
          }}
        >
          <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
