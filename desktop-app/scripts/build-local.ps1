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
  try {
    $env:HAK_LICENSE_QA = '0'
    $env:HAK_REQUIRE_SIGNING = '0'
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    Remove-Item Env:WIN_CSC_LINK, Env:WIN_CSC_KEY_PASSWORD, Env:CSC_LINK, Env:CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
    Push-Location $root
    try {
      Run-Tool 'npm.cmd' @('run', 'release')
      & (Join-Path $PSScriptRoot 'audit-installer.ps1') -ReleaseDir $releaseDir
      Write-Host "Bộ cài và HAK-CapPhep.html: $releaseDir"
    } finally {
      Pop-Location
    }
  } finally {
    Remove-Item Env:HAK_LICENSE_QA, Env:HAK_REQUIRE_SIGNING, Env:CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
