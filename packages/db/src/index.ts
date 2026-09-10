import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client, Pool } from "pg";

const sqlDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "sql",
);

export async function migrate(admin: Client | Pool): Promise<string[]> {
  const files = (await readdir(sqlDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = await readFile(path.join(sqlDir, file), "utf8");
    await admin.query(sql);
  }
  return files;
}

export { createPostgresGovernanceStore } from "./stores/governance-store.js";
export { insertMediaAsset } from "./stores/media-store.js";
export { createPostgresLinkedInOAuthStore } from "./stores/oauth-store.js";
export { createPostgresOutboxStore } from "./stores/outbox-store.js";
export { createPostgresLinkedInPublishStore } from "./stores/publish-store.js";
export { createPostgresTelemetryStore } from "./stores/telemetry-store.js";
export { appDatabaseUrl, withWorkspace } from "./tenancy.js";
