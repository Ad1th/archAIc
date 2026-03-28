"use client";

import { Activity, AlertTriangle, Cpu, ServerCrash } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceHealth } from "@/lib/types";
import { cn } from "@/lib/utils";

const iconByFailure = {
  healthy: Activity,
  timeout: AlertTriangle,
  error: AlertTriangle,
  cpu: Cpu,
  crash: ServerCrash,
  bad_data: AlertTriangle,
};

export function ServiceCard({ service }: { service: ServiceHealth }) {
  const Icon = iconByFailure[service.failure as keyof typeof iconByFailure] ?? iconByFailure.healthy;
  const isOffline = service.status === "offline";
  const isDegraded = service.status === "degraded";

  return (
    <Card
      className={cn(
        "relative overflow-hidden bg-[#fdfbf7] hover:-translate-y-1",
        isDegraded && "border-warning/70",
        isOffline && "border-danger/70",
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-1",
          isOffline ? "bg-danger" : isDegraded ? "bg-warning" : "bg-success",
        )}
      />
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-xl">{service.name}</CardTitle>
          <p className="mt-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            {service.service}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-secondary p-3">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
              isOffline
                ? "bg-danger/15 text-[#9b625b]"
                : isDegraded
                  ? "bg-warning/20 text-[#9c7b53]"
                  : "bg-success/15 text-[#647b68]",
            )}
          >
            {service.status}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-border bg-[rgba(255,255,255,0.62)] p-4">
            <p className="text-muted-foreground">Failure</p>
            <p className="mt-2 font-medium text-foreground">{service.failure ?? "none"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-[rgba(255,255,255,0.62)] p-4">
            <p className="text-muted-foreground">Latency</p>
            <p className="mt-2 font-medium text-foreground">
              {service.latencyMs === null ? "offline" : `${service.latencyMs} ms`}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {service.detail ?? `Last refresh ${new Date(service.updatedAt).toLocaleTimeString()}`}
        </p>
      </CardContent>
    </Card>
  );
}
