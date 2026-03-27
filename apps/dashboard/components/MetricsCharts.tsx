"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricPoint } from "@/lib/types";

export function MetricsCharts({ metrics }: { metrics: MetricPoint[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <MetricCard
        title="Requests / second"
        description="Synthetic load derived from current service state."
        color="#f6c446"
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={metrics}>
            <defs>
              <linearGradient id="rpsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f6c446" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#f6c446" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="timestamp" tick={{ fill: "#95a2bd", fontSize: 12 }} />
            <YAxis tick={{ fill: "#95a2bd", fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "#101725", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16 }}
            />
            <Area type="monotone" dataKey="rps" stroke="#f6c446" fill="url(#rpsFill)" strokeWidth={2.2} />
          </AreaChart>
        </ResponsiveContainer>
      </MetricCard>

      <MetricCard title="Error rate" description="Higher when failures are active." color="#f87171">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={metrics}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="timestamp" tick={{ fill: "#95a2bd", fontSize: 12 }} />
            <YAxis tick={{ fill: "#95a2bd", fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "#101725", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16 }}
            />
            <Line type="monotone" dataKey="errorRate" stroke="#f87171" strokeWidth={2.4} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </MetricCard>

      <MetricCard title="Latency" description="P95-style latency estimate in milliseconds." color="#38bdf8">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={metrics}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="timestamp" tick={{ fill: "#95a2bd", fontSize: 12 }} />
            <YAxis tick={{ fill: "#95a2bd", fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "#101725", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16 }}
            />
            <Line type="monotone" dataKey="latency" stroke="#38bdf8" strokeWidth={2.4} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </MetricCard>
    </div>
  );
}

function MetricCard({
  title,
  description,
  color,
  children,
}: {
  title: string;
  description: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
