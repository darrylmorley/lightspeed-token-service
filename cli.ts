#!/usr/bin/env bun
import { LightspeedTokenService } from "./services/token-service";
import * as readline from "readline";
import { spawn } from "child_process";

const tokenService = new LightspeedTokenService();

function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

interface Command {
  name: string;
  description: string;
  handler: (args: string[]) => Promise<void>;
}

const commands: Command[] = [
  {
    name: "login",
    description: "Interactive OAuth login to get initial tokens",
    handler: handleLogin,
  },
  {
    name: "set",
    description: "Interactively set access and refresh tokens",
    handler: handleSetTokens,
  },
  {
    name: "refresh",
    description: "Force refresh the current tokens",
    handler: handleRefresh,
  },
  {
    name: "status",
    description: "View current token status and expiry information",
    handler: handleStatus,
  },
  {
    name: "clear",
    description: "Clear all stored tokens",
    handler: handleClear,
  },
  {
    name: "tokens",
    description: "Display decrypted tokens (use with caution)",
    handler: handleShowTokens,
  },
  {
    name: "setup",
    description: "Initialize database schema and run migrations",
    handler: handleSetup,
  },
  {
    name: "help",
    description: "Show this help message",
    handler: handleHelp,
  },
];

async function handleLogin(_args: string[]): Promise<void> {
  console.log("🔐 Interactive OAuth Login");
  console.log("");

  try {
    // Get the OAuth scope from user (with default)
    const scope = await promptUser("🔧 Enter OAuth scope (default: employee:all): ");
    const finalScope = scope.trim() || "employee:all";
    
    // Get required environment variables
    const clientId = process.env.LIGHTSPEED_CLIENT_ID;
    const redirectUri = process.env.LIGHTSPEED_REDIRECT_URI || "https://localhost:3000/auth/callback";
    
    if (!clientId) {
      console.error("❌ LIGHTSPEED_CLIENT_ID environment variable is required");
      process.exit(1);
    }

    // Generate the OAuth authorization URL
    const authUrl = `https://cloud.lightspeedapp.com/auth/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${finalScope}`;
    
    console.log("");
    console.log("📋 To get an authorization code:");
    console.log("1. Visit this URL in your browser:");
    console.log("");
    console.log(`   ${authUrl}`);
    console.log("");
    console.log("2. Authorize the application");
    console.log("3. Copy the 'code' parameter from the redirect URL");
    console.log("4. Paste it below");
    console.log("");

    const authCode = await promptUser("📝 Enter authorization code: ");
    if (!authCode) {
      console.error("❌ Authorization code cannot be empty");
      process.exit(1);
    }

    const result = await tokenService.cliLogin(authCode);
    
    if (result.success) {
      console.log(`✅ ${result.message}`);
      
      // Show status after successful login
      if (result.status) {
        const statusResult = await tokenService.cliStatus();
        if (statusResult.formatted) {
          console.log("");
          console.log(statusResult.formatted);
        }
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Failed to complete OAuth login:", error);
    process.exit(1);
  }
}

async function handleRefresh(_args: string[]): Promise<void> {
  const result = await tokenService.cliRefresh();
  
  if (result.success) {
    console.log(`✅ ${result.message}`);
    
    // Show status after successful refresh
    if (result.status) {
      const statusResult = await tokenService.cliStatus();
      if (statusResult.formatted) {
        console.log("");
        console.log(statusResult.formatted);
      }
    }
  } else {
    console.error(`❌ ${result.message}`);
    process.exit(1);
  }
}

async function handleStatus(_args: string[]): Promise<void> {
  const result = await tokenService.cliStatus();
  
  if (result.success && result.formatted) {
    console.log(result.formatted);
  } else {
    console.error(`❌ ${result.message}`);
    if (!result.success) {
      process.exit(1);
    }
  }
}

async function handleClear(_args: string[]): Promise<void> {
  const result = await tokenService.cliClear();
  
  if (result.success) {
    console.log(`✅ ${result.message}`);
  } else {
    console.error(`❌ ${result.message}`);
    process.exit(1);
  }
}

async function handleShowTokens(_args: string[]): Promise<void> {
  console.log("🔓 Displaying decrypted tokens");
  console.log("");
  console.log("🚨 SECURITY WARNING:");
  console.log("   • These tokens provide full access to your Lightspeed account");
  console.log("   • Make sure no one can see your screen or copy these tokens");
  console.log("   • Do not share these tokens with anyone");
  console.log("   • Clear your terminal history after viewing");
  console.log("");
  
  const confirm = await promptUser("⚠️  Type 'yes' to continue and display tokens: ");
  if (confirm.toLowerCase() !== 'yes') {
    console.log("❌ Operation cancelled for security");
    return;
  }

  console.log("");
  const result = await tokenService.cliShowTokens();
  
  if (result.success && result.tokens) {
    console.log("📋 Current Tokens:");
    console.log(`   Access Token:  ${result.tokens.accessToken}`);
    console.log(`   Refresh Token: ${result.tokens.refreshToken}`);
    console.log(`   Expires At:    ${result.tokens.expiresAt ? result.tokens.expiresAt.toISOString() : 'Unknown'}`);
    console.log("");
    console.log("🔒 REMINDER: Clear your terminal history to remove these tokens from view");
  } else {
    console.error(`❌ ${result.message}`);
    if (!result.success) {
      process.exit(1);
    }
  }
}

async function handleSetup(_args: string[]): Promise<void> {
  console.log("🏗️  Database Setup");
  console.log("");
  console.log("This will:");
  console.log("• Generate Prisma client");
  console.log("• Run database migrations");
  console.log("• Create the lightspeedTokens table if it doesn't exist");
  console.log("");

  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable is required");
    console.log("Please set DATABASE_URL in your .env file");
    process.exit(1);
  }

  console.log(`🔗 Using database: ${process.env.DATABASE_URL.split('@')[1] || 'configured database'}`);
  console.log("");

  const confirm = await promptUser("Continue with database setup? (y/N): ");
  if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
    console.log("❌ Setup cancelled");
    return;
  }

  try {
    console.log("");
    console.log("🔧 Generating Prisma client...");
    
    await new Promise<void>((resolve, reject) => {
      const generate = spawn('bunx', ['prisma', 'generate'], {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      generate.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Prisma generate failed with code ${code}`));
        }
      });
    });

    console.log("✅ Prisma client generated successfully");
    console.log("");
    console.log("🚀 Running database migrations...");

    await new Promise<void>((resolve, reject) => {
      const migrate = spawn('bunx', ['prisma', 'migrate', 'deploy'], {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      migrate.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Prisma migrate failed with code ${code}`));
        }
      });
    });

    console.log("✅ Database migrations completed successfully");
    console.log("");
    console.log("🎉 Database setup complete!");
    console.log("You can now use the other CLI commands to manage tokens.");

  } catch (error) {
    console.error("❌ Setup failed:", error instanceof Error ? error.message : 'Unknown error');
    console.log("");
    console.log("💡 Try running these commands manually:");
    console.log("  bunx prisma generate");
    console.log("  bunx prisma migrate deploy");
    process.exit(1);
  }
}

async function handleSetTokens(_args: string[]): Promise<void> {
  console.log("🔐 Interactive Token Setup");
  console.log("💡 Tokens will be encrypted and stored securely");
  console.log("");

  try {
    const accessToken = await promptUser("📝 Enter access token: ");
    if (!accessToken) {
      console.error("❌ Access token cannot be empty");
      process.exit(1);
    }

    const refreshToken = await promptUser("🔄 Enter refresh token: ");
    if (!refreshToken) {
      console.error("❌ Refresh token cannot be empty");
      process.exit(1);
    }

    const expiresInput = await promptUser("⏰ Enter expiry time in minutes (default: 60): ");
    let expiresInMinutes: number | undefined;
    
    if (expiresInput) {
      expiresInMinutes = parseInt(expiresInput, 10);
      if (isNaN(expiresInMinutes) || expiresInMinutes <= 0) {
        console.error("❌ Expiry time must be a positive number (minutes)");
        process.exit(1);
      }
    }

    const result = await tokenService.cliSetTokens(accessToken, refreshToken, expiresInMinutes);
    
    if (result.success) {
      console.log(`✅ ${result.message}`);
      
      // Show status after successful token setting
      if (result.status) {
        const statusResult = await tokenService.cliStatus();
        if (statusResult.formatted) {
          console.log("");
          console.log(statusResult.formatted);
        }
      }
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Failed to collect token information:", error);
    process.exit(1);
  }
}

async function handleHelp(_args: string[]): Promise<void> {
  console.log("Lightspeed Token CLI");
  console.log("");
  console.log("Commands:");
  
  for (const command of commands) {
    console.log(`  ${command.name.padEnd(10)} - ${command.description}`);
  }
  
  console.log("");
  console.log("Examples:");
  console.log("  bun cli.ts setup                  # Initialize database schema");
  console.log("  bun cli.ts login                  # Interactive OAuth login");
  console.log("  bun cli.ts set                    # Interactive token setup");
  console.log("  bun cli.ts status");
  console.log("  bun cli.ts tokens                 # Show decrypted tokens");
  console.log("  bun cli.ts refresh");
  console.log("");
  console.log("Environment variables required:");
  console.log("  DATABASE_URL - PostgreSQL connection string");
  console.log("  TOKEN_ENCRYPTION_KEY - 32-byte hex string for encryption");
  console.log("  LIGHTSPEED_CLIENT_ID - OAuth client ID");
  console.log("  LIGHTSPEED_CLIENT_SECRET - OAuth client secret");
}

// Main CLI logic
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    await handleHelp([]);
    process.exit(0);
  }

  const commandName = args[0];
  const commandArgs = args.slice(1);
  
  const command = commands.find(cmd => cmd.name === commandName);
  
  if (!command) {
    console.error(`❌ Unknown command: ${commandName}`);
    console.log("");
    await handleHelp([]);
    process.exit(1);
  }

  try {
    await command.handler(commandArgs);
  } catch (error) {
    console.error(`❌ Command failed:`, error);
    process.exit(1);
  }
}

// Run the CLI
if (import.meta.main) {
  main().catch(console.error);
}