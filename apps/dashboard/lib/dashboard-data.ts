import { getServiceConfig, services } from "@/lib/config";
import {
  AlertItem,
  DashboardSnapshot,
  FailureType,
  LogEntry,
  MetricPoint,
  ServiceHealth,
  ServiceId,
  TraceResponse,
  TraceStep,
} from "@/lib/types";

const requestTimeoutMs = 1800;

type SnapshotStore = {
  metrics: MetricPoint[];
  logs: LogEntry[];
  lastTraceId: string;
};

const globalStore = globalThis as typeof globalThis & {
  __archaicDashboardStore__?: SnapshotStore;
};

function getStore(): SnapshotStore {
  if (!globalStore.__archaicDashboardStore__) {
    globalStore.__archaicDashboardStore__ = {
      metrics: [],
      logs: [],
      lastTraceId: createTraceId(),
    };
  }

  return globalStore.__archaicDashboardStore__;
}

function createTraceId() {
  const alphabet = "abcdef0123456789";
  return Array.from({ length: 16 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function trimLogs(logs: LogEntry[], max = 160) {
  return logs.slice(0, max);
}

function trimMetrics(metrics: MetricPoint[], max = 20) {
  return metrics.slice(-max);
}

function computeStatus(health: { status: string; failure: string | null } | null): ServiceHealth["status"] {
  if (!health) {
    return "offline";
  }

  if (health.failure) {
    return "degraded";
  }

  return health.status === "healthy" ? "healthy" : "degraded";
}

async function fetchServiceHealth(serviceId: ServiceId): Promise<ServiceHealth> {
  const service = getServiceConfig(serviceId);

  if (!service) {
    throw new Error(`Unknown service: ${serviceId}`);
  }

  const started = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    const response = await fetch(`${service.url}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}`);
    }

    const payload = (await response.json()) as { status: string; service: string; failure: string | null };
    const latencyMs = Date.now() - started;

    return {
      id: service.id,
      name: service.name,
      service: payload.service ?? service.systemName,
      status: computeStatus(payload),
      failure: payload.failure,
      latencyMs,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Service unavailable";

    return {
      id: service.id,
      name: service.name,
      service: service.systemName,
      status: "offline",
      failure: "crash",
      latencyMs: null,
      updatedAt: new Date().toISOString(),
      detail: message,
    };
  }
}

function createLogMessage(service: ServiceHealth) {
  if (service.status === "offline") {
    return `${service.service} is unreachable. Control plane fallback is active.`;
  }

  if (service.failure) {
    return `${service.service} is running with injected ${service.failure} behavior.`;
  }

  return `${service.service} passed health probe in ${service.latencyMs ?? 0}ms.`;
}

function createAlerts(servicesHealth: ServiceHealth[], metric: MetricPoint): AlertItem[] {
  const alerts: AlertItem[] = [];
  const now = new Date().toISOString();

  servicesHealth.forEach((service) => {
    if (service.status === "offline") {
      alerts.push({
        id: `${service.id}-offline`,
        title: `${service.name} offline`,
        severity: "critical",
        service: service.service,
        message: "Health endpoint is unreachable. Expect hard failures and broken request paths.",
        timestamp: now,
      });
      return;
    }

    if (service.failure) {
      alerts.push({
        id: `${service.id}-${service.failure}`,
        title: `${service.name} degraded`,
        severity: service.failure === "crash" ? "critical" : "high",
        service: service.service,
        message: `Injected ${service.failure} is active on ${service.service}.`,
        timestamp: now,
      });
    }
  });

  if (metric.errorRate >= 18) {
    alerts.push({
      id: "error-spike",
      title: "Error spike detected",
      severity: "high",
      service: "gateway",
      message: `Error rate reached ${metric.errorRate.toFixed(1)}%.`,
      timestamp: now,
    });
  }

  if (metric.latency >= 1100) {
    alerts.push({
      id: "latency-spike",
      title: "Latency spike detected",
      severity: "medium",
      service: "gateway",
      message: `Latency climbed to ${Math.round(metric.latency)}ms.`,
      timestamp: now,
    });
  }

  return alerts;
}

function nextMetric(servicesHealth: ServiceHealth[], previous?: MetricPoint): MetricPoint {
  const degradedCount = servicesHealth.filter((service) => service.status !== "healthy").length;
  const activeFailures = servicesHealth.filter((service) => Boolean(service.failure)).length;
  const avgLatency =
    servicesHealth.reduce((sum, service) => sum + (service.latencyMs ?? requestTimeoutMs), 0) / servicesHealth.length;

  const previousRps = previous?.rps ?? 40;
  const rpsBase = Math.max(8, 52 - degradedCount * 7 - activeFailures * 4);
  const rps = Math.max(5, Math.round((previousRps * 0.35 + rpsBase * 0.65 + Math.random() * 6) * 10) / 10);

  const errorRateBase = degradedCount * 6 + activeFailures * 4 + Math.random() * 2;
  const errorRate = Math.round(errorRateBase * 10) / 10;

  const latency = Math.round(avgLatency + degradedCount * 140 + activeFailures * 90 + Math.random() * 80);

  return {
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    rps,
    errorRate,
    latency,
  };
}

function appendLogs(servicesHealth: ServiceHealth[], traceId: string) {
  const store = getStore();
  const timestamp = new Date().toISOString();

  const newLogs = servicesHealth.map<LogEntry>((service) => ({
    id: `${service.id}-${timestamp}`,
    timestamp,
    service: service.service,
    level: service.status === "offline" ? "ERROR" : service.failure ? "WARN" : "INFO",
    message: createLogMessage(service),
    trace_id: traceId,
  }));

  store.logs = trimLogs([...newLogs.reverse(), ...store.logs]);
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const store = getStore();
  const servicesHealth = await Promise.all(services.map((service) => fetchServiceHealth(service.id)));
  const recommendedTraceId = createTraceId();
  store.lastTraceId = recommendedTraceId;
  appendLogs(servicesHealth, recommendedTraceId);

  const metric = nextMetric(servicesHealth, store.metrics.at(-1));
  store.metrics = trimMetrics([...store.metrics, metric]);
  const alerts = createAlerts(servicesHealth, metric);

  return {
    services: servicesHealth,
    logs: store.logs,
    metrics: store.metrics,
    alerts,
    recommendedTraceId,
  };
}

export async function triggerFailure(payload: {
  service: ServiceId;
  type: FailureType;
  intensity: number;
  probability: number;
  duration: number | null;
}) {
  const service = getServiceConfig(payload.service);

  if (!service) {
    throw new Error("Service not found");
  }

  const url = new URL(`${service.url}/inject-failure`);
  url.searchParams.set("type", payload.type);
  url.searchParams.set("intensity", String(payload.intensity));
  url.searchParams.set("probability", String(payload.probability));
  if (payload.duration) {
    url.searchParams.set("duration", String(payload.duration));
  }

  const response = await fetch(url, { method: "POST", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to inject failure on ${service.name}`);
  }

  return response.json();
}

export async function resetFailure(serviceId: ServiceId) {
  const service = getServiceConfig(serviceId);

  if (!service) {
    throw new Error("Service not found");
  }

  const response = await fetch(`${service.url}/reset`, { method: "POST", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to reset ${service.name}`);
  }

  return response.json();
}

function getStepStatus(
  serviceName: string,
  servicesHealth: ServiceHealth[],
): TraceStep["status"] {
  const match = servicesHealth.find((service) => service.service === serviceName);

  if (!match) {
    return "warn";
  }

  if (match.status === "offline") {
    return "error";
  }

  if (match.failure) {
    return "warn";
  }

  return "ok";
}

function getStepLatency(serviceName: string, servicesHealth: ServiceHealth[]) {
  const match = servicesHealth.find((service) => service.service === serviceName);
  return match?.latencyMs ?? requestTimeoutMs;
}

export async function getTrace(traceId: string): Promise<TraceResponse> {
  const snapshot = await getDashboardSnapshot();
  const steps: TraceStep[] = [
    {
      id: "user",
      label: "User Request",
      service: "edge",
      status: "ok",
      latencyMs: 18,
      description: "Client request enters the system and seeds the trace header.",
    },
    {
      id: "product",
      label: "Product Gateway",
      service: "product-service",
      status: getStepStatus("product-service", snapshot.services),
      latencyMs: getStepLatency("product-service", snapshot.services),
      description: "Catalog and cart orchestration starts here; token validation fans out to Auth.",
    },
    {
      id: "auth",
      label: "Auth Validation",
      service: "auth-service",
      status: getStepStatus("auth-service", snapshot.services),
      latencyMs: getStepLatency("auth-service", snapshot.services),
      description: "Validates bearer token and returns identity context for downstream business logic.",
    },
    {
      id: "db",
      label: "DB Read / Write",
      service: "db-service",
      status: getStepStatus("db-service", snapshot.services),
      latencyMs: getStepLatency("db-service", snapshot.services),
      description: "Handles catalog fetches, cart mutation, and the primary chaos fault domain.",
    },
    {
      id: "payment",
      label: "Payment Checkout",
      service: "payment-service",
      status: getStepStatus("payment-service", snapshot.services),
      latencyMs: getStepLatency("payment-service", snapshot.services),
      description: "Completes checkout using the shared trace header for end-to-end request visibility.",
    },
  ];

  const degradedSteps = steps.filter((step) => step.status !== "ok");
  const summary =
    degradedSteps.length === 0
      ? "Trace completed cleanly across Product, Auth, DB, and Payment with no active injected faults."
      : `Trace shows degradation at ${degradedSteps.map((step) => step.label).join(", ")}. Active failures or unreachable health probes are increasing end-to-end latency.`;

  return { traceId, steps, summary };
}
