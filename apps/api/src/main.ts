import { buildApi } from "./app.js";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? "3001");

const app = await buildApi();
await app.listen({ host, port });
