export type PublishCommand = {
  workspaceId: string;
  body: string;
};

export type PublishResult =
  | { kind: "verified"; externalId: string; confirmedAt: Date }
  | { kind: "platform_pending"; operationId: string }
  | { kind: "unknown_external_state"; operationId: string };

export type SocialPlatformAdapter = {
  readonly network: "linkedin";
  publish(command: PublishCommand): Promise<PublishResult>;
};

export function httpCreatedIsNotPublished(): false {
  return false;
}
