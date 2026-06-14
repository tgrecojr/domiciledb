import { NextResponse } from "next/server";

// Lightweight liveness probe for Docker HEALTHCHECK / reverse proxies.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
