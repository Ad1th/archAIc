import { NextRequest, NextResponse } from "next/server";

import { getTrace } from "@/lib/dashboard-data";

export async function GET(request: NextRequest) {
  const traceId = request.nextUrl.searchParams.get("trace_id");

  if (!traceId) {
    return NextResponse.json({ error: "trace_id is required" }, { status: 400 });
  }

  const trace = await getTrace(traceId);
  return NextResponse.json(trace);
}
