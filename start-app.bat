@echo off
title JKRestaurant Web Server
cd /d "%~dp0\backend"
echo ====================================================
echo Starting JKRestaurant Web Client & MS SQL Server API
echo ====================================================
echo Connecting to DUNESSERVER\JKSOFT (JKRTDB)...
node server.js
pause
