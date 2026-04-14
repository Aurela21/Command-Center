import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

// API routes are excluded from session auth — they handle their own security
// or are called internally server-to-server (e.g. process-video → analyze-scenes).
const PUBLIC_PATHS = ["/login", "/api/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    // Misconfiguration — let request through in dev so the error is visible
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token || !(await verifySessionToken(token, sessionSecret))) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
