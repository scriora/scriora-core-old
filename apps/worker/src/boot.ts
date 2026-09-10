import { outboxStates } from "@scriora/events";
import { type LinkedInDispatchPorts, processDueOutbox } from "@scriora/social";

export function bootWorker(): { status: "ready"; outbox: typeof outboxStates } {
  return { status: "ready", outbox: outboxStates };
}

export function workerPollMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.WORKER_POLL_MS ?? "5000");
  if (!Number.isFinite(raw) || raw < 250) {
    return 5000;
  }
  return raw;
}

export async function runOutboxTick(ports: LinkedInDispatchPorts) {
  return processDueOutbox(ports);
}

export async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runOutboxLoop(input: {
  tick: () => Promise<unknown>;
  pollMs: number;
  signal: AbortSignal;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  const wait = input.wait ?? sleep;
  while (!input.signal.aborted) {
    await input.tick();
    if (input.signal.aborted) {
      return;
    }
    await wait(input.pollMs, input.signal);
  }
}
