import type { Transfer } from '../../../../shared/contracts';
import { formatBytes, formatCount } from '../../utils/uploadFormat';
import { ShareActions } from './ShareActions';

export function CompletedScreen({ transfers, refresh, onOpen }: {
  transfers: Transfer[]; refresh: () => Promise<void>; onOpen: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="screen">
      <header>
        <div>
          <span className="eyebrow">VERIFIED</span>
          <h2>Completed &amp; links</h2>
          <p>Folders where every file matched Drive by size and checksum. Uploaded footage can be
            reused for later cuts from the same wedding without sending the terabytes again.</p>
        </div>
      </header>

      {transfers.length === 0 ? (
        <div className="panel empty">
          <h3>Nothing verified yet</h3>
          <p>A transfer appears here once all of its files have been checked against Drive.</p>
        </div>
      ) : transfers.map(job => (
        <section key={job.id} className="panel">
          <div className="row" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <div>
              <span className="eyebrow">
                {job.target ? `${job.target.kind === 'freelance' ? 'PARTNER STUDIO' : 'CLIENT'} · ${job.target.purpose === 'raw' ? 'RAW FOOTAGE' : 'FINAL DELIVERY'}` : 'FOLDER'}
              </span>
              <h2 style={{ fontSize: 21 }}>{job.target?.title || job.rootName}</h2>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
                {job.target?.clientName}
                {job.target?.serviceType ? ` · ${job.target.serviceType}` : ''}
                {' · '}{formatCount(job.scan?.fileCount || 0)} files · {formatBytes(job.scan?.totalBytes || 0)}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="status-pill done">Verified</span>
              <div><button className="text-button" onClick={() => onOpen(job.id)}>Open details</button></div>
            </div>
          </div>
          <p className="mono muted" style={{ fontSize: 12.5, wordBreak: 'break-all' }}>{job.link}</p>
          <ShareActions job={job} refresh={refresh} />
        </section>
      ))}
    </div>
  );
}
