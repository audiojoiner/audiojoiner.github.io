import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { createSafeObjectURL } from './memory.js';

let ffmpegInstance = null;
let isFfmpegLoading = false;
let ffmpegLoadPromise = null;

/**
 * Supported output formats and their FFmpeg encoder configurations.
 */
export const OUTPUT_FORMATS = {
  mp3: {
    label: 'MP3 (MPEG Audio Layer 3)',
    ext: 'mp3',
    mimeType: 'audio/mpeg',
    codec: 'libmp3lame',
    supportsBitrate: true,
    defaultBitrate: '320k',
  },
  wav: {
    label: 'WAV (Lossless 16-bit PCM)',
    ext: 'wav',
    mimeType: 'audio/wav',
    codec: 'pcm_s16le',
    supportsBitrate: false,
    defaultBitrate: null,
  },
  m4a: {
    label: 'M4A (AAC Audio)',
    ext: 'm4a',
    mimeType: 'audio/mp4',
    codec: 'aac',
    supportsBitrate: true,
    defaultBitrate: '256k',
  },
  ogg: {
    label: 'OGG (Vorbis Audio)',
    ext: 'ogg',
    mimeType: 'audio/ogg',
    codec: 'libvorbis',
    supportsBitrate: true,
    defaultBitrate: '192k',
  },
  flac: {
    label: 'FLAC (Free Lossless Audio Codec)',
    ext: 'flac',
    mimeType: 'audio/flac',
    codec: 'flac',
    supportsBitrate: false,
    defaultBitrate: null,
  },
};

/**
 * Available bitrate options for compressed formats.
 */
export const BITRATE_OPTIONS = [
  { label: '320 kbps (Ultra High)', value: '320k' },
  { label: '256 kbps (High Quality)', value: '256k' },
  { label: '192 kbps (Standard)', value: '192k' },
  { label: '128 kbps (Compact)', value: '128k' },
];

/**
 * Initializes and loads FFmpeg.wasm asynchronously from unpkg ESM CDN.
 * Uses single-threaded core for 100% universal browser and static hosting compatibility.
 * @param {Function} [onStatus] - Optional status progress callback
 * @returns {Promise<FFmpeg>}
 */
export async function getFFmpegInstance(onStatus) {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  if (isFfmpegLoading && ffmpegLoadPromise) {
    return ffmpegLoadPromise;
  }

  isFfmpegLoading = true;
  if (onStatus) onStatus('Loading FFmpeg WebAssembly engine...');

  ffmpegLoadPromise = (async () => {
    try {
      const ffmpeg = new FFmpeg();

      ffmpeg.on('log', ({ message }) => {
        // Suppress or log debug lines
        if (import.meta.env?.DEV) {
          console.debug('[FFmpeg]', message);
        }
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

      await ffmpeg.load({
        coreURL,
        wasmURL,
      });

      ffmpegInstance = ffmpeg;
      isFfmpegLoading = false;
      return ffmpeg;
    } catch (error) {
      isFfmpegLoading = false;
      ffmpegLoadPromise = null;
      console.error('Failed to load FFmpeg.wasm:', error);
      throw new Error(
        'Failed to initialize WebAssembly audio engine. Please verify your internet connection and try again.'
      );
    }
  })();

  return ffmpegLoadPromise;
}

/**
 * Decodes audio buffer using browser Web Audio API to get precise metadata (duration, sample rate, channels).
 * @param {File | Blob} file
 * @returns {Promise<{ duration: number, sampleRate: number, numberOfChannels: number, audioBuffer: AudioBuffer }>}
 */
export async function decodeAudioMetadata(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    await ctx.close();
    return { duration, sampleRate, numberOfChannels, audioBuffer };
  } catch (err) {
    await ctx.close();
    // Fallback: estimate using HTML5 Audio element
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      audio.src = url;
      audio.onloadedmetadata = () => {
        const dur = audio.duration;
        URL.revokeObjectURL(url);
        resolve({ duration: dur, sampleRate: 44100, numberOfChannels: 2, audioBuffer: null });
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Unable to read audio metadata for ${file.name}`));
      };
    });
  }
}

/**
 * Builds FFmpeg complex filter graph string for trimming, volume normalization, and concatenation/crossfading.
 * @param {Array<Object>} tracks - Array of processed track objects
 * @returns {{ filterGraph: string, outputNode: string }}
 */
function buildFilterGraph(tracks) {
  if (tracks.length === 1) {
    const t = tracks[0];
    const s = Math.max(0, t.startTime || 0);
    const e = t.endTime && t.endTime > s ? t.endTime : t.duration;
    return {
      filterGraph: `[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS[outa]`,
      outputNode: '[outa]',
    };
  }

  const trimNodes = [];
  const filterParts = [];

  // Step 1: Trim each input file and reset timestamps
  tracks.forEach((track, idx) => {
    const s = Math.max(0, track.startTime || 0);
    const e = track.endTime && track.endTime > s ? track.endTime : track.duration;
    const nodeName = `[a${idx}]`;
    filterParts.push(`[${idx}:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS${nodeName}`);
    trimNodes.push(nodeName);
  });

  // Step 2: Check if any track enables crossfade
  const hasCrossfade = tracks.some((t, i) => i < tracks.length - 1 && t.crossfade && (t.crossfadeDuration || 1) > 0);

  if (!hasCrossfade) {
    // Standard seamless concatenation
    const concatInput = trimNodes.join('');
    filterParts.push(`${concatInput}concat=n=${tracks.length}:v=0:a=1[outa]`);
    return {
      filterGraph: filterParts.join(';'),
      outputNode: '[outa]',
    };
  }

  // Crossfade chain construction
  let currentOutput = trimNodes[0];
  for (let i = 0; i < tracks.length - 1; i++) {
    const nextInput = trimNodes[i + 1];
    const isCrossfaded = tracks[i].crossfade;
    const duration = isCrossfaded ? Math.min(tracks[i].crossfadeDuration || 2, 5) : 0;
    const nextOut = i === tracks.length - 2 ? '[outa]' : `[xf${i}]`;

    if (duration > 0) {
      filterParts.push(`${currentOutput}${nextInput}acrossfade=d=${duration}:c1=tri:c2=tri${nextOut}`);
    } else {
      filterParts.push(`${currentOutput}${nextInput}concat=n=2:v=0:a=1${nextOut}`);
    }
    currentOutput = nextOut;
  }

  return {
    filterGraph: filterParts.join(';'),
    outputNode: '[outa]',
  };
}

/**
 * Main audio joining function.
 * Concatenates, trims, and applies crossfades to multiple audio files directly in the browser via FFmpeg.wasm.
 *
 * @param {Object} options
 * @param {Array<Object>} options.tracks - Array of track objects with { file, startTime, endTime, duration, crossfade, crossfadeDuration }
 * @param {string} [options.format='mp3'] - Target format ('mp3', 'wav', 'm4a', 'ogg', 'flac')
 * @param {string} [options.bitrate='320k'] - Target bitrate for lossy formats
 * @param {Function} [options.onProgress] - Progress callback ({ percent: number, stage: string })
 * @returns {Promise<{ blob: Blob, url: string, fileName: string, size: number }>}
 */
export async function mergeAudioTracks({
  tracks,
  format = 'mp3',
  bitrate = '320k',
  onProgress = () => {},
}) {
  if (!tracks || tracks.length === 0) {
    throw new Error('Please add at least one audio track to merge.');
  }

  onProgress({ percent: 5, stage: 'Initializing WebAssembly audio engine...' });
  const ffmpeg = await getFFmpegInstance((msg) => {
    onProgress({ percent: 10, stage: msg });
  });

  const targetFormat = OUTPUT_FORMATS[format] || OUTPUT_FORMATS.mp3;
  const outputFileName = `output_${Date.now()}.${targetFormat.ext}`;
  const writtenFiles = [];

  try {
    onProgress({ percent: 15, stage: 'Preparing audio files...' });

    // Write all input files to virtual filesystem
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const virtualInputName = `input_${i}_${Date.now()}.${track.file.name.split('.').pop() || 'tmp'}`;
      const fileData = await fetchFile(track.file);
      await ffmpeg.writeFile(virtualInputName, fileData);
      writtenFiles.push(virtualInputName);

      const percent = 15 + Math.floor(((i + 1) / tracks.length) * 20);
      onProgress({
        percent,
        stage: `Loaded track ${i + 1} of ${tracks.length} (${track.name})...`,
      });
    }

    // Build FFmpeg command arguments
    const ffmpegArgs = [];

    // Inputs
    writtenFiles.forEach((file) => {
      ffmpegArgs.push('-i', file);
    });

    // Filter Graph
    const { filterGraph, outputNode } = buildFilterGraph(tracks);
    ffmpegArgs.push('-filter_complex', filterGraph);
    ffmpegArgs.push('-map', outputNode);

    // Audio Codec & Quality
    ffmpegArgs.push('-c:a', targetFormat.codec);

    if (targetFormat.supportsBitrate && bitrate) {
      ffmpegArgs.push('-b:a', bitrate);
    }

    // Output File
    ffmpegArgs.push(outputFileName);

    onProgress({ percent: 45, stage: 'Processing audio tracks (joining, trimming & rendering)...' });

    // Track execution progress
    const progressHandler = ({ progress }) => {
      const clamped = Math.max(0, Math.min(1, progress));
      const currentPct = 45 + Math.floor(clamped * 45);
      onProgress({
        percent: currentPct,
        stage: `Rendering audio: ${Math.round(clamped * 100)}% complete...`,
      });
    };

    ffmpeg.on('progress', progressHandler);

    // Execute FFmpeg
    await ffmpeg.exec(ffmpegArgs);

    ffmpeg.off('progress', progressHandler);

    onProgress({ percent: 92, stage: 'Finalizing merged audio file...' });

    // Read result
    const outputData = await ffmpeg.readFile(outputFileName);
    const resultBlob = new Blob([outputData.buffer], { type: targetFormat.mimeType });
    const resultUrl = createSafeObjectURL(resultBlob);

    onProgress({ percent: 100, stage: 'Audio merge complete!' });

    return {
      blob: resultBlob,
      url: resultUrl,
      fileName: `joined_audio_${Date.now()}.${targetFormat.ext}`,
      size: resultBlob.size,
    };
  } finally {
    // Virtual FS Cleanup to prevent memory leaks in WebAssembly heap
    for (const f of writtenFiles) {
      try {
        await ffmpeg.deleteFile(f);
      } catch (e) {
        // ignore cleanup error
      }
    }
    try {
      await ffmpeg.deleteFile(outputFileName);
    } catch (e) {
      // ignore
    }
  }
}
