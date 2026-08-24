/**
 * Object URL lifecycle & memory management utility.
 * Prevents memory leaks by tracking all active Blob URLs in browser memory
 * and systematically revoking them when tracks are removed, re-uploaded, or component unmounts.
 */

const activeObjectUrls = new Set();

/**
 * Creates an Object URL and registers it in the memory management pool.
 * @param {Blob | File} blob - The Blob or File to create a URL for.
 * @returns {string | null} The created Object URL, or null if invalid input.
 */
export function createSafeObjectURL(blob) {
  if (!blob || !(blob instanceof Blob)) {
    return null;
  }
  try {
    const url = URL.createObjectURL(blob);
    activeObjectUrls.add(url);
    return url;
  } catch (error) {
    console.error('Failed to create safe Object URL:', error);
    return null;
  }
}

/**
 * Revokes an Object URL and removes it from the active memory pool.
 * @param {string} url - The URL to revoke.
 */
export function revokeSafeObjectURL(url) {
  if (!url || typeof url !== 'string') return;
  
  if (url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
      activeObjectUrls.delete(url);
    } catch (error) {
      console.warn('Error revoking Object URL:', url, error);
    }
  }
}

/**
 * Cleans up all Object URLs associated with a specific track object.
 * @param {Object} track - The track object containing url, blob, or export urls.
 */
export function cleanupTrackUrls(track) {
  if (!track) return;
  if (track.url) {
    revokeSafeObjectURL(track.url);
  }
  if (track.previewUrl) {
    revokeSafeObjectURL(track.previewUrl);
  }
}

/**
 * Revokes all tracked active Object URLs. Called during unmount or full reset.
 */
export function cleanupAllSafeObjectURLs() {
  for (const url of activeObjectUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      // Ignore cleanup error
    }
  }
  activeObjectUrls.clear();
}

/**
 * Returns the count of currently tracked active Object URLs.
 * @returns {number}
 */
export function getActiveUrlCount() {
  return activeObjectUrls.size;
}
