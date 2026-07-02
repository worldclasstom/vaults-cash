import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export default function RestrictedPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark size={48} />
      <h1 className="text-2xl font-bold">Not available in your region</h1>
      <p className="max-w-sm text-sm text-muted">
        Stock-token markets can&apos;t be offered in your jurisdiction (including
        the United States). Crypto markets remain available.
      </p>
      <Link
        href="/"
        className="rounded-full bg-accent px-6 py-2.5 font-semibold text-black hover:bg-accent-strong"
      >
        Back to markets
      </Link>
    </div>
  );
}
