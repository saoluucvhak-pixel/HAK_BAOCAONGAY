$ErrorActionPreference = 'Stop'

function Select-File([string]$Title, [string]$Filter) {
  $picker = New-Object System.Windows.Forms.OpenFileDialog
  try {
    $picker.Title = $Title
    $picker.Filter = $Filter
    if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
    return $picker.FileName
  } finally {
    $picker.Dispose()
  }
}

function Run-Tool([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command kết thúc với lỗi $LASTEXITCODE." }
}

try {
  $root = Split-Path -Parent $PSScriptRoot
  $releaseDir = Join-Path $root 'release'
  if (Test-Path -LiteralPath $releaseDir) {
    if (@(Get-ChildItem -LiteralPath $releaseDir -Force).Count -gt 0) {
      throw 'Thư mục release đang có dữ liệu. Chuyển bản phát hành cũ sang thư mục lưu trữ rồi chạy lại.'
    }
  }

  foreach ($tool in @('node.exe', 'npm.cmd', 'dotnet.exe')) {
    Get-Command $tool -ErrorAction Stop | Out-Null
  }
  if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules/.bin/electron-builder.cmd'))) {
    throw 'Máy này chưa được chuẩn bị công cụ đóng gói. IT cần cài trước phụ thuộc Windows theo README.'
  }
  Run-Tool 'node.exe' @((Join-Path $root '../app/scripts/verify-build.mjs'))
  Add-Type -AssemblyName System.Windows.Forms
  $publicPath = Select-File 'Chọn khóa công khai HAK' 'Khóa công khai (*.jwk)|*.jwk'
  if (-not $publicPath) { exit 0 }
  $certificatePath = Select-File 'Chọn chứng thư ký bộ cài của công ty' 'Chứng thư PFX/P12 (*.pfx;*.p12)|*.pfx;*.p12'
  if (-not $certificatePath) { exit 0 }

  $password = Read-Host 'Mật khẩu chứng thư ký bộ cài' -AsSecureString
  $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
  try {
    $env:WIN_CSC_LINK = $certificatePath
    $env:WIN_CSC_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
    $env:HAK_LICENSE_PUBLIC_KEY = [IO.File]::ReadAllText($publicPath)
    $env:HAK_LICENSE_QA = '0'
    $env:HAK_REQUIRE_SIGNING = '1'
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    Push-Location $root
    try {
      Run-Tool 'npm.cmd' @('run', 'release')
      & (Join-Path $PSScriptRoot 'audit-installer.ps1') -ReleaseDir $releaseDir -RequireSignature -RequireTimestamp
      $registration = Get-AuthenticodeSignature -LiteralPath (Join-Path $releaseDir 'registration/HAK-License.exe')
      if ($registration.Status -ne 'Valid' -or -not $registration.TimeStamperCertificate) {
        throw 'Công cụ đăng ký HAK thiếu chữ ký Authenticode hoặc dấu thời gian hợp lệ.'
      }
      Write-Host "Xong. Bộ cài và công cụ cấp phép nằm tại $releaseDir"
    } finally {
      Pop-Location
    }
  } finally {
    Remove-Item Env:WIN_CSC_LINK, Env:WIN_CSC_KEY_PASSWORD, Env:HAK_LICENSE_PUBLIC_KEY, Env:HAK_LICENSE_QA, Env:HAK_REQUIRE_SIGNING, Env:CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
