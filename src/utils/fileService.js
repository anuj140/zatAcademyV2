const cloudinary = require("../config/cloudinary");

/**
 * Determine Cloudinary resource_type from a MIME type.
 * Cloudinary uses 'raw' for documents (PDF, DOC...) and 'video' for video
 */
function mimeToResourceType(mimeType = '') {
  if (!mimeType) return 'raw';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'video'; // Cloudinary treats audio as video
  return 'raw'; // PDF, DOC, ZIP, TXT, etc.
}

/**
 * Build a signed Cloudinary URL
 * @param {string} publicId Cloudinary public_id
 * @param {string} resourceType 'image' | 'video' | 'raw'
 * @param {boolean} forDownload If true, prepares for download (adds fl_attachment)
 * @param {string} originalName Original filename (not appended to URL, used for headers)
 * @returns {string} Signed Cloudinary URL
 */
function buildCloudinaryUrl(publicId, resourceType, forDownload, originalName) {
  // Build clean options - no transformations that can cause errors
  const options = {
    resource_type: resourceType,
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiry
    type: 'upload',
  };

  // For download: add flag to force browser to download instead of render
  // This tells Cloudinary to set Content-Disposition: attachment header
  if (forDownload) {
    options.flags = 'attachment';
  }

  // Generate the signed URL without query parameter manipulation
  const url = cloudinary.url(publicId, options);

  return url;
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType MIME type string
 * @returns {string} File extension
 */
function getExtensionFromMime(mimeType = '') {
  const mimeToExtMap = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
    'application/x-7z-compressed': '7z',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
  };

  return mimeToExtMap[mimeType] || 'bin';
}

/**
 * Get MIME type from file extension
 * @param {string} filename Filename with extension
 * @returns {string} MIME type
 */
function getMimeFromExtension(filename = '') {
  const ext = filename.split('.').pop().toLowerCase();
  const extToMimeMap = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
  };

  return extToMimeMap[ext] || 'application/octet-stream';
}

/**
 * Determine if a file type is previewable in browser
 * @param {string} mimeType MIME type
 * @returns {boolean} True if previewable
 */
function isPreviewable(mimeType = '') {
  const previewableMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'application/pdf',
    'text/plain',
    'text/html',
    'text/csv',
  ];

  return previewableMimes.some(mime => 
    mimeType.includes(mime.split('/')[0]) && mimeType.includes(mime.split('/')[1])
  ) || previewableMimes.includes(mimeType);
}

/**
 * Build download response object for a file
 * @param {object} file File object with url, public_id, originalName, size, mimeType
 * @param {string} title Fallback title if originalName not available
 * @returns {object} Download response data
 */
function buildDownloadResponse(file, title = 'download') {
  if (!file || !file.url) {
    return null;
  }

  const { mimeType, originalName, size, url } = file;

  const filename = originalName || title;

  return {
    url: url,
    filename: filename,
    mimeType: mimeType || 'application/octet-stream',
    size: size,
    expiresIn: 3600, // seconds
    contentDisposition: `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
  };
}

/**
 * Build preview response object for a file
 * @param {object} file File object with url, public_id, originalName, mimeType
 * @param {string} title Fallback title if originalName not available
 * @returns {object} Preview response data
 */
function buildPreviewResponse(file, title = 'preview') {
  if (!file || !file.url) {
    return null;
  }

  const { mimeType, originalName, url } = file;

  const previewable = isPreviewable(mimeType);
  const extension = getExtensionFromMime(mimeType);

  return {
    type: 'file',
    url: url,
    mimeType: mimeType || 'application/octet-stream',
    filename: originalName || title,
    extension: extension,
    previewable: previewable,
    expiresIn: 3600, // seconds
  };
}

/**
 * Format file size to human readable format
 * @param {number} bytes File size in bytes
 * @returns {string} Human readable size
 */
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

module.exports = {
  mimeToResourceType,
  buildCloudinaryUrl,
  getExtensionFromMime,
  getMimeFromExtension,
  isPreviewable,
  buildDownloadResponse,
  buildPreviewResponse,
  formatFileSize,
};
