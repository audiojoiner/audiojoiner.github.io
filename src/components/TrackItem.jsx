import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import {
  Play,
  Pause,
  ArrowUp,
  ArrowDown,
  Trash2,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Scissors,
  Check,
} from 'lucide-react';
import { formatTime, parseTimeToSeconds, formatBytes } from '../utils/formatters.js';

export default function TrackItem({
  track,
  index,
  totalTracks,
  isActive,
  i18n = {},
  tipDrag = '(Tip: Drag the vertical START & END lines on the waveform)',
  onSelect,
  onUpdateTrim,
  onToggleCrossfade,
  onUpdateCrossfadeDuration,
  onMoveUp,
  onMoveDown,
  onDelete,
}) {
  const containerRef = useRef(null);
  const waveformWrapperRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isWaveReady, setIsWaveReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [startInput, setStartInput] = useState(formatTime(track.startTime, true));
  const [endInput, setEndInput] = useState(formatTime(track.endTime, true));
  const [isEditingTrim, setIsEditingTrim] = useState(false);
  
  // Dragging trim handles state
  const [draggingHandle, setDraggingHandle] = useState(null); // 'left' | 'right' | null

  // Fallback defaults for i18n
  const t = {
    crossfade: i18n?.crossfade || 'Crossfade',
    crossfadeTooltip: i18n?.crossfadeTooltip || 'Enable crossfade to next track',
    moveUp: i18n?.moveUp || 'Move Track Up',
    moveDown: i18n?.moveDown || 'Move Track Down',
    delete: i18n?.delete || 'Remove Track',
    preview: i18n?.preview || 'Preview Track',
    pause: i18n?.pause || 'Pause Track',
    trimLabel: i18n?.trimLabel || 'Trim:',
    start: i18n?.start || 'Start',
    end: i18n?.end || 'End',
    apply: i18n?.apply || 'Apply',
    reset: i18n?.reset || 'Reset',
    resetTooltip: i18n?.resetTooltip || 'Reset Trim to Full Length',
    mute: i18n?.mute || 'Mute',
    unmute: i18n?.unmute || 'Unmute',
    startHandle: i18n?.startHandle || 'START',
    endHandle: i18n?.endHandle || 'END',
  };

  // Sync inputs if track props change externally
  useEffect(() => {
    setStartInput(formatTime(track.startTime, true));
    setEndInput(formatTime(track.endTime, true));
  }, [track.startTime, track.endTime]);

  // Helper to determine active waveform colors based on dark mode
  const getWaveColors = () => {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    return {
      waveColor: isDark ? '#475569' : '#94a3b8',
      progressColor: isDark ? '#2dd4bf' : '#0d9488',
      cursorColor: isDark ? '#5eead4' : '#0f766e',
    };
  };

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    const colors = getWaveColors();

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: colors.waveColor,
      progressColor: colors.progressColor,
      cursorColor: colors.cursorColor,
      cursorWidth: 2,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      height: 52,
      normalize: true,
      url: track.url,
    });

    ws.on('ready', () => {
      setIsWaveReady(true);
      if (track.startTime > 0) {
        ws.setTime(track.startTime);
      }
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => {
      setIsPlaying(false);
      ws.setTime(track.startTime || 0);
    });

    ws.on('timeupdate', (time) => {
      setCurrentTime(time);
      if (track.endTime && time >= track.endTime) {
        ws.pause();
        ws.setTime(track.startTime || 0);
      }
    });

    wavesurferRef.current = ws;

    // Listen for theme changes to dynamically update WaveSurfer colors
    const handleThemeChange = (e) => {
      const isDark = e.detail?.theme === 'dark';
      ws.setOptions({
        waveColor: isDark ? '#475569' : '#94a3b8',
        progressColor: isDark ? '#2dd4bf' : '#0d9488',
        cursorColor: isDark ? '#5eead4' : '#0f766e',
      });
    };

    window.addEventListener('theme-change', handleThemeChange);

    return () => {
      window.removeEventListener('theme-change', handleThemeChange);
      try {
        ws.destroy();
      } catch (e) {
        // Ignore destruction errors
      }
    };
  }, [track.url]);

  const handlePlayPause = useCallback(
    (e) => {
      e.stopPropagation();
      if (!wavesurferRef.current || !isWaveReady) return;

      if (isPlaying) {
        wavesurferRef.current.pause();
      } else {
        const pos = wavesurferRef.current.getCurrentTime();
        if (pos < track.startTime || (track.endTime && pos >= track.endTime)) {
          wavesurferRef.current.setTime(track.startTime || 0);
        }
        wavesurferRef.current.play();
      }
    },
    [isPlaying, isWaveReady, track.startTime, track.endTime]
  );

  const handleApplyTrim = () => {
    const s = Math.max(0, Math.min(parseTimeToSeconds(startInput), track.duration - 0.1));
    let e = parseTimeToSeconds(endInput);
    if (e <= s || e > track.duration) {
      e = track.duration;
    }

    onUpdateTrim(track.id, s, e);
    setStartInput(formatTime(s, true));
    setEndInput(formatTime(e, true));
    if (wavesurferRef.current) {
      wavesurferRef.current.setTime(s);
    }
    setIsEditingTrim(false);
  };

  const handleResetTrim = (e) => {
    e.stopPropagation();
    onUpdateTrim(track.id, 0, track.duration);
    setStartInput(formatTime(0, true));
    setEndInput(formatTime(track.duration, true));
    if (wavesurferRef.current) {
      wavesurferRef.current.setTime(0);
    }
  };

  const handleToggleMute = (e) => {
    e.stopPropagation();
    if (!wavesurferRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    wavesurferRef.current.setVolume(nextMute ? 0 : volume);
  };

  const handleVolumeChange = (e) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(val);
      setIsMuted(val === 0);
    }
  };

  // Draggable Trim Handles Logic
  const handleStartDrag = (handle, e) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingHandle(handle);
  };

  useEffect(() => {
    if (!draggingHandle) return;

    const handlePointerMove = (clientX) => {
      if (!waveformWrapperRef.current || !track.duration) return;
      const rect = waveformWrapperRef.current.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, relativeX / rect.width));
      const targetTime = ratio * track.duration;

      if (draggingHandle === 'left') {
        const newStart = Math.max(0, Math.min(targetTime, (track.endTime || track.duration) - 0.2));
        onUpdateTrim(track.id, newStart, track.endTime || track.duration);
        setStartInput(formatTime(newStart, true));
        if (wavesurferRef.current) {
          wavesurferRef.current.setTime(newStart);
        }
      } else if (draggingHandle === 'right') {
        const newEnd = Math.min(track.duration, Math.max(targetTime, (track.startTime || 0) + 0.2));
        onUpdateTrim(track.id, track.startTime || 0, newEnd);
        setEndInput(formatTime(newEnd, true));
      }
    };

    const onMouseMove = (e) => handlePointerMove(e.clientX);
    const onTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        handlePointerMove(e.touches[0].clientX);
      }
    };

    const onEndDrag = () => {
      setDraggingHandle(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEndDrag);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onEndDrag);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEndDrag);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEndDrag);
    };
  }, [draggingHandle, track.id, track.duration, track.startTime, track.endTime, onUpdateTrim]);

  // Calculate visual trim boundary percentages for overlay and handle positions
  const trimStartPct = track.duration ? (track.startTime / track.duration) * 100 : 0;
  const trimEndPct = track.duration ? ((track.duration - track.endTime) / track.duration) * 100 : 0;
  const rightHandlePosPct = track.duration ? (track.endTime / track.duration) * 100 : 100;
  const trimmedDuration = Math.max(0, track.endTime - track.startTime);

  return (
    <div
      onClick={() => onSelect(track.id)}
      className={`group relative rounded-xl border transition-all duration-200 cursor-pointer select-none ${
        isActive
          ? 'border-teal-500 bg-white dark:bg-slate-900 shadow-md ring-1 ring-teal-500/30 dark:ring-teal-500/40'
          : 'border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900 shadow-2xs'
      }`}
    >
      <div className="p-3 sm:p-4">
        {/* Track Top Row Header */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 mb-2.5">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            {/* Track Index Badge */}
            <span
              className={`w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-xs font-mono font-bold transition-colors ${
                isActive
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
              }`}
            >
              {String(index + 1).padStart(2, '0')}
            </span>

            {/* Track Name & Metadata */}
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate leading-snug">
                {track.name}
              </h3>
              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="font-mono text-teal-700 dark:text-teal-300 font-medium bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.2 rounded border border-teal-100 dark:border-teal-900">
                  {formatTime(trimmedDuration, true)}
                </span>
                {trimmedDuration < track.duration && (
                  <span className="text-slate-400 dark:text-slate-600 line-through">
                    {formatTime(track.duration, true)}
                  </span>
                )}
                <span>•</span>
                <span>{formatBytes(track.size)}</span>
              </div>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Crossfade Toggle (if not the last track) */}
            {index < totalTracks - 1 && (
              <button
                type="button"
                onClick={() => onToggleCrossfade(track.id)}
                title={track.crossfade ? `${t.crossfade}: ${track.crossfadeDuration || 2}s` : t.crossfadeTooltip}
                className={`flex items-center gap-1 text-[11px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-full border transition-all ${
                  track.crossfade
                    ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 font-medium shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Sparkles className={`w-3 h-3 ${track.crossfade ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
                <span className="hidden md:inline">{t.crossfade}</span>
                {track.crossfade && (
                  <span className="text-[10px] font-mono text-teal-700 dark:text-teal-300">
                    {track.crossfadeDuration || 2}s
                  </span>
                )}
              </button>
            )}

            {/* Move Up */}
            <button
              type="button"
              disabled={index === 0}
              onClick={() => onMoveUp(index)}
              title={t.moveUp}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ArrowUp className="w-4 h-4" />
            </button>

            {/* Move Down */}
            <button
              type="button"
              disabled={index === totalTracks - 1}
              onClick={() => onMoveDown(index)}
              title={t.moveDown}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ArrowDown className="w-4 h-4" />
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={() => onDelete(track.id)}
              title={t.delete}
              className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Waveform & Playback Area */}
        <div className="relative flex items-center gap-2.5 sm:gap-3 bg-slate-50/90 dark:bg-slate-950/80 rounded-lg p-2 sm:p-2.5 border border-slate-200/80 dark:border-slate-800">
          {/* Individual Track Play/Pause Button */}
          <button
            type="button"
            onClick={handlePlayPause}
            disabled={!isWaveReady}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              isPlaying
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-xs'
            }`}
            title={isPlaying ? t.pause : t.preview}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5" />}
          </button>

          {/* Waveform Container with Dual Interactive Draggable Trim Lines */}
          <div
            ref={waveformWrapperRef}
            className="relative flex-1 h-12 sm:h-14 flex items-center overflow-visible rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs"
          >
            {/* Waveform Canvas Host */}
            <div ref={containerRef} className="w-full overflow-hidden rounded" />

            {/* Left Trim Dimmed Mask */}
            {trimStartPct > 0 && (
              <div
                style={{ width: `${trimStartPct}%` }}
                className="absolute top-0 bottom-0 left-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-[1px] pointer-events-none rounded-l"
              />
            )}

            {/* Right Trim Dimmed Mask */}
            {trimEndPct > 0 && (
              <div
                style={{ width: `${trimEndPct}%` }}
                className="absolute top-0 bottom-0 right-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-[1px] pointer-events-none rounded-r"
              />
            )}

            {/* Left Draggable Trim Handle / Line */}
            <div
              style={{ left: `${trimStartPct}%` }}
              onMouseDown={(e) => handleStartDrag('left', e)}
              onTouchStart={(e) => handleStartDrag('left', e)}
              className="absolute top-0 bottom-0 w-6 -ml-3 z-30 cursor-col-resize group/handle flex flex-col items-center justify-between select-none"
              title={t.start}
            >
              {/* Start Handle Top Pill Indicator */}
              <div
                className={`text-[8px] sm:text-[9px] font-mono font-bold px-1 sm:px-1.5 py-0.5 rounded-t-md shadow-xs transition-colors ${
                  draggingHandle === 'left'
                    ? 'bg-teal-600 text-white scale-110'
                    : 'bg-slate-800 dark:bg-slate-700 text-white group-hover/handle:bg-teal-600'
                }`}
              >
                {draggingHandle === 'left' ? formatTime(track.startTime, true) : t.startHandle}
              </div>

              {/* Vertical Drag Line */}
              <div
                className={`w-1 flex-1 transition-colors ${
                  draggingHandle === 'left'
                    ? 'bg-teal-500 shadow-[0_0_8px_rgba(13,148,136,0.8)]'
                    : 'bg-teal-600/90 dark:bg-teal-500/90 group-hover/handle:bg-teal-500'
                }`}
              />

              {/* Start Handle Bottom Grip Notch */}
              <div
                className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full flex items-center justify-center shadow-xs transition-transform ${
                  draggingHandle === 'left'
                    ? 'bg-teal-600 text-white scale-125'
                    : 'bg-white dark:bg-slate-900 border border-teal-500 text-teal-700 group-hover/handle:scale-110'
                }`}
              >
                <div className="w-1.5 h-1.5 bg-teal-600 rounded-full" />
              </div>
            </div>

            {/* Right Draggable Trim Handle / Line */}
            <div
              style={{ left: `${rightHandlePosPct}%` }}
              onMouseDown={(e) => handleStartDrag('right', e)}
              onTouchStart={(e) => handleStartDrag('right', e)}
              className="absolute top-0 bottom-0 w-6 -ml-3 z-30 cursor-col-resize group/handle flex flex-col items-center justify-between select-none"
              title={t.end}
            >
              {/* End Handle Top Pill Indicator */}
              <div
                className={`text-[8px] sm:text-[9px] font-mono font-bold px-1 sm:px-1.5 py-0.5 rounded-t-md shadow-xs transition-colors ${
                  draggingHandle === 'right'
                    ? 'bg-amber-600 text-white scale-110'
                    : 'bg-slate-800 dark:bg-slate-700 text-white group-hover/handle:bg-amber-600'
                }`}
              >
                {draggingHandle === 'right' ? formatTime(track.endTime, true) : t.endHandle}
              </div>

              {/* Vertical Drag Line */}
              <div
                className={`w-1 flex-1 transition-colors ${
                  draggingHandle === 'right'
                    ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                    : 'bg-amber-500/90 group-hover/handle:bg-amber-400'
                }`}
              />

              {/* End Handle Bottom Grip Notch */}
              <div
                className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full flex items-center justify-center shadow-xs transition-transform ${
                  draggingHandle === 'right'
                    ? 'bg-amber-600 text-white scale-125'
                    : 'bg-white dark:bg-slate-900 border border-amber-500 text-amber-700 group-hover/handle:scale-110'
                }`}
              >
                <div className="w-1.5 h-1.5 bg-amber-600 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Trimming & Volume Controls Sub-bar */}
        <div
          className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs pt-2 border-t border-slate-100 dark:border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Start & End Trim Inputs (Synced with Draggable Lines) */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
              <Scissors className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              <span>{t.trimLabel}</span>
            </span>

            <div className="flex items-center gap-1">
              <label className="text-[10px] sm:text-[11px] text-teal-700 dark:text-teal-300 font-semibold bg-teal-50 dark:bg-teal-950/60 px-1 rounded">{t.start}</label>
              <input
                type="text"
                value={startInput}
                onChange={(e) => {
                  setStartInput(e.target.value);
                  setIsEditingTrim(true);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyTrim()}
                placeholder="00:00.0"
                className="w-16 sm:w-18 px-1.5 sm:px-2 py-1 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-center"
              />
            </div>

            <div className="flex items-center gap-1">
              <label className="text-[10px] sm:text-[11px] text-amber-700 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-950/60 px-1 rounded">{t.end}</label>
              <input
                type="text"
                value={endInput}
                onChange={(e) => {
                  setEndInput(e.target.value);
                  setIsEditingTrim(true);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyTrim()}
                placeholder="00:00.0"
                className="w-16 sm:w-18 px-1.5 sm:px-2 py-1 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-center"
              />
            </div>

            {isEditingTrim ? (
              <button
                type="button"
                onClick={handleApplyTrim}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-medium shadow-xs transition-colors"
              >
                <Check className="w-3 h-3" />
                <span>{t.apply}</span>
              </button>
            ) : (
              (track.startTime > 0 || track.endTime < track.duration) && (
                <button
                  type="button"
                  onClick={handleResetTrim}
                  title={t.resetTooltip}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] transition-colors"
                >
                  <RotateCcw className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                  <span>{t.reset}</span>
                </button>
              )
            )}

            <span className="text-[11px] text-slate-400 dark:text-slate-500 italic hidden lg:inline">
              {tipDrag}
            </span>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleToggleMute}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              title={isMuted ? t.unmute : t.mute}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-14 sm:w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
