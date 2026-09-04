param(
  [int]$Port = 8081
)

$ErrorActionPreference = "Stop"
$previewDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceDirectory = Split-Path -Parent $previewDirectory
$npm = Join-Path $env:ProgramFiles "nodejs\npm.cmd"

if (-not (Test-Path -LiteralPath $npm)) {
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
}

$lanAddress = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
  Where-Object {
    $_.OperationalStatus -eq
      [System.Net.NetworkInformation.OperationalStatus]::Up -and
    $_.NetworkInterfaceType -ne
      [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback -and
    $_.NetworkInterfaceType -ne
      [System.Net.NetworkInformation.NetworkInterfaceType]::Tunnel
  } |
  ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
  Where-Object {
    $_.Address.AddressFamily -eq
      [System.Net.Sockets.AddressFamily]::InterNetwork -and
    $_.Address.IPAddressToString -notlike "169.254.*"
  } |
  Select-Object -First 1 -ExpandProperty Address |
  ForEach-Object { $_.IPAddressToString }

if (-not $lanAddress) {
  throw "No local Wi-Fi or Ethernet IPv4 address was found."
}

Write-Host ""
Write-Host "Heldat iPhone Preview" -ForegroundColor Green
Write-Host "Expo URL: exp://${lanAddress}:${Port}"
Write-Host "Keep this window open and connect the iPhone to the same Wi-Fi."
Write-Host ""

Push-Location -LiteralPath $workspaceDirectory
try {
  Write-Host "Building shared Heldat packages..." -ForegroundColor DarkGray
  & $npm run build:shared
  if ($LASTEXITCODE -ne 0) {
    throw "The shared Heldat package build failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}

Push-Location -LiteralPath $previewDirectory
try {
  & $npm run start:lan -- --port $Port
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
