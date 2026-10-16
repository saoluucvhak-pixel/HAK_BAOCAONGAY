; ===========================================================================
;  HAK - Bo cai dat "QUAN LY XUAT HANG" (offline HTML/JS app)
;  Tao boi Claude cho Le Thanh Phu Thuy - HAK Group
; ===========================================================================
Unicode true

!include "MUI2.nsh"

Name "HAK - Quan ly xuat hang"
OutFile "HAK_QuanLyXuatHang_Setup.exe"

; Cai theo tung nguoi dung (khong can quyen Admin), duong dan CO DINH de
; du lieu da luu trong trinh duyet (localStorage gan voi duong dan file)
; khong bi mat moi khi cai lai / cap nhat phien ban moi.
InstallDir "$LOCALAPPDATA\HAK\QuanLyXuatHang"
InstallDirRegKey HKCU "Software\HAK\QuanLyXuatHang" "InstallDir"
RequestExecutionLevel user

;--------------------------------
; Giao dien

!define MUI_ABORTWARNING
!define MUI_ICON "app\app.ico"
!define MUI_UNICON "app\app.ico"

!define MUI_WELCOMEPAGE_TITLE "Cai dat / Cap nhat: HAK - Quan ly xuat hang"
!define MUI_WELCOMEPAGE_TEXT "Chuong trinh nay se cai dat (hoac cap nhat) ung dung QUAN LY XUAT HANG cua HAK Group len may tinh nay.$\r$\n$\r$\nUng dung chay hoan toan OFFLINE bang trinh duyet (khong can Internet, khong gui du lieu ra ngoai).$\r$\n$\r$\nLuu y: giu nguyen duong dan cai dat mac dinh de KHONG bi mat du lieu (cac dot da nhap, nhat ky chung tu...) da luu tu ban truoc."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\index.html"
!define MUI_FINISHPAGE_RUN_TEXT "Mo ung dung ngay bay gio"
!define MUI_FINISHPAGE_LINK "Xem huong dan su dung (HUONG_DAN.md)"
!define MUI_FINISHPAGE_LINK_LOCATION "$INSTDIR\HUONG_DAN.md"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Cai dat

Section "Ung dung Quan ly xuat hang" SecApp
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "app\*.*"

  WriteRegStr HKCU "Software\HAK\QuanLyXuatHang" "InstallDir" "$INSTDIR"

  ; Shortcut ngoai Desktop va trong Start Menu - gan icon rieng (app.ico), khong dung icon trang mac dinh
  CreateDirectory "$SMPROGRAMS\HAK"
  CreateShortcut "$SMPROGRAMS\HAK\Quan ly xuat hang.lnk" "$INSTDIR\index.html" "" "$INSTDIR\app.ico" 0
  CreateShortcut "$DESKTOP\HAK - Quan ly xuat hang.lnk" "$INSTDIR\index.html" "" "$INSTDIR\app.ico" 0

  ; Uninstaller + muc trong "Apps & features"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "DisplayName" "HAK - Quan ly xuat hang"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "Publisher" "HAK Group"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "NoRepair" 1
SectionEnd

;--------------------------------
; Go cai (KHONG dong du lieu trinh duyet - chi xoa file chuong trinh)

Section "Uninstall"
  Delete "$SMPROGRAMS\HAK\Quan ly xuat hang.lnk"
  RMDir "$SMPROGRAMS\HAK"
  Delete "$DESKTOP\HAK - Quan ly xuat hang.lnk"

  RMDir /r "$INSTDIR\css"
  RMDir /r "$INSTDIR\js"
  RMDir /r "$INSTDIR\libs"
  RMDir /r "$INSTDIR\templates"
  Delete "$INSTDIR\index.html"
  Delete "$INSTDIR\HUONG_DAN.md"
  Delete "$INSTDIR\app.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang"
  DeleteRegKey HKCU "Software\HAK\QuanLyXuatHang"
SectionEnd
