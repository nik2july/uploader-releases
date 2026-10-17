export interface ExtractedRevisionResult {
  success: boolean;
  points: string;
  timecodes: string;
  summary?: string;
  clientMood?: string;
  modelUsed?: string;
}

export interface AudioRecordResult {
  blob: Blob;
  base64: string;
  mimeType: string;
  audioUrl: string;
  durationSeconds: number;
}

export class AudioRecorderController {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private mimeType = 'audio/webm';

  static isSupported(): boolean {
    return Boolean(
      typeof window !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder === 'function'
    );
  }

  async start(): Promise<void> {
    if (!AudioRecorderController.isSupported()) {
      throw new Error('Microphone recording is not supported on this device.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];

    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ];

    this.mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
    this.mediaRecorder = this.mimeType
      ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.stream);

    this.mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.startTime = Date.now();
    this.mediaRecorder.start(250); // collect chunks every 250ms
  }

  async stop(): Promise<AudioRecordResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('Recorder was not started.'));
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);
          const finalMime = this.mimeType || 'audio/webm';
          const blob = new Blob(this.chunks, { type: finalMime });
          const audioUrl = URL.createObjectURL(blob);

          // Convert blob to base64
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            const base64Data = (reader.result as string) || '';
            resolve({
              blob,
              base64: base64Data,
              mimeType: finalMime,
              audioUrl,
              durationSeconds,
            });
          };
          reader.onerror = err => reject(err);
        } catch (err) {
          reject(err);
        } finally {
          this.cleanup();
        }
      };

      this.mediaRecorder.stop();
    });
  }

  cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
  }
}

export async function fileToAudioPayload(file: File): Promise<{
  blob: Blob;
  base64: string;
  mimeType: string;
  audioUrl: string;
  fileName: string;
}> {
  return new Promise((resolve, reject) => {
    const audioUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      resolve({
        blob: file,
        base64: (reader.result as string) || '',
        mimeType: file.type || 'audio/mp3',
        audioUrl,
        fileName: file.name,
      });
    };
    reader.onerror = err => reject(err);
  });
}

export async function extractRevisionPointsWithGemini(params: {
  audioBase64?: string;
  mimeType?: string;
  rawText?: string;
  jobTitle?: string;
  clientName?: string;
  serviceType?: string;
}): Promise<ExtractedRevisionResult> {
  const endpoint = 'https://app.baawaray.com/api/revisions/extract-points';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (res.ok) {
    const data = await res.json();
    return {
      success: true,
      points: data.points || '',
      timecodes: data.timecodes || '',
      summary: data.summary,
      clientMood: data.clientMood,
      modelUsed: data.modelUsed,
    };
  }

  const errJson = await res.json().catch(() => null);
  throw new Error(errJson?.error || `Server responded with ${res.status}`);
}
