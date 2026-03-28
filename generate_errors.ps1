param (
    [switch]$DirectInject,
    [switch]$ForceTrigger
)

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  archAIc Chaos Experiment for AI-Ops     " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ─── MODE: Direct ML Injection ────────────────────────────────────────────────
if ($DirectInject -or $ForceTrigger) {
    if ($ForceTrigger) {
        Write-Host "[MODE] Force-Trigger: Bypassing Isolation Forest, firing AI Operator directly" -ForegroundColor Magenta
        $body = '{"error_rate": 0.85, "latency_p95": 4.2, "cpu_usage": 0.92, "force_trigger": true}'
    } else {
        Write-Host "[MODE] Direct-Inject: Pushing anomalous metric vector into Isolation Forest" -ForegroundColor Yellow
        $body = '{"error_rate": 0.85, "latency_p95": 4.2, "cpu_usage": 0.92, "repeat": 3, "force_trigger": false}'
    }

    Write-Host ""
    Write-Host ">> Calling /inject-metrics on anomaly-detector..." -ForegroundColor White
    $response = curl.exe -s -X POST 'http://localhost:8006/inject-metrics' -H 'Content-Type: application/json' -d $body
    Write-Host "Response: $response" -ForegroundColor Green
    Write-Host ""
    Write-Host ">> Watch the AI Operator process the webhook:" -ForegroundColor White
    Write-Host "   kubectl logs -f deployment/ai-operator -n archaics" -ForegroundColor Gray
    Write-Host "   kubectl logs -f deployment/anomaly-detector -n archaics" -ForegroundColor Gray
    exit 0
}

# ─── MODE: Full Pipeline via Prometheus ───────────────────────────────────────
Write-Host "[MODE] Full Pipeline - injecting failures + direct ML trigger" -ForegroundColor White
Write-Host "       This mode injects real failures AND pushes metrics directly" -ForegroundColor DarkGray
Write-Host ""

# Step 1: Inject failures into actual services
Write-Host "[1/5] Injecting 80% error rate on auth-service (60s)..." -ForegroundColor Red
$r = curl.exe -s -X POST 'http://localhost:8001/inject-failure?type=error&probability=0.8&duration=60'
Write-Host "      auth-service: $r"

Write-Host "[2/5] Injecting failures on product-service (60s)..." -ForegroundColor Red
$r = curl.exe -s -X POST 'http://localhost:8003/inject-failure?type=error&probability=0.8&duration=60'
Write-Host "      product-service (error): $r"
$r = curl.exe -s -X POST 'http://localhost:8003/inject-failure?type=timeout&intensity=3&probability=0.5&duration=60'
Write-Host "      product-service (timeout): $r"

Write-Host ""

# Step 2: Generate real traffic to create actual errors
Write-Host "[3/5] Generating traffic to flush errors into Prometheus..." -ForegroundColor Cyan
Write-Host "      Sending 20 requests to auth + product services..."
Write-Host ""

for ($i = 1; $i -le 20; $i++) {
    $r1 = curl.exe -s -o NUL -w "Auth $i -> HTTP %{http_code}" -X POST 'http://localhost:8001/login' -H 'Content-Type: application/json' -d '{"email":"chaos@test.com","password":"chaos123"}'
    $r2 = curl.exe -s -o NUL -w " | Product $i -> HTTP %{http_code}" 'http://localhost:8003/products' -H 'Authorization: Bearer fake-token'
    Write-Host "  $r1$r2"
    Start-Sleep -Milliseconds 300
}

Write-Host ""

# Step 3: Directly inject anomalous metrics to guarantee detection
Write-Host "[4/5] Injecting anomalous metrics directly into ML model..." -ForegroundColor Yellow
Write-Host "      Pre-filling baseline + spiking anomaly vector"
$body = '{"error_rate": 0.75, "latency_p95": 3.5, "cpu_usage": 0.85, "repeat": 3, "force_trigger": false}'
$response = curl.exe -s -X POST 'http://localhost:8006/inject-metrics' -H 'Content-Type: application/json' -d $body
Write-Host "      ML Response: $response" -ForegroundColor Green

Write-Host ""
Write-Host "[5/5] Waiting 5s then force-triggering AI Operator webhook..." -ForegroundColor Magenta
Start-Sleep -Seconds 5

$body2 = '{"error_rate": 0.9, "latency_p95": 5.0, "cpu_usage": 0.95, "force_trigger": true}'
$response2 = curl.exe -s -X POST 'http://localhost:8006/inject-metrics' -H 'Content-Type: application/json' -d $body2
Write-Host "      AI Operator Response: $response2" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Pipeline triggered! Watch the logs...  " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Watch the pipeline:" -ForegroundColor White
Write-Host "  kubectl logs -f deployment/anomaly-detector -n archaics" -ForegroundColor Gray
Write-Host "  kubectl logs -f deployment/ai-operator -n archaics" -ForegroundColor Gray
Write-Host ""
Write-Host "Quick modes:" -ForegroundColor Yellow
Write-Host "  .\generate_errors.ps1 -DirectInject   (ML model only)" -ForegroundColor Yellow
Write-Host "  .\generate_errors.ps1 -ForceTrigger   (bypass ML, fire AI Operator)" -ForegroundColor Yellow
