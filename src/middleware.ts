import { NextRequest, NextResponse } from 'next/server';

// Paths that require authentication
const protectedPaths = ['/admin', '/quiz', '/leaderboard', '/exam'];
// Paths that require admin role
const adminPaths = ['/admin'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessionId = req.cookies.get('session_id')?.value;
  const sessionToken = req.cookies.get('session_token')?.value;

  // Check if the path needs protection
  const needsAuth = protectedPaths.some(p => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  // No session cookies -> redirect to login
  if (!sessionId || !sessionToken) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/quiz/:path*', '/leaderboard/:path*', '/exam/:path*'],
};
