import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMediaAsset, setMediaLinkedInAssetUrn } from "@scriora/db";
import type { Pool } from "pg";
import { createLinkedInTextShare } from "./ugc-http.js";

export type LocalMediaShareDeps = {
  loadAsset(
    workspaceId: string,
    mediaAssetId: string,
  ): Promise<{
    storageKey: string;
    linkedinAssetUrn: string | null;
  } | null>;
  readBytes(storageKey: string): Promise<Uint8Array | null>;
  saveUrn(
    workspaceId: string,
    mediaAssetId: string,
    urn: string,
  ): Promise<void>;
  ugc(input: {
    accessToken: string;
    authorUrn: string;
    text: string;
    mediaAssetId?: string;
    imageAssetUrn?: string | null;
    imageBytes?: Uint8Array;
  }): Promise<{
    httpStatus: number;
    restliId: string | null;
    imageAssetUrn?: string;
  }>;
};

export function createLinkedInShareWithLocalMedia(deps: LocalMediaShareDeps) {
  return async function createShare(input: {
    accessToken: string;
    authorUrn: string;
    text: string;
    workspaceId?: string;
    mediaAssetId?: string;
    imageAssetUrn?: string | null;
  }) {
    let imageAssetUrn = input.imageAssetUrn ?? null;
    let imageBytes: Uint8Array | undefined;
    const shouldResolve =
      Boolean(input.mediaAssetId) &&
      Boolean(input.workspaceId) &&
      !imageAssetUrn;
    if (shouldResolve && input.mediaAssetId && input.workspaceId) {
      const asset = await deps.loadAsset(input.workspaceId, input.mediaAssetId);
      if (!asset) {
        return { httpStatus: 404, restliId: null };
      }
      if (asset.linkedinAssetUrn) {
        imageAssetUrn = asset.linkedinAssetUrn;
      } else {
        const bytes = await deps.readBytes(asset.storageKey);
        if (!bytes) {
          return { httpStatus: 404, restliId: null };
        }
        imageBytes = bytes;
      }
    }
    const result = await deps.ugc({
      accessToken: input.accessToken,
      authorUrn: input.authorUrn,
      text: input.text,
      ...(imageAssetUrn ? { imageAssetUrn } : {}),
      ...(imageBytes ? { imageBytes } : {}),
    });
    if (
      input.mediaAssetId &&
      input.workspaceId &&
      result.imageAssetUrn &&
      !input.imageAssetUrn &&
      imageBytes
    ) {
      await deps.saveUrn(
        input.workspaceId,
        input.mediaAssetId,
        result.imageAssetUrn,
      );
    }
    return {
      httpStatus: result.httpStatus,
      restliId: result.restliId,
    };
  };
}

export function postgresLinkedInShare(pool: Pool, mediaRoot: string) {
  return createLinkedInShareWithLocalMedia({
    ugc: createLinkedInTextShare,
    loadAsset: (workspaceId, mediaAssetId) =>
      getMediaAsset(pool, workspaceId, mediaAssetId),
    async readBytes(storageKey) {
      try {
        return await readFile(path.join(mediaRoot, storageKey));
      } catch {
        return null;
      }
    },
    saveUrn: (workspaceId, mediaAssetId, urn) =>
      setMediaLinkedInAssetUrn(pool, workspaceId, mediaAssetId, urn),
  });
}
