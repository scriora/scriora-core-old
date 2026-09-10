export const agentRunStates = [
  "QUEUED",
  "RUNNING",
  "WAITING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type AgentRunState = (typeof agentRunStates)[number];
