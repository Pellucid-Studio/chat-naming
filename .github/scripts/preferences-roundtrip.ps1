# Runs the shipped Codex Desktop preferences helper the way the skills do on Windows:
# powershell -NoProfile -ExecutionPolicy Bypass -File preferences.ps1 <args>
param([string]$Shell = 'powershell')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$skills = Join-Path $root 'plugins\codex-desktop\skills'
$helpers = Get-ChildItem -Path $skills -Recurse -Filter preferences.ps1
if ($helpers.Count -ne 3) { throw "expected 3 packaged helpers, found $($helpers.Count)" }
$first = (Get-FileHash $helpers[0].FullName).Hash
foreach ($h in $helpers) { if ((Get-FileHash $h.FullName).Hash -ne $first) { throw "helpers differ: $($h.FullName)" } }
$helper = $helpers[0].FullName

$env:CODEX_HOME = Join-Path ([System.IO.Path]::GetTempPath()) ('chat-naming-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $env:CODEX_HOME | Out-Null

function Invoke-Helper([string[]]$HelperArgs) {
    $out = & $Shell -NoProfile -ExecutionPolicy Bypass -File $helper @HelperArgs 2>&1
    return @{ Code = $LASTEXITCODE; Text = (($out | ForEach-Object { "$_" }) -join "`n").Trim() }
}
function Expect-Ok([string[]]$HelperArgs, [hashtable]$Want) {
    $r = Invoke-Helper $HelperArgs
    if ($r.Code -ne 0) { throw "$($HelperArgs -join ' '): exit $($r.Code): $($r.Text)" }
    $got = $r.Text | ConvertFrom-Json
    foreach ($k in $Want.Keys) {
        if ($got.$k -cne $Want[$k]) { throw "$($HelperArgs -join ' '): $k = '$($got.$k)', want '$($Want[$k])' in $($r.Text)" }
    }
    Write-Host "ok  $($HelperArgs -join ' ')  ->  $($r.Text)"
}
function Expect-Fail([string[]]$HelperArgs, [string]$Code) {
    $r = Invoke-Helper $HelperArgs
    if ($r.Code -eq 0 -or $r.Text -notmatch [regex]::Escape($Code)) { throw "$($HelperArgs -join ' '): want failure $Code, got exit $($r.Code): $($r.Text)" }
    Write-Host "ok  $($HelperArgs -join ' ')  ->  refused ($Code)"
}

Expect-Ok @('read') @{ configured = $false }
Expect-Ok @('save', 'auto', '-', 'phase', '-', 'auto') @{ language_mode = 'auto'; fixed_language = ''; stage_label_kind = 'phase'; stage_label = ''; invocation_mode = 'auto' }
Expect-Ok @('read') @{ schema_version = 1; stage_label_kind = 'phase'; invocation_mode = 'auto' }
$label = -join ([char]0x042D, [char]0x0442, [char]0x0430, [char]0x043F)
Expect-Ok @('save', 'fixed', 'fr', 'custom', $label, 'on-demand') @{ language_mode = 'fixed'; fixed_language = 'fr'; stage_label_kind = 'custom'; stage_label = $label; invocation_mode = 'on-demand' }
Expect-Ok @('read') @{ stage_label = $label; invocation_mode = 'on-demand' }
Expect-Fail @('save', 'fixed', '!!', 'phase', '-', 'auto') 'invalid-language'
Expect-Fail @('save', 'auto', '-', 'custom', ('a' + [char]0x00B7 + 'b'), 'auto') 'invalid-label'
Expect-Fail @('save', 'auto', '-', 'phase', '-', 'always') 'invalid-mode'
Expect-Fail @('delete') 'invalid-command'
Expect-Ok @('read') @{ stage_label = $label }

$file = Join-Path $env:CODEX_HOME 'pellucid-chat-naming\preferences.json'
if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "missing $file" }
Write-Host "preferences file: $file"
Remove-Item -LiteralPath $env:CODEX_HOME -Recurse -Force
