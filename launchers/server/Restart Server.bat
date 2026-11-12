@echo off
title Restart Delivery & Printer Server
echo ========================================================
echo Restarting Delivery POS Bridge & Printer Server...
echo ========================================================

powershell -NoProfile -Command "
# 1. Stop existing processes
$procs = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*bridge.js*' }
if ($procs) {
    $procs | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force
        Write-Host '[STOPPED] Stopped server process (PID: ' $_.ProcessId ')' -ForegroundColor Yellow
    }
}
Start-Sleep -Seconds 1

# 2. Start fresh background process
Start-Process -FilePath 'node.exe' -ArgumentList 'C:\Users\Dunesuser\Documents\Scripts\tablet-bridge\bridge.js' -WorkingDirectory 'C:\Users\Dunesuser' -WindowStyle Hidden
Start-Sleep -Seconds 2

# 3. Verify
$check = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*bridge.js*' }
if ($check) {
    Write-Host '[SUCCESS] Server restarted successfully! (PID: '$check.ProcessId')' -ForegroundColor Green
    Write-Host 'Listening on ports: 9100 (Printers), 8080 (Dashboard)' -ForegroundColor Cyan
} else {
    Write-Host '[ERROR] Server failed to start. Check logs.' -ForegroundColor Red
}
"

timeout /t 3
exit
