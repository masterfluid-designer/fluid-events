#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Fluid-Events Development Environment Setup
    
.DESCRIPTION
    Configure l'environnement de développement complet pour Fluid-Events

.EXAMPLE
    .\setup-dev.ps1
#>

param(
    [switch]$SkipPnpm = $false,
    [switch]$SkipDocker = $false,
    [switch]$SkipDatabase = $false
)

# Colors
$script:Green = @{ForegroundColor = "Green"}
$script:Red = @{ForegroundColor = "Red"}
$script:Yellow = @{ForegroundColor = "Yellow"}
$script:Blue = @{ForegroundColor = "Cyan"}

function Write-Step {
    param([string]$Message, [string]$Status = "")
    $symbol = "▶"
    Write-Host "  $symbol " -ForegroundColor Cyan -NoNewline
    Write-Host $Message -NoNewline
    if ($Status) {
        Write-Host " ... $Status" @Yellow
    }
}

function Write-Success {
    param([string]$Message)
    Write-Host "  ✓ $Message" @Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "  ✗ $Message" @Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "  → $Message" @Blue
}

# Header
Write-Host "`n╔════════════════════════════════════════════════════════════╗" @Blue
Write-Host "║     🚀 FLUID-EVENTS DEVELOPMENT ENVIRONMENT SETUP         ║" @Blue
Write-Host "╚════════════════════════════════════════════════════════════╝`n" @Blue

# Check prerequisites
Write-Host "📋 CHECKING PREREQUISITES..." @Yellow
Write-Host ""

$allReady = $true

# Node.js
Write-Step "Node.js"
try {
    $nodeVersion = node --version
    Write-Success "$nodeVersion"
} catch {
    Write-Error "Not found - Install from https://nodejs.org"
    $allReady = $false
}

# Docker
Write-Step "Docker"
try {
    $dockerVersion = docker --version
    Write-Success ($dockerVersion -split "," | Select-Object -First 1)
} catch {
    Write-Error "Not found - Install Docker Desktop"
    $allReady = $false
}

# Docker Compose
Write-Step "Docker Compose"
try {
    $composeVersion = docker compose version | Select-Object -First 1
    Write-Success $composeVersion
} catch {
    Write-Error "Not found - Install Docker Compose"
    $allReady = $false
}

if (-not $allReady) {
    Write-Host "`n❌ Please install missing prerequisites and retry." @Red
    exit 1
}

Write-Host ""

# Step 1: Setup .env
Write-Host "📝 STEP 1: CONFIGURING ENVIRONMENT..." @Yellow
Write-Host ""
Write-Step ".env configuration"

$envPath = ".env"
$envExamplePath = ".env.example"

if (-not (Test-Path $envPath)) {
    Copy-Item $envExamplePath $envPath
    Write-Success ".env created from .env.example"
} else {
    Write-Success ".env already exists"
}

Write-Host ""

# Step 2: Install pnpm
if (-not $SkipPnpm) {
    Write-Host "📦 STEP 2: PREPARING PACKAGE MANAGER..." @Yellow
    Write-Host ""
    Write-Step "pnpm"
    
    try {
        $pnpmVersion = pnpm --version 2>$null
        Write-Success "pnpm v$pnpmVersion already installed"
    } catch {
        Write-Info "Installing pnpm globally..."
        npm install -g pnpm
        Write-Success "pnpm installed"
    }
    
    Write-Host ""
}

# Step 3: Install dependencies
Write-Host "📚 STEP 3: INSTALLING DEPENDENCIES..." @Yellow
Write-Host ""
Write-Step "pnpm install"

try {
    pnpm install
    Write-Success "Dependencies installed"
} catch {
    Write-Error "Failed to install dependencies"
    exit 1
}

Write-Host ""

# Step 4: Generate Prisma
Write-Host "🔧 STEP 4: INITIALIZING DATABASE CLIENT..." @Yellow
Write-Host ""
Write-Step "Prisma generate"

try {
    pnpm db:generate
    Write-Success "Prisma client generated"
} catch {
    Write-Error "Failed to generate Prisma client"
    exit 1
}

Write-Host ""

# Step 5: Docker services
if (-not $SkipDocker) {
    Write-Host "🐳 STEP 5: STARTING DOCKER SERVICES..." @Yellow
    Write-Host ""
    Write-Step "Docker Compose up"
    
    try {
        docker compose up -d
        Write-Success "Docker containers started"
    } catch {
        Write-Error "Failed to start Docker services"
        exit 1
    }
    
    Write-Host ""
    Write-Info "Waiting 30 seconds for services to become healthy..."
    for ($i = 30; $i -gt 0; $i--) {
        Write-Host -NoNewline "`r  ⏳ $i seconds remaining...  "
        Start-Sleep -Seconds 1
    }
    Write-Host "`r✓ Services ready!                       `n" @Green
}

# Step 6: Database
if (-not $SkipDatabase) {
    Write-Host "💾 STEP 6: SETTING UP DATABASE..." @Yellow
    Write-Host ""
    
    Write-Step "Prisma migrate"
    try {
        pnpm db:migrate
        Write-Success "Migrations applied"
    } catch {
        Write-Error "Failed to run migrations"
        # Don't exit, might be already done
    }
    
    Write-Step "Seeding test data"
    try {
        pnpm db:seed
        Write-Success "Database seeded"
    } catch {
        Write-Error "Failed to seed database (optional, can skip)"
    }
    
    Write-Host ""
}

# Final summary
Write-Host "╔════════════════════════════════════════════════════════════╗" @Blue
Write-Host "║                ✅ SETUP COMPLETE!                          ║" @Green
Write-Host "╚════════════════════════════════════════════════════════════╝`n" @Blue

Write-Host "🚀 NEXT STEPS:" @Blue
Write-Host ""
Write-Info "Start development servers:"
Write-Host "   $ pnpm dev`n" @Green

Write-Info "Open in browser:"
Write-Host "   Frontend:  http://localhost:3000`n" @Green
Write-Host "   Backend:   http://localhost:4000" @Green
Write-Host "   Mailpit:   http://localhost:8025" @Green
Write-Host "   RustFS:    http://localhost:9001`n" @Green

Write-Info "Other commands:"
Write-Host "   pnpm build          # Build all packages" @Green
Write-Host "   pnpm lint           # Lint code" @Green
Write-Host "   pnpm test           # Run tests" @Green
Write-Host "   docker compose logs # View logs`n" @Green

Write-Info "Documentation:"
Write-Host "   • QUICKSTART.md       - Quick reference" @Green
Write-Host "   • SETUP.md            - Detailed setup" @Green
Write-Host "   • docs/architecture.md - Architecture overview" @Green
Write-Host "   • docs/api.md         - API documentation`n" @Green

Write-Host "✨ Happy coding!`n" @Green
