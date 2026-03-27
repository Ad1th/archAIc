import { NextRequest, NextResponse } from "next/server";

import { triggerFailure } from "@/lib/dashboard-data";
import { FailureType, ServiceId } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    service: ServiceId;
    type: FailureType;
    intensity: number;
    probability: number;
    duration: number | null;
  };

  try {
    const result = await triggerFailure(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to inject failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
