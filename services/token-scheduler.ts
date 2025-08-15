import * as cron from "node-cron";
import { LightspeedTokenService } from "./token-service";

export class TokenScheduler {
  private tokenService: LightspeedTokenService;
  private refreshTask: cron.ScheduledTask | null = null;
  private healthCheckTask: cron.ScheduledTask | null = null;
  private lastTokenCheckHadTokens: boolean = false;

  constructor() {
    this.tokenService = new LightspeedTokenService();
  }

  /**
   * Start the token refresh scheduler
   * Runs every 5 minutes to check if tokens need refreshing
   */
  startRefreshScheduler(): void {
    if (this.refreshTask) {
      console.log("⚠️  Token refresh scheduler is already running");
      return;
    }

    // Run every 5 minutes
    this.refreshTask = cron.schedule("*/5 * * * *", async () => {
      await this.checkAndRefreshTokens();
    }, {
      scheduled: false // Don't start automatically
    });

    this.refreshTask.start();
    console.log("🚀 Token refresh scheduler started (runs every 5 minutes)");
  }

  /**
   * Start health check scheduler
   * Runs every hour to log token status
   */
  startHealthCheckScheduler(): void {
    if (this.healthCheckTask) {
      console.log("⚠️  Health check scheduler is already running");
      return;
    }

    // Run every hour at minute 0
    this.healthCheckTask = cron.schedule("0 * * * *", async () => {
      await this.performHealthCheck();
    }, {
      scheduled: false
    });

    this.healthCheckTask.start();
    console.log("🏥 Health check scheduler started (runs every hour)");
  }

  /**
   * Start both schedulers
   */
  startAll(): void {
    this.startRefreshScheduler();
    this.startHealthCheckScheduler();
  }

  /**
   * Stop the token refresh scheduler
   */
  stopRefreshScheduler(): void {
    if (this.refreshTask) {
      this.refreshTask.stop();
      this.refreshTask = null;
      console.log("🛑 Token refresh scheduler stopped");
    }
  }

  /**
   * Stop the health check scheduler
   */
  stopHealthCheckScheduler(): void {
    if (this.healthCheckTask) {
      this.healthCheckTask.stop();
      this.healthCheckTask = null;
      console.log("🛑 Health check scheduler stopped");
    }
  }

  /**
   * Stop all schedulers
   */
  stopAll(): void {
    this.stopRefreshScheduler();
    this.stopHealthCheckScheduler();
  }

  /**
   * Check if tokens need refresh and refresh them if necessary
   */
  private async checkAndRefreshTokens(): Promise<void> {
    try {
      const tokens = await this.tokenService.getLatestTokens();
      
      if (!tokens) {
        // Only show guidance periodically, not every 5 minutes
        if (this.lastTokenCheckHadTokens) {
          console.log("🔍 Tokens were removed - service is now waiting for new tokens");
          console.log("💡 To reconfigure tokens, use: bun run tokens login <authorization_code>");
          this.lastTokenCheckHadTokens = false;
        }
        return;
      }

      // Detect when tokens are first configured
      if (!this.lastTokenCheckHadTokens) {
        console.log("🎉 Tokens detected! Automatic token management is now active");
        this.lastTokenCheckHadTokens = true;
      }

      if (this.tokenService.needsRefresh(tokens)) {
        console.log("🔄 Tokens need refresh - attempting automatic refresh...");
        
        const refreshedTokens = await this.tokenService.refreshTokens(tokens.refreshToken);
        
        if (refreshedTokens) {
          console.log("✅ Tokens automatically refreshed successfully");
          
          // Log new expiry time
          const status = await this.tokenService.getTokenStatus();
          if (status) {
            console.log(`📅 New expiry: ${status.expiresAt?.toISOString()}`);
            console.log(`⏱️  Expires in: ${status.expiresIn} minutes`);
          }
        } else {
          console.error("❌ Automatic token refresh failed");
          console.log("🚨 Manual intervention may be required");
        }
      } else {
        console.log("✅ Tokens are still valid - no refresh needed");
      }
    } catch (error) {
      console.error("❌ Error during scheduled token refresh:", error);
    }
  }

  /**
   * Perform health check and log token status
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const status = await this.tokenService.getTokenStatus();
      
      if (!status) {
        console.log("🏥 Health Check: No tokens configured");
        console.log("🚨 ACTION REQUIRED: No tokens found in the system");
        console.log("📋 To set up tokens (choose one option):");
        console.log("   Option 1 - OAuth flow:");
        console.log("     1. Get authorization code from Lightspeed OAuth");
        console.log("     2. Run: bun run tokens login <authorization_code>");
        console.log("   Option 2 - Manual entry:");
        console.log("     1. Get access and refresh tokens from another source");
        console.log("     2. Run: bun run tokens set <access_token> <refresh_token>");
        console.log("   The service will then start managing tokens automatically");
        console.log("");
        console.log("💡 Until tokens are configured, the scheduler will continue checking every hour");
        return;
      }

      console.log("🏥 Health Check Results:");
      console.log(`   Status: ${status.isValid ? "✅ Valid" : "❌ Invalid"}`);
      console.log(`   Expires in: ${status.expiresIn} minutes`);
      console.log(`   Needs refresh: ${status.needsRefresh ? "⚠️ Yes" : "✅ No"}`);
      console.log(`   Last updated: ${status.lastUpdated.toISOString()}`);

      // Alert if tokens expire soon
      if (status.expiresIn <= 30 && status.expiresIn > 0) {
        console.log("🚨 WARNING: Tokens expire in less than 30 minutes!");
      }

      // Alert if tokens are expired
      if (!status.isValid) {
        console.log("🚨 ALERT: Tokens are expired! Automatic refresh should handle this.");
      }
    } catch (error) {
      console.error("❌ Error during health check:", error);
    }
  }

  /**
   * Run a one-time token refresh check
   */
  async runOneTimeRefreshCheck(): Promise<void> {
    console.log("🔍 Running one-time token refresh check...");
    await this.checkAndRefreshTokens();
  }

  /**
   * Run a one-time health check
   */
  async runOneTimeHealthCheck(): Promise<void> {
    console.log("🏥 Running one-time health check...");
    await this.performHealthCheck();
  }

  /**
   * Get scheduler status
   */
  getSchedulerStatus(): {
    refreshSchedulerRunning: boolean;
    healthCheckSchedulerRunning: boolean;
  } {
    return {
      refreshSchedulerRunning: this.refreshTask !== null,
      healthCheckSchedulerRunning: this.healthCheckTask !== null,
    };
  }
}