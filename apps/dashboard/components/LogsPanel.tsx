"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogEntry } from "@/lib/types";

export function LogsPanel({ logs }: { logs: LogEntry[] }) {
  const [serviceFilter, setServiceFilter] = useState("all");
  const [traceFilter, setTraceFilter] = useState("");

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      const serviceMatch = serviceFilter === "all" || entry.service === serviceFilter;
      const traceMatch = !traceFilter || entry.trace_id.toLowerCase().includes(traceFilter.toLowerCase());
      return serviceMatch && traceMatch;
    });
  }, [logs, serviceFilter, traceFilter]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Live Logs</CardTitle>
        <CardDescription>Streaming structured events with service and trace correlation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[220px,1fr]">
          <div className="space-y-2">
            <Label htmlFor="service-filter">Service Filter</Label>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger id="service-filter">
                <SelectValue placeholder="Filter service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                <SelectItem value="auth-service">auth-service</SelectItem>
                <SelectItem value="db-service">db-service</SelectItem>
                <SelectItem value="product-service">product-service</SelectItem>
                <SelectItem value="payment-service">payment-service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trace-filter">Trace ID</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="trace-filter"
                className="pl-10"
                placeholder="Filter by trace_id"
                value={traceFilter}
                onChange={(event) => setTraceFilter(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="max-h-[440px] overflow-y-auto rounded-3xl border border-white/10 bg-black/25">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-[#0f1726]/90 backdrop-blur">
              <tr className="border-b border-white/10 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Trace ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((entry) => (
                <tr key={entry.id} className="border-b border-white/5 align-top">
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-white/5 px-2 py-1 text-xs">{entry.service}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{entry.message}</td>
                  <td className="px-4 py-3 font-mono text-xs text-primary">{entry.trace_id}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No logs match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
