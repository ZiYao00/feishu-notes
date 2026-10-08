param([string]$Command = '')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$entryFile = Join-Path $projectRoot 'src\cli.js'
$configScript = Join-Path $PSScriptRoot 'service-config.js'
$logDirectory = Join-Path $projectRoot 'data\logs'
$logFile = Join-Path $logDirectory 'viewer.log'
$allowedCommands = @('start', 'stop', 'restart', 'status', 'open', 'start-open')

function Get-Settings {
    $bundledNode = Join-Path $projectRoot 'runtime\node.exe'
    if (Test-Path -LiteralPath $bundledNode -PathType Leaf) { $script:nodeExe = $bundledNode }
    else { $script:nodeExe = (Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
    if (-not $script:nodeExe) { throw 'Node.js was not found. Install Node.js 24 LTS and reopen the terminal.' }
    $output = & $script:nodeExe $configScript
    if ($LASTEXITCODE -ne 0) { throw 'Environment/configuration check failed. Follow the message above.' }
    return ($output | ConvertFrom-Json)
}

function Get-Listeners {
    return @(Get-NetTCPConnection -LocalPort $script:settings.port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-Owner([int]$ProcessId) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $processInfo -or -not $processInfo.CommandLine) { return $false }
    $pattern = '(?:^|\s)"?' + [regex]::Escape($entryFile) + '"?\s+serve(?:\s|$)'
    return [regex]::IsMatch($processInfo.CommandLine, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
}

function Get-ViewerPid {
    foreach ($processId in (Get-Listeners)) {
        if (Test-Owner $processId) { return $processId }
    }
    return $null
}

function Assert-Dependencies {
    & $script:nodeExe $configScript --check-dependencies | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Project dependencies are unavailable. In the project folder, run npm.cmd ci.' }
}

function Start-Viewer {
    $viewerPid = Get-ViewerPid
    if ($viewerPid) { Write-Host "Viewer is already running (PID $viewerPid)."; return }
    $otherPids = Get-Listeners
    if ($otherPids.Count) { throw "Port $($script:settings.port) is occupied by another process (PID $($otherPids -join ', ')). Change viewer.port in config/local.json; nothing was stopped." }
    Assert-Dependencies
    if (-not (Test-Path -LiteralPath $entryFile -PathType Leaf)) { throw 'Missing src/cli.js. Extract the complete source package.' }
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $argumentLine = '"' + $entryFile + '" serve'
    $started = Start-Process -FilePath $script:nodeExe -ArgumentList $argumentLine -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError ($logFile + '.err') -PassThru
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (Get-ViewerPid) { Write-Host 'Viewer started in background.'; Write-Host "URL: $($script:settings.url)"; return }
        $started.Refresh()
        if ($started.HasExited) { break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $started.HasExited -and (Test-Owner $started.Id)) { Stop-Process -Id $started.Id -Force }
    throw "Viewer did not start. Check $logFile and $logFile.err."
}

function Stop-Viewer {
    $viewerPid = Get-ViewerPid
    if (-not $viewerPid) { Write-Host 'Viewer is not running. Nothing was stopped.'; return }
    if (-not (Test-Owner $viewerPid)) { throw 'Process ownership changed; refusing to stop it.' }
    Stop-Process -Id $viewerPid -Force
    Write-Host 'Viewer stopped.'
}

function Show-Status {
    $viewerPid = Get-ViewerPid
    if ($viewerPid) { Write-Host "Viewer status: running (PID $viewerPid)" }
    else { Write-Host 'Viewer status: stopped' }
    Write-Host 'Node.js: supported'
    try { Assert-Dependencies; Write-Host 'Dependencies: installed' }
    catch { Write-Host 'Dependencies: missing or incomplete (run npm.cmd ci)' }
    Write-Host "URL: $($script:settings.url)"
    Write-Host "Log: $logFile"
}

function Open-Viewer {
    if (-not (Get-ViewerPid)) { throw 'Viewer is not running. Start it first.' }
    Start-Process -FilePath $script:settings.url
}

function Invoke-ViewerCommand([string]$Mode) {
    $script:settings = Get-Settings
    switch ($Mode) {
        'start' { Start-Viewer }
        'stop' { Stop-Viewer }
        'restart' { Stop-Viewer; Start-Viewer }
        'status' { Show-Status }
        'open' { Open-Viewer }
        'start-open' { Start-Viewer; Open-Viewer }
    }
}

if ($Command) {
    if ($allowedCommands -notcontains $Command) { Write-Host 'Valid commands: start, stop, restart, status, open, start-open'; exit 1 }
    try { Invoke-ViewerCommand $Command; exit 0 }
    catch { Write-Host $_.Exception.Message; exit 1 }
}

while ($true) {
    Clear-Host
    Write-Host 'feishu-notes Local Viewer'
    try { Invoke-ViewerCommand 'status' } catch { Write-Host $_.Exception.Message }
    Write-Host "Project: $projectRoot"
    Write-Host '1. Start viewer in background'
    Write-Host '2. Stop viewer'
    Write-Host '3. Restart viewer'
    Write-Host '4. Open browser'
    Write-Host '5. Start viewer and open browser'
    Write-Host '6. Check status'
    Write-Host '0. Exit'
    $choice = Read-Host 'Choose'
    if ($choice -eq '0') { exit 0 }
    $mode = @{ '1' = 'start'; '2' = 'stop'; '3' = 'restart'; '4' = 'open'; '5' = 'start-open'; '6' = 'status' }[$choice]
    if ($mode) {
        try { Invoke-ViewerCommand $mode } catch { Write-Host $_.Exception.Message }
        Read-Host 'Press Enter to continue' | Out-Null
    }
}
