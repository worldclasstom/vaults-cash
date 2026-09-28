"use client";

import { useSyncExternalStore } from "react";

const PARTS = ["support", "prosperitylabs", "co"] as const;
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** The contact address, assembled in the browser only, so it never appears
 *  in the served HTML for scrapers to harvest. */
export function ContactEmail() {
  const mounted = useSyncExternalStore(subscribe, onClient, onServer);
  if (!mounted) return <span className="text-foreground">{PARTS[0]} at {PARTS[1]} dot {PARTS[2]}</span>;
  const addr = `${PARTS[0]}@${PARTS[1]}.${PARTS[2]}`;
  return (
    <a href={`mailto:${addr}`} className="text-foreground underline underline-offset-2 hover:text-accent">
      {addr}
    </a>
  );
}
