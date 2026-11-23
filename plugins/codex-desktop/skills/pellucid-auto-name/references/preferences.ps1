# Windows counterpart of preferences.sh: same commands, checks and JSON output.
# Settings live in %CODEX_HOME%\pellucid-chat-naming\preferences.json (default %USERPROFILE%\.codex).
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File preferences.ps1 read
#      powershell -NoProfile -ExecutionPolicy Bypass -File preferences.ps1 save <language_mode> <language_tag|none> <kind> <label|none> <mode>
# "none" stands for the empty language tag of automatic language and the empty label of a preset numbering:
# Windows PowerShell 5.1 drops empty arguments and reads "-" as a parameter name.
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

function Fail([string]$code) { [Console]::Error.WriteLine($code); exit 1 }

if ($env:OS -ne 'Windows_NT') { Fail 'unsupported-platform' }

$profileDir = if ($env:CODEX_HOME) { $env:CODEX_HOME } elseif ($env:USERPROFILE) { Join-Path $env:USERPROFILE '.codex' } else { $null }
if (-not $profileDir -or -not [System.IO.Path]::IsPathRooted($profileDir) -or $profileDir -match '^[\\/](?![\\/])') { Fail 'invalid-profile' }
$profileDir = [System.IO.Path]::GetFullPath($profileDir)
$dir = Join-Path $profileDir 'pellucid-chat-naming'
$prefs = Join-Path $dir 'preferences.json'

function Test-Reparse([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $false }
    $item = Get-Item -LiteralPath $path -Force
    return [bool]($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
}
function Assert-SafePaths { if ((Test-Reparse $dir) -or (Test-Reparse $prefs)) { Fail 'unsafe-preferences-path' } }

function Get-CodePointCount([string]$s) {
    $n = 0
    foreach ($ch in $s.ToCharArray()) { if (-not [char]::IsLowSurrogate($ch)) { $n++ } }
    return $n
}

function Test-Values($languageMode, $fixedLanguage, $stageKind, $stageLabel, $mode) {
    foreach ($v in @($languageMode, $fixedLanguage, $stageKind, $stageLabel, $mode)) {
        if ($v -isnot [string]) { Fail 'invalid-preferences' }
    }
    switch -CaseSensitive ($languageMode) {
        'auto' { if ($fixedLanguage -ne '') { Fail 'invalid-language' } }
        'fixed' {
            if ($fixedLanguage.Length -gt 63 -or $fixedLanguage -cnotmatch '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$') { Fail 'invalid-language' }
        }
        default { Fail 'invalid-language' }
    }
    switch -CaseSensitive ($stageKind) {
        { $_ -in 'phase', 'level', 'step' } { if ($stageLabel -ne '') { Fail 'invalid-label' } }
        'custom' {
            if ($stageLabel -eq '') { Fail 'invalid-label' }
            if ($stageLabel.Contains([string][char]0x00B7) -or $stageLabel.Contains([string][char]0x2014) -or $stageLabel.Contains([string][char]0x2026)) { Fail 'invalid-label' }
            if ($stageLabel -match '[\x00-\x1F\x7F]') { Fail 'invalid-label' }
            if ((Get-CodePointCount $stageLabel) -gt 24) { Fail 'invalid-label' }
            if ($stageLabel -notmatch '\S') { Fail 'invalid-label' }
        }
        default { Fail 'invalid-label' }
    }
    if ($mode -cne 'auto' -and $mode -cne 'on-demand') { Fail 'invalid-mode' }
}

function Read-Settings {
    if (-not (Test-Path -LiteralPath $prefs -PathType Leaf)) { Write-Output '{"configured":false}'; return }
    if ((Get-Item -LiteralPath $prefs -Force).Length -gt 4096) { Fail 'invalid-preferences' }
    try { $data = [System.IO.File]::ReadAllText($prefs, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } catch { Fail 'invalid-preferences' }
    $version = $data.schema_version
    if (-not (($version -is [int] -or $version -is [long]) -and $version -eq 1)) { Fail 'invalid-preferences' }
    Test-Values $data.language_mode $data.fixed_language $data.stage_label_kind $data.stage_label $data.invocation_mode
    $out = [ordered]@{
        fixed_language   = $data.fixed_language
        invocation_mode  = $data.invocation_mode
        language_mode    = $data.language_mode
        schema_version   = 1
        stage_label      = $data.stage_label
        stage_label_kind = $data.stage_label_kind
    }
    Write-Output ($out | ConvertTo-Json -Compress)
}

$command = if ($args.Count -gt 0) { $args[0] } else { '' }
switch -CaseSensitive ($command) {
    'read' {
        if ($args.Count -ne 1) { Fail 'invalid-command' }
        Assert-SafePaths
        Read-Settings
    }
    'save' {
        if ($args.Count -ne 6) { Fail 'invalid-preferences' }
        $values = @($args[1..5] | ForEach-Object { [string]$_ })
        if ($values[0] -ceq 'auto' -and $values[1] -ceq 'none') { $values[1] = '' }
        if ($values[2] -cin @('phase', 'level', 'step') -and $values[3] -ceq 'none') { $values[3] = '' }
        Test-Values $values[0] $values[1] $values[2] $values[3] $values[4]
        Assert-SafePaths
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Assert-SafePaths
        $json = [ordered]@{
            schema_version   = 1
            language_mode    = $values[0]
            fixed_language   = $values[1]
            stage_label_kind = $values[2]
            stage_label      = $values[3]
            invocation_mode  = $values[4]
        } | ConvertTo-Json -Compress
        $scratch = Join-Path $dir ('.preferences.' + [System.IO.Path]::GetRandomFileName())
        try {
            [System.IO.File]::WriteAllText($scratch, $json, (New-Object System.Text.UTF8Encoding $false))
            if (Test-Path -LiteralPath $prefs) { [System.IO.File]::Replace($scratch, $prefs, $null) } else { [System.IO.File]::Move($scratch, $prefs) }
        } finally {
            if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Force }
        }
        Read-Settings
    }
    default { Fail 'invalid-command' }
}
