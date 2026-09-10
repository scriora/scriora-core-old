import type { Pool } from "pg";
import { withWorkspace } from "./index.js";

export async function insertMediaAsset(
  pool: Pool,
  input: {
    workspaceId: string;
    sha256: string;
    mime: string;
    bytes: number;
    storageKey: string;
  },
): Promise<void> {
  await withWorkspace(pool, input.workspaceId, async (client) => {
    await client.query(
      `insert into media_assets
         (workspace_id, sha256, mime, bytes, storage_key, status)
       values ($1, $2, $3, $4, $5, 'STORED')
       on conflict (workspace_id, sha256) do update set
         mime = excluded.mime,
         bytes = excluded.bytes,
         storage_key = excluded.storage_key,
         status = 'STORED'`,
      [
        input.workspaceId,
        input.sha256,
        input.mime,
        input.bytes,
        input.storageKey,
      ],
    );
  });
}
