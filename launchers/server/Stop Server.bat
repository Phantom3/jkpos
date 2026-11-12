@echo off
title Stop Delivery & Printer Server
echo ========================================================
echo Stopping Delivery POS Bridge & Printer Server...
echo ========================================================

powershell -NoProfile -Command "
$procs = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*bridge.js*' }
if ($procs) {
    $procs | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force
        Write-Host '[STOPPED] Stopped server process (PID: ' $_.ProcessId ')' -ForegroundColor Green
    }
} else {
    Write-Host '[INFO] No running server was found.' -ForegroundColor Yellow
}
"

timeout /t 3
exit
