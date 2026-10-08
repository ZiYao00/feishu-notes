param(
    [Parameter(Mandatory = $true)][string]$NodeZip,
    [Parameter(Mandatory = $true)][string]$NodeSha256,
    [string]$Ref = 'HEAD'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Write-Utf8([string]$File, [string]$Value) {
    [System.IO.File]::WriteAllText($File, $Value, $utf8)
}

Push-Location $projectRoot
try {
    $nodeZipPath = (Resolve-Path -LiteralPath $NodeZip).Path
    $nodeName = [System.IO.Path]::GetFileNameWithoutExtension($nodeZipPath)
    if ($nodeName -notmatch '^node-v(\d+\.\d+\.\d+)-win-x64$') { throw 'Use an official node-vVERSION-win-x64.zip.' }
    $nodeVersion = $Matches[1]
    if ($NodeSha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Provide the SHA-256 from the official Node SHASUMS256.txt.' }
    if ((Get-FileHash -LiteralPath $nodeZipPath -Algorithm SHA256).Hash -ne $NodeSha256) { throw 'Node ZIP checksum mismatch.' }
    $commit = (& git rev-parse --verify "$Ref^{commit}").Trim()
    if ($LASTEXITCODE -ne 0) { throw 'The source ref must be a local commit.' }
    $buildRoot = Join-Path $projectRoot ('dist\build-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $buildRoot | Out-Null
    $sourceZip = Join-Path $buildRoot 'source.zip'
    & git archive --format=zip "--output=$sourceZip" $commit
    if ($LASTEXITCODE -ne 0) { throw 'Source export failed.' }
    $sourceArchive = [System.IO.Compression.ZipFile]::OpenRead($sourceZip)
    try {
        foreach ($entry in $sourceArchive.Entries) {
            $name = $entry.FullName
            if ($name.EndsWith('/')) { continue }
            $allowed = $name -match '^(src|scripts|docs)/' -or
                $name -match '^config/(default\.json|local\.example\.json)$' -or
                $name -eq 'secrets/credentials.example.json' -or
                $name -match '^(data/(cache|logs|profiles|state|styles|tmp)|library)/\.gitkeep$' -or
                $name -match '^(\.gitignore|AGENTS\.md|README\.md|package(-lock)?\.json|service\.bat|notes\.bat)$'
            if (-not $allowed -or $name -match '(^|/)\.\.(/|$)|\\|^[A-Za-z]:') { throw "Unexpected source artifact entry: $name" }
        }
    } finally { $sourceArchive.Dispose() }
    $sourceRoot = Join-Path $buildRoot 'source'
    [System.IO.Compression.ZipFile]::ExtractToDirectory($sourceZip, $sourceRoot)
    $package = Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($package.license -ne 'UNLICENSED') { throw 'Review packaging and licensing if the project license changes.' }
    if ($package.version -notmatch '^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$') { throw 'Unexpected package version.' }
    $bundleName = 'feishu-notes-' + $package.version + '-windows-x64'
    $bundleRoot = Join-Path $buildRoot $bundleName
    foreach ($target in @($sourceRoot, $bundleRoot)) {
        if (-not [System.IO.Path]::GetFullPath($target).StartsWith($buildRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Build path escaped its workspace.' }
    }
    Move-Item -LiteralPath $sourceRoot -Destination $bundleRoot
    $nodeExtract = Join-Path $buildRoot 'official-node'
    [System.IO.Compression.ZipFile]::ExtractToDirectory($nodeZipPath, $nodeExtract)
    $officialNode = Join-Path $nodeExtract $nodeName
    $node = Join-Path $officialNode 'node.exe'
    $npmCli = Join-Path $officialNode 'node_modules\npm\bin\npm-cli.js'
    $identity = & $node -p 'JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch})' | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $identity.version -ne $nodeVersion -or $identity.platform -ne 'win32' -or $identity.arch -ne 'x64') { throw 'Unexpected Node runtime identity.' }
    $userConfig = Join-Path $buildRoot 'empty-user.npmrc'
    $globalConfig = Join-Path $buildRoot 'empty-global.npmrc'
    Write-Utf8 $userConfig ''
    Write-Utf8 $globalConfig ''
    $lockPath = Join-Path $bundleRoot 'package-lock.json'
    $lock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($property in $lock.packages.PSObject.Properties) {
        if ($property.Value.hasInstallScript) { throw 'An install script now exists. Review it before changing the ignore-scripts build policy.' }
    }
    $lockBefore = (Get-FileHash -LiteralPath $lockPath -Algorithm SHA256).Hash
    Push-Location $bundleRoot
    try {
        & $node $npmCli ci --ignore-scripts --no-fund '--registry=https://registry.npmjs.org' "--cache=$(Join-Path $buildRoot 'npm-cache')" "--userconfig=$userConfig" "--globalconfig=$globalConfig"
        if ($LASTEXITCODE -ne 0) { throw 'Independent dependency installation failed.' }
        if ((Get-FileHash -LiteralPath $lockPath -Algorithm SHA256).Hash -ne $lockBefore) { throw 'Lock file changed during installation.' }
        & $node 'scripts\service-config.js' --check-dependencies | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Installed dependency verification failed.' }
    } finally { Pop-Location }
    $runtime = Join-Path $bundleRoot 'runtime'
    New-Item -ItemType Directory -Path $runtime | Out-Null
    Copy-Item -LiteralPath $node -Destination (Join-Path $runtime 'node.exe')
    Copy-Item -LiteralPath (Join-Path $officialNode 'LICENSE') -Destination (Join-Path $runtime 'LICENSE')
    $notices = @('# Third-party notices', '', 'Project code: UNLICENSED; no open-source license is granted.', '', "Node.js $nodeVersion Windows x64: full license and bundled notices in runtime/LICENSE.", '', '| Package | Version | License | License/notice files |', '| --- | --- | --- | --- |')
    foreach ($property in $lock.packages.PSObject.Properties) {
        if (-not $property.Name) { continue }
        $modulePath = Join-Path $bundleRoot $property.Name
        $module = Get-Content -LiteralPath (Join-Path $modulePath 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $licenseFiles = @(Get-ChildItem -LiteralPath $modulePath -File | Where-Object { $_.Name -match 'license|copying|notice' } | ForEach-Object { $property.Name + '/' + $_.Name })
        if (-not $licenseFiles.Count) { throw "No distributed license/notice found for $($module.name)." }
        $notices += "| $($module.name) | $($module.version) | $($module.license) | $($licenseFiles -join ', ') |"
    }
    Write-Utf8 (Join-Path $bundleRoot 'THIRD-PARTY-NOTICES.md') ($notices -join "`n")
    $files = @(Get-ChildItem -LiteralPath $bundleRoot -File -Recurse | ForEach-Object {
        [ordered]@{ path = $_.FullName.Substring($bundleRoot.Length + 1).Replace('\', '/'); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
    $manifest = [ordered]@{ version = $package.version; sourceCommit = $commit; nodeVersion = $nodeVersion; nodeZipSha256 = $NodeSha256.ToLowerInvariant(); platform = 'windows-x64'; projectLicense = 'UNLICENSED'; files = $files }
    Write-Utf8 (Join-Path $bundleRoot 'BUILD-MANIFEST.json') ($manifest | ConvertTo-Json -Depth 8)
    $zip = Join-Path $buildRoot ($bundleName + '.zip')
    [System.IO.Compression.ZipFile]::CreateFromDirectory($bundleRoot, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $true)
    $result = [ordered]@{ zip = $zip; sha256 = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant(); sourceCommit = $commit; nodeVersion = $nodeVersion; files = $files.Count + 1 }
    Write-Utf8 (Join-Path $buildRoot 'artifact-result.json') ($result | ConvertTo-Json)
    $result | ConvertTo-Json
} finally { Pop-Location }
