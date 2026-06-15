[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$ProjectRef = $env:PROJECT_REF,
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$TemplateDir = "supabase/templates/auth",
  [string]$SubjectPath = "supabase/templates/auth/subjects.json",
  [switch]$DryRun,
  [switch]$SkipBackup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Get-ProjectRefFromEnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^NEXT_PUBLIC_SUPABASE_URL=(.+)$") {
      $rawValue = $Matches[1].Trim().Trim('"').Trim("'")
      if (-not $rawValue) {
        return $null
      }

      $uri = [Uri]$rawValue
      return ($uri.Host -split "\.")[0]
    }
  }

  return $null
}

function Read-Template {
  param([string]$Name)

  $path = Join-Path $TemplateDir $Name
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Template file not found: $path"
  }

  return [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $path), [System.Text.Encoding]::UTF8)
}

function Read-Subjects {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Subject file not found: $Path"
  }

  $json = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path), [System.Text.Encoding]::UTF8)
  return $json | ConvertFrom-Json
}

if (-not $ProjectRef) {
  $ProjectRef = Get-ProjectRefFromEnvFile ".env.local"
}

if (-not $ProjectRef) {
  throw "Missing project ref. Set PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL in .env.local."
}

if (-not $AccessToken) {
  throw "Missing Supabase Management API token. Set SUPABASE_ACCESS_TOKEN first."
}

$endpoint = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"
$authHeaders = @{
  Authorization = "Bearer $AccessToken"
}

$subjects = Read-Subjects $SubjectPath

$payload = [ordered]@{
  mailer_subjects_confirmation = $subjects.confirmation
  mailer_templates_confirmation_content = Read-Template "confirmation.html"
  mailer_subjects_magic_link = $subjects.magic_link
  mailer_templates_magic_link_content = Read-Template "magic_link.html"
  mailer_subjects_recovery = $subjects.recovery
  mailer_templates_recovery_content = Read-Template "recovery.html"
  mailer_subjects_email_change = $subjects.email_change
  mailer_templates_email_change_content = Read-Template "email_change.html"
  mailer_subjects_invite = $subjects.invite
  mailer_templates_invite_content = Read-Template "invite.html"
  mailer_subjects_reauthentication = $subjects.reauthentication
  mailer_templates_reauthentication_content = Read-Template "reauthentication.html"
}

if ($DryRun) {
  Write-Host "Dry run for Supabase project $ProjectRef. Payload keys:"
  $payload.Keys | ForEach-Object { Write-Host " - $_" }
  return
}

if (-not $SkipBackup) {
  Write-Host "Reading current Supabase Auth email templates..."
  $currentConfig = Invoke-RestMethod -Method Get -Uri $endpoint -Headers $authHeaders -TimeoutSec 30
  $currentTemplates = [ordered]@{}
  foreach ($property in $currentConfig.PSObject.Properties) {
    if ($property.Name.StartsWith("mailer_subjects_") -or $property.Name.StartsWith("mailer_templates_")) {
      $currentTemplates[$property.Name] = $property.Value
    }
  }

  New-Item -ItemType Directory -Force -Path "temp" | Out-Null
  $backupPath = Join-Path "temp" ("supabase-auth-email-templates-{0}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
  $currentTemplates | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $backupPath -Encoding UTF8
  Write-Host "Backed up current templates to $backupPath"
}

$jsonBody = $payload | ConvertTo-Json -Depth 20

New-Item -ItemType Directory -Force -Path "temp" | Out-Null
$payloadPath = Join-Path "temp" ("supabase-auth-email-template-payload-{0}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $payloadPath), $jsonBody, $Utf8NoBom)

if ($PSCmdlet.ShouldProcess($ProjectRef, "Update Supabase Auth email templates")) {
  Write-Host "Updating Supabase Auth email templates..."
  $curlArgs = @(
    "--silent",
    "--show-error",
    "--fail-with-body",
    "--max-time",
    "60",
    "-X",
    "PATCH",
    $endpoint,
    "-H",
    "Authorization: Bearer $AccessToken",
    "-H",
    "Content-Type: application/json",
    "--data-binary",
    "@$payloadPath"
  )
  & curl.exe @curlArgs | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase Auth email template update failed. curl.exe exit code: $LASTEXITCODE"
  }
  Write-Host "Updated Supabase Auth email templates for $ProjectRef"
}
