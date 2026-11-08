/**
 * ImageAttachmentValidator.ts
 *
 * Robust validation, MIME normalization, and security safeguards for multimodal
 * image inputs across AI providers (Groq, OpenAI, Anthropic, Gemini, Ollama, Custom).
 */

export const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'image/tiff',
  'image/avif'
]);

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB binary
export const MAX_IMAGE_BASE64_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 200; // ~28 MB
export const MAX_IMAGES_PER_REQUEST = 5;

/**
 * Normalizes image MIME type:
 * - Maps 'image/jpg' to standard 'image/jpeg'
 * - Lowercases and trims
 */
export function normalizeImageMime(mime?: string): string {
  if (!mime) return 'image/jpeg';
  const clean = mime.trim().toLowerCase();
  if (clean === 'image/jpg' || clean === 'jpg') return 'image/jpeg';
  if (clean === 'png') return 'image/png';
  if (clean === 'webp') return 'image/webp';
  if (clean === 'gif') return 'image/gif';
  return clean;
}

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  normalizedMimeType?: string;
  rawBase64?: string;
  dataUrl?: string;
}

/**
 * Validates an image attachment:
 * - Checks for corrupted binary UTF-8 headers (e.g. \x89PNG, \xFF\xD8)
 * - Validates base64 encoding integrity
 * - Validates MIME type against supported formats
 * - Enforces size boundaries (< 20MB)
 */
export function validateImageAttachment(attachment: {
  name?: string;
  path?: string;
  mimeType?: string;
  content?: string;
  base64Data?: string;
}): ImageValidationResult {
  const rawInput = attachment.base64Data || attachment.content || '';
  if (!rawInput || !rawInput.trim()) {
    return { valid: false, error: `Image attachment "${attachment.name || 'unnamed'}" contains no data.` };
  }

  // Detect corrupted binary text headers injected into UTF-8 strings
  if (rawInput.startsWith('\x89PNG') || rawInput.includes('\x89PNG') || rawInput.startsWith('\xFF\xD8\xFF') || rawInput.charCodeAt(0) === 0x89) {
    return {
      valid: false,
      error: `Image "${attachment.name || 'unnamed'}" contains raw binary headers instead of valid base64 data. Re-read from disk required.`
    };
  }

  let mime = normalizeImageMime(attachment.mimeType);
  let base64Part = rawInput;

  // Extract MIME and base64 if data URL format
  if (rawInput.startsWith('data:')) {
    const match = rawInput.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) {
      return {
        valid: false,
        error: `Image "${attachment.name || 'unnamed'}" has an invalid data URI format.`
      };
    }
    mime = normalizeImageMime(match[1]);
    base64Part = match[2].trim();
  } else {
    base64Part = rawInput.trim();
  }

  // Check supported MIME
  if (!SUPPORTED_IMAGE_MIMES.has(mime)) {
    return {
      valid: false,
      error: `Unsupported image format "${mime}". Supported formats: JPEG, PNG, WebP, GIF, BMP, SVG, TIFF, AVIF.`
    };
  }

  // Check base64 length limit
  if (base64Part.length > MAX_IMAGE_BASE64_LENGTH) {
    return {
      valid: false,
      error: `Image "${attachment.name || 'unnamed'}" exceeds maximum allowable size of 20MB.`
    };
  }

  // Validate base64 charset
  // Allow whitespace, newlines, standard base64 characters and '=' padding
  const cleanBase64 = base64Part.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
    return {
      valid: false,
      error: `Image "${attachment.name || 'unnamed'}" contains invalid base64 characters.`
    };
  }

  // Verify minimal plausible length (valid image is at least ~30 base64 chars)
  if (cleanBase64.length < 32) {
    return {
      valid: false,
      error: `Image "${attachment.name || 'unnamed'}" data is too short to be a valid image.`
    };
  }

  return {
    valid: true,
    normalizedMimeType: mime,
    rawBase64: cleanBase64,
    dataUrl: `data:${mime};base64,${cleanBase64}`
  };
}

/**
 * Validates if the selected model on the given provider supports multimodal vision.
 */
export function validateModelVisionCapability(
  providerName: string,
  modelId: string,
  supportsVision?: boolean
): { supported: boolean; error?: string } {
  if (supportsVision) {
    return { supported: true };
  }

  return {
    supported: false,
    error: `Model "${modelId}" on ${providerName} does not support image/vision inputs. Please select a vision-capable model (e.g. qwen/qwen3.8-27b on Groq, gpt-4o on OpenAI, claude-3-5-sonnet on Anthropic, or gemini-1.5-flash on Gemini).`
  };
}

/**
 * Redacts API keys and truncates base64 payloads to protect security and token budgets in logs.
 */
export function sanitizeLogOutput(text: string): string {
  if (!text) return '';
  return text
    // Redact Groq keys
    .replace(/gsk_[a-zA-Z0-9_-]+/g, 'gsk_***')
    // Redact OpenAI keys
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***')
    // Redact Anthropic keys
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'sk-ant-***')
    // Redact Google AI keys
    .replace(/AIza[a-zA-Z0-9_-]{20,}/g, 'AIza***')
    // Redact Bearer tokens
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***')
    // Truncate Base64 Data URLs
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{40,}/g, match => {
      const prefix = match.slice(0, 30);
      return `${prefix}...[${match.length - 30} chars base64 redacted]`;
    });
}
