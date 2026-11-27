param([Parameter(Mandatory)][string]$Installer)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run this signing helper on the disposable GitHub Actions runner.' }
Write-Host 'Creating disposable test certificate.'
$certificate = New-SelfSignedCertificate -Subject 'CN=HAK Windows upgrade test' -Type CodeSigningCert -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(1)
$certificatePath = Join-Path $env:RUNNER_TEMP 'hak-upgrade-test.cer'
"HAK_QA_CERT_THUMBPRINT=$($certificate.Thumbprint)" >> $env:GITHUB_ENV
try {
  Write-Host 'Trusting certificate on the disposable Windows runner.'
  Export-Certificate -Cert $certificate -FilePath $certificatePath | Out-Null
  certutil.exe -f -addstore Root $certificatePath | Out-Host
  if ($LASTEXITCODE) { throw 'Could not trust the QA certificate on the disposable runner.' }
  Write-Host 'Signing NSIS installer and verifying Authenticode.'
  $signature = Set-AuthenticodeSignature -FilePath $Installer -Certificate $certificate -HashAlgorithm SHA256
  if ($signature.Status -ne 'Valid') { throw "Signature verification failed: $($signature.StatusMessage)" }
  Write-Host "Verified test Authenticode signature: $($signature.SignerCertificate.Subject)"
} finally {
  Remove-Item $certificatePath -ErrorAction SilentlyContinue
}
