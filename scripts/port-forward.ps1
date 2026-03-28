# ─── archAIc — Port Forward All Services ─────────────────────────────────────
#
# Usage: .\scripts\port-forward.ps1
#
# Opens port-forwards for all 6 services as background jobs.
# Use  Get-Job  to check status,  Stop-Job -Name 'pf-*'  to kill them all.
# ─────────────────────────────────────────────────────────────────────────────

$forwards = @(
    @{ Name = "pf-auth";     Svc = "svc/auth-service";     Port = "8001:8001"; Ns = "archaics" },
    @{ Name = "pf-db";       Svc = "svc/db-service";       Port = "8002:8002"; Ns = "archaics" },
    @{ Name = "pf-product";  Svc = "svc/product-service";  Port = "8003:8003"; Ns = "archaics" },
    @{ Name = "pf-payment";  Svc = "svc/payment-service";  Port = "8004:8004"; Ns = "archaics" },
    @{ Name = "pf-ai";       Svc = "svc/ai-operator";      Port = "8005:8005"; Ns = "archaics" },
    @{ Name = "pf-ml";       Svc = "svc/anomaly-detector"; Port = "8006:8006"; Ns = "archaics" }
)

Write-Host "Starting port-forwards..." -ForegroundColor Cyan

foreach ($fwd in $forwards) {
    # Remove old job with same name if it exists
    Get-Job -Name $fwd.Name -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue

    Start-Job -Name $fwd.Name -ScriptBlock {
        param($svc, $port, $ns)
        kubectl port-forward $svc $port -n $ns
    } -ArgumentList $fwd.Svc, $fwd.Port, $fwd.Ns | Out-Null

    Write-Host "  [$($fwd.Name)] $($fwd.Svc) -> localhost:$($fwd.Port.Split(':')[0])" -ForegroundColor Green
}

Write-Host "`nAll port-forwards started as background jobs." -ForegroundColor Green
Write-Host "Check status:  Get-Job" -ForegroundColor Yellow
Write-Host "Stop all:      Get-Job -Name 'pf-*' | Stop-Job; Get-Job -Name 'pf-*' | Remove-Job" -ForegroundColor Yellow
Write-Host "`nDashboard:     http://localhost:3000/dashboard" -ForegroundColor Cyan
