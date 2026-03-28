# ─── archAIc — Full Deploy Script ────────────────────────────────────────────
#
# Usage:  .\scripts\deploy.ps1
#
# What this does:
#   1. Loads the GEMINI_API_KEY from .env
#   2. Patches infra/k8s/base/kustomization.yaml with the real key
#   3. Builds all Docker images directly into Minikube's image cache
#   4. Applies the full Kustomize stack to the 'archaics' namespace
#   5. Waits for rollout and prints port-forward instructions
#
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot   # repo root
$Infra = "$Root\infra\k8s\base"
$Services = "$Root\services"
$EnvFile = "$Root\.env"

# ── 1. Load .env ────────────────────────────────────────────────────────────
Write-Host "`n[1/6] Loading .env ..." -ForegroundColor Cyan
if (-not (Test-Path $EnvFile)) {
    Write-Error ".env file not found at $EnvFile. Copy .env.example and fill in your keys."
    exit 1
}

$envVars = @{}
Get-Content $EnvFile | Where-Object { $_ -match "^\s*[^#\s]" } | ForEach-Object {
    $parts = $_ -split "=", 2
    if ($parts.Count -eq 2) {
        $envVars[$parts[0].Trim()] = $parts[1].Trim()
    }
}

$GroqKey = $envVars["GROQ_API_KEY"]
if ([string]::IsNullOrWhiteSpace($GroqKey) -or $GroqKey -eq "PLACEHOLDER_REPLACE_ME") {
    Write-Error "GROQ_API_KEY is missing or placeholder in .env. Set a real key first."
    exit 1
}

Write-Host "  GROQ_API_KEY loaded: $($GroqKey.Substring(0,6))..." -ForegroundColor Green

# ── 2. Patch the real keys into kustomization.yaml ──────────────────────────
Write-Host "`n[2/6] Patching GROQ keys into kustomization.yaml ..." -ForegroundColor Cyan
$KustFile = "$Infra\kustomization.yaml"
$kustContent = Get-Content $KustFile -Raw
$kustContent = $kustContent -replace "GROQ_API_KEY=.*", "GROQ_API_KEY=$GroqKey"
Set-Content $KustFile $kustContent -NoNewline
Write-Host "  Done." -ForegroundColor Green

# ── 3. Point docker to Minikube's daemon ─────────────────────────────────
Write-Host "`n[3/6] Configuring Docker to use Minikube daemon ..." -ForegroundColor Cyan
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# ── 4. Build all images ─────────────────────────────────────────────────────
Write-Host "`n[4/6] Building Docker images ..." -ForegroundColor Cyan

$images = @(
    @{ Name = "auth-service:latest";       Context = "$Services\auth" },
    @{ Name = "db-service:latest";         Context = "$Services\db" },
    @{ Name = "product-service:latest";    Context = "$Services\product" },
    @{ Name = "payment-service:latest";    Context = "$Services\payment" },
    @{ Name = "ai-operator:latest";        Context = "$Services\ai-operator" },
    @{ Name = "anomaly-detector:v2";       Context = "$Services\anomaly-detector" }
)

foreach ($img in $images) {
    Write-Host "  Building $($img.Name) ..." -ForegroundColor Yellow
    docker build -t $img.Name $img.Context
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build $($img.Name)"
        exit 1
    }
}
Write-Host "  All images built." -ForegroundColor Green

# ── 5. Apply Kustomize stack ────────────────────────────────────────────────
Write-Host "`n[5/6] Applying Kustomize stack to namespace 'archaics' ..." -ForegroundColor Cyan
kubectl apply -k $Infra
if ($LASTEXITCODE -ne 0) {
    Write-Error "kubectl apply -k failed"
    exit 1
}

# Restart any running deployments to pick up new images & secrets
Write-Host "  Rolling restart to pick up new images ..." -ForegroundColor Yellow
$deployments = @("auth-service","db-service","product-service","payment-service","ai-operator","anomaly-detector")
foreach ($dep in $deployments) {
    kubectl rollout restart deployment/$dep -n archaics 2>$null
}

# ── 6. Wait for rollouts ────────────────────────────────────────────────────
Write-Host "`n[6/6] Waiting for all deployments to be ready ..." -ForegroundColor Cyan
foreach ($dep in $deployments) {
    Write-Host "  Waiting for $dep ..." -ForegroundColor Yellow
    kubectl rollout status deployment/$dep -n archaics --timeout=120s
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  Deploy complete! Run port-forwards in separate terminals:" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  # Microservices (required for dashboard service cards + failure injection)"
Write-Host "  kubectl port-forward svc/auth-service    8001:8001 -n archaics"
Write-Host "  kubectl port-forward svc/db-service      8002:8002 -n archaics"
Write-Host "  kubectl port-forward svc/product-service 8003:8003 -n archaics"
Write-Host "  kubectl port-forward svc/payment-service 8004:8004 -n archaics"
Write-Host ""
Write-Host "  # AI Pipeline (required for ML logs + AI Evidence panels)"
Write-Host "  kubectl port-forward svc/ai-operator     8005:8005 -n archaics"
Write-Host "  kubectl port-forward svc/anomaly-detector 8006:8006 -n archaics"
Write-Host ""
Write-Host "  # Then start the dashboard:"
Write-Host "  cd apps\dashboard && npm run dev   -> http://localhost:3000/dashboard"
Write-Host ""
