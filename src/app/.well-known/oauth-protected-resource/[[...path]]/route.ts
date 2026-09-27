import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { ISSUER, MCP_RESOURCE } from "@/lib/auth";

// RFC 9728: tells MCP clients that /api/mcp is protected by Cadence's OAuth server.
export const GET = protectedResourceHandler({ authServerUrls: [ISSUER], resourceUrl: MCP_RESOURCE });
export const OPTIONS = metadataCorsOptionsRequestHandler();
