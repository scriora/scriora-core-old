export const allowedMediaMimes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export type AllowedMediaMime = (typeof allowedMediaMimes)[number];

const maxBytesByMime: Record<AllowedMediaMime, number> = {
  "image/jpeg": 8 * 1024 * 1024,
  "image/png": 8 * 1024 * 1024,
  "image/webp": 8 * 1024 * 1024,
  "image/gif": 8 * 1024 * 1024,
  "application/pdf": 20 * 1024 * 1024,
};

export function maxBytesForMime(mime: string): number | null {
  if (!allowedMediaMimes.includes(mime as AllowedMediaMime)) {
    return null;
  }
  return maxBytesByMime[mime as AllowedMediaMime];
}

export function sniffMediaMime(header: Uint8Array): AllowedMediaMime | null {
  if (
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    header.length >= 6 &&
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38 &&
    (header[4] === 0x37 || header[4] === 0x39) &&
    header[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    header.length >= 5 &&
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46 &&
    header[4] === 0x2d
  ) {
    return "application/pdf";
  }
  return null;
}
