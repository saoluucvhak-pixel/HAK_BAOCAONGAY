@echo off
setlocal
rem ==================================================================
rem  GHEP FILE CAI DAT "Bao cao ngay" - chay bang cach NHAP DUP
rem  Dat file nay CUNG THU MUC voi 3 file BaoCaoNgay_Setup_0x.part
rem ==================================================================
title Ghep file cai dat Bao cao ngay
cd /d "%~dp0"

set "OUT=BaoCaoNgay_Setup.exe"
set "EXPECTED=__SHA256__"

echo.
echo  === GHEP FILE CAI DAT "BAO CAO NGAY" ===
echo.

set "MISSING="
for %%P in (BaoCaoNgay_Setup_00.part BaoCaoNgay_Setup_01.part BaoCaoNgay_Setup_02.part) do (
  if not exist "%%P" (
    echo  [THIEU] Khong tim thay file %%P
    set "MISSING=1"
  )
)
if defined MISSING (
  echo.
  echo  Hay tai du 3 file .part va dat CUNG THU MUC voi file GHEP_FILE.bat nay, roi chay lai.
  goto :END
)

echo  Dang ghep 3 file .part ...
if exist "%OUT%" del /f /q "%OUT%" >nul 2>&1
copy /b /y "BaoCaoNgay_Setup_00.part"+"BaoCaoNgay_Setup_01.part"+"BaoCaoNgay_Setup_02.part" "%OUT%" >nul
if errorlevel 1 goto :COPYFAIL
if not exist "%OUT%" goto :COPYFAIL
echo  Da ghep xong: %OUT%
echo.

echo  Dang kiem tra tinh toan ven (SHA256) ...
set "GOT="
for /f "skip=1 delims=" %%H in ('certutil -hashfile "%OUT%" SHA256 2^>nul') do if not defined GOT set "GOT=%%H"
if defined GOT set "GOT=%GOT: =%"
if not defined GOT for /f "delims=" %%H in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 -LiteralPath '%OUT%').Hash" 2^>nul') do set "GOT=%%H"

if not defined GOT (
  echo  [CANH BAO] Khong kiem tra duoc SHA256 tren may nay - file van da ghep xong.
  goto :ASK
)
if /i "%GOT%"=="%EXPECTED%" (
  echo  [OK] SHA256 khop - file cai dat nguyen ven.
  goto :ASK
)
echo  [LOI] SHA256 KHONG khop - file bi hong khi tai ve.
echo        Mong doi : %EXPECTED%
echo        Thuc te  : %GOT%
echo  Hay tai lai 3 file .part roi chay lai file nay. KHONG nen cai file vua ghep.
del /f /q "%OUT%" >nul 2>&1
goto :END

:ASK
echo.
choice /c CK /n /m " Mo trinh cai dat ngay bay gio? [C = Co / K = Khong]: "
if errorlevel 2 goto :DONE
start "" "%OUT%"
:DONE
echo.
echo  File cai dat: %CD%\%OUT%
goto :END

:COPYFAIL
echo  [LOI] Ghep file that bai (o dia day hoac khong co quyen ghi vao thu muc nay).
echo        Thu chep 3 file .part va file .bat sang thu muc khac (vd Desktop) roi chay lai.

:END
echo.
pause
endlocal
