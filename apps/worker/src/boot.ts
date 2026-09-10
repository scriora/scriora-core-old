import { outboxStates } from "@scriora/events";

export function bootWorker(): { status: "idle"; outbox: typeof outboxStates } {
  return { status: "idle", outbox: outboxStates };
}
