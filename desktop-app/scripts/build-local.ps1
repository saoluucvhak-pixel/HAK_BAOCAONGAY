$ErrorActionPreference = 'Stop'

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
    Push-Location $root
    try { Run-Tool 'npm.cmd' @('ci') }
    finally { Pop-Location }
  }
  Run-Tool 'node.exe' @((Join-Path $root '../app/scripts/verify-build.mjs'))
  $issuerFile = Join-Path $env:LOCALAPPDATA 'HAK\Issuer\HAK-KhoaRieng.hakkey'
  $firstRun = -not (Test-Path -LiteralPath $issuerFile)
  if ($firstRun) {
    $password = Read-Host 'Đặt mật khẩu quản trị HAK (ít nhất 12 ký tự)' -AsSecureString
  } else {
    $password = Read-Host 'Nhập mật khẩu quản trị HAK' -AsSecureString
  }
  $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
  $repeatPtr = [IntPtr]::Zero
  try {
    $env:HAK_LOCAL_ISSUER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
    if ($firstRun) {
      $repeated = Read-Host 'Nhập lại mật khẩu quản trị HAK' -AsSecureString
      $repeatPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($repeated)
      if (-not [string]::Equals($env:HAK_LOCAL_ISSUER_PASSWORD, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($repeatPtr), [StringComparison]::Ordinal)) {
        throw 'Hai mật khẩu chưa khớp.'
      }
    }
    $publicKey = & node.exe (Join-Path $PSScriptRoot 'local-issuer.mjs') $issuerFile
    if ($LASTEXITCODE -ne 0 -or -not $publicKey) { throw 'Không mở được khóa quản trị HAK.' }
  } finally {
    Remove-Item Env:HAK_LOCAL_ISSUER_PASSWORD -ErrorAction SilentlyContinue
    if ($repeatPtr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($repeatPtr)
    }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
  }

  try {
    $env:HAK_LICENSE_PUBLIC_KEY = $publicKey
    $env:HAK_LICENSE_QA = '0'
    $env:HAK_REQUIRE_SIGNING = '0'
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    Remove-Item Env:WIN_CSC_LINK, Env:WIN_CSC_KEY_PASSWORD, Env:CSC_LINK, Env:CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
    Push-Location $root
    try {
      Run-Tool 'npm.cmd' @('run', 'release')
      & (Join-Path $PSScriptRoot 'audit-installer.ps1') -ReleaseDir $releaseDir
      Write-Host "Bộ cài và HAK-CapPhep.html: $releaseDir"
      Write-Host "Khóa dùng để duyệt máy: $issuerFile"
    } finally {
      Pop-Location
    }
  } finally {
    Remove-Item Env:HAK_LICENSE_PUBLIC_KEY, Env:HAK_LICENSE_QA, Env:HAK_REQUIRE_SIGNING, Env:CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
