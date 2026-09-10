import type { Pool, PoolClient } from "pg";

export async function withWorkspace<T>(
  pool: Pool,
  workspaceId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config($1, $2, true)", [
      "app.current_workspace_id",
      workspaceId,
    ]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* connection may already be aborted */
    }
    throw error;
  } finally {
    try {
      await client.query("reset all");
    } catch {
      /* ignore */
    }
    client.release();
  }
}

export function appDatabaseUrl(adminUrl: string): string {
  const url = new URL(adminUrl);
  url.username = "scriora_app";
  url.password = "scriora_app";
  return url.toString();
}
