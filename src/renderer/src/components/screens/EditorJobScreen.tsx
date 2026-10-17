import { useState } from 'react';
import type { FreelanceJob } from '../../types';
import { Cloud, ArrowLeft, Upload, FileText, CheckCircle } from 'lucide-react';

export function EditorJobScreen({ job, onBack }: { job: FreelanceJob; onBack: () => void }): React.JSX.Element {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const hasDelivery = !!job.deliveryLink;

  async function handleUpload() {
    // This will open a file dialog, select video, and chunk-upload to Dropbox.
    // If a file exists, it will overwrite it to utilize Dropbox's native version history.
    setUploading(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setUploading(false);
          return 100;
        }
        return p + 10;
      });
    }, 500);
  }

  return (
    <div className="screen transfer-detail">
      <header>
        <div>
          <button className="back" onClick={onBack}><ArrowLeft size={16} /></button>
          <span className="eyebrow">JOB {job.id.slice(-6).toUpperCase()}</span>
          <h2>{job.title}</h2>
          <p>Stage: {job.stage}</p>
        </div>
      </header>
      
      <div className="content" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <section className="panel" style={{ marginBottom: '20px' }}>
          <h3>Raw Data</h3>
          {job.rawDataLink ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileText size={16} /> 
              <a href={job.rawDataLink} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>Open Raw Footage Folder</a>
            </div>
          ) : (
            <p className="muted">No raw data link provided by the studio yet.</p>
          )}
        </section>

        <section className="panel" style={{ marginBottom: '20px' }}>
          <h3>Deliverables & Client Feedback</h3>
          <p className="muted" style={{ marginBottom: '16px' }}>
            Upload your completed videos here. If a file was previously uploaded, this will replace it to save space (Dropbox retains the version history automatically).
          </p>
          
          {hasDelivery && (
            <div style={{ padding: '12px', background: 'var(--surface-sunken)', borderRadius: '6px', marginBottom: '16px' }}>
              <p><strong>Latest Delivery:</strong> <a href={job.deliveryLink} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>View on Dropbox</a></p>
            </div>
          )}

          {job.revisions?.map((rev, idx) => (
            <div key={idx} style={{ padding: '12px', borderLeft: '3px solid var(--blue)', background: 'var(--surface-sunken)', borderRadius: '6px', marginBottom: '16px' }}>
              <p><strong>Feedback received on {new Date(rev.receivedDate).toLocaleDateString()}:</strong></p>
              <p>{rev.feedbackNotes}</p>
            </div>
          ))}

          <div className="actions" style={{ marginTop: '20px' }}>
            <button className="primary" onClick={handleUpload} disabled={uploading}>
              <Upload size={16} />
              {uploading 
                ? `Uploading (${progress}%)...` 
                : hasDelivery ? `Replace Deliverable` : `Upload Deliverable`}
            </button>
          </div>
          {uploading && <p className="notice" style={{ marginTop: '10px' }}>Chunking and sending to Dropbox... Please do not close the app.</p>}
        </section>
      </div>
    </div>
  );
}
