@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -File "%~dp0scripts\build-local.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" echo Khong the dong bo cai. Xem thong bao o tren.
pause
exit /b %RESULT%
