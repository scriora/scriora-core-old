import type { Pool } from "pg";
import { withWorkspace } from "../tenancy.js";

export async function insertMediaAsset(
  pool: Pool,
  input: {
    workspaceId: string;
    sha256: string;
    mime: string;
    bytes: number;
    storageKey: string;
  },
): Promise<{ id: string }> {
  return withWorkspace(pool, input.workspaceId, async (client) => {
    const result = await client.query(
      `insert into media_assets
         (workspace_id, sha256, mime, bytes, storage_key, status)
       values ($1, $2, $3, $4, $5, 'STORED')
       on conflict (workspace_id, sha256) do update set
         mime = excluded.mime,
         bytes = excluded.bytes,
         storage_key = excluded.storage_key,
         status = 'STORED'
       returning id`,
      [
        input.workspaceId,
        input.sha256,
        input.mime,
        input.bytes,
        input.storageKey,
      ],
    );
    return { id: result.rows[0].id as string };
  });
}

export async function getMediaAsset(
  pool: Pool,
  workspaceId: string,
  mediaAssetId: string,
): Promise<{
  id: string;
  storageKey: string;
  linkedinAssetUrn: string | null;
} | null> {
  return withWorkspace(pool, workspaceId, async (client) => {
    const result = await client.query(
      `select id, storage_key, linkedin_asset_urn
       from media_assets
       where id = $1`,
      [mediaAssetId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id as string,
      storageKey: row.storage_key as string,
      linkedinAssetUrn: (row.linkedin_asset_urn as string | null) ?? null,
    };
  });
}

export async function setMediaLinkedInAssetUrn(
  pool: Pool,
  workspaceId: string,
  mediaAssetId: string,
  urn: string,
): Promise<void> {
  await withWorkspace(pool, workspaceId, async (client) => {
    await client.query(
      `update media_assets
       set linkedin_asset_urn = $2
       where id = $1 and linkedin_asset_urn is null`,
      [mediaAssetId, urn],
    );
  });
}

export async function listMediaAssets(
  pool: Pool,
  workspaceId: string,
): Promise<
  Array<{
    id: string;
    sha256: string;
    mime: string;
    bytes: number;
    storageKey: string;
    linkedinAssetUrn: string | null;
  }>
> {
  return withWorkspace(pool, workspaceId, async (client) => {
    const result = await client.query(
      `select id, sha256, mime, bytes, storage_key, linkedin_asset_urn
       from media_assets
       order by created_at desc`,
    );
    return result.rows.map((row) => ({
      id: row.id as string,
      sha256: row.sha256 as string,
      mime: row.mime as string,
      bytes: Number(row.bytes),
      storageKey: row.storage_key as string,
      linkedinAssetUrn: (row.linkedin_asset_urn as string | null) ?? null,
    }));
  });
}
