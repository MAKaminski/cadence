import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { inputsOn } from "@/lib/inputs";

/** The way back from an input's home page to every input in one place. */
export function InputsLink({ page }: { page: string }) {
  const here = inputsOn(page);
  return (
    <Link href={`/app/inputs${here[0] ? `?tab=${here[0].group}` : ""}`} data-testid="all-inputs"
      className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline">
      <SlidersHorizontal className="size-3.5" aria-hidden />All inputs →
      {here.length > 0 && <span className="sr-only">({here.length} of them are on this page)</span>}
    </Link>
  );
}
