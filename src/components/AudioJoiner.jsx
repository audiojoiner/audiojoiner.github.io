import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Upload,
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  Download,
  Music,
  Settings2,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import TrackItem from './TrackItem.jsx';
import {
  mergeAudioTracks,
  decodeAudioMetadata,
  OUTPUT_FORMATS,
  BITRATE_OPTIONS,
} from '../utils/audioEngine.js';
import {
  createSafeObjectURL,
  cleanupTrackUrls,
  cleanupAllSafeObjectURLs,
} from '../utils/memory.js';
import { formatTime, formatBytes } from '../utils/formatters.js';

export default function AudioJoiner({ i18n = {} }) {
  const [tracks, setTracks] = useState([]);
  const [activeTrackId, setActiveTrackId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Global Playback State
  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false);
  const [globalCurrentTime, setGlobalCurrentTime] = useState(0);
  const [currentPlayingTrackIndex, setCurrentPlayingTrackIndex] = useState(0);
  const globalAudioRef = useRef(null);

  // Export State
  const [selectedFormat, setSelectedFormat] = useState('mp3');
  const [selectedBitrate, setSelectedBitrate] = useState('320k');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState('');
  const [exportResult, setExportResult] = useState(null);
  const [exportError, setExportError] = useState(null);

  const fileInputRef = useRef(null);

  // Fallback defaults for i18n dictionary
  const t = {
    dropTitle: i18n?.dropTitle || 'Drag & Drop audio files here',
    dropSubtitle: i18n?.dropSubtitle || 'Supports MP3, WAV, M4A, FLAC, OGG, and AAC. Files stay 100% on your device.',
    addFiles: i18n?.addFiles || 'Add audio files',
    loadingFiles: i18n?.loadingFiles || 'Loading Files...',
    loadDemo: i18n?.loadDemo || 'Load Demo Tracks',
    playAll: i18n?.playAll || 'Play All in Sequence',
    pauseAll: i18n?.pauseAll || 'Pause All',
    stopTimeline: i18n?.stopTimeline || 'Stop & Reset Timeline',
    tracksSingular: i18n?.tracksSingular || 'Track',
    tracksPlural: i18n?.tracksPlural || 'Tracks',
    total: i18n?.total || 'Total',
    addTrack: i18n?.addTrack || 'Add Track',
    clearAll: i18n?.clearAll || 'Clear All Tracks',
    confirmClear: i18n?.confirmClear || 'Are you sure you want to remove all audio tracks?',
    exportConfig: i18n?.exportConfig || 'Export Configuration',
    formatLabel: i18n?.formatLabel || 'Format:',
    bitrateLabel: i18n?.bitrateLabel || 'Bitrate:',
    readyPrefix: i18n?.readyPrefix || 'Ready to concatenate',
    readySuffix: i18n?.readySuffix || 'tracks into high-fidelity',
    joinButton: i18n?.joinButton || 'Join & Export Audio',
    processing: i18n?.processing || 'Processing',
    exportFailed: i18n?.exportFailed || 'Export Failed',
    exportSuccess: i18n?.exportSuccess || 'Audio Merged Successfully!',
    downloadFile: i18n?.downloadFile || 'Download File',
    tipDrag: i18n?.tipDrag || '(Tip: Drag the vertical START & END lines on the waveform)',
    track: i18n?.track || {},
  };

  // Clean up all object URLs when the component unmounts
  useEffect(() => {
    return () => {
      cleanupAllSafeObjectURLs();
    };
  }, []);

  // Calculate total combined time considering trimmed start/ends and crossfades
  const totalCombinedDuration = useMemo(() => {
    if (tracks.length === 0) return 0;
    let total = 0;
    tracks.forEach((t, i) => {
      const dur = Math.max(0, (t.endTime || t.duration) - (t.startTime || 0));
      let overlap = 0;
      if (i < tracks.length - 1 && t.crossfade) {
        overlap = Math.min(t.crossfadeDuration || 2, dur);
      }
      total += Math.max(0, dur - overlap);
    });
    return total;
  }, [tracks]);

  // Calculate total file size
  const totalRawSize = useMemo(() => {
    return tracks.reduce((acc, t) => acc + (t.size || 0), 0);
  }, [tracks]);

  // Handle adding new audio files
  const processAudioFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setIsLoadingFiles(true);

    const newTrackItems = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|aac|ogg|flac|wma|opus|webm)$/i)) {
        continue;
      }

      try {
        const objectUrl = createSafeObjectURL(file);
        const metadata = await decodeAudioMetadata(file);

        const trackItem = {
          id: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          file,
          name: file.name.replace(/\.[^/.]+$/, ''),
          originalName: file.name,
          size: file.size,
          duration: metadata.duration || 0,
          startTime: 0,
          endTime: metadata.duration || 0,
          crossfade: false,
          crossfadeDuration: 2,
          url: objectUrl,
        };

        newTrackItems.push(trackItem);
      } catch (err) {
        console.error('Error processing audio file:', file.name, err);
      }
    }

    setTracks((prev) => {
      const updated = [...prev, ...newTrackItems];
      if (!activeTrackId && updated.length > 0) {
        setActiveTrackId(updated[0].id);
      }
      return updated;
    });

    setIsLoadingFiles(false);
  };

  // Demo audio loader (Generates 2 synth tone audio buffers for quick testing)
  const handleLoadDemoTracks = async () => {
    setIsLoadingFiles(true);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();

      // Track 1: Gentle chord (440Hz A4)
      const buffer1 = ctx.createBuffer(2, ctx.sampleRate * 3.5, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer1.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          const t = i / ctx.sampleRate;
          data[i] = Math.sin(2 * Math.PI * 440 * t) * Math.exp(-t * 0.5) * 0.3;
        }
      }

      // Track 2: Upbeat melody chord (554.37Hz C#5)
      const buffer2 = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer2.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          const t = i / ctx.sampleRate;
          data[i] = Math.sin(2 * Math.PI * 554.37 * t) * Math.exp(-t * 0.4) * 0.3;
        }
      }

      // Helper to convert AudioBuffer to WAV Blob
      const audioBufferToWavBlob = (audioBuffer) => {
        const numOfChan = audioBuffer.numberOfChannels;
        const length = audioBuffer.length * numOfChan * 2 + 44;
        const outBuffer = new ArrayBuffer(length);
        const view = new DataView(outBuffer);
        let channels = [], sampleRate = audioBuffer.sampleRate, offset = 0, pos = 0;

        function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
        function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8);
        setUint32(0x45564157); // "WAVE"
        setUint32(0x20746d66); // "fmt "
        setUint32(16);
        setUint16(1); // PCM
        setUint16(numOfChan);
        setUint32(sampleRate);
        setUint32(sampleRate * 2 * numOfChan);
        setUint16(numOfChan * 2);
        setUint16(16);
        setUint32(0x61746164); // "data"
        setUint32(length - pos - 4);

        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
          channels.push(audioBuffer.getChannelData(i));
        }

        while (offset < audioBuffer.length) {
          for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
          }
          offset++;
        }
        return new Blob([view], { type: 'audio/wav' });
      };

      const blob1 = audioBufferToWavBlob(buffer1);
      const blob2 = audioBufferToWavBlob(buffer2);
      await ctx.close();

      const file1 = new File([blob1], 'Demo_Acoustic_Chime.wav', { type: 'audio/wav' });
      const file2 = new File([blob2], 'Demo_Ambient_Swell.wav', { type: 'audio/wav' });

      await processAudioFiles([file1, file2]);
    } catch (e) {
      console.error('Demo tracks error:', e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Drag and Drop event handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processAudioFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processAudioFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  // Track manipulation handlers
  const handleUpdateTrim = (id, start, end) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, startTime: start, endTime: end } : t))
    );
  };

  const handleToggleCrossfade = (id) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, crossfade: !t.crossfade } : t))
    );
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    setTracks((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleMoveDown = (index) => {
    if (index === tracks.length - 1) return;
    setTracks((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleDeleteTrack = (id) => {
    const trackToDelete = tracks.find((t) => t.id === id);
    if (trackToDelete) {
      cleanupTrackUrls(trackToDelete);
    }
    setTracks((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (activeTrackId === id) {
        setActiveTrackId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  };

  const handleClearAll = () => {
    if (tracks.length === 0) return;
    if (window.confirm(t.confirmClear)) {
      cleanupAllSafeObjectURLs();
      setTracks([]);
      setActiveTrackId(null);
      setExportResult(null);
      setExportError(null);
      setIsGlobalPlaying(false);
      setGlobalCurrentTime(0);
    }
  };

  // Global Playback Engine
  const stopGlobalPlayback = useCallback(() => {
    if (globalAudioRef.current) {
      globalAudioRef.current.pause();
      globalAudioRef.current.src = '';
    }
    setIsGlobalPlaying(false);
    setGlobalCurrentTime(0);
    setCurrentPlayingTrackIndex(0);
  }, []);

  const playTrackAtIndex = useCallback(
    (index) => {
      if (index >= tracks.length) {
        stopGlobalPlayback();
        return;
      }

      const track = tracks[index];
      setCurrentPlayingTrackIndex(index);

      if (!globalAudioRef.current) {
        globalAudioRef.current = new Audio();
      }

      const audio = globalAudioRef.current;
      audio.src = track.url;
      audio.currentTime = track.startTime || 0;

      audio.onended = () => {
        playTrackAtIndex(index + 1);
      };

      audio.ontimeupdate = () => {
        if (track.endTime && audio.currentTime >= track.endTime) {
          playTrackAtIndex(index + 1);
          return;
        }

        // Calculate global elapsed time
        let elapsedBefore = 0;
        for (let i = 0; i < index; i++) {
          const t = tracks[i];
          elapsedBefore += Math.max(0, (t.endTime || t.duration) - (t.startTime || 0));
        }
        const currentInTrack = Math.max(0, audio.currentTime - (track.startTime || 0));
        setGlobalCurrentTime(elapsedBefore + currentInTrack);
      };

      audio.play().catch((e) => {
        console.warn('Playback interrupted:', e);
      });
      setIsGlobalPlaying(true);
    },
    [tracks, stopGlobalPlayback]
  );

  const toggleGlobalPlayPause = () => {
    if (tracks.length === 0) return;

    if (isGlobalPlaying) {
      if (globalAudioRef.current) {
        globalAudioRef.current.pause();
      }
      setIsGlobalPlaying(false);
    } else {
      playTrackAtIndex(currentPlayingTrackIndex);
    }
  };

  // Start FFmpeg Export Action
  const handleStartJoin = async () => {
    if (tracks.length === 0 || isExporting) return;

    stopGlobalPlayback();
    setIsExporting(true);
    setExportProgress(0);
    setExportStage('Starting audio engine...');
    setExportError(null);
    setExportResult(null);

    try {
      const result = await mergeAudioTracks({
        tracks,
        format: selectedFormat,
        bitrate: selectedBitrate,
        onProgress: ({ percent, stage }) => {
          setExportProgress(percent);
          setExportStage(stage);
        },
      });

      setExportResult(result);
      setIsExporting(false);

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // ignore confetti errors
      }
    } catch (err) {
      console.error('Audio joining error:', err);
      setExportError(err.message || 'An error occurred while merging your audio files.');
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full">
      {/* Upload Zone & Actions when empty */}
      {tracks.length === 0 ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center transition-all bg-white dark:bg-slate-900 shadow-2xs ${
            isDragging
              ? 'border-teal-500 bg-teal-50/40 dark:bg-teal-950/40 scale-[1.005]'
              : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,.webm"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-900 flex items-center justify-center text-teal-600 dark:text-teal-400 mb-3 sm:mb-4 shadow-2xs">
            <Upload className="w-7 h-7 sm:w-8 sm:h-8 stroke-[1.75]" />
          </div>

          <h2 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {t.dropTitle}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-5 sm:mb-6">
            {t.dropSubtitle}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingFiles}
              className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold shadow-md hover:shadow-lg transition-all"
            >
              {isLoadingFiles ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.loadingFiles}</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>{t.addFiles}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleLoadDemoTracks}
              disabled={isLoadingFiles}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-3 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium transition-all"
            >
              <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>{t.loadDemo}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Active DAW Workspace Layout */
        <div className="space-y-4 sm:space-y-6">
          {/* Top Master Transport Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-3.5 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
            {/* Playback Controls & Scrubber */}
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={toggleGlobalPlayPause}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-500 text-white flex items-center justify-center shadow-md transition-transform active:scale-95 flex-shrink-0"
                title={isGlobalPlaying ? t.pauseAll : t.playAll}
              >
                {isGlobalPlaying ? (
                  <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={stopGlobalPlayback}
                className="p-2 sm:p-2.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
                title={t.stopTimeline}
              >
                <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {/* Master Timecode Tracker */}
              <div className="bg-slate-950 text-teal-400 border border-slate-800 font-mono px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-base tracking-wider flex items-center gap-1.5 sm:gap-2 shadow-inner min-w-0">
                <span className="font-bold">{formatTime(globalCurrentTime, true)}</span>
                <span className="text-slate-600">/</span>
                <span className="text-slate-300 font-medium">
                  {formatTime(totalCombinedDuration, true)}
                </span>
              </div>
            </div>

            {/* Quick Track Stack Stats & Actions */}
            <div className="flex items-center flex-wrap justify-between md:justify-end gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium">
                  {tracks.length} {tracks.length === 1 ? t.tracksSingular : t.tracksPlural}
                </span>
                <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium">
                  {formatBytes(totalRawSize)} {t.total}
                </span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.addTrack}</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearAll}
                  className="p-1 sm:p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  title={t.clearAll}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,.webm"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Track Stack List (DAW Tracks) */}
          <div className="space-y-3">
            {tracks.map((track, index) => (
              <TrackItem
                key={track.id}
                track={track}
                index={index}
                totalTracks={tracks.length}
                isActive={activeTrackId === track.id}
                i18n={t.track}
                tipDrag={t.tipDrag}
                onSelect={(id) => setActiveTrackId(id)}
                onUpdateTrim={handleUpdateTrim}
                onToggleCrossfade={handleToggleCrossfade}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onDelete={handleDeleteTrack}
              />
            ))}
          </div>

          {/* Bottom Export Configuration & Primary Join Action */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-semibold text-xs sm:text-sm">
                <Settings2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>{t.exportConfig}</span>
              </div>

              {/* Format & Bitrate Selectors */}
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <label className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">{t.formatLabel}</label>
                  <select
                    value={selectedFormat}
                    onChange={(e) => setSelectedFormat(e.target.value)}
                    className="px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  >
                    {Object.entries(OUTPUT_FORMATS).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.label}
                      </option>
                    ))}
                  </select>
                </div>

                {OUTPUT_FORMATS[selectedFormat]?.supportsBitrate && (
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <label className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">{t.bitrateLabel}</label>
                    <select
                      value={selectedBitrate}
                      onChange={(e) => setSelectedBitrate(e.target.value)}
                      className="px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    >
                      {BITRATE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Primary Action Button & Export State */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
              <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                <span>
                  {t.readyPrefix} {tracks.length} {t.readySuffix}{' '}
                  <strong className="text-slate-700 dark:text-slate-200 uppercase">{selectedFormat}</strong>.
                </span>
              </div>

              <button
                type="button"
                onClick={handleStartJoin}
                disabled={isExporting || tracks.length === 0}
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-3.5 rounded-full bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-500 text-white font-semibold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-teal-400 dark:text-white" />
                    <span>{t.processing} ({exportProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Music className="w-4 h-4 text-teal-400 dark:text-teal-200" />
                    <span>{t.joinButton}</span>
                  </>
                )}
              </button>
            </div>

            {/* In-flight Export Progress Bar */}
            {isExporting && (
              <div className="pt-2 sm:pt-3 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300 font-medium">{exportStage}</span>
                  <span className="font-mono text-teal-700 dark:text-teal-400 font-bold">{exportProgress}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-teal-500 to-teal-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {exportError && (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold mb-1">{t.exportFailed}</p>
                  <p>{exportError}</p>
                </div>
              </div>
            )}

            {/* Export Success Box */}
            {exportResult && (
              <div className="p-4 sm:p-5 rounded-xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-slate-800 dark:text-slate-100 space-y-3 animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm text-teal-950 dark:text-teal-200">{t.exportSuccess}</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {exportResult.fileName} • {formatBytes(exportResult.size)}
                      </p>
                    </div>
                  </div>

                  <a
                    href={exportResult.url}
                    download={exportResult.fileName}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t.downloadFile}</span>
                  </a>
                </div>

                {/* Built-in Preview Player */}
                <div className="pt-2">
                  <audio
                    src={exportResult.url}
                    controls
                    className="w-full h-10 rounded-lg focus:outline-hidden"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
