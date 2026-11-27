param([Parameter(Mandatory)][string]$Installer)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Run this signing helper on the disposable GitHub Actions runner.' }
$certificate = New-SelfSignedCertificate -Subject 'CN=HAK Windows upgrade test' -Type CodeSigningCert -CertStoreLocation Cert:\CurrentUser\My
$certificatePath = Join-Path $env:RUNNER_TEMP 'hak-upgrade-test.cer'
try {
  Export-Certificate -Cert $certificate -FilePath $certificatePath | Out-Null
  Import-Certificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
  Import-Certificate -FilePath $certificatePath -CertStoreLocation Cert:\CurrentUser\TrustedPublisher | Out-Null
  $signature = Set-AuthenticodeSignature -FilePath $Installer -Certificate $certificate -HashAlgorithm SHA256
  if ($signature.Status -ne 'Valid') { throw "Signature verification failed: $($signature.StatusMessage)" }
  Write-Host "Verified test Authenticode signature: $($signature.SignerCertificate.Subject)"
} finally {
  foreach ($store in @('Root', 'TrustedPublisher', 'My')) {
    Remove-Item "Cert:\CurrentUser\$store\$($certificate.Thumbprint)" -ErrorAction SilentlyContinue
  }
  Remove-Item $certificatePath -ErrorAction SilentlyContinue
}
