param([Parameter(Mandatory)][string]$Installer, [switch]$ExpectHidden)

$ErrorActionPreference = 'Stop'
$existingHelpers = @(Get-Process -Name HAK-License -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$setup = Start-Process -FilePath $Installer -PassThru
$activation = $null
try {
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $activation = Get-Process -Name HAK-License -ErrorAction SilentlyContinue |
            Where-Object { $_.Id -notin $existingHelpers -and $_.MainWindowTitle -like '*Báo cáo ngày HAK' } |
            Select-Object -First 1
        if ($activation -or $setup.HasExited) { break }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)

    if ($ExpectHidden) {
        $helper = Get-Process -Name HAK-License -ErrorAction SilentlyContinue |
            Where-Object { $_.Id -notin $existingHelpers } |
            Select-Object -First 1
        if ($activation -or !$helper -or $setup.HasExited) {
            throw 'Old setup did not reproduce the live activation process without a visible dialog.'
        }
        Write-Host 'Confirmed: old setup and HAK-License are running without a visible activation dialog.'
        return
    }
    if (!$activation) { throw 'The interactive setup did not show the HAK activation window.' }
    if (!$activation.CloseMainWindow()) { throw 'Could not cancel the HAK activation window.' }
    if (!$setup.WaitForExit(15000) -or $setup.ExitCode -ne 31) {
        throw 'Setup did not exit with code 31 after activation was canceled.'
    }
} finally {
    Get-Process -Name HAK-License -ErrorAction SilentlyContinue |
        Where-Object { $_.Id -notin $existingHelpers } |
        Stop-Process -ErrorAction SilentlyContinue
    if (!$setup.HasExited) { Stop-Process -Id $setup.Id -ErrorAction SilentlyContinue }
}
