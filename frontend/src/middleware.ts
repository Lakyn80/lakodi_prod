import { NextRequest, NextResponse } from "next/server";

const CANONICAL_HOST = "lakodi.cz";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostName = host.split(":")[0];
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const requestProto = request.nextUrl.protocol.replace(":", "");
  const proto = forwardedProto ?? requestProto;

  const shouldRedirectWww = hostName === "www.lakodi.cz";
  const shouldRedirectHttp = hostName === "lakodi.cz" && proto === "http";

  if (shouldRedirectWww || shouldRedirectHttp) {
    const target = new URL(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
      `https://${CANONICAL_HOST}`,
    );
    return new Response(null, {
      status: 301,
      headers: {
        Location: target.toString(),
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
