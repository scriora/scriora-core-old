import { outboxStates } from "@scriora/events";
import { type LinkedInDispatchPorts, processDueOutbox } from "@scriora/social";

export function bootWorker(): { status: "ready"; outbox: typeof outboxStates } {
  return { status: "ready", outbox: outboxStates };
}

export async function runOutboxTick(ports: LinkedInDispatchPorts) {
  return processDueOutbox(ports);
}
