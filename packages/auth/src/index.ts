export type WorkspaceId = string & { readonly brand: "WorkspaceId" };

export function workspaceId(value: string): WorkspaceId {
  if (value.length === 0) {
    throw new Error("workspace id is required");
  }
  return value as WorkspaceId;
}
