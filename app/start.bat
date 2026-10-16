@echo off
chcp 65001 >nul
title HE THONG BAO CAO - Dai Hiep
echo Dang mo He thong bao cao...
echo Neu Windows hoi "Windows Defender Firewall", chon "Allow access" (chi cho phep may tinh nay tu ket noi voi chinh no).
node "%~dp0server.mjs"
if errorlevel 1 (
  echo.
  echo Khong chay duoc. Kiem tra da cai Node.js chua ^(tai tai https://nodejs.org^), roi thu lai.
  pause
)
