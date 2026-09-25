"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SelectOption<T extends string | number> = { value: T; label: string; hint?: string };

/**
 * Our own listbox in place of the native <select>, so the control matches
 * the rest of the UI on every platform. Keyboard: arrows move, Enter/Space
 * pick, Escape closes, Home/End jump. Mouse: click outside closes.
 */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  align = "right",
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  ariaLabel: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    list.current?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openAt = (i: number) => {
    setActive(Math.max(0, Math.min(options.length - 1, i)));
    setOpen(true);
  };
  const pick = (i: number) => {
    onChange(options[i].value);
    setOpen(false);
    trigger.current?.focus();
  };
  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(last, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(last);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      trigger.current?.focus();
      if (e.key === "Escape") e.preventDefault();
    }
  };
  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAt(options.findIndex((o) => o.value === value));
    }
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openAt(options.findIndex((o) => o.value === value)))}
        onKeyDown={onTriggerKey}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full bg-surface pl-3.5 pr-2.5 text-sm font-medium transition-colors hover:bg-surface-raised ${
          open ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground"
        }`}
      >
        <span className="whitespace-nowrap">{current?.label}</span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className={`absolute z-40 mt-1.5 min-w-[11rem] animate-pop rounded-2xl border border-borderline bg-surface-raised p-1 shadow-elevated outline-none ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li
                key={String(o.value)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  i === active ? "bg-surface text-foreground" : "text-muted"
                } ${selected ? "font-semibold text-foreground" : ""}`}
              >
                <span>
                  <span className="block">{o.label}</span>
                  {o.hint && <span className="block text-[11px] font-normal text-muted">{o.hint}</span>}
                </span>
                {selected && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-accent">
                    <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
