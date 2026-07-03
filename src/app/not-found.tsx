import Link from "next/link";
import { LogoMark } from "@/components/Logo";

function EscapingBill({
  delay,
  left,
  tilt,
}: {
  delay: string;
  left: string;
  tilt: string;
}) {
  return (
    <span
      aria-hidden
      className="animate-bill-escape absolute bottom-16 h-4 w-8 rounded-[4px] bg-accent/70"
      style={{ animationDelay: delay, left, ["--tilt" as string]: tilt }}
    >
      <span className="absolute inset-1 rounded-[2px] bg-accent-deep/80" />
    </span>
  );
}

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-4 text-center">
      <div className="relative">
        <EscapingBill delay="0s" left="-10%" tilt="-14deg" />
        <EscapingBill delay="0.9s" left="45%" tilt="8deg" />
        <EscapingBill delay="1.7s" left="95%" tilt="-5deg" />
        <div className="animate-bob">
          <LogoMark size={88} />
        </div>
      </div>
      <h1 className="pt-6 text-6xl font-bold tracking-tight">
        404<span className="text-accent">.</span>
      </h1>
      <p className="pt-2 text-xl font-semibold">This vault is empty.</p>
      <p className="max-w-sm pt-2 text-sm text-muted">
        The page you&apos;re looking for was withdrawn — or was never deposited
        in the first place. Either way, there&apos;s no yield here.
      </p>
      <div className="flex gap-3 pt-6">
        <Link
          href="/"
          className="rounded-full bg-accent px-6 py-2.5 font-semibold text-black transition-colors hover:bg-accent-strong"
        >
          Back to markets
        </Link>
        <Link
          href="/portfolio"
          className="rounded-full bg-surface-raised px-6 py-2.5 font-semibold transition-colors hover:bg-borderline"
        >
          My portfolio
        </Link>
      </div>
      <p className="pt-8 text-xs text-muted/60">
        Error 404 · no funds were harmed in the making of this page
      </p>
    </div>
  );
}
