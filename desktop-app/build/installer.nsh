!macro customInit
  InitPluginsDir
  File /oname=$PLUGINSDIR\HAK-License.exe "${BUILD_RESOURCES_DIR}\license-bin\HAK-License.exe"
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
  MessageBox MB_OK|MB_ICONSTOP "Can giay phep HAK duoc duyet cho may va tai khoan Windows nay. Dat HAK-GiayPhep.haklic canh bo cai.$\r$\n$1" /SD IDOK
hakLicenseDenied:
  SetErrorLevel 31
  Quit
hakLicenseOkay:
!macroend
