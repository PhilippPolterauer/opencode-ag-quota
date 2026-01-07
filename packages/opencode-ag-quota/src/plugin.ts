/*
 * MIT License
 *
 * Copyright (c) 2026 Philipp
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
 * ACTION, ARISING OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

import { type Plugin } from "@opencode-ai/plugin";
import { appendFile } from "node:fs/promises";
import * as path from "node:path";
import {
    fetchQuota,
    formatRelativeTime,
    formatAbsoluteTime,
    loadConfig,
    formatQuotaEntry,
    type ShellRunner,
    type UnifiedQuotaResult,
    type CategoryQuota,
} from "ag-quota";
import { getCloudCredentials, hasCloudCredentials } from "./auth";

const RETRY_INTERVAL_MS = 10000;
const MAX_RETRIES = 3;
const LOG_FILE = "/tmp/opencode-quota-debug.log";
const DEFAULT_MARKER = "--- AG Quota ---";

/**
 * Debug logger - writes to a file to understand hook behavior
 */
async function debugLog(message: string): Promise<void> {
    try {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        await appendFile(LOG_FILE, logLine);
    } catch {
        // Ignore logging errors
    }
}

export const QuotaPlugin: Plugin = async ({ client, directory, $ }) => {
    // Load configuration
    const config = await loadConfig(directory);
    const marker = config.quotaMarker || DEFAULT_MARKER;

    // Use Bun's $ shell helper from opencode
    const shellRunner: ShellRunner = async (cmd: string) => {
        try {
            const result = await $`sh -c ${cmd}`.quiet().text();
            return result;
        } catch {
            return "";
        }
    };

    // Connection state
    interface PluginState {
        data: UnifiedQuotaResult | null;
        lastAlertLevel: number; // Start at 1.0 (100%)
        isConnected: boolean;
        currentSource: "cloud" | "local" | null;
        retryCount: number;
        pendingConnectToast: boolean;
    }

    let quotaState: PluginState = {
        data: null,
        lastAlertLevel: 1.0,
        isConnected: false,
        currentSource: null,
        retryCount: 0,
        pendingConnectToast: false,
    };

    // Track processed messages to prevent duplicate quota appending
    const processedMessages = new Map<string, number>();
    const MAX_PROCESSED_MESSAGES = 100;
    const UPDATE_THROTTLE_MS = 5000;

    /**
     * Mark a message as processed and clean up old entries to prevent memory leaks
     */
    const markMessageProcessed = (messageKey: string): void => {
        processedMessages.set(messageKey, Date.now());
        // Clean up oldest entries if we exceed the limit
        if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
            const firstKey = processedMessages.keys().next().value;
            if (firstKey !== undefined) {
                processedMessages.delete(firstKey);
            }
        }
    };

    /**
     * Helper to append or replace the quota message
     */
    const updateQuotaMessage = (
        currentText: string,
        newContent: string,
    ): string => {
        const fullMessage = `\n\n> AG Quota: ${newContent}`;
        if (currentText.includes("> AG Quota:")) {
            // Replace existing quota message
            // Match: \n\n> AG Quota: ...
            const regex = /\n\n> AG Quota: .*/;
            return currentText.replace(regex, fullMessage);
        }
        return currentText + fullMessage;
    };

    const buildQuotaSummary = (quotaResult: UnifiedQuotaResult): string => {
        if (config.displayMode === "current") {
            const currentModel = quotaResult.models.find((model) => model.quotaInfo);
            if (currentModel?.quotaInfo) {
                const fraction = currentModel.quotaInfo.remainingFraction;
                const percent = (
                    typeof fraction === "number" && Number.isFinite(fraction)
                        ? fraction * 100
                        : 0
                ).toFixed(1);
                const resetDate = currentModel.quotaInfo.resetTime
                    ? new Date(currentModel.quotaInfo.resetTime)
                    : null;
                return formatQuotaEntry(config.format, {
                    category: "Current",
                    percent: `${percent}%`,
                    resetIn: resetDate ? formatRelativeTime(resetDate) : null,
                    resetAt: resetDate ? formatAbsoluteTime(resetDate) : null,
                    model: currentModel.modelName,
                });
            }
        }

        const parts: string[] = [];
        for (const cat of quotaResult.categories) {
            const percent = (cat.remainingFraction * 100).toFixed(0);
            const formatted = formatQuotaEntry(config.format, {
                category: cat.category,
                percent: `${percent}%`,
                resetIn: cat.resetTime ? formatRelativeTime(cat.resetTime) : null,
                resetAt: cat.resetTime ? formatAbsoluteTime(cat.resetTime) : null,
                model: "current",
            });
            parts.push(formatted);
        }
        return parts.join(config.separator);
    };

    /**
     * Format a short quota summary for toasts.
     */
    const formatQuotaSummary = (quota: UnifiedQuotaResult): string => {
        if (config.displayMode === "current") {
            const currentModel = quota.models.find((model) => model.quotaInfo);
            if (currentModel?.quotaInfo) {
                const fraction = currentModel.quotaInfo.remainingFraction;
                const percent = (
                    typeof fraction === "number" && Number.isFinite(fraction)
                        ? fraction * 100
                        : 0
                ).toFixed(1);
                const resetDate = currentModel.quotaInfo.resetTime
                    ? new Date(currentModel.quotaInfo.resetTime)
                    : null;
                return formatQuotaEntry(config.format, {
                    category: "Current",
                    percent: `${percent}%`,
                    resetIn: resetDate ? formatRelativeTime(resetDate) : null,
                    resetAt: resetDate ? formatAbsoluteTime(resetDate) : null,
                    model: currentModel.modelName,
                });
            }
        }

        const parts: string[] = [];

        for (const cat of quota.categories) {
            const percent = (cat.remainingFraction * 100).toFixed(0);
            const displayPercent =
                cat.remainingFraction < 0.1 ? `${percent}% 🔴` : `${percent}%`;

            const formatted = formatQuotaEntry(config.format, {
                category: cat.category,
                percent: displayPercent,
                resetIn: cat.resetTime ? formatRelativeTime(cat.resetTime) : null,
                resetAt: cat.resetTime ? formatAbsoluteTime(cat.resetTime) : null,
                model: "",
            });
            parts.push(formatted);
        }

        if (parts.length > 0) {
            return parts.join(config.separator);
        }

        const fallbackModel = quota.models.find((model) => model.quotaInfo);
        if (fallbackModel?.quotaInfo) {
            const fraction = fallbackModel.quotaInfo.remainingFraction;
            const percent = (
                typeof fraction === "number" && Number.isFinite(fraction)
                    ? fraction * 100
                    : 0
            ).toFixed(1);
            return formatQuotaEntry(config.format, {
                category: "Current",
                percent: `${percent}%`,
                resetIn: fallbackModel.quotaInfo.resetTime
                    ? formatRelativeTime(new Date(fallbackModel.quotaInfo.resetTime))
                    : null,
                resetAt: fallbackModel.quotaInfo.resetTime
                    ? formatAbsoluteTime(new Date(fallbackModel.quotaInfo.resetTime))
                    : null,
                model: fallbackModel.modelName,
            });
        }

        return "unknown";
    };


    // Try to connect with the configured source
    const tryConnect = async (): Promise<UnifiedQuotaResult | null> => {
        try {
            let cloudAuth;
            if (config.quotaSource !== "local") {
                try {
                    cloudAuth = await getCloudCredentials();
                } catch {
                    // If cloud auth fails but source is auto, we'll continue to local
                    if (config.quotaSource === "cloud") throw new Error("Cloud auth failed");
                }
            }

            const result = await fetchQuota(config.quotaSource, shellRunner, cloudAuth);
            quotaState.currentSource = result.source;
            return result;
        } catch {
            return null;
        }
    };



    /**
     * Check if we need to alert the user about low quota
     */
    const checkAlerts = () => {
        if (!quotaState.data) return;

        // Find lowest category fraction
        let minFraction = 1.0;
        for (const cat of quotaState.data.categories) {
            if (cat.remainingFraction < minFraction) {
                minFraction = cat.remainingFraction;
            }
        }

        // Check against thresholds (descending order)
        const thresholds = [...config.alertThresholds].sort((a, b) => b - a);

        for (const threshold of thresholds) {
            // If we dropped below this threshold AND haven't alerted for it yet
            if (minFraction <= threshold && quotaState.lastAlertLevel > threshold) {
                client.tui.showToast({
                    body: {
                        title: "Low Quota Warning",
                        message: `One or more categories are below ${(threshold * 100).toFixed(0)}% remaining`,
                        variant: "warning",
                    },
                });
                quotaState.lastAlertLevel = threshold;
                break; // Only one alert per drop
            }
        }

        // If quota went back up (reset), reset alert level
        if (minFraction > quotaState.lastAlertLevel) {
            // Find the highest threshold we are now above
            // Actually, simply setting it to the current fraction or 1.0 is fine?
            // Safer: set it to 1.0 so we re-alert on next drop
            // Or better: set it to the next threshold above current fraction
            quotaState.lastAlertLevel = 1.0;
        }
    };

    /**
     * Start background polling loop
     */
    const startPolling = async () => {
        // Fetch quota
        const result = await tryConnect();

        if (result) {
            if (!quotaState.isConnected) {
                // Just became connected
                quotaState.isConnected = true;
                const sourceLabel = quotaState.currentSource === "cloud" ? "Cloud API" : "Language Server";
                const summary = buildQuotaSummary(result) || "unknown";
                client.tui.showToast({
                    body: {
                        title: "Quota Connected",
                        message: `Connected via ${sourceLabel}. ${summary}`,
                        variant: "success",
                    },
                });
            }

            quotaState.data = result;
            quotaState.currentSource = result.source;
            checkAlerts();
        } else {
            if (quotaState.isConnected) {
                // Just became disconnected
                quotaState.isConnected = false;
                quotaState.currentSource = null;
                client.tui.showToast({
                    body: {
                        title: "Quota Disconnected",
                        message: "Quota connection lost",
                        variant: "warning",
                    },
                });
            }
        }

        // Schedule next poll
        setTimeout(startPolling, config.pollingInterval);
    };

    // Start polling immediately
    startPolling();

    return {
        "experimental.text.complete": async (input, output) => {
            const { sessionID, messageID } = input;
            const messageKey = `${sessionID}-${messageID}`;
            
            // Check throttle for updates (we still throttle updates to the message content to avoid spamming regex)
            const lastProcessed = processedMessages.get(messageKey);
            if (lastProcessed && Date.now() - lastProcessed < UPDATE_THROTTLE_MS) {
                return;
            }

            try {
                const messageResp = await client.session.message({
                    path: { id: sessionID, messageID: messageID },
                });

                if (
                    !messageResp.data?.info ||
                    messageResp.data.info.role !== "assistant"
                ) {
                    return;
                }

                const modelID = messageResp.data.info.modelID || "";

                // Only fire for Google/Antigravity models
                if (
                    !modelID.toLowerCase().includes("google") &&
                    !modelID.toLowerCase().includes("gemini")
                ) {
                    return;
                }

                // If not connected or no data, show unavailable or previous state
                if (!quotaState.isConnected || !quotaState.data) {
                    if (config.alwaysAppend) {
                        const hint = (await hasCloudCredentials())
                            ? "quota source unavailable"
                            : "run 'opencode auth login' first";
                        output.text = updateQuotaMessage(output.text, hint);
                        markMessageProcessed(messageKey);
                    }
                    return;
                }

                // Use cached data
                const quotaResult = quotaState.data;

                if (config.displayMode === "current") {
                    // Show only current model's quota
                    const currentModel = quotaResult.models.find(
                        (m) =>
                            m.modelName === modelID ||
                            modelID.includes(m.modelName) ||
                            (m.label && modelID.toLowerCase().includes(m.label.toLowerCase())) ||
                            (m.label && m.label.toLowerCase().includes(modelID.toLowerCase())),
                    );

                    if (currentModel?.quotaInfo) {
                        const fraction = currentModel.quotaInfo.remainingFraction;
                        const percent = (
                            typeof fraction === "number" && Number.isFinite(fraction)
                                ? fraction * 100
                                : 0
                        ).toFixed(1);

                        // Add red dot if low
                        const displayPercent = fraction < 0.1 ? `${percent}% 🔴` : `${percent}%`;

                        const resetDate = currentModel.quotaInfo.resetTime
                            ? new Date(currentModel.quotaInfo.resetTime)
                            : null;

                        const formatted = formatQuotaEntry(config.format, {
                            category: "Current",
                            percent: displayPercent,
                            resetIn: resetDate ? formatRelativeTime(resetDate) : null,
                            resetAt: resetDate ? formatAbsoluteTime(resetDate) : null,
                            model: modelID,
                        });

                        output.text = updateQuotaMessage(output.text, formatted);
                        markMessageProcessed(messageKey);
                    } else if (config.alwaysAppend) {
                        output.text = updateQuotaMessage(output.text, "unknown");
                        markMessageProcessed(messageKey);
                    }
                } else {
                    // Show all quota categories (using the unified categories)
                    const parts: string[] = [];

                    for (const cat of quotaResult.categories) {
                        const percent = (cat.remainingFraction * 100).toFixed(0);
                        
                        // Add red dot if low
                        const displayPercent = cat.remainingFraction < 0.1 ? `${percent}% 🔴` : `${percent}%`;

                        const formatted = formatQuotaEntry(config.format, {
                            category: cat.category,
                            percent: displayPercent,
                            resetIn: cat.resetTime ? formatRelativeTime(cat.resetTime) : null,
                            resetAt: cat.resetTime ? formatAbsoluteTime(cat.resetTime) : null,
                            model: modelID,
                        });
                        parts.push(formatted);
                    }

                    if (parts.length > 0) {
                        output.text = updateQuotaMessage(
                            output.text,
                            parts.join(config.separator),
                        );
                        markMessageProcessed(messageKey);
                    } else if (config.alwaysAppend) {
                        output.text = updateQuotaMessage(output.text, "unknown");
                        markMessageProcessed(messageKey);
                    }
                }
            } catch {
                // Silently fail to avoid disrupting TUI
                if (config.alwaysAppend) {
                    output.text = updateQuotaMessage(output.text, "error");
                    markMessageProcessed(messageKey);
                }
            }
        },
    };
};

export default QuotaPlugin;
