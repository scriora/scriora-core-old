import pg from "pg";
import { migrate } from "./index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await migrate(client);
  console.log("Applied packages/db/sql/0001_tenancy.sql");
} finally {
  await client.end();
}
