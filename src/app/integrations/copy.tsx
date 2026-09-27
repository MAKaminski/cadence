"use client";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyBlock({ text, label }: { text: string; label: string }) {
  return (
    <div className="flex items-start gap-2">
      <pre className="flex-1 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{text}</pre>
      <Button size="sm" variant="outline" aria-label={`Copy ${label}`} onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }}><Copy className="size-4" aria-hidden /></Button>
    </div>
  );
}
