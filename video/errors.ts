export type VideoDigestErrorCode =
  | "NO_PENDING_NEWS"
  | "OPEN_VIDEO_DIGEST_EXISTS"
  | "VIDEO_DIGEST_NOT_FOUND"
  | "VIDEO_DIGEST_INVALID_STATE"
  | "NEWS_ALREADY_RESERVED"
  | "NEWS_NO_LONGER_ELIGIBLE"
  | "VIDEO_DIGEST_STALE"
  | "VIDEO_SCRIPT_GENERATION_ERROR"
  | "VIDEO_SCRIPT_VALIDATION_ERROR"
  | "TTS_GENERATION_ERROR"
  | "MEDIA_DOWNLOAD_ERROR"
  | "VIDEO_RENDER_ERROR"
  | "VIDEO_VALIDATION_ERROR"
  | "VIDEO_FILE_NOT_FOUND"
  | "TELEGRAM_VIDEO_UPLOAD_ERROR"
  | "TELEGRAM_VIDEO_DELIVERY_UNCERTAIN"
  | "VIDEO_DIGEST_INTEGRITY_ERROR";

export class VideoDigestError extends Error {
  constructor(
    public readonly code: VideoDigestErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "VideoDigestError";
  }
}

export function videoErrorDetails(error: unknown) {
  if (error instanceof VideoDigestError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "VIDEO_RENDER_ERROR" as VideoDigestErrorCode,
    message: error instanceof Error ? error.message : "Error desconocido generando el video."
  };
}
