import { handle } from "hono/vercel";
import { api } from "@/api/app";

// hono/vercel's handle() is a plain fetch adapter; it works in any Next.js route handler.
export const GET = handle(api);
export const POST = handle(api);
export const PATCH = handle(api);
