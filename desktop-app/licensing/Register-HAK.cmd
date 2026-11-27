@echo off
setlocal
set "OUT=%TEMP%\HAK-YeuCau.hakreq"
"%~dp0HAK-License.exe" request "%OUT%"
if errorlevel 1 (
  echo Khong tao duoc yeu cau. Kiem tra TPM va chay bang tai khoan Windows se su dung app.
  pause
  exit /b 1
)
echo Gui file HAK-YeuCau.hakreq cho quan tri vien HAK.
explorer.exe /select,"%OUT%"
