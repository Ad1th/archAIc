export type ServiceId = "auth" | "db" | "product" | "payment";

export type FailureType = "timeout" | "error" | "cpu" | "crash" | "bad_data";

export type HealthStatus = "healthy" | "degraded" | "offline";

export type ServiceHealth = {
  id: ServiceId;
  name: string;
  status: HealthStatus;
  service: string;
  failure: string | null;
  latencyMs: number | null;
  updatedAt: string;
  detail?: string;
};

export type LogEntry = {
  id: string;
  timestamp: string;
  service: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  trace_id: string;
};

export type MetricPoint = {
  timestamp: string;
  rps: number;
  errorRate: number;
  latency: number;
};

export type TraceStep = {
  id: string;
  label: string;
  service: string;
  status: "ok" | "warn" | "error";
  latencyMs: number;
  description: string;
};

export type AlertItem = {
  id: string;
  title: string;
  severity: "medium" | "high" | "critical";
  service: string;
  message: string;
  timestamp: string;
};

export type AIEvidenceEntry = {
  timestamp: string;
  trace_id: string;
  service: string;
  alert_type: string;
  evidence: string;
  ai_response: {
    root_cause: string;
    confidence: number;
    action_type: string;
    target: string;
    command: string;
  };
};

export type MLLogEntry = {
  timestamp: string;
  level: string;
  message: string;
};

export type DashboardSnapshot = {
  services: ServiceHealth[];
  logs: LogEntry[];
  mlLogs: MLLogEntry[];
  aiEvidence: AIEvidenceEntry[];
  metrics: MetricPoint[];
  alerts: AlertItem[];
  recommendedTraceId: string;
};

export type TraceResponse = {
  traceId: string;
  steps: TraceStep[];
  summary: string;
};
