import { AIEvidenceEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, TerminalSquare, AlertCircle } from "lucide-react";

export function AIEvidencePanel({ evidence }: { evidence: AIEvidenceEntry[] }) {
  return (
    <Card className="h-full bg-[rgba(255,255,255,0.75)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-indigo-500" />
              AI Operator Evidence Dashboard
            </CardTitle>
            <CardDescription>Generated remediation commands based on context.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[400px] overflow-y-auto space-y-4 font-mono text-sm py-2 px-6">
        {evidence.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Waiting for AI analysis...
          </div>
        ) : (
          evidence.map((entry, idx) => (
            <div key={idx} className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4 shadow-sm">
               <div className="flex justify-between items-center text-xs">
                 <span className="font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                   TRACE: {entry.trace_id}
                 </span>
                 <span className="text-muted-foreground">
                   {new Date(entry.timestamp).toLocaleTimeString()}
                 </span>
               </div>
               
               <div className="border border-red-100 bg-red-50/50 p-3 rounded text-xs text-red-900 overflow-x-auto">
                 <div className="font-semibold flex items-center gap-1 mb-1">
                   <AlertCircle className="w-3 h-3" /> EVIDENCE RECEIVED:
                 </div>
                 {entry.evidence}
               </div>

               <div className="border border-green-100 bg-green-50/50 p-3 rounded text-xs text-green-900">
                 <div className="font-semibold mb-1 text-green-700">AI DIAGNOSIS:</div>
                 <p className="whitespace-pre-wrap">{entry.ai_response.root_cause}</p>
                 <div className="mt-2 flex items-center justify-between font-sans">
                    <span className="bg-white border rounded px-2 py-0.5 shadow-sm text-green-700 text-[10px] font-bold uppercase">
                      Action: {entry.ai_response.action_type}
                    </span>
                    <span className="bg-white border rounded px-2 py-0.5 shadow-sm text-green-700 text-[10px] font-bold uppercase">
                      Target: {entry.ai_response.target}
                    </span>
                 </div>
               </div>
               
               <div className="bg-zinc-950 text-emerald-400 p-3 rounded text-xs overflow-x-auto flex items-start gap-2">
                 <TerminalSquare className="w-4 h-4 shrink-0 text-zinc-500" />
                 <code>{entry.ai_response.command}</code>
               </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
