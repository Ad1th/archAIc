import { MLLogEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

export function MLLogsPanel({ logs }: { logs: MLLogEntry[] }) {
  return (
    <Card className="h-full bg-[rgba(255,255,255,0.75)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
               <BrainCircuit className="h-5 w-5 text-orange-500" />
               Anomaly Detector Log
            </CardTitle>
            <CardDescription>Raw isolation forest multivariate ML evaluations.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[400px] overflow-y-auto font-mono text-xs py-2 px-6">
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Waiting for ML logs...
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, idx) => {
              const dateObj = new Date(log.timestamp);
              const isWarning = log.level === "WARN" || log.level === "WARNING";
              
              return (
                <div key={idx} className="group flex gap-3 rounded px-2 py-1.5 hover:bg-black/5">
                  <span className="shrink-0 text-muted-foreground">
                    {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold w-12",
                      isWarning ? "text-orange-500" : log.level === "ERROR" ? "text-red-500" : "text-sky-500"
                    )}
                  >
                    {log.level}
                  </span>
                  <span className={cn("break-all", isWarning && "text-orange-800 font-medium")}>{log.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
