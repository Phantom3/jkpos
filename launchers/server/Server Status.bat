@echo off
title Server Status
echo ========================================================
echo Checking Delivery POS Bridge & Printer Server Status...
echo ========================================================

powershell -NoProfile -Command "
$procs = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*bridge.js*' }
if ($procs) {
    Write-Host '[STATUS: RUNNING]' -ForegroundColor Green
    Write-Host 'Process ID: ' $procs.ProcessId
    Write-Host 'Ports: 9100 (Print Relay), 8080 (Printer Settings Dashboard)'
} else {
    Write-Host '[STATUS: STOPPED]' -ForegroundColor Red
    Write-Host 'The server is not currently running.'
}

Write-Host ''
Write-Host '--- Recent Activity Log ---' -ForegroundColor Cyan
if (Test-Path 'C:\Users\Dunesuser\Documents\Scripts\tablet-bridge\bridge.log') {
    Get-Content 'C:\Users\Dunesuser\Documents\Scripts\tablet-bridge\bridge.log' -Tail 8
}
"

echo ========================================================
pause
