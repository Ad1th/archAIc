"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TraceResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

type TraceViewerProps = {
  trace: TraceResponse | null;
  suggestedTraceId: string;
  onLookup: (traceId: string) => Promise<void>;
  loading: boolean;
};

export function TraceViewer({ trace, suggestedTraceId, onLookup, loading }: TraceViewerProps) {
  const [traceId, setTraceId] = useState(suggestedTraceId);

  useEffect(() => {
    setTraceId((current) => current || suggestedTraceId);
  }, [suggestedTraceId]);

  return (
    <Card className="h-full bg-[#fdfbf7]">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Trace Viewer</CardTitle>
            <CardDescription>Follow a request path across the distributed graph.</CardDescription>
          </div>
          <div className="rounded-2xl border border-accent/30 bg-accent/10 p-3 text-primary">
            <Route className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row">
          <Input value={traceId} onChange={(event) => setTraceId(event.target.value)} placeholder="Enter trace_id" />
          <Button disabled={loading || !traceId.trim()} onClick={() => onLookup(traceId.trim())}>
            {loading ? "Loading..." : "Inspect Trace"}
          </Button>
        </div>

        {trace ? (
          <>
            <div className="rounded-2xl border border-border bg-[rgba(255,255,255,0.68)] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Flow Summary</p>
              <p className="mt-2 text-sm leading-6 text-foreground">{trace.summary}</p>
            </div>
            <div className="grid gap-3">
              {trace.steps.map((step, index) => (
                <div key={step.id} className="flex items-start gap-3">
                  <div className="flex min-w-8 flex-col items-center">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold",
                        step.status === "error"
                          ? "border-danger/50 bg-danger/15 text-[#9b625b]"
                          : step.status === "warn"
                            ? "border-warning/50 bg-warning/20 text-[#9c7b53]"
                            : "border-[#b7a186] bg-[#efe3d0] text-[#7b654e]",
                      )}
                    >
                      {index + 1}
                    </div>
                    {index < trace.steps.length - 1 ? <ArrowRight className="mt-2 h-4 w-4 text-accent" /> : null}
                  </div>
                  <div
                    className={cn(
                      "flex-1 rounded-2xl border p-4",
                      step.status === "ok"
                        ? "border-[#dccfbf] bg-[#fcf7f0]"
                        : "border-border bg-[rgba(255,255,255,0.68)]",
                    )}
                  >
                    <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                      <div>
                        <p className="text-sm font-semibold">{step.label}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {step.service}
                        </p>
                      </div>
                      <div className="text-sm text-muted-foreground">{step.latencyMs} ms</div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-[rgba(255,255,255,0.68)] p-8 text-center text-sm text-muted-foreground">
            Load the suggested trace to see the distributed request path.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
