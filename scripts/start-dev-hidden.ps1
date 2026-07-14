$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe).Source

$processInfo = [System.Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = $node
$processInfo.Arguments = '"node_modules\next\dist\bin\next" dev'
$processInfo.WorkingDirectory = $root
$processInfo.UseShellExecute = $true
$processInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

$process = [System.Diagnostics.Process]::Start($processInfo)
Write-Output $process.Id
