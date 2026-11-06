@echo off
chcp 65001 >nul
echo ============================================================
echo 🍲 Ev Yemeklerim — E-Ticaret ve Siparis Yonetim Platformu
echo 🚀 Tarayicida aciliyor: http://localhost:3000
echo ============================================================
start http://localhost:3000
deno task start
pause
