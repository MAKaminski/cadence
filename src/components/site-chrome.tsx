import Link from "next/link";

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden className="flex h-6 items-end gap-0.5">
        {[10, 16, 22].map((h) => <span key={h} className="w-1.5 rounded-sm bg-primary" style={{ height: h }} />)}
      </span>
      Cadence
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Wordmark />
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/#pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
          <Link href="/login" className="font-medium">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Cadence</span>
        <nav className="flex gap-4"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></nav>
      </div>
    </footer>
  );
}
