import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, checkBasicAuth } from "@/lib/admin/basic-auth";

/** Gate /admin behind Basic auth (interim, until Phase 4). Disabled admin looks like a 404. */
export function proxy(request: NextRequest) {
  if (!adminConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!checkBasicAuth(request.headers.get("authorization"))) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="admin", charset="UTF-8"' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
