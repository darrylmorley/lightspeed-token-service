import { db } from "../db/connection";
import crypto from "crypto";

export interface LightspeedToken {
  id: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  updatedAt: Date;
}

export interface LightspeedTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

// Token status for monitoring
export interface TokenStatus {
  isValid: boolean;
  expiresAt: Date | null;
  expiresIn: number; // minutes
  needsRefresh: boolean;
  lastUpdated: Date;
}

export class LightspeedTokenService {
  private readonly REFRESH_BUFFER_MINUTES = 10; // Refresh tokens 10 minutes before expiry
  private readonly ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY; // Add this
  private readonly ALGORITHM = "aes-256-cbc";

  /**
   * Get the latest (most recent) tokens
   */
  async getLatestTokens(): Promise<LightspeedToken | null> {
    const result = await db.lightspeedTokens.findFirst();

    return result;
  }

  /**
   * Check if tokens need refresh
   */
  needsRefresh(tokens: LightspeedToken): boolean {
    if (!tokens.expiresAt) {
      return true; // No expiry time, assume needs refresh
    }

    const now = new Date();
    const expiresAt = new Date(tokens.expiresAt);
    const bufferTime = new Date(
      expiresAt.getTime() - this.REFRESH_BUFFER_MINUTES * 60 * 1000
    );

    return now >= bufferTime;
  }

  /**
   * Encrypt a string value
   */
  private encrypt(text: string): string {
    if (!this.ENCRYPTION_KEY) {
      throw new Error("TOKEN_ENCRYPTION_KEY environment variable is required");
    }

    const iv = crypto.randomBytes(16);

    // ✅ Convert hex string to Buffer (this was likely missing)
    const keyBuffer = Buffer.from(this.ENCRYPTION_KEY, "hex");

    // ✅ Verify key is exactly 32 bytes
    if (keyBuffer.length !== 32) {
      throw new Error(
        `Invalid encryption key length: expected 32 bytes, got ${keyBuffer.length}`
      );
    }

    const cipher = crypto.createCipheriv(this.ALGORITHM, keyBuffer, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    return iv.toString("hex") + ":" + encrypted;
  }

  /**
   * Decrypt a string value
   */
  private decrypt(encryptedText: string): string {
    if (!this.ENCRYPTION_KEY) {
      throw new Error("TOKEN_ENCRYPTION_KEY environment variable is required");
    }

    const [ivHex, encrypted] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");

    // ✅ Convert hex string to Buffer
    const keyBuffer = Buffer.from(this.ENCRYPTION_KEY, "hex");

    const decipher = crypto.createDecipheriv(this.ALGORITHM, keyBuffer, iv);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(): Promise<string | null> {
    const tokens = await this.getLatestTokens();

    if (!tokens) {
      console.error("No Lightspeed tokens found");
      return null;
    }

    // Check if token needs refresh
    if (this.needsRefresh(tokens)) {
      console.log("Access token needs refresh, attempting to refresh...");
      const refreshedTokens = await this.refreshTokens(
        this.decrypt(tokens.refreshToken) // Decrypt before use
      );

      if (refreshedTokens) {
        return this.decrypt(refreshedTokens.accessToken);
      } else {
        console.error("Failed to refresh tokens");
        return null;
      }
    }

    return this.decrypt(tokens.accessToken); // Decrypt before returning
  }

  /**
   * Insert new tokens (for initial setup)
   */
  async insertTokens(
    accessToken: string,
    refreshToken: string,
    expiresIn: number
  ): Promise<LightspeedToken> {
    // ✅ Log tokens before attempting to encrypt/store
    console.log("🔐 Received tokens for storage:");
    console.log(
      "  Access Token (first 20 chars):",
      accessToken.substring(0, 20) + "..."
    );
    console.log(
      "  Refresh Token (first 20 chars):",
      refreshToken.substring(0, 20) + "..."
    );
    console.log("  Expires In:", expiresIn, "seconds");

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

    try {
      const tokenData: LightspeedToken = {
        id: 0, // Auto-incremented by database
        accessToken: this.encrypt(accessToken),
        refreshToken: this.encrypt(refreshToken),
        expiresAt,
        updatedAt: new Date(),
      };

      const result = await db.lightspeedTokens.create({
        data: tokenData,
      });

      console.log("✅ New tokens inserted successfully");
      console.log("  Database ID:", result.id);
      console.log("  Expires At:", expiresAt.toISOString());

      return result;
    } catch (error) {
      console.error("❌ Failed to insert tokens to database:", error);
      console.log("🚨 RECOVERY INFO - Save these tokens:");
      console.log("  LIGHTSPEED_REFRESH_TOKEN=" + refreshToken);
      console.log("  Access token was:", accessToken);
      throw error;
    }
  }

  /**
   * Update tokens (after refresh or initial setup)
   */
  async updateTokens(
    id: number,
    accessToken: string,
    refreshToken: string,
    expiresIn: number
  ): Promise<void> {
    // ✅ Log tokens before attempting to encrypt/store
    console.log("🔄 Updating tokens in database:");
    console.log("  Record ID:", id);
    console.log(
      "  Access Token (first 20 chars):",
      accessToken.substring(0, 20) + "..."
    );
    console.log(
      "  Refresh Token (first 20 chars):",
      refreshToken.substring(0, 20) + "..."
    );
    console.log("  Expires In:", expiresIn, "seconds");

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

    try {
      await db.lightspeedTokens.update({
        where: { id },
        data: {
          accessToken: this.encrypt(accessToken),
          refreshToken: this.encrypt(refreshToken),
          expiresAt,
          updatedAt: new Date(),
        },
      });

      console.log("✅ Tokens updated successfully");
      console.log("  Expires At:", expiresAt.toISOString());
    } catch (error) {
      console.error("❌ Failed to update tokens in database:", error);
      console.log("🚨 RECOVERY INFO - Save these tokens:");
      console.log("  LIGHTSPEED_REFRESH_TOKEN=" + refreshToken);
      console.log("  Access token was:", accessToken);
      throw error;
    }
  }

  /**
   * Refresh tokens using the refresh token
   */
  async refreshTokens(refreshToken: string): Promise<LightspeedToken | null> {
    try {
      // Make request to Lightspeed token refresh endpoint
      const response = await this.requestTokenRefresh(refreshToken);

      if (!response) {
        return null;
      }

      // Get the latest token record to update
      const latestTokens = await this.getLatestTokens();

      if (!latestTokens) {
        // Insert new tokens if none exist
        return await this.insertTokens(
          response.access_token,
          response.refresh_token,
          response.expires_in
        );
      } else {
        // Update existing tokens
        await this.updateTokens(
          latestTokens.id,
          response.access_token,
          response.refresh_token,
          response.expires_in
        );

        // Return updated tokens
        return await this.getLatestTokens();
      }
    } catch (error) {
      console.error("Error refreshing Lightspeed tokens:", error);
      return null;
    }
  }

  /**
   * Get token status for monitoring
   */
  async getTokenStatus(): Promise<TokenStatus | null> {
    const tokens = await this.getLatestTokens();

    if (!tokens) {
      return null;
    }

    const now = new Date();
    const expiresAt = tokens.expiresAt ? new Date(tokens.expiresAt) : null;
    const isValid = expiresAt ? now < expiresAt : false;
    const expiresIn = expiresAt
      ? Math.max(
          0,
          Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60))
        )
      : 0;
    const needsRefresh = this.needsRefresh(tokens);

    return {
      isValid,
      expiresAt,
      expiresIn,
      needsRefresh,
      lastUpdated: tokens.updatedAt,
    };
  }

  /**
   * Validate tokens are properly configured
   */
  async validateTokens(): Promise<boolean> {
    const tokens = await this.getLatestTokens();

    if (!tokens || !tokens.refreshToken) {
      return false;
    }

    // Try to get a valid access token (will refresh if needed)
    const accessToken = await this.getValidAccessToken();
    return !!accessToken;
  }

  /**
   * Clear all tokens (for reset/logout)
   */
  async clearTokens(): Promise<void> {
    await db.lightspeedTokens.deleteMany({});
  }

  /**
   * Complete login flow: exchange auth code and store tokens
   */
  async loginWithAuthCode(authCode: string): Promise<LightspeedToken | null> {
    try {
      const tokenResponse = await this.exchangeAuthCodeForTokens(authCode);

      if (!tokenResponse) {
        return null;
      }

      const storedTokens = await this.insertTokens(
        tokenResponse.access_token,
        tokenResponse.refresh_token,
        tokenResponse.expires_in
      );

      console.log("✅ Login completed successfully");
      return storedTokens;
    } catch (error) {
      console.error("❌ Login flow failed:", error);
      return null;
    }
  }

  /**
   * Exchange authorization code for initial tokens
   */
  async exchangeAuthCodeForTokens(
    authCode: string
  ): Promise<LightspeedTokenResponse | null> {
    // Clean the authorization code - remove any whitespace, newlines, etc.
    const cleanAuthCode = authCode.replace(/\s/g, "").trim();
    const clientId = process.env.LIGHTSPEED_CLIENT_ID;
    const clientSecret = process.env.LIGHTSPEED_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "LIGHTSPEED_CLIENT_ID and LIGHTSPEED_CLIENT_SECRET environment variables are required"
      );
    }

    const requestBody = {
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code: cleanAuthCode,
    };

    console.log("🌐 Making token exchange request to Lightspeed...");
    console.log("  Client ID:", clientId);
    console.log("  Request body:", JSON.stringify(requestBody, null, 2));

    try {
      const response = await fetch(
        "https://cloud.lightspeedapp.com/auth/oauth/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Token exchange failed:", response.status, errorText);
        return null;
      }

      const data = await response.json();

      if (data.access_token && data.refresh_token) {
        console.log("✅ Token exchange successful");
        return {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in || 3600, // Default to 1 hour if not provided
        };
      } else {
        console.error("❌ Invalid response - missing tokens:", data);
        return null;
      }
    } catch (error) {
      console.error("❌ Network error during token exchange:", error);
      return null;
    }
  }

  /**
   * Make HTTP request to refresh tokens
   */
  private async requestTokenRefresh(
    refreshToken: string
  ): Promise<LightspeedTokenResponse | null> {
    const clientId = process.env.LIGHTSPEED_CLIENT_ID;
    const clientSecret = process.env.LIGHTSPEED_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Lightspeed client credentials not configured");
    }

    console.log("🔄 Requesting token refresh from Lightspeed...");
    console.log(
      "  Using refresh token (first 20 chars):",
      refreshToken.substring(0, 20) + "..."
    );

    try {
      const response = await fetch(
        "https://cloud.lightspeedapp.com/auth/oauth/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Token refresh failed:", response.status, errorText);
        console.log("🚨 The refresh token that failed was:", refreshToken);
        return null;
      }

      const rawData = await response.json();

      const data: LightspeedTokenResponse = rawData as LightspeedTokenResponse;

      if (data.access_token && data.refresh_token) {
        console.log("✅ Tokens refreshed successfully from Lightspeed");
        console.log(
          "  New Access Token (first 20):",
          data.access_token.substring(0, 20) + "..."
        );
        console.log(
          "  New Refresh Token (first 20):",
          data.refresh_token.substring(0, 20) + "..."
        );
      } else {
        console.error("❌ Invalid response - missing tokens:", rawData);
      }

      return data;
    } catch (error) {
      console.error("❌ Network error during token refresh:", error);
      console.log(
        "🚨 The refresh token that caused the error was:",
        refreshToken
      );
      return null;
    }
  }

  /**
   * Get time until token expires (in minutes)
   */
  getTimeUntilExpiry(tokens: LightspeedToken): number {
    if (!tokens.expiresAt) return 0;

    const now = new Date();
    const expiresAt = new Date(tokens.expiresAt);
    return Math.max(
      0,
      Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60))
    );
  }

  /**
   * Check if tokens expire within specified minutes
   */
  expiresWithin(tokens: LightspeedToken, minutes: number): boolean {
    return this.getTimeUntilExpiry(tokens) <= minutes;
  }

  // CLI-focused methods that combine business logic with appropriate responses

  /**
   * CLI Login: Handle complete login flow with user-friendly responses
   */
  async cliLogin(
    authCode: string
  ): Promise<{ success: boolean; message: string; status?: any }> {
    if (!authCode?.trim()) {
      return {
        success: false,
        message: "Authorization code is required",
      };
    }

    try {
      console.log("🔐 Exchanging authorization code for tokens...");
      const tokens = await this.loginWithAuthCode(authCode);

      if (tokens) {
        const status = await this.getTokenStatus();
        return {
          success: true,
          message: "Login successful! Tokens stored securely.",
          status,
        };
      } else {
        return {
          success: false,
          message:
            "Failed to complete login - invalid authorization code or network error",
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Login failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * CLI Refresh: Handle token refresh with user-friendly responses
   */
  async cliRefresh(): Promise<{
    success: boolean;
    message: string;
    status?: any;
  }> {
    try {
      console.log("🔄 Refreshing tokens...");

      const currentTokens = await this.getLatestTokens();

      if (!currentTokens) {
        return {
          success: false,
          message:
            "No tokens found. Please login first using the login command",
        };
      }

      const refreshedTokens = await this.refreshTokens(
        this.decrypt(currentTokens.refreshToken)
      );

      if (refreshedTokens) {
        const status = await this.getTokenStatus();
        return {
          success: true,
          message: "Tokens refreshed successfully!",
          status,
        };
      } else {
        return {
          success: false,
          message: "Failed to refresh tokens - they may be expired or invalid",
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Refresh failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * CLI Status: Get formatted status information
   */
  async cliStatus(): Promise<{
    success: boolean;
    message: string;
    status?: any;
    formatted?: string;
  }> {
    try {
      const status = await this.getTokenStatus();

      if (!status) {
        return {
          success: false,
          message: "No tokens found",
          formatted: "❌ No tokens found\nUse the login command to get started",
        };
      }

      const formatted = [
        "📊 Token Status:",
        `   Valid: ${status.isValid ? "✅" : "❌"}`,
        `   Expires: ${
          status.expiresAt ? status.expiresAt.toISOString() : "Unknown"
        }`,
        `   Expires in: ${status.expiresIn} minutes`,
        `   Needs refresh: ${status.needsRefresh ? "⚠️ Yes" : "✅ No"}`,
        `   Last updated: ${status.lastUpdated.toISOString()}`,
      ].join("\n");

      let tips = "";
      if (status.needsRefresh && status.isValid) {
        tips = "\n\n💡 Tip: Run the refresh command to refresh tokens";
      } else if (!status.isValid) {
        tips =
          "\n\n🚨 Tokens are expired. Try refreshing or login again if refresh fails.";
      }

      return {
        success: true,
        message: "Token status retrieved",
        status,
        formatted: formatted + tips,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get token status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * CLI Clear: Clear all tokens with confirmation
   */
  async cliClear(): Promise<{ success: boolean; message: string }> {
    try {
      await this.clearTokens();
      return {
        success: true,
        message: "All tokens cleared successfully",
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to clear tokens: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Manually set tokens (for debugging, testing, or when you already have tokens)
   */
  async setTokensManually(
    accessToken: string,
    refreshToken: string,
    expiresInMinutes?: number
  ): Promise<LightspeedToken> {
    if (!accessToken?.trim() || !refreshToken?.trim()) {
      throw new Error("Both access token and refresh token are required");
    }

    // Default to 1 hour if not specified
    const expiresIn = (expiresInMinutes || 60) * 60; // Convert minutes to seconds

    console.log("🔐 Storing manually provided tokens...");
    console.log(
      `   Access Token (first 20 chars): ${accessToken.substring(0, 20)}...`
    );
    console.log(
      `   Refresh Token (first 20 chars): ${refreshToken.substring(0, 20)}...`
    );
    console.log(`   Expires in: ${expiresInMinutes || 60} minutes`);

    return await this.insertTokens(accessToken, refreshToken, expiresIn);
  }

  /**
   * CLI Show Tokens: Display decrypted tokens (use with caution)
   */
  async cliShowTokens(): Promise<{ success: boolean; message: string; tokens?: { accessToken: string; refreshToken: string; expiresAt: Date | null } }> {
    try {
      const tokens = await this.getLatestTokens();
      
      if (!tokens) {
        return {
          success: false,
          message: "No tokens found"
        };
      }

      const decryptedTokens = {
        accessToken: this.decrypt(tokens.accessToken),
        refreshToken: this.decrypt(tokens.refreshToken),
        expiresAt: tokens.expiresAt
      };

      return {
        success: true,
        message: "Tokens retrieved successfully",
        tokens: decryptedTokens
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to retrieve tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * CLI Manual Token Entry: Handle manual token input with validation
   */
  async cliSetTokens(
    accessToken: string,
    refreshToken: string,
    expiresInMinutes?: number
  ): Promise<{ success: boolean; message: string; status?: any }> {
    if (!accessToken?.trim() || !refreshToken?.trim()) {
      return {
        success: false,
        message: "Both access token and refresh token are required",
      };
    }

    // Basic validation - tokens should be reasonable length and not contain spaces
    if (accessToken.length < 10 || refreshToken.length < 10) {
      return {
        success: false,
        message: "Tokens appear too short - please verify they are complete",
      };
    }

    if (accessToken.includes(" ") || refreshToken.includes(" ")) {
      return {
        success: false,
        message:
          "Tokens should not contain spaces - please verify they are correct",
      };
    }

    try {
      await this.setTokensManually(accessToken, refreshToken, expiresInMinutes);
      const status = await this.getTokenStatus();

      return {
        success: true,
        message: "Tokens set manually and stored securely",
        status,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to set tokens: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }
}
