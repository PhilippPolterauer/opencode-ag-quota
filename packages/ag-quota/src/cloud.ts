/*
 * ISC License
 * Copyright (c) 2025, Cristian Militaru
 * Copyright (c) 2026, Philipp
 *
 * Cloud quota fetching via Google Cloud Code API.
 */

// ============================================================================
// Constants from opencode-antigravity-auth
// ============================================================================

// Endpoint fallback order (daily → autopush → prod)
const CLOUDCODE_ENDPOINTS = [
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "https://autopush-cloudcode-pa.sandbox.googleapis.com",
    "https://cloudcode-pa.googleapis.com",
] as const;

// Headers matching opencode-antigravity-auth
const CLOUDCODE_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "antigravity/1.11.5 windows/amd64",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata":
        '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
} as const;

// ============================================================================
// Types
// ============================================================================

interface CloudQuotaInfo {
    remainingFraction?: number;
    resetTime?: string;
}

interface CloudModelInfo {
    displayName?: string;
    model?: string;
    quotaInfo?: CloudQuotaInfo;
    supportsImages?: boolean;
    supportsThinking?: boolean;
    recommended?: boolean;
}

interface FetchModelsResponse {
    models?: Record<string, CloudModelInfo>;
}

/**
 * Unified quota info structure (shared between cloud and local)
 */
export interface QuotaInfo {
    remainingFraction: number;
    resetTime?: string;
}

/**
 * Unified model config structure (shared between cloud and local)
 */
export interface ModelConfig {
    modelName: string;
    label?: string;
    quotaInfo?: QuotaInfo;
}

/**
 * Cloud-specific account info
 */
export interface CloudAccountInfo {
    email?: string;
    projectId?: string;
}

/**
 * Result from cloud quota fetch
 */
export interface CloudQuotaResult {
    account: CloudAccountInfo;
    models: ModelConfig[];
    timestamp: number;
}

// ============================================================================
// API Fetching
// ============================================================================

/**
 * Fetch available models with quota from the Cloud Code API.
 */
async function fetchAvailableModels(
    accessToken: string,
    projectId?: string,
): Promise<FetchModelsResponse> {
    const payload = projectId ? { project: projectId } : {};
    let lastError: Error | null = null;

    const headers: Record<string, string> = {
        ...CLOUDCODE_HEADERS,
        Authorization: `Bearer ${accessToken}`,
    };

    for (const endpoint of CLOUDCODE_ENDPOINTS) {
        try {
            const url = `${endpoint}/v1internal:fetchAvailableModels`;

            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });

            if (response.status === 401) {
                throw new Error(
                    "Authorization expired or invalid.",
                );
            }

            if (response.status === 403) {
                throw new Error("Access forbidden (403). Check your account permissions.");
            }

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Cloud Code API error ${response.status}: ${text.slice(0, 200)}`);
            }

            return (await response.json()) as FetchModelsResponse;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Auth errors should not fallback to other endpoints
            if (
                lastError.message.includes("Authorization") ||
                lastError.message.includes("forbidden") ||
                lastError.message.includes("invalid_grant")
            ) {
                throw lastError;
            }
            // Try next endpoint
        }
    }

    throw lastError || new Error("All Cloud Code API endpoints failed");
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Fetch quota information from the Cloud Code API.
 *
 * @param accessToken - Valid OAuth2 access token
 * @param projectId - Optional Google Cloud project ID
 * @returns CloudQuotaResult with account info and model quotas
 * @throws Error if API fails
 */
export async function fetchCloudQuota(
    accessToken: string,
    projectId?: string,
): Promise<CloudQuotaResult> {
    if (!accessToken) {
        throw new Error("Access token is required for cloud quota fetching");
    }

    // Fetch quota data
    const response = await fetchAvailableModels(accessToken, projectId);

    // Convert to unified format
    const models: ModelConfig[] = [];

    if (response.models) {
        for (const [modelKey, info] of Object.entries(response.models)) {
            if (!info.quotaInfo) continue;

            models.push({
                modelName: info.model || modelKey,
                label: info.displayName || modelKey,
                quotaInfo: {
                    remainingFraction: info.quotaInfo.remainingFraction ?? 0,
                    resetTime: info.quotaInfo.resetTime,
                },
            });
        }
    }

    return {
        account: {
            projectId,
        },
        models,
        timestamp: Date.now(),
    };
}
