import { bootWorker } from "./boot.js";

const state = bootWorker();
console.log(`scriora-worker ${state.status}`);
