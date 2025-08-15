import { TokenScheduler } from "./services/token-scheduler";
import { LightspeedTokenService } from "./services/token-service";

const scheduler = new TokenScheduler();
const tokenService = new LightspeedTokenService();

async function startTokenService() {
  console.log("🚀 Starting Lightspeed Token Service...");

  // Perform initial health check
  console.log("🔍 Performing initial token health check...");
  const initialStatus = await tokenService.getTokenStatus();
  
  if (!initialStatus) {
    console.log("");
    console.log("⚠️  WARNING: No tokens configured!");
    console.log("🚨 The service is starting but cannot manage tokens until you login");
    console.log("");
    console.log("📋 To configure tokens (choose one):");
    console.log("   Option 1 - OAuth: bun run tokens login <authorization_code>");
    console.log("   Option 2 - Manual: bun run tokens set <access_token> <refresh_token>");
    console.log("   The service will automatically start managing your tokens");
    console.log("");
    console.log("💡 The service will continue running and check for tokens periodically");
    console.log("");
  } else {
    await scheduler.runOneTimeHealthCheck();
  }

  // Start the schedulers
  scheduler.startAll();

  console.log("✅ Lightspeed Token Service is running");
  console.log("📋 Service includes:");
  console.log("   • Token refresh every 5 minutes");
  console.log("   • Health check every hour");
  console.log("   • Automatic token refresh before expiry");
  
  // Keep the process running
  process.on('SIGINT', () => {
    console.log("\n🛑 Shutting down Lightspeed Token Service...");
    scheduler.stopAll();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log("\n🛑 Shutting down Lightspeed Token Service...");
    scheduler.stopAll();
    process.exit(0);
  });
}

// Start the service if this file is run directly
if (import.meta.main) {
  startTokenService().catch(console.error);
}

// Export for use in other files
export { scheduler, tokenService };