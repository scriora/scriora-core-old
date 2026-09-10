import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const domainDir = path.join(root, "packages", "domain", "src");
const forbidden = [
  "prisma",
  "kysely",
  "fastify",
  "bullmq",
  "ioredis",
  "@aws-sdk",
  'from "next',
  'from "react',
  "from 'next",
  "from 'react",
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const files = await walk(domainDir);
const violations = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const needle of forbidden) {
    if (text.includes(needle)) {
      violations.push(
        `${path.relative(root, file)}: forbidden import (${needle})`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Architecture: domain has no infrastructure imports.");
