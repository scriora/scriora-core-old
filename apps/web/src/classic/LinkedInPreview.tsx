"use client";

import { useState } from "react";
import { foldPreview } from "./preview-fold";

export function LinkedInPreview(input: {
  name: string;
  body: string;
  hasImage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const fold = foldPreview(input.body);
  const shown = expanded || !fold.overflow ? input.body : fold.visible;

  return (
    <article className="mt-8 border border-rule p-4">
      <p className="m-0 text-sm font-medium">{input.name}</p>
      <p className="mt-1 text-xs text-muted">now · Public</p>
      <p className="mt-4 whitespace-pre-wrap">
        {shown}
        {!expanded && fold.overflow ? "…" : ""}
      </p>
      {fold.overflow ? (
        <button
          type="button"
          className="mt-2 text-sm text-gold"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "see less" : "see more"}
        </button>
      ) : null}
      {input.hasImage ? (
        <div className="mt-4 aspect-square w-40 border border-rule bg-ink" />
      ) : null}
    </article>
  );
}
