import { NextRequest, NextResponse } from "next/server";

import { callAuthService, jsonFromResponse } from "@/lib/storefront-server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const response = await callAuthService("/login", {
    method: "POST",
    body,
  });
  const payload = await jsonFromResponse(response);

  return NextResponse.json(payload, { status: response.status });
}
