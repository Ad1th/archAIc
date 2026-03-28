import { NextRequest, NextResponse } from "next/server";

import { callPaymentService, jsonFromResponse } from "@/lib/storefront-server";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const response = await callPaymentService("/create-checkout-session", {
    method: "POST",
    authorization,
  });
  const payload = await jsonFromResponse(response);

  return NextResponse.json(payload, { status: response.status });
}
