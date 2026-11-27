param(
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$Destination
)
$ErrorActionPreference = 'Stop'
$setup = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$Destination") -Wait -PassThru
if ($setup.ExitCode -ne 0) { throw "NSIS exited with code $($setup.ExitCode)" }
