# Agent Maturity Compass: install or update the current source build on Windows, without administrator rights.
#
# UNTESTED: this PowerShell twin of install-source.sh has never been run on a real Windows machine.
# Read it before you run it, and report what happens.
#
#   irm https://agentmaturity.co/install-source.ps1 | iex
#   & ([scriptblock]::Create((irm https://agentmaturity.co/install-source.ps1))) -Ref <tag or full commit id>
#
# What it does: checks for git and Node.js, fetches AgentMaturity/AgentMaturityCompass from GitHub over https,
# installs dependencies from the lockfile with the pnpm version package.json names (through Corepack), builds,
# and puts amc.cmd in %USERPROFILE%\.amc-source\bin, which it adds to your user PATH once.
# Running it again updates: the new build is made beside the old one, and only a finished build replaces it.
# Remove it: delete the folder %USERPROFILE%\.amc-source and remove that folder's bin entry from your user PATH.
# Everything is in one function called on the last line, so a download cut short runs nothing.

function Install-AmcSource {
  param(
    [string]$Repo = "https://github.com/AgentMaturity/AgentMaturityCompass.git",
    [string]$Ref = "HEAD",
    [switch]$NoModifyPath,
    [switch]$Help
  )
  $ErrorActionPreference = "Stop"
  function Stop-AmcInstall([string]$Message) { throw "AMC install stopped: $Message" }

  if ($Help) {
    Write-Host "Usage: install-source.ps1 [-Ref <branch, tag or full commit id>] [-Repo <https URL or local folder>] [-NoModifyPath]"
    Write-Host "UNTESTED on a real Windows machine. Installs the current AMC source build into %USERPROFILE%\.amc-source."
    Write-Host "Remove it: delete %USERPROFILE%\.amc-source and its bin entry from your user PATH."
    return
  }

  $Prefix = Join-Path $HOME ".amc-source"
  if ($Repo -like "https://*") {
  } elseif (Test-Path -PathType Container -LiteralPath $Repo) {
    $Repo = (Resolve-Path -LiteralPath $Repo).ProviderPath
  } else {
    Stop-AmcInstall "-Repo must be an https URL or a folder that exists: $Repo"
  }
  if ($Ref -notmatch '^[A-Za-z0-9._/][A-Za-z0-9._/-]*$' -or $Ref.StartsWith("-") -or $Ref.Contains("..")) {
    Stop-AmcInstall "-Ref must be a branch, a tag or a full commit id: $Ref"
  }

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Stop-AmcInstall "git is needed to fetch the source. Install Git for Windows from https://git-scm.com and run this again."
  }
  $Node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $Node) {
    Stop-AmcInstall "AMC needs Node.js 20 or newer, and none was found on this computer. Install Node.js from https://nodejs.org and run this again."
  }
  if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
    Stop-AmcInstall "Corepack was not found next to Node.js $($Node.Source). Node.js 22 and 24 include it; install one of those from https://nodejs.org and run this again."
  }

  Write-Host ""
  Write-Host "amc_ source install (untested on Windows)" -ForegroundColor Green
  Write-Host "Fetching $Repo ($Ref)"
  $Builds = Join-Path $Prefix "builds"
  New-Item -ItemType Directory -Force -Path $Builds | Out-Null
  $Work = Join-Path $Builds (".partial-" + $PID)
  if (Test-Path -LiteralPath $Work) { Remove-Item -Recurse -Force -LiteralPath $Work }
  $Current = ""
  $CurrentLink = Join-Path $Prefix "current"
  if (Test-Path -LiteralPath $CurrentLink) { $Current = Split-Path -Leaf ((Get-Item -LiteralPath $CurrentLink).Target | Select-Object -First 1) }
  $SavedEnv = @{}
  try {
    & git init -q $Work
    if ($LASTEXITCODE -ne 0) { Stop-AmcInstall "git init failed in $Work" }
    $SavedEnv.GIT_ALLOW_PROTOCOL = $env:GIT_ALLOW_PROTOCOL
    $env:GIT_ALLOW_PROTOCOL = "https:file"
    & git -C $Work fetch -q --depth 1 -- $Repo $Ref
    if ($LASTEXITCODE -ne 0) { Stop-AmcInstall "could not fetch $Ref from $Repo. Check the address and the ref (a commit id must be the full 40 characters)." }
    & git -C $Work checkout -q --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0) { Stop-AmcInstall "git checkout failed" }
    $Commit = (& git -C $Work rev-parse HEAD).Trim()

    # The one Node.js rule is package.json engines.node (">=N") of the commit being built.
    $Package = Get-Content -Raw -LiteralPath (Join-Path $Work "package.json") | ConvertFrom-Json
    if ("$($Package.engines.node)" -notmatch '^>=\s*(\d+)') { Stop-AmcInstall "package.json at $Commit has no engines.node rule of the form >=N" }
    $NodeMin = [int]$Matches[1]
    $NodeVersion = (& $Node.Source --version) -replace '[^A-Za-z0-9.+-]', ''
    $NodeMajor = 0
    [void][int]::TryParse(($NodeVersion.TrimStart("v") -split "\.")[0], [ref]$NodeMajor)
    if ($NodeMajor -lt $NodeMin) {
      Stop-AmcInstall "AMC needs Node.js $NodeMin or newer, and the one found on this computer is Node.js $NodeVersion ($($Node.Source)). Install a newer Node.js from https://nodejs.org and run this again."
    }
    Write-Host "Using Node.js $NodeVersion ($($Node.Source))"

    if ($Current -eq $Commit -and (Test-Path -LiteralPath (Join-Path $CurrentLink "dist\cli.js"))) {
      Write-Host "Commit $Commit is already installed; nothing to build."
    } else {
      Write-Host "Building commit $Commit (this takes a few minutes)"
      # pnpm comes from Corepack at the version package.json names; its download and the npm and pnpm caches stay in the prefix.
      foreach ($Pair in @(
          @("COREPACK_HOME", (Join-Path $Prefix "corepack")), @("COREPACK_ENABLE_DOWNLOAD_PROMPT", "0"),
          @("XDG_DATA_HOME", (Join-Path $Prefix "data")), @("XDG_CACHE_HOME", (Join-Path $Prefix "cache")),
          @("XDG_STATE_HOME", (Join-Path $Prefix "state")), @("npm_config_cache", (Join-Path $Prefix "npm-cache")),
          @("npm_config_update_notifier", "false"))) {
        $SavedEnv[$Pair[0]] = [Environment]::GetEnvironmentVariable($Pair[0], "Process")
        [Environment]::SetEnvironmentVariable($Pair[0], $Pair[1], "Process")
      }
      Push-Location -LiteralPath $Work
      try {
        & corepack pnpm install --frozen-lockfile
        $Built = $LASTEXITCODE -eq 0
        if ($Built) { & corepack pnpm run build; $Built = $LASTEXITCODE -eq 0 }
        if ($Built) { & $Node.Source dist/cli.js --version | Out-Null; $Built = $LASTEXITCODE -eq 0 }
      } finally {
        Pop-Location
      }
      if (-not $Built) {
        if ($Current) { Stop-AmcInstall "the build of $Commit failed (see the lines above). Your previous AMC, commit $Current, is still installed and works." }
        Stop-AmcInstall "the build of $Commit failed (see the lines above). Nothing was installed."
      }
      $Target = Join-Path $Builds $Commit
      if (Test-Path -LiteralPath $Target) { Remove-Item -Recurse -Force -LiteralPath $Target }
      Move-Item -LiteralPath $Work -Destination $Target
      # A directory junction needs no administrator rights; replacing it switches to the new build.
      if (Test-Path -LiteralPath $CurrentLink) { (Get-Item -LiteralPath $CurrentLink).Delete() }
      New-Item -ItemType Junction -Path $CurrentLink -Target $Target | Out-Null
      # Keep the build just replaced, for going back by hand; remove older ones (only inside builds).
      Get-ChildItem -LiteralPath $Builds -Directory | Where-Object { $_.Name -ne $Commit -and $_.Name -ne $Current -and -not $_.Name.StartsWith(".") } |
        ForEach-Object { Remove-Item -Recurse -Force -LiteralPath $_.FullName }
    }
  } finally {
    if (Test-Path -LiteralPath $Work) { Remove-Item -Recurse -Force -LiteralPath $Work -ErrorAction SilentlyContinue }
    foreach ($Name in $SavedEnv.Keys) { [Environment]::SetEnvironmentVariable($Name, $SavedEnv[$Name], "Process") }
  }

  $Bin = Join-Path $Prefix "bin"
  New-Item -ItemType Directory -Force -Path $Bin | Out-Null
  Set-Content -LiteralPath (Join-Path $Bin "amc.cmd") -Encoding ASCII -Value "@node `"%~dp0..\current\dist\cli.js`" %*"
  $Version = (& (Join-Path $Bin "amc.cmd") --version 2>$null)

  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($NoModifyPath) {
    Write-Host "PATH: not changed (-NoModifyPath). Add $Bin to your user PATH."
  } elseif (@("$UserPath" -split ";") -contains $Bin) {
    Write-Host "PATH: your user PATH already has $Bin."
  } else {
    $NewPath = if ([string]::IsNullOrEmpty($UserPath)) { $Bin } else { "$UserPath;$Bin" }
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    Write-Host "PATH: added $Bin to your user PATH."
  }

  Write-Host ""
  Write-Host "AMC $Version is installed from commit $Commit ($Repo)." -ForegroundColor Green
  Write-Host "It is in $Prefix. To remove it, delete that folder and remove $Bin from your user PATH."
  Write-Host "Next step: open a new terminal, go to your project folder and type: amc"
}

Install-AmcSource @args
