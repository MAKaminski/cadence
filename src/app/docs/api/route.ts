import { ApiReference } from "@scalar/nextjs-api-reference";

// The API reference, generated from /api/v1/openapi.json and styled to match Cadence.
export const GET = ApiReference({
  url: "/api/v1/openapi.json",
  pageTitle: "Cadence API reference",
  theme: "default",
  hideClientButton: false,
  customCss: `:root { --scalar-color-accent: #4f46e5; --scalar-font: "Hanken Grotesk", system-ui, sans-serif; }`,
  metaData: { title: "Cadence API reference", description: "Drive Cadence from scripts, a CLI or your own tools." },
});
