import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// A fast, optimistic check only: no session cookie means no chance of access, so skip the render.
// The real checks (valid session, active subscription, finished setup) run on the server in each layout.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const to = new URL("/login", request.url);
    to.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(to);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/onboarding/:path*", "/checkout"] };
