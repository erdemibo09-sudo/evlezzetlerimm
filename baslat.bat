@echo off
chcp 65001 >nul
set DENO_TLS_CA_STORE=mozilla,system
echo ============================================================
echo 🍲 Ev Lezzetlerimm — E-Ticaret ve Siparis Yonetim Platformu
echo ☁️  Supabase Bulut Veritabani Baglantisi Aktif
echo 🚀 Tarayicida aciliyor: http://localhost:3000
echo ============================================================
start http://localhost:3000
deno task start
pause
