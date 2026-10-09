param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$skill = Join-Path $root 'skill\feishu-notes'
$relativeFiles = @(
  'SKILL.md',
  'agents/openai.yaml',
  'references/chatgpt-codexpro.md',
  'references/local-agent.md',
  'references/validation.md'
)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$stage = Join-Path $root ('data\tmp\agent-skill-package-' + $stamp)
$directory = Join-Path $stage 'feishu-notes'
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
foreach ($relative in $relativeFiles) {
  $source = Join-Path $skill ($relative.Replace('/', '\'))
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing Skill file: $relative" }
  $dest = Join-Path $directory ($relative.Replace('/', '\'))
  [System.IO.Directory]::CreateDirectory((Split-Path -Parent $dest)) | Out-Null
  Copy-Item -LiteralPath $source -Destination $dest
}
$front = [System.IO.File]::ReadAllText((Join-Path $directory 'SKILL.md'))
if ($front -notmatch '(?s)^---\s+name: feishu-notes\s+description:') { throw 'Invalid SKILL.md frontmatter' }
$release = Join-Path $root 'release'
[System.IO.Directory]::CreateDirectory($release) | Out-Null
$target = Join-Path $release 'skill.zip'
if (Test-Path -LiteralPath $target) {
  $backup = Join-Path $root ('data\backups\agent-skill-' + $stamp + '.zip')
  Copy-Item -LiteralPath $target -Destination $backup
}
$tempZip = Join-Path $release ('skill-' + $stamp + '.next.zip')
$outStream = [System.IO.File]::Open($tempZip,[System.IO.FileMode]::CreateNew)
$writer = New-Object System.IO.Compression.ZipArchive($outStream,[System.IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach ($relative in $relativeFiles) {
    $entry = $writer.CreateEntry(('feishu-notes/' + $relative),[System.IO.Compression.CompressionLevel]::Optimal)
    $source = [System.IO.File]::OpenRead((Join-Path $directory ($relative.Replace('/', '\'))))
    $targetStream = $entry.Open()
    try {$source.CopyTo($targetStream)}
    finally {$targetStream.Dispose();$source.Dispose()}
  }
} finally {$writer.Dispose();$outStream.Dispose()}
$zip = [System.IO.Compression.ZipFile]::OpenRead($tempZip)
try {
  $actual = @($zip.Entries | Where-Object { -not $_.FullName.EndsWith('/') -and -not $_.FullName.EndsWith('\') } | ForEach-Object {$_.FullName.Replace('\','/')})
  $expected = @($relativeFiles | ForEach-Object {'feishu-notes/' + $_})
  if ($actual.Count -ne $expected.Count) { throw "Wrong file count $($actual.Count)" }
  foreach ($name in $actual) { if ($expected -notcontains $name) { throw "Unexpected file in ZIP: $name" } }
} finally {$zip.Dispose()}
if ((Get-Item -LiteralPath $tempZip).Length -gt 25MB) { throw 'Skill exceeds 25 MB' }
Move-Item -LiteralPath $tempZip -Destination $target -Force
Write-Output ([ordered]@{
  zip = $target
  sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  fileCount = $relativeFiles.Count
  sizeBytes = (Get-Item -LiteralPath $target).Length
} | ConvertTo-Json)
