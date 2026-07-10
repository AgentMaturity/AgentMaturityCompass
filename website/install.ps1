$ErrorActionPreference = "Stop"

$PinnedAmcReleaseVersion = "1.1.0"
$RequestedAmcReleaseVersion = $env:AMC_RELEASE_VERSION
$AmcReleaseVersion = $PinnedAmcReleaseVersion
$AmcReleaseBaseUrl = "https://github.com/AgentMaturity/AgentMaturityCompass/releases/download/v$AmcReleaseVersion"

if ($env:AMC_INSTALL_TEST_MODE -eq "1") {
  if ([string]::IsNullOrWhiteSpace($RequestedAmcReleaseVersion)) {
    throw "AMC_RELEASE_VERSION is required in test mode"
  }
  if ([string]::IsNullOrWhiteSpace($env:AMC_RELEASE_BASE_URL)) {
    throw "AMC_RELEASE_BASE_URL is required in test mode"
  }
  $AmcReleaseVersion = $RequestedAmcReleaseVersion
  $AmcReleaseBaseUrl = $env:AMC_RELEASE_BASE_URL.TrimEnd("/")
}

function Fail-AmcInstall([string]$Message) {
  throw "AMC install failed: $Message"
}

Write-Host ""
Write-Host "amc_ install" -ForegroundColor Green
Write-Host "Evidence over claims. Verified release $AmcReleaseVersion." -ForegroundColor DarkGray
Write-Host ""

if ($env:AMC_INSTALL_TEST_MODE -ne "1") {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail-AmcInstall "Node.js 20 or 22 LTS is required: https://nodejs.org"
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail-AmcInstall "npm is required"
  }
  $NodeMajor = [int]((& node -p 'Number(process.versions.node.split(".")[0])').Trim())
  if ($NodeMajor -lt 20) {
    Fail-AmcInstall "Node.js 20 or newer is required; found $(& node --version)"
  }
}

if ($env:AMC_INSTALL_TEST_MODE -eq "1" -and -not [string]::IsNullOrWhiteSpace($env:AMC_INSTALL_PLATFORM)) {
  $Platform = $env:AMC_INSTALL_PLATFORM
} else {
  $Architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  if ($Architecture -ne "X64") {
    Fail-AmcInstall "Windows architecture $Architecture is not packaged yet; use the source install at https://agentmaturity.co/docs/"
  }
  $Platform = "windows-x64"
}

$ArchiveName = "amc-$AmcReleaseVersion-$Platform.zip"
$PackageRoot = "amc-$AmcReleaseVersion-$Platform"
$TemporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("amc-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TemporaryDirectory | Out-Null

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $SumsPath = Join-Path $TemporaryDirectory "SHA256SUMS"
  $ArchivePath = Join-Path $TemporaryDirectory $ArchiveName
  Invoke-WebRequest -UseBasicParsing -Uri "$AmcReleaseBaseUrl/SHA256SUMS" -OutFile $SumsPath
  Invoke-WebRequest -UseBasicParsing -Uri "$AmcReleaseBaseUrl/$ArchiveName" -OutFile $ArchivePath

  $EscapedArchive = [regex]::Escape($ArchiveName)
  $Match = Get-Content $SumsPath | Where-Object { $_ -match "^([0-9a-fA-F]{64})\s+$EscapedArchive$" }
  if (@($Match).Count -ne 1) {
    Fail-AmcInstall "SHA256SUMS does not contain exactly one valid entry for $ArchiveName"
  }
  $Expected = ([regex]::Match($Match, "^([0-9a-fA-F]{64})")).Groups[1].Value.ToLowerInvariant()
  $Actual = (Get-FileHash -Algorithm SHA256 -Path $ArchivePath).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected) {
    Fail-AmcInstall "checksum mismatch for $ArchiveName"
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $Zip = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
  try {
    foreach ($Entry in $Zip.Entries) {
      $Normalized = $Entry.FullName.Replace("\", "/")
      if ($Normalized.StartsWith("/") -or $Normalized -match "(^|/)\.\.(/|$)" -or -not $Normalized.StartsWith("$PackageRoot/")) {
        Fail-AmcInstall "unsafe archive path in $ArchiveName"
      }
    }
  } finally {
    $Zip.Dispose()
  }

  $Unpacked = Join-Path $TemporaryDirectory "unpacked"
  Expand-Archive -Path $ArchivePath -DestinationPath $Unpacked
  $Installer = Join-Path (Join-Path $Unpacked $PackageRoot) "install.ps1"
  if (-not (Test-Path -PathType Leaf $Installer)) {
    Fail-AmcInstall "release archive is missing install.ps1"
  }
  & $Installer
  if ($LASTEXITCODE -ne 0) {
    Fail-AmcInstall "packaged installer exited with code $LASTEXITCODE"
  }
} finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $TemporaryDirectory
}

Write-Host ""
Write-Host "AMC $AmcReleaseVersion installed from a verified GitHub release." -ForegroundColor Green
Write-Host "Run: amc --version; amc doctor"
Write-Host "Docs: https://agentmaturity.co/docs/"
