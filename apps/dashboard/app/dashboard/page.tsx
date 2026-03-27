"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertOctagon, BellRing, Network, RefreshCcwDot } from "lucide-react";

import { FailureControl } from "@/components/FailureControl";
import { LogsPanel } from "@/components/LogsPanel";
import { MetricsCharts } from "@/components/MetricsCharts";
import { ServiceCard } from "@/components/ServiceCard";
import { TraceViewer } from "@/components/TraceViewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchDashboard, fetchTrace, injectFailure, resetFailure } from "@/lib/api";
import { AlertItem, DashboardSnapshot, ServiceId, TraceResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const refreshIntervalMs = 2500;

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await fetchDashboard();
        if (!active) {
          return;
        }
        setSnapshot(data);
        setErrorMessage(null);
      } catch (error) {
        if (!active) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard");
      }
    };

    void load();
    const interval = setInterval(() => void load(), refreshIntervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!snapshot?.recommendedTraceId || trace) {
      return;
    }

    void handleTraceLookup(snapshot.recommendedTraceId);
  }, [snapshot?.recommendedTraceId]);

  const handleInject = async (payload: {
    service: ServiceId;
    type: string;
    intensity: number;
    probability: number;
    duration: number | null;
  }) => {
    try {
      setPendingAction("inject");
      await injectFailure(payload);
      const data = await fetchDashboard();
      setSnapshot(data);
      setTrace(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to inject failure");
    } finally {
      setPendingAction(null);
    }
  };

  const handleReset = async (service: ServiceId) => {
    try {
      setPendingAction("reset");
      await resetFailure({ service });
      const data = await fetchDashboard();
      setSnapshot(data);
      setTrace(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reset failure");
    } finally {
      setPendingAction(null);
    }
  };

  async function handleTraceLookup(traceId: string) {
    try {
      setTraceLoading(true);
      const data = await fetchTrace(traceId);
      setTrace(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load trace");
    } finally {
      setTraceLoading(false);
    }
  }

  const headlineStats = useMemo(() => {
    if (!snapshot) {
      return {
        healthy: 0,
        degraded: 0,
        alerts: 0,
      };
    }

    return {
      healthy: snapshot.services.filter((service) => service.status === "healthy").length,
      degraded: snapshot.services.filter((service) => service.status !== "healthy").length,
      alerts: snapshot.alerts.length,
    };
  }, [snapshot]);

  if (!snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="text-sm text-muted-foreground">Loading archAIc control plane...</div>
      </main>
    );
  }

  return (
    <main className="panel-grid min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1220]/80 p-6 shadow-glow backdrop-blur-xl lg:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.38em] text-primary">archAIc observability</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
                Real-time chaos dashboard for distributed microservices.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                Health probes, injected failure controls, synthetic traffic analytics, live trace walkthroughs, and
                demo-ready alerts in one control surface.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeroStat label="Healthy" value={headlineStats.healthy} icon={Network} />
              <HeroStat label="Degraded" value={headlineStats.degraded} icon={AlertOctagon} />
              <HeroStat label="Alerts" value={headlineStats.alerts} icon={BellRing} />
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className="rounded-3xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {snapshot.services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr,0.9fr]">
          <FailureControl onInject={handleInject} onReset={handleReset} pendingAction={pendingAction} />
          <TraceViewer
            trace={trace}
            suggestedTraceId={snapshot.recommendedTraceId}
            onLookup={handleTraceLookup}
            loading={traceLoading}
          />
        </section>

        <section>
          <MetricsCharts metrics={snapshot.metrics} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.25fr,0.75fr]">
          <LogsPanel logs={snapshot.logs} />
          <AlertsPanel alerts={snapshot.alerts} />
        </section>
      </div>
    </main>
  );
}

function HeroStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-2.5">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Alerts</CardTitle>
            <CardDescription>Error spikes, latency spikes, and unhealthy services.</CardDescription>
          </div>
          <div className="rounded-2xl border border-warning/20 bg-warning/10 p-3 text-warning">
            <RefreshCcwDot className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-black/20 p-6 text-sm text-muted-foreground">
            No active alerts. System behavior is within expected bounds.
          </div>
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{alert.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{alert.message}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                    alert.severity === "critical"
                      ? "bg-danger/15 text-danger"
                      : alert.severity === "high"
                        ? "bg-warning/15 text-warning"
                        : "bg-accent/15 text-accent",
                  )}
                >
                  {alert.severity}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{alert.service}</span>
                <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
