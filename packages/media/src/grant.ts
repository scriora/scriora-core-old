import { hmacHexEqual, hmacSha256Hex, randomToken } from "@scriora/crypto";

export type MediaUploadGrant = {
  uploadId: string;
  workspaceId: string;
  mime: string;
  maxBytes: number;
  expiresAt: number;
  signature: string;
};

export function createMediaUploadGrant(input: {
  secret: string;
  workspaceId: string;
  mime: string;
  maxBytes: number;
  now: Date;
  ttlMs?: number;
}): MediaUploadGrant {
  const expiresAt = input.now.getTime() + (input.ttlMs ?? 10 * 60 * 1000);
  const uploadId = randomToken();
  const signature = signGrant(input.secret, {
    uploadId,
    workspaceId: input.workspaceId,
    mime: input.mime,
    maxBytes: input.maxBytes,
    expiresAt,
  });
  return {
    uploadId,
    workspaceId: input.workspaceId,
    mime: input.mime,
    maxBytes: input.maxBytes,
    expiresAt,
    signature,
  };
}

export function verifyMediaUploadGrant(
  secret: string,
  grant: Omit<MediaUploadGrant, "signature"> & { signature: string },
  now: Date,
): boolean {
  if (now.getTime() >= grant.expiresAt) {
    return false;
  }
  const expected = signGrant(secret, grant);
  return hmacHexEqual(expected, grant.signature);
}

function signGrant(
  secret: string,
  grant: Omit<MediaUploadGrant, "signature">,
): string {
  return hmacSha256Hex(
    secret,
    `${grant.workspaceId}|${grant.uploadId}|${grant.mime}|${grant.maxBytes}|${grant.expiresAt}`,
  );
}
