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
import {
    fetchQuota,
    formatRelativeTime,
    formatAbsoluteTime,
    loadConfig,
    formatQuotaEntry,
    type ShellRunner,
    type UnifiedQuotaResult,
} from "ag-quota";
import { getCloudCredentials } from "./auth";

export const QuotaPlugin: Plugin = async ({ client, directory, $ }) => {
    // Load configuration (loadConfig always returns Required<QuotaConfig> with defaults)
    const config = await loadConfig(directory);

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
    }

    let quotaState: PluginState = {
        data: null,
        lastAlertLevel: 1.0,
        isConnected: false,
        currentSource: null,
    };

    /**
     * Check if a model ID is an Antigravity model (quota tracking applies).
     */
    const isAntigravityModel = (modelID: string): boolean => {
        return modelID.toLowerCase().includes("antigravity");
    };

    /**
     * Get the last assistant message's model ID from a session
     */
    const getLastAssistantModelID = async (sessionID: string): Promise<string | null> => {
        try {
            const response = await client.session.messages({
                path: { id: sessionID },
                query: { limit: 10 }, // Get recent messages, we just need the last assistant one
            });

            if (!response.data) return null;

            // Find the last assistant message (iterate in reverse)
            for (let i = response.data.length - 1; i >= 0; i--) {
                const msg = response.data[i];
                if (msg.info.role === "assistant" && msg.info.modelID) {
                    return msg.info.modelID;
                }
            }

            return null;
        } catch {
            return null;
        }
    };

    /**
     * Get the indicator symbol for a given remaining fraction based on config.
     */
    const getIndicatorSymbol = (fraction: number): string => {
        if (!config.indicators || config.indicators.length === 0) return "";
        // Sort by threshold ascending to find the most severe (lowest threshold met)
        const sorted = [...config.indicators].sort((a, b) => a.threshold - b.threshold);
        for (const indicator of sorted) {
            if (fraction <= indicator.threshold) {
                return ` ${indicator.symbol}`;
            }
        }
        return "";
    };

    const buildQuotaSummary = (quotaResult: UnifiedQuotaResult, modelID?: string, separator?: string): string => {
        if (config.displayMode === "current" && modelID) {
            // Find the model that matches the last used model
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
                const resetDate = currentModel.quotaInfo.resetTime
                    ? new Date(currentModel.quotaInfo.resetTime)
                    : null;

                const displayPercent = `${percent}%${getIndicatorSymbol(fraction)}`;

                return formatQuotaEntry(config.format, {
                    category: "Current",
                    percent: displayPercent,
                    resetIn: resetDate ? formatRelativeTime(resetDate) : null,
                    resetAt: resetDate ? formatAbsoluteTime(resetDate) : null,
                    model: currentModel.modelName,
                });
            }
        }

        const parts: string[] = [];
        for (const cat of quotaResult.categories) {
            const percent = (cat.remainingFraction * 100).toFixed(0);
            const displayPercent = `${percent}%${getIndicatorSymbol(cat.remainingFraction)}`;

            const formatted = formatQuotaEntry(config.format, {
                category: cat.category,
                percent: displayPercent,
                resetIn: cat.resetTime ? formatRelativeTime(cat.resetTime) : null,
                resetAt: cat.resetTime ? formatAbsoluteTime(cat.resetTime) : null,
                model: modelID ?? "current",
            });
            parts.push(formatted);
        }
        return parts.join(separator ?? config.separator);
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

        // Check against thresholds (ascending order).
        // We want to show the most severe (lowest) warning once when crossing multiple levels.
        const thresholds = [...config.alertThresholds].sort((a, b) => a - b);

        for (const threshold of thresholds) {
            // If we dropped below this threshold AND haven't alerted for it yet
            if (minFraction <= threshold && quotaState.lastAlertLevel > threshold) {
                // Use buildQuotaSummary for consistent formatting across all toasts
                const summary = buildQuotaSummary(quotaState.data, undefined, "\n");

                client.tui.showToast({
                    body: {
                        title: "Low Quota Warning",
                        message: `Below ${(threshold * 100).toFixed(0)}% threshold.\n\n${summary}`,
                        variant: "warning",
                    },
                });
                quotaState.lastAlertLevel = threshold;
                break; // Only one alert per drop
            }
        }

        // If quota went back up (reset), reset alert level
        if (minFraction > quotaState.lastAlertLevel) {
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
                const summary = buildQuotaSummary(result, undefined, "\n") || "unknown";
                client.tui.showToast({
                    body: {
                        title: "AG Quota",
                        message: `Connected via ${sourceLabel}.\n${summary}`,
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
        event: async ({ event }) => {
            // On session.idle, show quota toast if an Antigravity model was used
            if (event.type === "session.idle") {
                const { sessionID } = event.properties;

                // Get the last assistant message's model ID from the session
                const lastModelID = await getLastAssistantModelID(sessionID);

                // Only show quota for Antigravity models (model ID contains "antigravity")
                if (!lastModelID || !isAntigravityModel(lastModelID)) {
                    return;
                }

                // Check if we have quota data
                if (!quotaState.isConnected || !quotaState.data) {
                    return;
                }

                // Build and show quota summary
                const summary = buildQuotaSummary(quotaState.data, lastModelID, "\n");
                if (summary) {
                    client.tui.showToast({
                        body: {
                            title: "AG Quota",
                            message: summary,
                            variant: "info",
                        },
                    });
                }
            }
        },
    };
};

export default QuotaPlugin;
