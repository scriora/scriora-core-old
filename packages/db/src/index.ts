import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client, Pool, PoolClient } from "pg";

const sqlDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "sql",
);

export async function migrate(admin: Client | Pool): Promise<void> {
  const sql = await readFile(path.join(sqlDir, "0001_tenancy.sql"), "utf8");
  await admin.query(sql);
}

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
