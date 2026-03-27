import { DashboardSnapshot, TraceResponse } from "@/lib/types";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(error?.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchDashboard(): Promise<DashboardSnapshot> {
  const response = await fetch("/api/dashboard", { cache: "no-store" });
  return parseResponse<DashboardSnapshot>(response);
}

export async function injectFailure(payload: {
  service: string;
  type: string;
  intensity: number;
  probability: number;
  duration: number | null;
}) {
  const response = await fetch("/api/failure/inject", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function resetFailure(payload: { service: string }) {
  const response = await fetch("/api/failure/reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function fetchTrace(traceId: string): Promise<TraceResponse> {
  const response = await fetch(`/api/trace?trace_id=${encodeURIComponent(traceId)}`, {
    cache: "no-store",
  });
  return parseResponse<TraceResponse>(response);
}
