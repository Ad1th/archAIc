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
        color="#c8a97e"
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={metrics}>
            <defs>
              <linearGradient id="rpsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c8a97e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#c8a97e" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(161,134,111,0.14)" vertical={false} />
            <XAxis dataKey="timestamp" tick={{ fill: "#6b6b6b", fontSize: 12 }} />
            <YAxis tick={{ fill: "#6b6b6b", fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "#fdfbf7", border: "1px solid rgba(232,226,217,1)", borderRadius: 16, color: "#1e1e1e" }}
            />
            <Area type="monotone" dataKey="rps" stroke="#c8a97e" fill="url(#rpsFill)" strokeWidth={2.2} />
          </AreaChart>
        </ResponsiveContainer>
      </MetricCard>

      <MetricCard title="Error rate" description="Higher when failures are active." color="#c68a82">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={metrics}>
            <CartesianGrid stroke="rgba(161,134,111,0.14)" vertical={false} />
            <XAxis dataKey="timestamp" tick={{ fill: "#6b6b6b", fontSize: 12 }} />
            <YAxis tick={{ fill: "#6b6b6b", fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "#fdfbf7", border: "1px solid rgba(232,226,217,1)", borderRadius: 16, color: "#1e1e1e" }}
            />
            <Line type="monotone" dataKey="errorRate" stroke="#c68a82" strokeWidth={2.4} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </MetricCard>

      <MetricCard title="Latency" description="P95-style latency estimate in milliseconds." color="#a1866f">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={metrics}>
            <CartesianGrid stroke="rgba(161,134,111,0.14)" vertical={false} />
            <XAxis dataKey="timestamp" tick={{ fill: "#6b6b6b", fontSize: 12 }} />
            <YAxis tick={{ fill: "#6b6b6b", fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "#fdfbf7", border: "1px solid rgba(232,226,217,1)", borderRadius: 16, color: "#1e1e1e" }}
            />
            <Line type="monotone" dataKey="latency" stroke="#a1866f" strokeWidth={2.4} dot={false} />
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
    <Card className="bg-[#fdfbf7]">
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
