import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Clock,
  MessageSquare,
  CheckCircle2,
  Send,
  Sparkles,
  Share2,
  ShieldCheck,
  ChevronRight,
  Tv
} from 'lucide-react';

export interface TimecodeComment {
  id: string;
  timeSeconds: number;
  timecodeFormatted: string;
  authorName: string;
  comment: string;
  timestamp: string;
  resolved?: boolean;
}

interface PrivateReviewPortalProps {
  clientName?: string;
  deliverableTitle?: string;
  cutVersion?: string;
  videoSrc?: string;
  posterSrc?: string;
  initialComments?: TimecodeComment[];
  onAddComment?: (comment: TimecodeComment) => void;
  onApproveCut?: () => void;
}

export const PrivateReviewPortal: React.FC<PrivateReviewPortalProps> = ({
  clientName = 'Dikshant & Moreen',
  deliverableTitle = 'Wedding Highlight Film (Cinematic 4K)',
  cutVersion = 'Cut 1 (V001)',
  videoSrc = '',
  posterSrc = '',
  initialComments = [
    {
      id: 'c1',
      timeSeconds: 28,
      timecodeFormatted: '00:28',
      authorName: 'Moreen (Bride)',
      comment: 'Please replace the wide angle with CAM B close-up during the ring exchange.',
      timestamp: 'Today at 11:30 AM',
      resolved: false
    },
    {
      id: 'c2',
      timeSeconds: 72,
      timecodeFormatted: '01:12',
      authorName: 'Dikshant (Groom)',
      comment: 'Audio transition here is a bit sudden. Can we crossfade the background music more gently?',
      timestamp: 'Today at 12:15 PM',
      resolved: false
    }
  ],
  onAddComment,
  onApproveCut
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [comments, setComments] = useState<TimecodeComment[]>(initialComments);

  // New comment draft state
  const [authorName, setAuthorName] = useState('Bride / Groom');
  const [commentText, setCommentText] = useState('');
  const [isApproved, setIsApproved] = useState(false);

  // Format seconds to MM:SS
  const formatTime = (secs: number): string => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  };

  const handleTimeUpdate = (): void => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = (): void => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const togglePlay = (): void => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      void videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekTo = (seconds: number): void => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const handleAddComment = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const newComment: TimecodeComment = {
      id: `comm_${Date.now()}`,
      timeSeconds: Math.floor(currentTime),
      timecodeFormatted: formatTime(currentTime),
      authorName: authorName.trim() || 'Family Member',
      comment: commentText.trim(),
      timestamp: 'Just now',
      resolved: false
    };

    const updated = [...comments, newComment].sort((a, b) => a.timeSeconds - b.timeSeconds);
    setComments(updated);
    setCommentText('');
    onAddComment?.(newComment);
  };

  const handleApprove = (): void => {
    setIsApproved(true);
    onApproveCut?.();
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col space-y-6 text-[#1A1814] font-sans">
      {/* Luxury Portal Top Header */}
      <div className="flex items-center justify-between p-4 bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#9B2226] flex items-center justify-center font-serif text-white font-bold text-lg shadow-sm shadow-[#9B2226]/20">
            B
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-serif font-bold tracking-wide text-[#1A1814] uppercase">
                {clientName}
              </h2>
              <span className="text-[10px] bg-[#FAF8F5] text-[#9B2226] border border-[#E5DFD7] px-2.5 py-0.5 rounded-full font-semibold">
                {cutVersion}
              </span>
            </div>
            <p className="text-xs text-[#6B655C] mt-0.5 font-sans">{deliverableTitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#6B655C] bg-[#FAF8F5] px-3 py-1.5 rounded-xl border border-[#E5DFD7]">
            <ShieldCheck size={14} className="text-[#C8860B]" />
            <span>Private Family Premiere</span>
          </div>
          <button
            onClick={handleApprove}
            disabled={isApproved}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              isApproved
                ? 'bg-emerald-700 text-white cursor-default'
                : 'sindoor-gradient-btn text-white shadow-sm'
            }`}
          >
            <CheckCircle2 size={15} />
            <span>{isApproved ? 'Cut Approved by Family ✓' : 'Approve This Cut'}</span>
          </button>
        </div>
      </div>

      {/* Main Video Screen with Smooth Faststart Player */}
      <div className="relative bg-[#000000] rounded-2xl overflow-hidden border border-[#24211B] shadow-2xl group">
        <video
          ref={videoRef}
          src={videoSrc || undefined}
          poster={posterSrc || undefined}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onClick={togglePlay}
          playsInline
          className="w-full aspect-video object-contain bg-black cursor-pointer"
        />

        {/* Big Center Play Button Overlay when paused */}
        {!isPlaying && (
          <div
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer backdrop-blur-[2px] transition-all"
          >
            <div className="w-16 h-16 rounded-full bg-[#9B2226] flex items-center justify-center text-white shadow-xl shadow-[#9B2226]/40 group-hover:scale-105 transition-transform">
              <Play size={28} className="ml-1" />
            </div>
          </div>
        )}

        {/* Video Scrubber & Controls Bar */}
        <div className="p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
          {/* Timeline Bar with Comment Markers */}
          <div className="relative w-full h-3 bg-white/20 rounded-full cursor-pointer mb-2 flex items-center">
            <div
              className="h-full bg-[#9B2226] rounded-full relative"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-[#E8A317] rounded-full shadow" />
            </div>

            {/* Interactive Comment Markers along Scrubber */}
            {duration > 0 &&
              comments.map(c => (
                <button
                  key={c.id}
                  onClick={e => {
                    e.stopPropagation();
                    seekTo(c.timeSeconds);
                  }}
                  title={`${c.timecodeFormatted} - ${c.authorName}: ${c.comment}`}
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#F4B942] hover:scale-150 transition-transform shadow-md z-10"
                  style={{ left: `${(c.timeSeconds / duration) * 100}%` }}
                />
              ))}
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between text-xs text-[#FBFAF7]">
            <div className="flex items-center gap-3">
              <button onClick={togglePlay} className="p-1 hover:text-[#E8A317] transition-colors">
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>

              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.muted = !isMuted;
                    setIsMuted(!isMuted);
                  }
                }}
                className="p-1 hover:text-[#E8A317] transition-colors"
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>

              <div className="font-mono text-[11px] text-[#A69F94]">
                <span>{formatTime(currentTime)}</span>
                <span className="mx-1">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[#8A847A] hidden sm:inline">
                Tap anywhere on timeline to jump
              </span>
              <button
                onClick={() => {
                  if (videoRef.current && (videoRef.current as any).webkitShowPlaybackTargetPicker) {
                    (videoRef.current as any).webkitShowPlaybackTargetPicker();
                  }
                }}
                className="p-1 hover:text-[#E8A317] transition-colors"
                title="AirPlay to Smart TV"
              >
                <Tv size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Timecode Feedback Form + Family Comments Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Drop Note at Specific Timecode */}
        <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#E5DFD7] pb-3">
            <div className="flex items-center gap-2 text-sm font-serif font-bold text-[#1A1814]">
              <Clock size={16} className="text-[#C8860B]" />
              <span>Leave a Note at Current Time</span>
            </div>
            <div className="font-mono text-xs px-2.5 py-1 bg-[#FAF8F5] text-[#9B2226] font-bold rounded-lg border border-[#D6D0C6]">
              {formatTime(currentTime)}
            </div>
          </div>

          <form onSubmit={handleAddComment} className="space-y-3">
            <div>
              <label className="text-[11px] text-[#6B655C] font-medium block mb-1">Your Name / Family Role</label>
              <input
                type="text"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                placeholder="e.g. Moreen (Bride), Dikshant (Groom)"
                className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#6B655C] font-medium block mb-1">Feedback Note at {formatTime(currentTime)}</label>
              <textarea
                rows={3}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="e.g. Can we change the background song here or swap this clip with the ceremony entrance?"
                className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl p-3 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226] resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={!commentText.trim()}
              className="w-full py-2.5 sindoor-gradient-btn disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              <Send size={13} />
              <span>Save Note at {formatTime(currentTime)}</span>
            </button>
          </form>

          {/* Quick Click Suggestions */}
          <div className="pt-2 border-t border-[#E5DFD7]">
            <span className="text-[10px] text-[#6B655C] uppercase tracking-wider block mb-2 font-semibold">
              Quick Suggestions
            </span>
            <div className="flex flex-wrap gap-1.5">
              {['Replace with close-up shot', 'Lower music volume', 'Extend this shot', 'Change music song'].map(
                phrase => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => setCommentText(prev => (prev ? `${prev} • ${phrase}` : phrase))}
                    className="text-[10px] bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#D6D0C6] text-[#6B655C] hover:text-[#1A1814] px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    + {phrase}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Family Timecoded Comments Log */}
        <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-5 rounded-2xl flex flex-col">
          <div className="flex items-center justify-between border-b border-[#E5DFD7] pb-3 mb-4">
            <div className="flex items-center gap-2 text-sm font-serif font-bold text-[#1A1814]">
              <MessageSquare size={16} className="text-[#9B2226]" />
              <span>Family Feedback &amp; Change Requests</span>
            </div>
            <span className="text-xs text-[#6B655C] bg-[#FAF8F5] px-2.5 py-0.5 rounded-full border border-[#E5DFD7] font-medium">
              {comments.length} notes
            </span>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-[360px] pr-1">
            {comments.length === 0 ? (
              <div className="p-8 text-center text-[#6B655C] text-xs font-sans">
                No change requests added yet. Pause the video at any time to leave a note.
              </div>
            ) : (
              comments.map(c => (
                <div
                  key={c.id}
                  onClick={() => seekTo(c.timeSeconds)}
                  className="p-3.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#E5DFD7] hover:border-[#D6D0C6] cursor-pointer transition-all flex items-start justify-between group shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#9B2226] bg-[#FFFFFF] border border-[#D6D0C6] px-2 py-0.5 rounded">
                        {c.timecodeFormatted}
                      </span>
                      <span className="text-xs font-semibold text-[#1A1814]">{c.authorName}</span>
                      <span className="text-[10px] text-[#6B655C] font-mono">{c.timestamp}</span>
                    </div>
                    <p className="text-xs text-[#1A1814] leading-relaxed pl-0.5 font-sans">{c.comment}</p>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-[#6B655C] group-hover:text-[#9B2226] transition-colors">
                    <Play size={12} />
                    <span className="hidden sm:inline font-medium">Seek</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
