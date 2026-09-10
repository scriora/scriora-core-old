"use client";

import { useEffect, useId, useState } from "react";
import { api, workspaceStorageKey } from "../../../classic/api";
import { useClassicI18n } from "../../../classic/i18n";

type Asset = {
  id?: string;
  sha256: string;
  mime: string;
  bytes: number;
  linkedinAssetUrn: string | null;
};

export default function MediaPage() {
  const { copy } = useClassicI18n();
  const inputId = useId();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId) {
      return;
    }
    const result = await api<Asset[]>(`/media?workspaceId=${workspaceId}`);
    if (result.ok) {
      setAssets(result.body);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function upload(file: File) {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId) {
      setMessage(copy.workspace);
      return;
    }
    const grant = await api<{ url: string }>("/media/uploads", {
      method: "POST",
      body: JSON.stringify({ workspaceId, mime: file.type }),
    });
    if (!grant.ok) {
      setMessage("Upload grant failed.");
      return;
    }
    const put = await fetch(`/scriora-api${grant.body.url}`, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    });
    setMessage(put.ok ? "Stored." : "Upload rejected.");
    await refresh();
  }

  return (
    <main className="max-w-3xl">
      <h1 className="m-0 font-[family-name:var(--font-display)] text-4xl">
        {copy.classicMedia}
      </h1>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void upload(file);
          }
        }}
      />
      <label
        htmlFor={inputId}
        className="mt-8 flex size-40 cursor-pointer flex-col items-center justify-center border border-dashed border-gold text-center text-sm text-gold"
      >
        <span className="text-3xl leading-none" aria-hidden>
          +
        </span>
        <span className="mt-3">{copy.addImage}</span>
      </label>
      <ul className="mt-8 m-0 flex list-none flex-wrap gap-4 p-0">
        {assets.map((asset) => (
          <li
            key={asset.id ?? asset.sha256}
            className="flex size-40 flex-col justify-end border border-rule p-3 text-xs text-muted"
          >
            <span>{asset.mime}</span>
            <span>{asset.bytes} bytes</span>
          </li>
        ))}
      </ul>
      {message ? <p className="mt-4 text-muted">{message}</p> : null}
    </main>
  );
}
