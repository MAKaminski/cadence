import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Public pages are open to every crawler, AI crawlers included: being quoted accurately by assistants
// is part of how people find Cadence. Signed-in pages are private.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/onboarding", "/checkout", "/api"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
