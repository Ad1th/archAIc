"use client";

import { useMemo, useState } from "react";
import { RefreshCcw, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { services } from "@/lib/config";
import { FailureType, ServiceId } from "@/lib/types";

type FailureControlProps = {
  onInject: (payload: {
    service: ServiceId;
    type: FailureType;
    intensity: number;
    probability: number;
    duration: number | null;
  }) => Promise<void>;
  onReset: (service: ServiceId) => Promise<void>;
  pendingAction: string | null;
};

export function FailureControl({ onInject, onReset, pendingAction }: FailureControlProps) {
  const [service, setService] = useState<ServiceId>("db");
  const [failureType, setFailureType] = useState<FailureType>("timeout");
  const [intensity, setIntensity] = useState(2);
  const [probability, setProbability] = useState(1);
  const [duration, setDuration] = useState(30);

  const activeService = useMemo(
    () => services.find((item) => item.id === service) ?? services[0],
    [service],
  );

  const isInjecting = pendingAction === "inject";
  const isResetting = pendingAction === "reset";

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Failure Injection</CardTitle>
            <CardDescription>
              Trigger controlled chaos to demo cascades, retries, and degraded paths.
            </CardDescription>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="service">Service</Label>
            <Select
              value={service}
              onValueChange={(value) => {
                const nextService = value as ServiceId;
                setService(nextService);
                setFailureType(
                  (services.find((item) => item.id === nextService)?.failureTypes[0] ?? "timeout") as FailureType,
                );
              }}
            >
              <SelectTrigger id="service">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="failure-type">Failure Type</Label>
            <Select value={failureType} onValueChange={(value) => setFailureType(value as FailureType)}>
              <SelectTrigger id="failure-type">
                <SelectValue placeholder="Select failure" />
              </SelectTrigger>
              <SelectContent>
                {activeService.failureTypes.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="intensity">Intensity</Label>
            <Input
              id="intensity"
              type="number"
              min={1}
              value={intensity}
              onChange={(event) => setIntensity(Number(event.target.value) || 1)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="probability">Probability</Label>
            <Input
              id="probability"
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={probability}
              onChange={(event) => setProbability(Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration">Duration (sec)</Label>
            <Input
              id="duration"
              type="number"
              min={1}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value) || 1)}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4 text-primary" />
            Active profile
          </div>
          <p className="mt-3 text-sm leading-6 text-foreground">
            {activeService.name} will receive <span className="font-semibold text-primary">{failureType}</span> at
            intensity <span className="font-semibold">{intensity}</span>, probability{" "}
            <span className="font-semibold">{probability}</span>, duration{" "}
            <span className="font-semibold">{duration}s</span>.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            className="flex-1"
            disabled={isInjecting}
            onClick={() =>
              onInject({
                service,
                type: failureType,
                intensity,
                probability,
                duration,
              })
            }
          >
            {isInjecting ? "Injecting..." : "Inject Failure"}
          </Button>
          <Button className="flex-1" variant="outline" disabled={isResetting} onClick={() => onReset(service)}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {isResetting ? "Resetting..." : "Reset"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
