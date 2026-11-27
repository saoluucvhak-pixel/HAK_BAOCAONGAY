@echo off
setlocal
"%~dp0HAK-License.exe" enroll
exit /b %ERRORLEVEL%
