import { NextRequest, NextResponse } from "next/server";

import { callProductService, jsonFromResponse } from "@/lib/storefront-server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const authorization = request.headers.get("authorization");
  const response = await callProductService("/cart/add", {
    method: "POST",
    body,
    authorization,
  });
  const payload = await jsonFromResponse(response);

  return NextResponse.json(payload, { status: response.status });
}
