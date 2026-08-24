/**
 * Formatting and parsing helpers for timestamps, file sizes, and audio metadata.
 */

/**
 * Formats a duration in seconds to a standard DAW timecode (e.g., 00:00.0 or 01:23:45.6).
 * @param {number} seconds - Total time in seconds.
 * @param {boolean} [includeDecimals=true] - Whether to include tenths of a second.
 * @returns {string} Formatted timecode.
 */
export function formatTime(seconds, includeDecimals = true) {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) {
    return includeDecimals ? '00:00.0' : '00:00';
  }

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);

  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = String(secs).padStart(2, '0');

  let result = '';
  if (hrs > 0) {
    const paddedHrs = String(hrs).padStart(2, '0');
    result = `${paddedHrs}:${paddedMins}:${paddedSecs}`;
  } else {
    result = `${paddedMins}:${paddedSecs}`;
  }

  if (includeDecimals) {
    result += `.${tenths}`;
  }

  return result;
}

/**
 * Parses user-input time string (e.g. "01:23.4", "1:15", "85.2", "01:02:03") into seconds.
 * @param {string | number} input - Time string or number.
 * @returns {number} Seconds as a float.
 */
export function parseTimeToSeconds(input) {
  if (typeof input === 'number') {
    return isNaN(input) || input < 0 ? 0 : input;
  }
  if (!input || typeof input !== 'string') {
    return 0;
  }

  const clean = input.trim();
  if (!clean) return 0;

  // If it's a simple number (e.g. "45.5" or "120")
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return Math.max(0, parseFloat(clean));
  }

  // If it's formatted with colons (e.g. "MM:SS.s" or "HH:MM:SS.s")
  const parts = clean.split(':').map((p) => parseFloat(p));
  if (parts.some((p) => isNaN(p))) {
    return 0;
  }

  let totalSeconds = 0;
  if (parts.length === 3) {
    // HH:MM:SS.s
    totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS.s
    totalSeconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    totalSeconds = parts[0];
  }

  return Math.max(0, totalSeconds);
}

/**
 * Formats a file size in bytes into a human-readable string.
 * @param {number} bytes - File size in bytes.
 * @param {number} [decimals=1] - Decimal precision.
 * @returns {string} Formatted size (e.g. "3.4 MB").
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

/**
 * Formats duration in seconds to a friendly human string (e.g. "3m 12s").
 * @param {number} seconds - Total time in seconds.
 * @returns {string}
 */
export function formatDurationHuman(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0s';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);

  const parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Sanitizes a file name for export by stripping illegal filename characters.
 * @param {string} name - Desired filename.
 * @param {string} [ext="mp3"] - Target extension.
 * @returns {string}
 */
export function sanitizeFileName(name, ext = 'mp3') {
  if (!name || typeof name !== 'string') {
    return `joined_audio_${Date.now()}.${ext}`;
  }

  let clean = name.replace(/[/\\?%*:|"<>]/g, '-').trim();
  if (!clean) {
    clean = `joined_audio_${Date.now()}`;
  }

  // Remove existing extension if present
  clean = clean.replace(/\.[^/.]+$/, '');

  return `${clean}.${ext}`;
}
