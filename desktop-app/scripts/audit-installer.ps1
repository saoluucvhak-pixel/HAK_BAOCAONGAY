# HAK - Windows installer audit and reproducible manifest
# Không coi bộ cài chưa ký số hoặc chưa quét là "an toàn".
param(
  [Parameter(Mandatory=$true)][string]$ReleaseDir,
  [switch]$RequireSignature,
  [switch]$RequireTimestamp
)
$ErrorActionPreference = 'Stop'
$release = (Resolve-Path -LiteralPath $ReleaseDir).Path
$files = @(Get-ChildItem -LiteralPath $release -Filter '*.exe' -File)
if ($files.Count -eq 0) { throw 'Không tìm thấy Windows Setup EXE trong release.' }

$records = @()
foreach ($file in $files) {
  $sig = Get-AuthenticodeSignature -LiteralPath $file.FullName
  $sigStatus = [string]$sig.Status
  $digest = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($RequireSignature -and $sigStatus -ne 'Valid') {
    throw "Chứng thư ký số đã được cấu hình nhưng EXE không có chữ ký hợp lệ: $($file.Name) ($sigStatus)"
  }
  if ($RequireTimestamp -and ($sigStatus -ne 'Valid' -or -not $sig.TimeStamperCertificate)) {
    throw "Thiếu dấu thời gian Authenticode hợp lệ: $($file.Name)"
  }
  if ($sigStatus -notin @('Valid','NotSigned')) {
    throw "Chữ ký Windows không hợp lệ: $($file.Name) ($sigStatus)"
  }
  $records += [pscustomobject]@{
    filename = $file.Name
    bytes = $file.Length
    sha256 = $digest
    authenticode = $sigStatus
    signer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
    signer_thumbprint = if ($sig.SignerCertificate) { $sig.SignerCertificate.Thumbprint } else { $null }
    timestamped = [bool]$sig.TimeStamperCertificate
  }
}

# Chỉ công bố kết quả scan nếu máy runner thật sự bật Microsoft Defender.
$scanStatus = 'not_available'
$scanDetails = 'Chưa quét độc lập; không kết luận file an toàn.'
$scanCmd = Get-Command Start-MpScan -ErrorAction SilentlyContinue
$statusCmd = Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue
if ($scanCmd -and $statusCmd) {
  try {
    $av = Get-MpComputerStatus -ErrorAction Stop
    if ($av.AntivirusEnabled -and $av.AMServiceEnabled) {
      foreach ($file in $files) { Start-MpScan -ScanType CustomScan -ScanPath $file.FullName -ErrorAction Stop }
      $detections = @(Get-MpThreatDetection -ErrorAction Stop | Where-Object {
        $resources = @($_.Resources) -join '|'
        @($files | Where-Object { $resources.Contains($_.FullName) }).Count -gt 0
      })
      if ($detections.Count -gt 0) { throw 'Microsoft Defender đã phát hiện mối đe dọa trên bộ cài.' }
      $scanStatus = 'completed_no_detection'
      $scanDetails = 'Đã thực hiện Microsoft Defender custom scan, không có phát hiện liên quan tới đường dẫn bộ cài.'
    } else {
      $scanDetails = 'Microsoft Defender không bật trên Windows runner; không có kết quả quét.'
    }
  } catch {
    if ($_.Exception.Message -match 'phát hiện mối đe dọa') { throw }
    $scanStatus = 'not_available'
    $scanDetails = 'Không hoàn tất được Microsoft Defender scan trên runner: ' + $_.Exception.Message
  }
}

$report = [ordered]@{
  project = 'HAK_BAOCAONGAY'
  source_commit = $env:GITHUB_SHA
  github_run = $env:GITHUB_RUN_ID
  checked_utc = (Get-Date).ToUniversalTime().ToString('o')
  windows_defender_status = $scanStatus
  windows_defender_note = $scanDetails
  note = 'SHA256 và provenance không thay thế chữ ký Authenticode hoặc chứng nhận sạch mã độc.'
  installers = $records
}
$reportPath = Join-Path $release 'INSTALLER_SECURITY.json'
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding utf8
$shaPath = Join-Path $release 'SHA256SUMS.txt'
$records | ForEach-Object { "$($_.sha256)  $($_.filename)" } | Set-Content -LiteralPath $shaPath -Encoding utf8
Write-Host "HAK installer audit saved: $reportPath"
Write-Host "Authenticode: $(($records | ForEach-Object { $_.authenticode }) -join ', ')"
Write-Host "Windows Defender scan: $scanStatus"
if (@($records | Where-Object { $_.authenticode -eq 'NotSigned' }).Count -gt 0) {
  Write-Warning 'Installer chưa ký số. Google/SmartScreen vẫn có thể chặn; không nên ép tải hoặc tắt bảo vệ.'
}
