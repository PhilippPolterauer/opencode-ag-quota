/*
 * Authentication helper for the CLI.
 * 
 * This logic is duplicated here specifically for the CLI to be standalone 
 * and user-friendly, without polluting the core library exports which 
 * should remain pure and environment-agnostic.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Constants
// ============================================================================

const ANTIGRAVITY_CLIENT_ID =
    "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const ANTIGRAVITY_CLIENT_SECRET = "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";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ============================================================================
// Types
// ============================================================================

interface StoredAccount {
    email: string;
    refreshToken: string;
    projectId?: string;
    managedProjectId?: string;
    addedAt: number;
    lastUsed: number;
}

interface AccountsFile {
    version: number;
    accounts: StoredAccount[];
    activeIndex: number;
}

interface TokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

export interface CLICloudCredentials {
    accessToken: string;
    projectId?: string;
    email: string;
}

// ============================================================================
// Logic
// ============================================================================

function getAccountsFilePath(): string {
    return join(homedir(), ".config", "opencode", "antigravity-accounts.json");
}

function loadAccounts(): AccountsFile {
    const accountsPath = getAccountsFilePath();

    try {
        const content = readFileSync(accountsPath, "utf-8");
        const data = JSON.parse(content) as AccountsFile;

        if (!data.accounts || data.accounts.length === 0) {
            throw new Error("No accounts found in antigravity-accounts.json");
        }

        return data;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            throw new Error("Antigravity accounts file not found.");
        }
        throw error;
    }
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            client_id: ANTIGRAVITY_CLIENT_ID,
            client_secret: ANTIGRAVITY_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }).toString(),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as TokenResponse;
    return data.access_token;
}

/**
 * Attempt to get cloud credentials from the local environment.
 * Returns null if no credentials found or file missing.
 * Throws if file exists but is invalid or refresh fails.
 */
export async function getCLICloudCredentials(): Promise<CLICloudCredentials | null> {
    try {
        // Load accounts
        const accountsFile = loadAccounts();
        const activeAccount =
            accountsFile.accounts[accountsFile.activeIndex] ?? accountsFile.accounts[0];

        if (!activeAccount) {
            return null;
        }

        // Get access token
        const accessToken = await refreshAccessToken(activeAccount.refreshToken);

        return {
            accessToken,
            projectId: activeAccount.projectId,
            email: activeAccount.email,
        };
    } catch (error) {
        // If file not found, just return null (not available)
        if (error instanceof Error && error.message.includes("not found")) {
            return null;
        }
        // If other error (parsing, network), throw it
        throw error;
    }
}
