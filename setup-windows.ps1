#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallPath,
    [switch]$Update,
    [switch]$StartOnly,
    [switch]$ServeOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = 'https://github.com/tomas-bar/transport-management-system.git'
$setupBranch = 'codex/windows-local-setup'
$localOrigin = 'http://127.0.0.1:4174'

function Get-LocalServerState {
    $probe = New-Object Net.Sockets.TcpClient
    try {
        $pending = $probe.BeginConnect('127.0.0.1', 4174, $null, $null)
        if (!$pending.AsyncWaitHandle.WaitOne(300)) { return 'stopped' }
        try { $probe.EndConnect($pending) } catch { return 'stopped' }
        try {
            $health = Invoke-WebRequest -UseBasicParsing -Uri "$localOrigin/api/health" -TimeoutSec 2
            $body = $health.Content | ConvertFrom-Json
            $page = Invoke-WebRequest -UseBasicParsing -Uri $localOrigin -TimeoutSec 2
            if ($health.StatusCode -eq 200 -and $body.ok -eq $true -and $body.schema -ge 3 -and $page.Content -match '<title>Krypta[ |<]') { return 'ready' }
        } catch { }
        return 'occupied'
    } finally { $probe.Dispose() }
}

function Open-LocalKrypta {
    # The OS releases this mutex after a crash/restart. No stale lock file remains.
    $mutex = [Threading.Mutex]::new($false, 'Local\Krypta-Local-4174')
    $acquired = $false
    $serverWindow = $null
    try {
        try { $acquired = $mutex.WaitOne(30000) }
        catch [Threading.AbandonedMutexException] { $acquired = $true }
        if (!$acquired) { throw 'Another Krypta launcher is starting. Wait a moment and click the shortcut again.' }
        $state = Get-LocalServerState
        if ($state -eq 'ready') { Start-Process $localOrigin; return }
        if ($state -eq 'occupied') { throw 'Port 4174 belongs to a different or unresponsive service. Nothing was stopped.' }
        $script = Join-Path $InstallPath 'setup-windows.ps1'
        $shell = (Get-Process -Id $PID).Path
        $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $script + '" -InstallPath "' + $InstallPath + '" -ServeOnly'
        # A separate visible console keeps the server alive after the shortcut exits.
        $serverWindow = Start-Process -FilePath $shell -ArgumentList $arguments -WorkingDirectory $InstallPath -PassThru
        $deadline = [DateTime]::UtcNow.AddSeconds(30)
        while ([DateTime]::UtcNow -lt $deadline) {
            if ($serverWindow.HasExited) { throw 'The server stopped before becoming ready. Run start-krypta.cmd again and read the server error.' }
            if ((Get-LocalServerState) -eq 'ready') { Start-Process $localOrigin; return }
            Start-Sleep -Milliseconds 250
        }
        throw 'The server did not become ready within 30 seconds. Check the separate server window; it was not terminated.'
    } finally {
        if ($serverWindow) { $serverWindow.Dispose() }
        if ($acquired) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed (exit $LASTEXITCODE). Setup stopped; fix the error above and run again." }
}

function Get-Git {
    $command = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if ($base) {
            foreach ($relative in @('Git\cmd\git.exe', 'Programs\Git\cmd\git.exe')) {
                $candidate = Join-Path $base $relative
                if (Test-Path -LiteralPath $candidate) { return $candidate }
            }
        }
    }
    return $null
}

function Save-Download {
    param([string]$Url, [string]$Destination)
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination -TimeoutSec 120
            return
        } catch {
            if ($attempt -eq 3) { throw }
            Write-Host "Download interrupted. Retrying ($attempt/3)..."
            Start-Sleep -Seconds 2
        }
    }
}

function Get-KryptaNode {
    $tools = Join-Path $env:LOCALAPPDATA 'Krypta\tools'
    if ($StartOnly) {
        if (Test-Path -LiteralPath $tools) {
            $installed = @(Get-ChildItem -LiteralPath $tools -Directory | Where-Object { $_.Name -match '^node-v24\.\d+\.\d+-win-(x64|arm64)$' } | Sort-Object { [version]($_.Name -replace '^node-v|-win-.*$', '') } -Descending)
            foreach ($folder in $installed) {
                $candidate = Join-Path $folder.FullName 'node.exe'
                if (Test-Path -LiteralPath $candidate) { return $candidate }
            }
        }
        throw 'Run setup-windows.ps1 without -StartOnly once to install Node.js and build Krypta.'
    }
    # A private portable runtime leaves existing system Node installations alone.
    $architecture = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $architecture = $env:PROCESSOR_ARCHITEW6432 }
    switch ($architecture) {
        'AMD64' { $nodeArch = 'x64' }
        'ARM64' { $nodeArch = 'arm64' }
        default { throw 'Krypta requires 64-bit Windows (x64 or ARM64).' }
    }
    $downloadDir = Join-Path ([IO.Path]::GetTempPath()) ('krypta-node-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $downloadDir | Out-Null
    try {
        Write-Host 'Checking the latest compatible Node.js 24 release...'
        $manifest = Join-Path $downloadDir 'SHASUMS256.txt'
        Save-Download 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' $manifest
        $entry = @(Get-Content -LiteralPath $manifest | Where-Object { $_ -match "^[a-fA-F0-9]{64}\s+node-v24\.\d+\.\d+-win-$nodeArch\.zip$" })
        if ($entry.Count -ne 1) { throw 'Could not identify the official Node.js 24 archive. Nothing was installed.' }
        $parts = $entry[0] -split '\s+'
        $expectedHash = $parts[0]
        $archiveName = $parts[1]
        $nodeFolder = Join-Path $tools ($archiveName -replace '\.zip$', '')
        $candidate = Join-Path $nodeFolder 'node.exe'
        if (!(Test-Path -LiteralPath $nodeFolder)) {
            $archive = Join-Path $downloadDir $archiveName
            # Pin the archive URL to the manifest version, even across a new release.
            $version = ($archiveName -split '-')[1]
            Save-Download "https://nodejs.org/dist/$version/$archiveName" $archive
            if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Node.js checksum mismatch. Nothing was installed.' }
            Expand-Archive -LiteralPath $archive -DestinationPath $downloadDir
            New-Item -ItemType Directory -Path $tools -Force | Out-Null
            Move-Item -LiteralPath (Join-Path $downloadDir ($archiveName -replace '\.zip$', '')) -Destination $nodeFolder
        }
        if (!(Test-Path -LiteralPath $candidate)) { throw "Incomplete Node.js installation at $nodeFolder. Inspect it before trying again." }
        return $candidate
    } finally {
        # Only the unique temporary directory created by this invocation is removed.
        Remove-Item -LiteralPath $downloadDir -Recurse -Force
    }
}

function Initialize-Owner {
    param([string]$Node)
    $status = & $Node scripts/owner-status.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the local database. It was not reset.' }
    if ($status -eq 'exists') { Write-Host 'Existing local owner account preserved.'; return }
    if ($StartOnly) { throw 'No local owner exists. Run setup-windows.ps1 without -StartOnly first.' }
    $email = (Read-Host 'Email for your NEW local owner account').Trim().ToLowerInvariant()
    # Restrict command-line quoting characters; the server CLI validates email too.
    if ($email -notmatch '^[^\s"<>\\]+@[^\s"<>\\]+\.[^\s"<>\\]+$') { throw 'Enter a valid email address and run setup again.' }
    $secret = Read-Host 'New local password (at least 8 characters)' -AsSecureString
    $confirmation = Read-Host 'Repeat password' -AsSecureString
    $password = $null
    $repeated = $null
    $previousEncoding = $OutputEncoding
    try {
        $password = [Net.NetworkCredential]::new('', $secret).Password
        $repeated = [Net.NetworkCredential]::new('', $confirmation).Password
        if ($password.Length -lt 8 -or $password -cne $repeated) { throw 'Passwords must match and contain at least 8 characters. Run setup again.' }
        # Windows PowerShell 5.1 lacks ProcessStartInfo.StandardInputEncoding.
        # Its native pipeline supports UTF-8 through the scoped OutputEncoding.
        $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
        $password | & $Node --experimental-strip-types scripts/owner.ts $email
        if ($LASTEXITCODE -ne 0) { throw 'Owner creation failed. Existing accounts were not overwritten.' }
    } finally {
        $password = $null
        $repeated = $null
        $secret.Dispose()
        $confirmation.Dispose()
        $OutputEncoding = $previousEncoding
    }
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'Run this script in Windows PowerShell on Windows 10 or 11.' }
    if ($ServeOnly) { $StartOnly = $true }
    if ($StartOnly -and $Update) { throw 'Use -Update for setup/build, or -StartOnly to start an existing build.' }
    if ($StartOnly -and !$ServeOnly -and (Get-LocalServerState) -eq 'ready') {
        Start-Process $localOrigin
        return
    }
    if (!$StartOnly) {
        # Never rebuild files beneath a running local server or kill its process.
        $probe = New-Object Net.Sockets.TcpClient
        try {
            $pending = $probe.BeginConnect('127.0.0.1', 4174, $null, $null)
            if ($pending.AsyncWaitHandle.WaitOne(300)) {
                try { $probe.EndConnect($pending) } catch { }
                if ($probe.Connected) { throw 'Port 4174 is in use. Stop the running server with Ctrl+C before setup or update.' }
            }
        } finally { $probe.Dispose() }
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    if (!$InstallPath) {
        if ((Test-Path -LiteralPath (Join-Path $PSScriptRoot 'package.json')) -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'server\start.ts'))) { $InstallPath = $PSScriptRoot }
        else { $InstallPath = 'C:\Projects\Krypta' }
    }
    $InstallPath = [IO.Path]::GetFullPath($InstallPath)
    if (!$StartOnly) {
        $git = Get-Git
        if (!$git) {
            $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
            if (!$winget) {
                # Try registration of the built-in App Installer before stopping.
                try { Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe -ErrorAction Stop } catch { Write-Host 'App Installer registration was unavailable.' }
                $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
            }
            if (!$winget) { throw 'WinGet is missing. Install/update Microsoft App Installer from https://apps.microsoft.com/detail/9nblggh4nns1 then reopen PowerShell and run setup again.' }
            Write-Host 'Installing Git using Windows Package Manager. Windows may request installer approval.'
            Invoke-Checked $winget.Source @('install', '--id', 'Git.Git', '--exact', '--source', 'winget', '--accept-source-agreements', '--accept-package-agreements')
            $git = Get-Git
            if (!$git) { throw 'Git was installed but cannot be found. Reopen PowerShell and run setup again.' }
        }
        if (!(Test-Path -LiteralPath $InstallPath)) {
            New-Item -ItemType Directory -Path (Split-Path -Parent $InstallPath) -Force | Out-Null
            Invoke-Checked $git @('clone', '--branch', $setupBranch, '--single-branch', $repository, $InstallPath)
        }
        if (!(Test-Path -LiteralPath (Join-Path $InstallPath '.git'))) { throw "The destination already exists and is not a Git checkout: $InstallPath. Choose a new -InstallPath; nothing was deleted." }
        $repositoryRoot = & $git -C $InstallPath rev-parse --show-toplevel
        if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($repositoryRoot).TrimEnd('\') -ne $InstallPath.TrimEnd('\')) { throw 'The installation path must be the Git repository root. Nothing was overwritten.' }
        $remote = & $git -C $InstallPath remote get-url origin
        if ($LASTEXITCODE -ne 0 -or $remote -notmatch '^https://github\.com/tomas-bar/transport-management-system(?:\.git)?/?$') { throw 'This checkout has an unexpected origin. Setup will not change it.' }
        if ($Update) {
            $branch = & $git -C $InstallPath branch --show-current
            if ($LASTEXITCODE -ne 0 -or $branch -ne $setupBranch) { throw "Updates require $setupBranch. No branch was switched. Use a separate installation directory for an existing main checkout." }
            $dirty = & $git -C $InstallPath status --porcelain
            if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Local source changes exist. Commit or review them before updating; nothing was discarded.' }
            Invoke-Checked $git @('-C', $InstallPath, 'fetch', 'origin', $setupBranch)
            $ahead = & $git -C $InstallPath rev-list --count 'FETCH_HEAD..HEAD'
            if ($LASTEXITCODE -ne 0 -or [int]$ahead -ne 0) { throw "Local commits are ahead of or diverge from GitHub $setupBranch. Reconcile them yourself; setup will not reset them." }
            Invoke-Checked $git @('-C', $InstallPath, 'merge', '--ff-only', 'FETCH_HEAD')
        }
    }
    if (!(Test-Path -LiteralPath (Join-Path $InstallPath 'server\start.ts'))) { throw "Krypta source was not found at $InstallPath." }
    Push-Location -LiteralPath $InstallPath
    try {
        $node = Get-KryptaNode
        $nodeDir = Split-Path -Parent $node
        $env:PATH = $nodeDir + ';' + $env:PATH
        $nodeVersion = & $node --version
        if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') { throw 'The launcher requires its compatible Node.js 24 runtime.' }
        # Explicit local configuration prevents an inherited remote DB or listener.
        $env:KRYPTA_HOST = '127.0.0.1'
        $env:KRYPTA_PORT = '4174'
        $env:KRYPTA_PUBLIC_ORIGIN = 'http://127.0.0.1:4174'
        $env:KRYPTA_DB_PATH = Join-Path $InstallPath 'data\server.sqlite'
        $env:NODE_ENV = 'development'
        if (!$StartOnly) {
            $npm = Join-Path $nodeDir 'npm.cmd'
            Invoke-Checked $npm @('ci', '--include=dev')
            Invoke-Checked $npm @('run', 'build:server')
            $buildCommit = & $git rev-parse HEAD
            if ($LASTEXITCODE -ne 0) { throw 'Cannot read the source version after building.' }
            Set-Content -LiteralPath 'dist\.krypta-local-build' -Value $buildCommit -Encoding ASCII
        }
        if (!(Test-Path -LiteralPath 'dist\index.html') -or !(Test-Path -LiteralPath 'dist\.krypta-local-build')) { throw 'No launcher-built server frontend. Run setup-windows.ps1 without -StartOnly.' }
        if ($StartOnly) {
            $git = Get-Git
            if (!$git) { throw 'Git is required to check the local build version. Run setup-windows.ps1 again.' }
            $currentCommit = & $git rev-parse HEAD
            if ($LASTEXITCODE -ne 0 -or (Get-Content -LiteralPath 'dist\.krypta-local-build' -Raw).Trim() -ne $currentCommit) { throw 'The source changed since the last setup. Run setup-windows.ps1 to rebuild before starting.' }
        }
        Initialize-Owner $node
        if ($ServeOnly) {
            try { $Host.UI.RawUI.WindowTitle = 'Krypta - local server' } catch { }
            Write-Host 'Krypta: http://127.0.0.1:4174. Keep this server window open; Ctrl+C stops it.'
            Write-Host 'Local accounts, records and photos remain in data\server.sqlite after restarting.'
            Invoke-Checked $node @('--experimental-strip-types', 'server/start.ts')
        } else { Open-LocalKrypta }
    } finally { Pop-Location }
} catch {
    Write-Host ("Krypta setup stopped: " + $_.Exception.Message) -ForegroundColor Red
    if ($ServeOnly) { Read-Host 'Press Enter to close this server window' | Out-Null }
    exit 1
}
