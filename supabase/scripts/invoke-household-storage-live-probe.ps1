[CmdletBinding()]
param(
  [switch]$CheckConfigOnly
)

$ErrorActionPreference = 'Stop'
$probeScript = Join-Path $PSScriptRoot 'probe-household-storage-live.mjs'
$probeVariables = @(
  'HELDAT_AUTHENTICATED_PROBE_CONFIRM',
  'HELDAT_AUTHENTICATED_PROBE_ACCESS_TOKEN',
  'HELDAT_AUTHENTICATED_PROBE_HOUSEHOLD_ID'
)
$secretPointer = [IntPtr]::Zero
$plainToken = $null
$secureToken = $null
$exitCode = 1

foreach ($name in $probeVariables) {
  if (Test-Path "Env:$name") {
    throw "Clear existing authenticated-probe environment values before using the secure prompt."
  }
}

try {
  $secureToken = Read-Host 'Ephemeral authenticated access token' -AsSecureString
  $householdId = (Read-Host 'Synthetic probe household UUID').Trim().ToLowerInvariant()
  if ($householdId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
    throw 'The synthetic probe household ID must be a UUID.'
  }

  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  [Environment]::SetEnvironmentVariable(
    'HELDAT_AUTHENTICATED_PROBE_CONFIRM',
    'HELDAT_EPHEMERAL_HOUSEHOLD_STORAGE_READ',
    'Process'
  )
  [Environment]::SetEnvironmentVariable(
    'HELDAT_AUTHENTICATED_PROBE_ACCESS_TOKEN',
    $plainToken,
    'Process'
  )
  [Environment]::SetEnvironmentVariable(
    'HELDAT_AUTHENTICATED_PROBE_HOUSEHOLD_ID',
    $householdId,
    'Process'
  )

  & node $probeScript --check-config
  if ($LASTEXITCODE -ne 0) {
    $exitCode = $LASTEXITCODE
  }
  elseif ($CheckConfigOnly) {
    $exitCode = 0
  }
  else {
    & node $probeScript
    $exitCode = $LASTEXITCODE
  }
}
finally {
  foreach ($name in $probeVariables) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  $plainToken = $null
  $secureToken = $null
  if ($secretPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
  }
}

exit $exitCode
