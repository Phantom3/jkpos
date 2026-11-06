@echo off
title Online Orders - Uber Eats & Grubhub
echo ========================================================
echo Starting Online Orders with Direct Web Order Grabber...
echo Portal: Uber Eats Merchant Overview & Grubhub
echo Syncing To: JKRestaurant POS (Take Out) & Thermal Printers
echo Extension: C:\Users\Dunesuser\jkrestaurant-web\browser-extension
echo ========================================================

start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --load-extension="C:\Users\Dunesuser\jkrestaurant-web\browser-extension" --new-window "https://merchants-beta.ubereats.com/orders/overview" "https://restaurant.grubhub.com"
exit
