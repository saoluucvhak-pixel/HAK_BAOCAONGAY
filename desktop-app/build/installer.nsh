!macro customInit
  InitPluginsDir
  File /oname=$PLUGINSDIR\HAK-License.exe "${BUILD_RESOURCES_DIR}\license-bin\HAK-License.exe"
  IfFileExists "$EXEDIR\HAK-CaiDat.haksetup" 0 hakCheckLegacy
  nsExec::ExecToStack /TIMEOUT=45000 '"$PLUGINSDIR\HAK-License.exe" accept-kit "$EXEDIR\HAK-CaiDat.haksetup"'
  Goto hakVerifyResponse
hakCheckLegacy:
  IfFileExists "$EXEDIR\HAK-GiayPhep.haklic" 0 hakCheckExisting
  nsExec::ExecToStack /TIMEOUT=45000 '"$PLUGINSDIR\HAK-License.exe" accept "$EXEDIR\HAK-GiayPhep.haklic"'
  Goto hakVerifyResponse
hakCheckExisting:
  nsExec::ExecToStack /TIMEOUT=45000 '"$PLUGINSDIR\HAK-License.exe" check'
hakVerifyResponse:
  Pop $0
  Pop $1
  StrCmp $0 "0" hakLicenseOkay
  IfSilent hakLicenseDenied
  nsExec::ExecToStack '"$PLUGINSDIR\HAK-License.exe" enroll'
  Pop $0
  Pop $1
  StrCmp $0 "0" hakLicenseOkay
hakLicenseDenied:
  SetErrorLevel 31
  Quit
hakLicenseOkay:
!macroend
