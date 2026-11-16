# Agent Maturity Compass Studio for Windows: starts AMC Studio in your own workspace (or the view-only demo with -Demo),
# then opens the Compass Console in your browser. -Stop stops it. The first run adds a Start menu shortcut with the AMC
# icon (-NoShortcut skips that). Built and unit-tested on macOS only; not yet run on Windows (docs/DESKTOP_PACKAGES.md).
# The packager fills the __AMC_...__ values (scripts/desktop/files.mjs).
param([switch]$Demo, [switch]$Stop, [switch]$NoShortcut)
$ErrorActionPreference = "Stop"

$Package = Join-Path $PSScriptRoot "__AMC_PACKAGE_NAME__"
$PackageDigest = "__AMC_PACKAGE_SHA256__"
$NodeMinMajor = __AMC_NODE_MIN_MAJOR__
$AppDir = Join-Path $env:LOCALAPPDATA "Agent Maturity Compass"
$LogDir = Join-Path $AppDir "Logs"
$LogFile = Join-Path $LogDir "studio-launcher.log"
$RuntimeDir = Join-Path $AppDir "runtime"
$WorkspaceDir = Join-Path $AppDir "workspace"
$DemoDir = Join-Path $AppDir "studio-workspace"
$DigestFile = Join-Path $RuntimeDir "package.sha256"
$AmcBin = Join-Path $RuntimeDir "node_modules\.bin\amc.cmd"
$InstallLimitSeconds = 900
$StartLimitSeconds = 300
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# The app's own ports, away from the 3210-3212 a terminal amc up uses, so both can run at once (as on macOS).
# A variable already set wins. The demo and your workspace never run together, so they share them.
$AppPorts = [ordered]@{ AMC_STUDIO_PORT = "3232"; AMC_HOST_PORT = "3232"; AMC_GATEWAY_PORT = "3230"; AMC_PROXY_PORT = "3231"; AMC_DASHBOARD_PORT = "4193"; AMC_METRICS_PORT = "9484" }
foreach ($Name in $AppPorts.Keys) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name))) { Set-Item -LiteralPath "env:$Name" -Value $AppPorts[$Name] }
}

function Write-Log([string]$Text) { Add-Content -LiteralPath $LogFile -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Text) }
function Stop-Launcher([string]$Text) { Write-Log $Text; throw $Text }

# Stops a process and every process under it (npm starts node, prebuild-install, node-gyp and compilers).
function Stop-Tree([int]$ProcessId) { & taskkill.exe /PID $ProcessId /T /F *> $null }

# Runs an npm or amc .cmd file through cmd.exe with its output in the log, stops it and its children after $Seconds,
# and returns its exit code, or 124 when the limit stopped it. Closing this window or Ctrl+C stops it too (finally).
$script:Child = $null
function Invoke-Limited([int]$Seconds, [string]$WorkingDirectory, [string]$Command, [string[]]$Arguments) {
  $Quoted = (@($Command) + $Arguments | ForEach-Object { '"' + $_ + '"' }) -join " "
  $Out = Join-Path $LogDir "step-out.log"
  $Err = Join-Path $LogDir "step-err.log"
  $script:Child = Start-Process -FilePath $env:ComSpec -ArgumentList "/d /s /c `"$Quoted`"" -WorkingDirectory $WorkingDirectory `
    -NoNewWindow -PassThru -RedirectStandardOutput $Out -RedirectStandardError $Err
  $null = $script:Child.Handle # Windows PowerShell 5.1 fills ExitCode only for a process whose handle was read
  $Finished = $script:Child.WaitForExit($Seconds * 1000)
  if (-not $Finished) { Stop-Tree $script:Child.Id }
  $Code = if ($Finished) { $script:Child.ExitCode } else { 124 }
  $script:Child = $null
  foreach ($File in @($Out, $Err)) { if (Test-Path -LiteralPath $File) { Get-Content -LiteralPath $File | Add-Content -LiteralPath $LogFile; Remove-Item -LiteralPath $File -Force } }
  return $Code
}

# The Studio daemon a workspace's state.json names, when that pid is really one (a stale file's pid may now be another program's).
function Get-LiveDaemon([string]$Dir) {
  $StateFile = Join-Path $Dir ".amc\studio\state.json"
  if (-not (Test-Path -LiteralPath $StateFile)) { return $null }
  $DaemonPid = try { [int](Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json).pid } catch { 0 }
  $CommandLine = if ($DaemonPid -gt 0) { try { (Get-CimInstance Win32_Process -Filter "ProcessId=$DaemonPid" -ErrorAction Stop).CommandLine } catch { $null } } else { $null }
  if ($CommandLine -and $CommandLine.Contains("_studio-daemon")) { return $DaemonPid }
  # No Studio daemon runs under that pid, so the state file is stale; the runtime must not trust it.
  Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
  return $null
}

# Stops the Studio of one workspace and waits for it to release its ports.
# AMC_NO_AUTO_REBUILD: an old runtime about to be replaced must not repair its database engine first.
function Stop-Studio([string]$Dir) {
  $DaemonPid = Get-LiveDaemon $Dir
  if (-not $DaemonPid -or -not (Test-Path -LiteralPath $AmcBin)) { return }
  Push-Location -LiteralPath $Dir
  $NoAutoRebuild = $env:AMC_NO_AUTO_REBUILD
  $env:AMC_NO_AUTO_REBUILD = "1"
  $ErrorActionPreference = "Continue"
  & $AmcBin down *>> $LogFile
  $ErrorActionPreference = "Stop"
  $env:AMC_NO_AUTO_REBUILD = $NoAutoRebuild
  Pop-Location
  Wait-Process -Id $DaemonPid -Timeout 15 -ErrorAction SilentlyContinue
}

# Finds node and holds it to the one rule (package.json engines), saying which one it picked.
function Assert-Node {
  $Node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $Node) { Stop-Launcher "AMC needs Node.js $NodeMinMajor or newer, and none was found on this computer. Install Node.js from https://nodejs.org, then start Agent Maturity Compass Studio again." }
  $NodeVersion = (& $Node.Source --version) -replace '[^A-Za-z0-9.+-]', ''
  $NodeMajor = 0
  [void][int]::TryParse(($NodeVersion.TrimStart("v") -split "\.")[0], [ref]$NodeMajor)
  if ($NodeMajor -lt $NodeMinMajor) {
    Stop-Launcher "AMC needs Node.js $NodeMinMajor or newer, and the one found on this computer is Node.js $NodeVersion ($($Node.Source)). Install a newer Node.js from https://nodejs.org, then start Agent Maturity Compass Studio again."
  }
  Write-Log "Using Node.js $NodeVersion at $($Node.Source)"
  Write-Host "Using Node.js $NodeVersion ($($Node.Source))"
}

# Installs the included package into the version-pinned runtime when its digest changed (first launch or an upgrade).
function Install-Runtime {
  if (-not (Test-Path -LiteralPath $Package -PathType Leaf)) { Stop-Launcher "This folder is missing its AMC package ($Package). Download the archive again." }
  $ActualPackageDigest = (Get-FileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($ActualPackageDigest -ne $PackageDigest.ToLowerInvariant()) { Stop-Launcher "The AMC package in this folder failed its integrity check, so it was not installed. Download the archive again." }
  Assert-Node
  $CurrentDigest = if (Test-Path -LiteralPath $DigestFile) { (Get-Content -LiteralPath $DigestFile -Raw).Trim() } else { "" }
  if ($CurrentDigest -eq $PackageDigest -and (Test-Path -LiteralPath $AmcBin)) { return }
  $Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $Npm) { Stop-Launcher "AMC needs npm, which comes with Node.js, and it was not found. Reinstall Node.js from https://nodejs.org, then start Agent Maturity Compass Studio again." }
  if ($CurrentDigest) { Write-Host "Updating AMC to the version in this folder." } else { Write-Host "Installing AMC (first launch only). This takes a minute or two." }
  # Stop the Studios the previous runtime started, so the upgraded runtime serves the console.
  Stop-Studio $WorkspaceDir
  Stop-Studio $DemoDir
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  # npm downloads AMC's dependencies: 30 s per request and two retries, and $InstallLimitSeconds for the whole install.
  $Code = Invoke-Limited $InstallLimitSeconds $RuntimeDir $Npm.Source @("install", "--prefix", $RuntimeDir, "--no-audit", "--no-fund", $Package,
    "--fetch-timeout=30000", "--fetch-retries=2", "--fetch-retry-maxtimeout=10000")
  if ($Code -eq 124) { Stop-Launcher "Installing AMC took longer than $($InstallLimitSeconds / 60) minutes, so it was stopped. On first launch AMC downloads its parts from the internet. Check the network connection, then start Agent Maturity Compass Studio again. Details are in $LogFile." }
  if ($Code -ne 0) { Stop-Launcher "Installing AMC failed: npm could not finish, often because this computer is offline. Details are in $LogFile. Check the network connection, then start Agent Maturity Compass Studio again." }
  Set-Content -LiteralPath $DigestFile -Value $PackageDigest -NoNewline
}

# Why a taken port stops AMC: another AMC Studio (its command line names _studio-daemon) or another program, by name.
function Get-PortProblem {
  foreach ($Port in @($env:AMC_STUDIO_PORT, $env:AMC_HOST_PORT, $env:AMC_GATEWAY_PORT, $env:AMC_PROXY_PORT, $env:AMC_DASHBOARD_PORT, $env:AMC_METRICS_PORT)) {
    $Listener = Get-NetTCPConnection -State Listen -LocalPort ([int]$Port) -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $Listener) { continue }
    $Owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($Listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($Owner -and $Owner.CommandLine -and $Owner.CommandLine.Contains("_studio-daemon")) {
      $How = if (Get-Command amc -ErrorAction SilentlyContinue) { "To stop it, type amc down in a terminal in the folder where it was started" } else { "Stop that Studio, or close the window that started it" }
      return "AMC could not start because another AMC Studio on this computer already uses port $Port, probably one started from a terminal. $How, then start Agent Maturity Compass Studio again."
    }
    $Name = if ($Owner) { " ($($Owner.Name -replace '[^A-Za-z0-9._ -]', ''))" } else { "" }
    return "AMC could not start because another program on this computer uses port $Port$Name, which AMC needs. Quit that program, then start Agent Maturity Compass Studio again."
  }
  return $null
}

function Start-Studio([string]$Dir, [string[]]$Options) {
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  $WasRunning = [bool](Get-LiveDaemon $Dir)
  $Code = Invoke-Limited $StartLimitSeconds $Dir $AmcBin (@("up", "--no-open") + $Options)
  if ($Code -eq 0) { return }
  if (-not $WasRunning) { Stop-Studio $Dir }
  if ($Code -eq 124) { Stop-Launcher "AMC did not finish starting within $($StartLimitSeconds / 60) minutes, so it was stopped. Details are in $LogFile." }
  $Problem = Get-PortProblem
  if ($Problem) { Stop-Launcher $Problem }
  Stop-Launcher "AMC could not start. Details are in $LogFile."
}

# The port Studio bound (state.json apiPort), else the configured one.
function Get-StudioPort([string]$Dir, [string]$Fallback) {
  $StudioPort = [int]$Fallback
  try { $BoundPort = [int](Get-Content -LiteralPath (Join-Path $Dir ".amc\studio\state.json") -Raw | ConvertFrom-Json).apiPort; if ($BoundPort -gt 0 -and $BoundPort -lt 65536) { $StudioPort = $BoundPort } } catch { }
  return $StudioPort
}

# A Start menu shortcut with the AMC icon, pointing at this folder's launcher (made once; -NoShortcut skips it).
function Add-StartMenuShortcut {
  $Icon = Join-Path $PSScriptRoot "amc-studio.ico"
  $Link = Join-Path ([Environment]::GetFolderPath("Programs")) "Agent Maturity Compass Studio.lnk"
  if ($NoShortcut -or (Test-Path -LiteralPath $Link) -or -not (Test-Path -LiteralPath $Icon)) { return }
  $Shell = New-Object -ComObject WScript.Shell
  $Shortcut = $Shell.CreateShortcut($Link)
  $Shortcut.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  $Shortcut.WorkingDirectory = $PSScriptRoot
  $Shortcut.IconLocation = "$Icon,0"
  $Shortcut.Description = "Build, run and check AI agents for regulated work."
  $Shortcut.Save()
  Write-Host "Added Agent Maturity Compass Studio to your Start menu. It starts AMC from this folder, so keep the folder where it is."
}

Write-Host ""
Write-Host "Agent Maturity Compass Studio" -ForegroundColor Green
Write-Host ""
try {
  if ($Stop) {
    Stop-Studio $WorkspaceDir
    Stop-Studio $DemoDir
    Write-Host "AMC is stopped. Your records stay on this computer."
    exit 0
  }
  Install-Runtime
  if ($Demo) {
    Stop-Studio $WorkspaceDir
    Start-Studio $DemoDir @("--demo")
    $Url = "http://127.0.0.1:$(Get-StudioPort $DemoDir $env:AMC_HOST_PORT)/w/demo/console/"
  } else {
    Stop-Studio $DemoDir
    Start-Studio $WorkspaceDir @()
    if (-not (Test-Path -LiteralPath (Join-Path $WorkspaceDir ".amc\users.yaml"))) {
      # The owner account: amc asks for its password here, in this window; nothing else sees it.
      $UserName = ($env:USERNAME -replace '[^A-Za-z0-9._-]', '')
      if (-not $UserName) { $UserName = "owner" }
      Write-Host "Create the owner account you will sign in with ($UserName). AMC asks for its password now."
      Push-Location -LiteralPath $WorkspaceDir
      & $AmcBin user init --username $UserName
      $InitCode = $LASTEXITCODE
      Pop-Location
      if ($InitCode -ne 0) { Stop-Launcher "AMC could not create your owner account. Details are above. Start Agent Maturity Compass Studio again to retry." }
    }
    $Url = "http://127.0.0.1:$(Get-StudioPort $WorkspaceDir $env:AMC_STUDIO_PORT)/console/"
  }
  Add-StartMenuShortcut
  Write-Host "The Compass Console is at $Url"
  Write-Host "AMC keeps running after you close this window. To stop it, run Agent Maturity Compass Studio.cmd -Stop from this folder."
  Start-Process $Url
} catch {
  # A plain message, not a PowerShell error record; the .cmd file keeps the window open so it can be read.
  Write-Host ""
  Write-Host "Problem: $($_.Exception.Message)" -ForegroundColor Yellow
  exit 1
} finally {
  if ($script:Child -and -not $script:Child.HasExited) { Stop-Tree $script:Child.Id }
}
