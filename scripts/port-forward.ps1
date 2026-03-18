# LearnFlow Port-Forward Script
# Usage:  .\scripts\port-forward.ps1
# Stop:   Press Ctrl+C

$namespace = "learnflow"

$services = @(
    @{ Name = "kong-gateway";        From = 30080; To = 8000; Ns = "learnflow" },
    @{ Name = "triage-service";      From = 8001;  To = 8000; Ns = "learnflow" },
    @{ Name = "concepts-service";    From = 8002;  To = 8000; Ns = "learnflow" },
    @{ Name = "code-review-service"; From = 8003;  To = 8000; Ns = "learnflow" },
    @{ Name = "debug-service";       From = 8004;  To = 8000; Ns = "learnflow" },
    @{ Name = "exercise-service";    From = 8005;  To = 8000; Ns = "learnflow" },
    @{ Name = "progress-service";    From = 8006;  To = 8000; Ns = "learnflow" },
    @{ Name = "docusaurus";          From = 30090; To = 80;   Ns = "docs"      }
)

$jobs = @()

Write-Host "Starting port-forwards for LearnFlow services..." -ForegroundColor Cyan

foreach ($svc in $services) {
    $svcName = $svc.Name
    $fromPort = $svc.From
    $toPort = $svc.To
    $job = Start-Job -ScriptBlock {
        param($n, $p, $t, $ns)
        kubectl port-forward "svc/$n" "${p}:${t}" -n $ns
    } -ArgumentList $svcName, $fromPort, $toPort, $svc.Ns

    $jobs += $job
    Write-Host "  + $svcName -> localhost:$fromPort" -ForegroundColor Green
}

Write-Host ""
Write-Host "All 8 services forwarded. Press Ctrl+C to stop." -ForegroundColor Yellow

try {
    while ($true) {
        foreach ($job in $jobs) {
            Receive-Job -Job $job -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
        }
        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host "`nStopping all port-forwards..." -ForegroundColor Red
    $jobs | Stop-Job
    $jobs | Remove-Job
    Write-Host "Done." -ForegroundColor Green
}
