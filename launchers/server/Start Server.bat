@echo off
title Start Delivery & Printer Server
echo ========================================================
echo Starting Delivery POS Bridge & Printer Server...
echo ========================================================

powershell -NoProfile -Command "
$running = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*bridge.js*' }
if ($running) {
    Write-Host '[INFO] Server is ALREADY running (PID: '$running.ProcessId')' -ForegroundColor Yellow
} else {
    Start-Process -FilePath 'node.exe' -ArgumentList 'C:\Users\Dunesuser\Documents\Scripts\tablet-bridge\bridge.js' -WorkingDirectory 'C:\Users\Dunesuser' -WindowStyle Hidden
    Start-Sleep -Seconds 2
    $check = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*bridge.js*' }
    if ($check) {
        Write-Host '[SUCCESS] Delivery & Printer Server started (PID: '$check.ProcessId')' -ForegroundColor Green
        Write-Host 'Active on ports: 9100 (Printers), 8080 (Dashboard)' -ForegroundColor Cyan
    } else {
        Write-Host '[ERROR] Failed to start server. Check logs.' -ForegroundColor Red
    }
}
"

timeout /t 3
exit
