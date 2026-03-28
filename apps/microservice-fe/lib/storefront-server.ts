const authServiceUrl = process.env.AUTH_SERVICE_URL ?? "http://127.0.0.1:8001";
const productServiceUrl = process.env.PRODUCT_SERVICE_URL ?? "http://127.0.0.1:8003";
const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL ?? "http://127.0.0.1:8004";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  authorization?: string | null;
};

export async function callAuthService(path: string, options: RequestOptions = {}) {
  return callService(authServiceUrl, path, options);
}

export async function callProductService(path: string, options: RequestOptions = {}) {
  return callService(productServiceUrl, path, options);
}

export async function callPaymentService(path: string, options: RequestOptions = {}) {
  return callService(paymentServiceUrl, path, options);
}

async function callService(baseUrl: string, path: string, options: RequestOptions) {
  const headers = new Headers();

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.authorization) {
    headers.set("Authorization", options.authorization);
  }

  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
}

export async function jsonFromResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}
