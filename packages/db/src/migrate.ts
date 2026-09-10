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
  const files = await migrate(client);
  console.log(`Applied packages/db/sql/${files.join(", ")}`);
} finally {
  await client.end();
}
