# AutoSortBins Pro - installs the panel for the current user: Premiere Pro and After Effects (a CEP extension)
# and DaVinci Resolve Studio (a Workflow Integration plugin). All three are links to the same "ext" folder.
#   powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ext  = Join-Path $root "ext"

function Link($dest) {
  New-Item -ItemType Directory -Force (Split-Path -Parent $dest) | Out-Null
  if (Test-Path $dest) { cmd /c rmdir "$dest" | Out-Null }
  cmd /c mklink /J "$dest" "$ext" | Out-Null
  Write-Host "Linked: $dest -> $ext"
}

# --- Premiere Pro and After Effects
Link (Join-Path $env:APPDATA "Adobe\CEP\extensions\com.ourtools.autosortbins")
# unsigned panels load only with PlayerDebugMode = 1 (HKCU\Software\Adobe\CSXS.N); this script only checks it
$debug = $false
foreach ($v in 9..13) {
  $p = Get-ItemProperty "HKCU:\Software\Adobe\CSXS.$v" -Name PlayerDebugMode -ErrorAction SilentlyContinue
  if ($p -and "$($p.PlayerDebugMode)" -eq "1") { $debug = $true }
}
if (-not $debug) { Write-Warning "PlayerDebugMode is not enabled: the Adobe panel will not appear until it is set to 1 for your CSXS version" }

# --- DaVinci Resolve Studio
$resolve = Join-Path $env:PROGRAMDATA "Blackmagic Design\DaVinci Resolve\Support"
if (Test-Path $resolve) {
  try { Link (Join-Path $resolve "Workflow Integration Plugins\com.ourtools.autosortbins") }
  catch { Write-Warning "Could not link the Resolve plugin (run this script as administrator): $_" }
  if (-not (Test-Path "C:\Program Files\Blackmagic Design\DaVinci Resolve\fuscript.exe")) {
    Write-Warning "fuscript.exe is not in the default place: set the DR_FUSCRIPT environment variable to its path"
  }
} else { Write-Host "DaVinci Resolve not found: skipped" }

Write-Host "Done. Restart the application, then:"
Write-Host "  Premiere Pro / After Effects: Window > Extensions > AutoSortBins Pro"
Write-Host "  DaVinci Resolve Studio:       Workspace > Workflow Integrations > AutoSortBins Pro"
