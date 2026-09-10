"use client";

import { useEffect, useId, useState } from "react";
import { api, workspaceStorageKey } from "../../../classic/api";
import { useClassicI18n } from "../../../classic/i18n";
import { LinkedInPreview } from "../../../classic/LinkedInPreview";
import { foldLimit } from "../../../classic/preview-fold";

const foldChars = foldLimit;

type Asset = {
  id: string;
  sha256: string;
  mime: string;
  bytes: number;
};

type LinkedInStatus = {
  connected: boolean;
  displayName: string | null;
  memberUrn: string | null;
};

export default function ComposePage() {
  const { copy } = useClassicI18n();
  const inputId = useId();
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [attachedId, setAttachedId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<LinkedInStatus | null>(null);

  useEffect(() => {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId) {
      return;
    }
    void api<Asset[]>(`/media?workspaceId=${workspaceId}`).then((result) => {
      if (result.ok) {
        setAssets(result.body);
      }
    });
    void api<LinkedInStatus>(
      `/integrations/linkedin?workspaceId=${workspaceId}`,
    ).then((result) => {
      if (result.ok) {
        setIdentity(result.body);
      }
    });
  }, []);

  async function saveDraft() {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId) {
      setMessage(copy.workspace);
      return;
    }
    const draft = await api<{ id: string; originMode: string; source: string }>(
      "/contents",
      {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          body,
          ...(attachedId ? { mediaAssetIds: [attachedId] } : {}),
        }),
      },
    );
    if (!draft.ok) {
      setMessage("Could not save draft.");
      return;
    }
    const submitted = await api<{ approval: { id: string } }>(
      `/contents/${draft.body.id}/submit`,
      { method: "POST", body: JSON.stringify({ workspaceId }) },
    );
    setMessage(
      submitted.ok
        ? `Draft ${draft.body.id} is in review (${draft.body.source}).`
        : "Draft saved but submit failed.",
    );
  }

  const remaining = Math.max(0, foldChars - body.length);
  const selected = assets.find((asset) => asset.id === attachedId);

  return (
    <main className="max-w-2xl">
      <h1 className="m-0 font-[family-name:var(--font-display)] text-4xl">
        {copy.classicCompose}
      </h1>
      <p className="mt-3 text-muted">
        {identity?.connected
          ? `${identity.displayName ?? identity.memberUrn}`
          : copy.linkedInDisconnected}
      </p>
      <p className="mt-2 text-sm text-muted">{copy.previewFold}</p>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={12}
        className="mt-8 h-72 w-full resize-none border border-rule bg-ink p-4 text-paper"
      />
      <p className="mt-2 text-xs text-muted">
        {remaining} {copy.remaining}
      </p>
      <LinkedInPreview
        name={
          identity?.displayName ??
          identity?.memberUrn ??
          copy.linkedInDisconnected
        }
        body={body}
        hasImage={Boolean(selected)}
      />
      <p className="mt-6 text-sm text-muted">{copy.attachFromLibrary}</p>
      <div className="mt-3 flex flex-wrap gap-4">
        <label
          htmlFor={inputId}
          className="flex size-40 cursor-pointer flex-col items-center justify-center border border-dashed border-gold text-center text-sm text-gold"
        >
          <span className="text-3xl leading-none" aria-hidden>
            +
          </span>
          <span className="mt-3">{copy.addImage}</span>
        </label>
        <select
          id={inputId}
          value={attachedId ?? ""}
          onChange={(event) => setAttachedId(event.target.value || null)}
          className="min-h-11 border border-rule bg-ink px-3 text-paper"
        >
          <option value="">{copy.attachFromLibrary}</option>
          {assets.map((asset) => (
            <option key={asset.id || asset.sha256} value={asset.id}>
              {asset.mime} · {asset.bytes}
            </option>
          ))}
        </select>
        {selected ? (
          <div className="flex size-40 flex-col justify-end border border-gold p-3 text-xs">
            {selected.mime}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void saveDraft()}
        className="mt-6 min-h-11 border border-gold px-5 text-gold"
      >
        {copy.saveReview}
      </button>
      {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
    </main>
  );
}
