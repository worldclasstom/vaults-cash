"use client";

import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";

/**
 * Share anything that has a card image and a public link: preview the
 * landscape card, hand the 9:16 version to the OS share sheet as a file
 * (Instagram / TikTok stories take it straight), copy or share the link.
 * The story PNG is fetched when the sheet opens so navigator.share can be
 * called synchronously inside the tap, which Safari requires.
 */
export function ShareCardSheet({
  title,
  img,
  url,
  alt,
  fileBase,
  shareText,
  note,
  onClose,
}: {
  title: string;
  /** landscape card image URL; `?format=story` must yield the 1080×1920 version */
  img: string;
  url: string;
  alt: string;
  fileBase: string;
  shareText: string;
  note: React.ReactNode;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [story, setStory] = useState<File | null>(null);
  const canShareLink = typeof navigator !== "undefined" && typeof navigator.share === "function";
  useEffect(() => {
    let live = true;
    fetch(`${img}${img.includes("?") ? "&" : "?"}format=story`)
      .then((r) => r.blob())
      .then((b) => live && setStory(new File([b], `${fileBase}.png`, { type: "image/png" })))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [img, fileBase]);
  const canShareImage = !!story && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [story] });
  const saveImage = () => {
    if (!story) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(story);
    a.download = story.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
  };
  return (
    <Sheet open onClose={onClose} title={title}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt={alt} className="mt-3 w-full rounded-2xl shadow-elevated" />
      <p className="pt-3 text-xs text-muted">{note}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canShareImage ? (
          <button
            onClick={() => navigator.share({ files: [story!], title, text: `${shareText} ${url}` }).catch(() => undefined)}
            className="grow rounded-full bg-accent px-5 py-3 font-semibold text-black transition-colors hover:bg-accent-strong"
          >
            Share image
          </button>
        ) : (
          <button onClick={saveImage} disabled={!story} className="grow rounded-full bg-accent px-5 py-3 font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-50">
            {story ? "Save image" : "Preparing image…"}
          </button>
        )}
        <button
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="grow rounded-full bg-surface px-5 py-3 font-semibold transition-colors hover:bg-borderline"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
        {canShareLink && (
          <button onClick={() => navigator.share({ title, text: shareText, url }).catch(() => undefined)} className="grow rounded-full bg-surface px-5 py-3 font-semibold transition-colors hover:bg-borderline">
            Share link
          </button>
        )}
      </div>
    </Sheet>
  );
}
