import { NextRequest, NextResponse } from "next/server";

import { resetFailure } from "@/lib/dashboard-data";
import { ServiceId } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { service: ServiceId };

  try {
    const result = await resetFailure(body.service);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
