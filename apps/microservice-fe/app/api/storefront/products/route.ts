import { NextRequest, NextResponse } from "next/server";

import { callProductService, jsonFromResponse } from "@/lib/storefront-server";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const response = await callProductService("/products", { authorization });
  const payload = await jsonFromResponse(response);

  return NextResponse.json(payload, { status: response.status });
}
