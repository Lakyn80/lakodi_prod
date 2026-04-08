import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_HOSTNAME,
  CANONICAL_HOSTNAME,
  WWW_HOSTNAME,
  isAdminPath,
  normalizeHostname,
} from "@/lib/hosts";

function buildRedirectUrl(request: NextRequest, hostname: string): URL {
  const target = request.nextUrl.clone();
  target.protocol = "https";
  target.hostname = hostname;
  target.port = "";
  return target;
}

export function middleware(request: NextRequest) {
  const hostName = normalizeHostname(request.headers.get("host") ?? "");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const requestProto = request.nextUrl.protocol.replace(":", "");
  const proto = forwardedProto?.split(",")[0]?.trim() || requestProto;
  const adminPath = isAdminPath(request.nextUrl.pathname);

  if (
    adminPath &&
    (hostName === CANONICAL_HOSTNAME || hostName === WWW_HOSTNAME)
  ) {
    return NextResponse.redirect(buildRedirectUrl(request, ADMIN_HOSTNAME), 308);
  }

  const shouldRedirectWww = hostName === WWW_HOSTNAME;
  const shouldRedirectHttp =
    (hostName === CANONICAL_HOSTNAME || hostName === ADMIN_HOSTNAME) &&
    proto === "http";

  if (shouldRedirectWww) {
    return NextResponse.redirect(buildRedirectUrl(request, CANONICAL_HOSTNAME), 301);
  }

  if (shouldRedirectHttp) {
    return NextResponse.redirect(buildRedirectUrl(request, hostName), 301);
  }

  if (hostName === ADMIN_HOSTNAME && request.nextUrl.pathname === "/") {
    const target = buildRedirectUrl(request, ADMIN_HOSTNAME);
    target.pathname = "/admin/login";
    return NextResponse.redirect(target, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
