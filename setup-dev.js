#!/usr/bin/env node

/**
 * Fluid-Events Development Environment Setup
 * 
 * Ce script configure automatiquement:
 * 1. Installation des dépendances (pnpm)
 * 2. Configuration .env pour le développement
 * 3. Démarrage des services Docker
 * 4. Initialisation de la base de données
 * 5. Vérification de l'installation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function run(command, description) {
  log(`\n▶ ${description}`, 'blue');
  try {
    execSync(command, { stdio: 'inherit' });
    log(`✅ ${description} - OK`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${description} - FAILED`, 'red');
    return false;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║     🚀 FLUID-EVENTS DEVELOPMENT ENVIRONMENT SETUP         ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝\n', 'blue');

  const projectRoot = __dirname;

  // Step 1: Check prerequisites
  log('STEP 1: Checking prerequisites...', 'yellow');
  
  try {
    execSync('node --version', { stdio: 'pipe' });
    log('✓ Node.js installed', 'green');
  } catch {
    log('✗ Node.js not found - install from https://nodejs.org', 'red');
    process.exit(1);
  }

  try {
    execSync('docker --version', { stdio: 'pipe' });
    log('✓ Docker installed', 'green');
  } catch {
    log('✗ Docker not found - install from https://docker.com', 'red');
    process.exit(1);
  }

  try {
    execSync('docker compose version', { stdio: 'pipe' });
    log('✓ Docker Compose installed', 'green');
  } catch {
    log('✗ Docker Compose not found', 'red');
    process.exit(1);
  }

  // Step 2: Setup .env
  log('\nSTEP 2: Configuring environment...', 'yellow');
  const envPath = path.join(projectRoot, '.env');
  const envExamplePath = path.join(projectRoot, '.env.example');

  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(envExamplePath, envPath);
    log('✓ .env created from .env.example', 'green');
  } else {
    log('✓ .env already exists', 'green');
  }

  // Step 3: Install pnpm globally
  log('\nSTEP 3: Preparing package manager...', 'yellow');
  try {
    execSync('pnpm --version', { stdio: 'pipe' });
    log('✓ pnpm already installed', 'green');
  } catch {
    log('→ Installing pnpm globally...', 'blue');
    execSync('npm install -g pnpm', { stdio: 'inherit' });
    log('✓ pnpm installed', 'green');
  }

  // Step 4: Install dependencies
  log('\nSTEP 4: Installing dependencies...', 'yellow');
  run('pnpm install', 'Installing monorepo dependencies');

  // Step 5: Generate Prisma client
  log('\nSTEP 5: Initializing database client...', 'yellow');
  run('pnpm db:generate', 'Generating Prisma client');

  // Step 6: Start Docker services
  log('\nSTEP 6: Starting Docker services...', 'yellow');
  run('docker compose up -d', 'Starting Docker containers (postgres, redis, mailpit, rustfs)');

  // Wait for services
  log('\n⏳ Waiting for services to become healthy (30 seconds)...', 'yellow');
  execSync('timeout /t 30 || sleep 30', { stdio: 'inherit' });

  // Step 7: Database setup
  log('\nSTEP 7: Setting up database...', 'yellow');
  run('pnpm db:migrate', 'Running Prisma migrations');
  run('pnpm db:seed', 'Seeding database with test data');

  // Step 8: Verification
  log('\nSTEP 8: Verifying installation...', 'yellow');

  const services = [
    { name: 'PostgreSQL', port: 5432, url: 'postgres://user:password@localhost:5432/fluid_events' },
    { name: 'Redis', port: 6379 },
    { name: 'Mailpit', port: 8025, url: 'http://localhost:8025' },
    { name: 'RustFS', port: 9001, url: 'http://localhost:9001' },
  ];

  let allHealthy = true;
  for (const service of services) {
    try {
      execSync(`netstat -an | find ":${service.port}"`, { stdio: 'pipe' });
      log(`✓ ${service.name} (${service.url || `port ${service.port}`})`, 'green');
    } catch {
      log(`✗ ${service.name} not responding`, 'red');
      allHealthy = false;
    }
  }

  // Final instructions
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  if (allHealthy) {
    log('║                ✅ SETUP COMPLETE!                          ║', 'green');
  } else {
    log('║          ⚠️  Setup done but verify services                ║', 'yellow');
  }
  log('╚════════════════════════════════════════════════════════════╝', 'blue');

  log('\n🚀 NEXT STEPS:', 'blue');
  log('\n   1. Start development servers:', 'yellow');
  log('      $ pnpm dev', 'reset');
  
  log('\n   2. Open in browser:', 'yellow');
  log('      Frontend:  http://localhost:3000', 'reset');
  log('      Backend:   http://localhost:4000', 'reset');
  log('      Mailpit:   http://localhost:8025', 'reset');
  log('      RustFS:    http://localhost:9001', 'reset');

  log('\n   3. Useful commands:', 'yellow');
  log('      pnpm dev              # Start all dev servers', 'reset');
  log('      pnpm build            # Build all packages', 'reset');
  log('      pnpm lint             # Lint all code', 'reset');
  log('      pnpm test             # Run tests', 'reset');
  log('      docker compose logs -f # View Docker logs', 'reset');
  log('      docker compose down    # Stop services', 'reset');

  log('\n📚 Documentation:', 'yellow');
  log('      SETUP.md              # Detailed setup guide', 'reset');
  log('      docs/architecture.md  # Architecture overview', 'reset');
  log('      docs/api.md           # API endpoints', 'reset');

  log('\n✨ Happy coding!\n', 'green');
}

main().catch(error => {
  log(`\n❌ Error: ${error.message}`, 'red');
  process.exit(1);
});
