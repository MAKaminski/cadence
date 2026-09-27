import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/how-it-works", "/demo", "/integrations", "/terms", "/privacy"];
  return pages.map((p) => ({ url: `${SITE.url}${p}`, changeFrequency: p ? "monthly" : "weekly", priority: p ? 0.7 : 1 }));
}
