param(
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$Destination
)
$ErrorActionPreference = 'Stop'
$setup = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$Destination") -Wait -PassThru
exit $setup.ExitCode
