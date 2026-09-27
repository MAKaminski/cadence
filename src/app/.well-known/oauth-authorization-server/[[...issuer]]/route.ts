import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

// RFC 8414 metadata for the issuer at /api/auth (clients request /.well-known/oauth-authorization-server/api/auth).
export const GET = oauthProviderAuthServerMetadata(auth);
