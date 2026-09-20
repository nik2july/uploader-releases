/**
 * Utilities — the four jobs that bookend every delivery.
 *
 * Ported from the standalone Baawaray Utility app so the studio has one window
 * instead of two. Each tool keeps its own folder and its own progress, so a
 * conversion running in Clip Delivery carries on while you measure something
 * else. ⌘1–⌘4 switch between them.
 */
import { useEffect, useState } from 'react';
import { Clock, Film, Image, ScanSearch } from 'lucide-react';
import type { UtilityToolsStatus } from '../../../../../shared/contracts';
import { DurationTool } from './DurationTool';
import { MissingClipsTool } from './MissingClipsTool';
import { ClipDeliveryTool } from './ClipDeliveryTool';
import { PhotoDeliveryTool } from './PhotoDeliveryTool';
import { utilitiesCache } from './state';
import type { UtilityTool } from './state';
import '../../../assets/utilities.css';

const TOOLS: { id: UtilityTool; name: string; blurb: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'duration', name: 'Duration', blurb: 'Total runtime of every clip in a folder and its subfolders', icon: Clock },
  { id: 'missing', name: 'Missing Clips', blurb: 'Finds gaps in camera numbering and writes the message', icon: ScanSearch },
  { id: 'clips', name: 'Clip Delivery', blurb: 'Re-encodes camera masters into files clients can play', icon: Film },
  { id: 'photos', name: 'Photo Delivery', blurb: 'Optimises a shoot into a viewing set and a print set', icon: Image },
];

export function UtilitiesScreen(): React.JSX.Element {
  const [tool, setTool] = useState<UtilityTool>(utilitiesCache.tool);
  const [status, setStatus] = useState<UtilityToolsStatus | null>(null);

  useEffect(() => { utilitiesCache.tool = tool; }, [tool]);
  useEffect(() => { void window.api.utilityStatus().then(setStatus).catch(() => setStatus(null)); }, []);

  // ⌘1–⌘4, as the standalone app had them.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (!event.metaKey && !event.ctrlKey) return;
      const index = ['1', '2', '3', '4'].indexOf(event.key);
      if (index < 0) return;
      event.preventDefault();
      setTool(TOOLS[index].id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = TOOLS.find(one => one.id === tool) ?? TOOLS[0];

  return (
    <div className="screen utilities">
      <header>
        <div>
          <span className="eyebrow">UTILITIES</span>
          <h2>{current.name}</h2>
          <p>{current.blurb}. Drop a folder anywhere on the page — it goes to whichever tool is on screen.</p>
        </div>
      </header>

      <div className="tool-tabs">
        {TOOLS.map((one, index) => {
          const Icon = one.icon;
          return (
            <button key={one.id} aria-current={tool === one.id} onClick={() => setTool(one.id)}>
              <Icon size={15} /> {one.name} <span className="shortcut">⌘{index + 1}</span>
            </button>
          );
        })}
      </div>

      {tool === 'duration' ? <DurationTool /> : null}
      {tool === 'missing' ? <MissingClipsTool /> : null}
      {tool === 'clips' ? <ClipDeliveryTool ffmpegAvailable={Boolean(status?.ffmpeg)} /> : null}
      {tool === 'photos' ? <PhotoDeliveryTool /> : null}
    </div>
  );
}
