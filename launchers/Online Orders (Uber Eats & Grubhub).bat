@echo off
title Online Orders - Uber Eats & Grubhub
echo ========================================================
echo Starting Online Orders with Silent Kiosk Auto-Printing...
echo Portal: Uber Eats Merchant Overview & Grubhub
echo Default Printers: Deli (192.168.2.153) & Register
echo ========================================================

start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --new-window "https://merchants-beta.ubereats.com/orders/overview" "https://restaurant.grubhub.com"
exit
