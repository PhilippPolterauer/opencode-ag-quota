/*
 ISC License

 Copyright (c) 2025, Cristian Militaru

 Permission to use, copy, modify, and/or distribute this software for any
 purpose with or without fee is hereby granted, provided that the above
 copyright notice and this permission notice appear in all copies.

 THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

import * as http from "node:http";
import * as https from "node:https";

export const API_ENDPOINTS = {
    GET_USER_STATUS:
        "/exa.language_server_pb.LanguageServerService/GetUserStatus",
};

export interface QuotaInfo {
    remainingFraction: number;
    resetTime?: string;
}

export interface ModelConfig {
    modelName: string;
    label?: string;
    quotaInfo?: QuotaInfo;
}

export interface UserStatus {
    cascadeModelConfigData?: {
        clientModelConfigs?: ModelConfig[];
    };
}

export interface UserStatusResponse {
    userStatus: UserStatus;
    timestamp: number;
}

export type ShellRunner = (cmd: string) => Promise<string>;

function makeRequest<T>(
    port: number,
    csrfToken: string,
    path: string,
    body: object,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const options = {
            hostname: "127.0.0.1",
            port,
            path,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
                "X-Codeium-Csrf-Token": csrfToken,
                "Connect-Protocol-Version": "1",
            },
            timeout: 2000,
        };

        const handleResponse = (response: http.IncomingMessage) => {
            let data = "";
            response.on("data", (chunk: Buffer) => {
                data += chunk.toString();
            });
            response.on("end", () => {
                try {
                    resolve(JSON.parse(data) as T);
                } catch {
                    reject(new Error("JSON parse error"));
                }
            });
        };

        const req = https.request(
            { ...options, rejectUnauthorized: false },
            handleResponse,
        );
        req.on("error", () => {
            const reqHttp = http.request(options, handleResponse);
            reqHttp.on("error", (err) => reject(err));
            reqHttp.write(payload);
            reqHttp.end();
        });
        req.write(payload);
        req.end();
    });
}

export async function fetchAntigravityStatus(
    runShell: ShellRunner,
): Promise<UserStatusResponse> {
    let procOutput = "";
    try {
        procOutput = await runShell(
            'ps aux | grep -E "csrf_token|language_server" | grep -v grep',
        );
    } catch {
        procOutput = "";
    }

    const lines = procOutput.split("\n");
    let csrfToken = "";
    let cmdLinePort = 0;

    for (const line of lines) {
        const csrfMatch = line.match(/--csrf_token[=\s]+([\w-]+)/i);
        if (csrfMatch?.[1]) csrfToken = csrfMatch[1];
        const portMatch = line.match(/--extension_server_port[=\s]+(\d+)/i);
        if (portMatch?.[1]) cmdLinePort = parseInt(portMatch[1], 10);
        if (csrfToken && cmdLinePort) break;
    }

    if (!csrfToken) {
        throw new Error(
            "Antigravity CSRF token not found. Is the Language Server running?",
        );
    }

    let netstatOutput = "";
    try {
        netstatOutput = await runShell(
            'ss -tlnp | grep -E "language_server|opencode|node"',
        );
    } catch {
        netstatOutput = "";
    }

    const portMatches = netstatOutput.match(/:(\d+)/g);
    let ports = portMatches
        ? portMatches.map((p: string) => parseInt(p.replace(":", ""), 10))
        : [];

    if (cmdLinePort && !ports.includes(cmdLinePort)) {
        ports.unshift(cmdLinePort);
    }

    ports = Array.from(new Set(ports));

    if (ports.length === 0) {
        throw new Error(
            "No listening ports found for Antigravity. Check if the server is active.",
        );
    }

    let userStatus: UserStatus | null = null;
    let lastError: Error | null = null;

    for (const p of ports) {
        try {
            const resp = await makeRequest<{ userStatus?: UserStatus }>(
                p,
                csrfToken,
                API_ENDPOINTS.GET_USER_STATUS,
                { metadata: { ideName: "opencode" } },
            );
            if (resp?.userStatus) {
                userStatus = resp.userStatus;
                break;
            }
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            continue;
        }
    }

    if (!userStatus) {
        throw new Error(
            `Could not communicate with Antigravity API. ${lastError?.message ?? ""}`,
        );
    }

    return {
        userStatus,
        timestamp: Date.now(),
    };
}

/**
 * Format relative time until target date (e.g., "2h 30m")
 */
export function formatRelativeTime(targetDate: Date): string {
    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();
    if (diffMs <= 0) return "now";

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;

    if (diffHours > 0) {
        return `${diffHours}h ${remainingMins}m`;
    }
    return `${diffMins}m`;
}

/**
 * Format absolute time of target date (e.g., "10:30 PM" or "22:30")
 */
export function formatAbsoluteTime(targetDate: Date): string {
    return targetDate.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    });
}

// Re-export config utilities
export {
    loadConfig,
    formatQuotaEntry,
    DEFAULT_CONFIG,
    type QuotaConfig,
    type QuotaSource,
} from "./config";

// Re-export cloud utilities
export {
    fetchCloudQuota,
    type CloudQuotaResult,
    type CloudAccountInfo,
} from "./cloud";

// ============================================================================
// Unified Quota Types and Functions
// ============================================================================

/**
 * Unified category quota info (for the three model groups)
 */
export interface CategoryQuota {
    category: "Flash" | "Pro" | "Claude/GPT";
    remainingFraction: number;
    resetTime: Date | null;
}

/**
 * Unified quota result from either source
 */
export interface UnifiedQuotaResult {
    source: "cloud" | "local";
    categories: CategoryQuota[];
    models: ModelConfig[];
    timestamp: number;
}

/**
 * Credentials for cloud quota fetching
 */
export interface CloudAuthCredentials {
    accessToken: string;
    projectId?: string;
}

/**
 * Categorize a model label into one of the three groups.
 */
export function categorizeModel(label: string): "Flash" | "Pro" | "Claude/GPT" {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes("flash")) {
        return "Flash";
    }
    if (lowerLabel.includes("gemini") || lowerLabel.includes("pro")) {
        return "Pro";
    }
    return "Claude/GPT";
}

/**
 * Group models into the three categories, taking the minimum quota per category.
 */
export function groupModelsByCategory(models: ModelConfig[]): CategoryQuota[] {
    const categories: Record<
        string,
        { remainingFraction: number; resetTime: Date | null }
    > = {};

    for (const model of models) {
        const label = model.label || model.modelName || "";
        const category = categorizeModel(label);
        const fraction = model.quotaInfo?.remainingFraction ?? 0;
        const resetTime = model.quotaInfo?.resetTime
            ? new Date(model.quotaInfo.resetTime)
            : null;

        if (
            !categories[category] ||
            fraction < categories[category].remainingFraction
        ) {
            categories[category] = { remainingFraction: fraction, resetTime };
        }
    }

    const result: CategoryQuota[] = [];
    for (const cat of ["Flash", "Pro", "Claude/GPT"] as const) {
        if (categories[cat]) {
            result.push({
                category: cat,
                remainingFraction: categories[cat].remainingFraction,
                resetTime: categories[cat].resetTime,
            });
        }
    }

    return result;
}

/**
 * Fetch quota from either cloud or local source.
 *
 * @param source - "cloud", "local", or "auto" (try cloud first, fallback to local)
 * @param shellRunner - Required for local source
 * @param cloudAuth - Required for cloud source
 * @returns Unified quota result
 */
export async function fetchQuota(
    source: "cloud" | "local" | "auto",
    shellRunner?: ShellRunner,
    cloudAuth?: CloudAuthCredentials,
): Promise<UnifiedQuotaResult> {
    // Import cloud module dynamically to avoid issues if not available
    const { fetchCloudQuota } = await import("./cloud");

    if (source === "cloud" || source === "auto") {
        // Try cloud first
        if (cloudAuth) {
            try {
                const cloudResult = await fetchCloudQuota(
                    cloudAuth.accessToken,
                    cloudAuth.projectId,
                );
                const categories = groupModelsByCategory(cloudResult.models);
                return {
                    source: "cloud",
                    categories,
                    models: cloudResult.models,
                    timestamp: cloudResult.timestamp,
                };
            } catch (error) {
                if (source === "cloud") {
                    throw error; // Don't fallback if explicitly requested cloud
                }
                // Fall through to local if auto
            }
        } else if (source === "cloud") {
            throw new Error(
                "Cloud access token not provided. Cannot fetch cloud quota.",
            );
        }
    }

    // Try local
    if (!shellRunner) {
        throw new Error("Shell runner required for local quota fetching");
    }

    const localResult = await fetchAntigravityStatus(shellRunner);
    const models: ModelConfig[] =
        localResult.userStatus.cascadeModelConfigData?.clientModelConfigs || [];
    const categories = groupModelsByCategory(models);

    return {
        source: "local",
        categories,
        models,
        timestamp: localResult.timestamp,
    };
}
