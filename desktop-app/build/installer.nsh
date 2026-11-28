!macro customInit
  InitPluginsDir
  File /oname=$PLUGINSDIR\HAK-License.exe "${BUILD_RESOURCES_DIR}\license-bin\HAK-License.exe"
  File /oname=$PLUGINSDIR\BouncyCastle.Cryptography.dll "${BUILD_RESOURCES_DIR}\license-bin\BouncyCastle.Cryptography.dll"
  IfSilent hakSilent
  ; nsExec starts its child hidden. The interactive helper owns a WinForms dialog.
  ClearErrors
  ExecWait '"$PLUGINSDIR\HAK-License.exe" enroll-install' $0
  IfErrors hakLicenseFailed
  Goto hakVerifyResponse
hakSilent:
  nsExec::ExecToStack /TIMEOUT=45000 '"$PLUGINSDIR\HAK-License.exe" accept-install-qa "$EXEDIR\HAK-CaiDat.haksetup" "$EXEDIR\HAK-PhanHoi.txt"'
  Pop $0
  Pop $1
hakVerifyResponse:
  StrCmp $0 "0" hakLicenseOkay
hakLicenseFailed:
  SetErrorLevel 31
  Quit
hakLicenseOkay:
!macroend
