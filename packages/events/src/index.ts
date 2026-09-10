export const outboxStates = [
  "PENDING",
  "PROCESSING",
  "PUBLISHED",
  "FAILED",
] as const;
export type OutboxState = (typeof outboxStates)[number];
