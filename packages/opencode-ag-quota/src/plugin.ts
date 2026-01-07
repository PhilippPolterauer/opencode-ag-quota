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
import * as fs from "node:fs";
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
function debugLog(message: string): void {
    try {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(LOG_FILE, logLine);
    } catch {
        // Ignore logging errors
    }
}

export const QuotaPlugin: Plugin = async ({ client, directory, $ }) => {
    // Load configuration
    const config = loadConfig(directory);
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
    }

    let quotaState: PluginState = {
        data: null,
        lastAlertLevel: 1.0,
        isConnected: false,
        currentSource: null,
        retryCount: 0
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

    // Try to connect with the configured source
    const tryConnect = async (): Promise<boolean> => {
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
            return true;
        } catch {
            return false;
        }
    };

    // Background connection checker
    const startConnectionChecker = () => {
        const check = async () => {
            const connected = await tryConnect();

            if (connected && !quotaState.isConnected) {
                // Just became connected
                quotaState.isConnected = true;
                quotaState.retryCount = 0;
                const sourceLabel = quotaState.currentSource === "cloud" ? "Cloud API" : "Language Server";
                client.tui.showToast({
                    body: {
                        title: "Quota Connected",
                        message: `Connected via ${sourceLabel}`,
                        variant: "success",
                    },
                });
            } else if (!connected && quotaState.isConnected) {
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
            } else if (!connected && !quotaState.isConnected) {
                // Still not connected, retry
                quotaState.retryCount++;
                if (quotaState.retryCount <= MAX_RETRIES) {
                    setTimeout(check, RETRY_INTERVAL_MS);
                }
            }
        };

        // Initial check
        check();
    };

    // Start background connection checker
    startConnectionChecker();

    return {
        "experimental.text.complete": async (input, output) => {
            const { sessionID, messageID } = input;
            const messageKey = `${sessionID}-${messageID}`;
            const textLength = output.text.length;
            const textPreview = output.text.slice(-100).replace(/\n/g, "\\n");

            debugLog(`HOOK FIRED: messageKey=${messageKey}`);
            debugLog(`  textLength=${textLength}`);
            debugLog(`  textPreview (last 100 chars): "${textPreview}"`);

            // Check throttle for updates
            const lastProcessed = processedMessages.get(messageKey);
            if (lastProcessed && Date.now() - lastProcessed < UPDATE_THROTTLE_MS) {
                debugLog(`  SKIPPING: throttled`);
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
                debugLog(`  modelID from session: "${modelID}"`);

                // Only fire for Google/Antigravity models
                if (
                    !modelID.toLowerCase().includes("google") &&
                    !modelID.toLowerCase().includes("gemini")
                ) {
                    return;
                }

                // If not connected, show unavailable
                if (!quotaState.isConnected) {
                    if (config.alwaysAppend) {
                        const hint = hasCloudCredentials()
                            ? "quota source unavailable"
                            : "run 'opencode auth login' first";
                        output.text = updateQuotaMessage(output.text, hint);
                        markMessageProcessed(messageKey);
                    }
                    return;
                }

                let quotaResult: UnifiedQuotaResult;
                try {
                    let cloudAuth;
                    // Try to get updated cloud credentials for the fetch
                    if (config.quotaSource !== "local") {
                        try {
                            cloudAuth = await getCloudCredentials();
                        } catch {
                            // Ignore error, will fallback if auto or fail if cloud
                        }
                    }
                    quotaResult = await fetchQuota(config.quotaSource, shellRunner, cloudAuth);
                } catch (error) {
                    // Unexpected error when we thought we were connected
                    quotaState.isConnected = false;
                    quotaState.currentSource = null;
                    client.tui.showToast({
                        body: {
                            title: "Quota Fetch Failed",
                            message: "Unexpected error retrieving quota data",
                            variant: "error",
                        },
                    });
                    // Restart connection checker
                    quotaState.retryCount = 0;
                    startConnectionChecker();

                    if (config.alwaysAppend) {
                        output.text = updateQuotaMessage(output.text, "error");
                        markMessageProcessed(messageKey);
                    }
                    return;
                }

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

                        const resetDate = currentModel.quotaInfo.resetTime
                            ? new Date(currentModel.quotaInfo.resetTime)
                            : null;

                        const formatted = formatQuotaEntry(config.format, {
                            category: "Current",
                            percent,
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

                        const formatted = formatQuotaEntry(config.format, {
                            category: cat.category,
                            percent,
                            resetIn: cat.resetTime ? formatRelativeTime(cat.resetTime) : null,
                            resetAt: cat.resetTime ? formatAbsoluteTime(cat.resetTime) : null,
                            model: modelID,
                        });
                        parts.push(formatted);
                    }

                    if (parts.length > 0) {
                        debugLog(`  APPENDING quota for messageKey=${messageKey}`);
                        output.text = updateQuotaMessage(
                            output.text,
                            parts.join(config.separator),
                        );
                        markMessageProcessed(messageKey);
                    } else if (config.alwaysAppend) {
                        debugLog(`  APPENDING unknown for messageKey=${messageKey}`);
                        output.text = updateQuotaMessage(output.text, "unknown");
                        markMessageProcessed(messageKey);
                    }
                }
            } catch {
                // Silently fail to avoid disrupting TUI
                debugLog(`  CATCH: error occurred for messageKey=${messageKey}`);
                if (config.alwaysAppend) {
                    output.text = updateQuotaMessage(output.text, "error");
                    markMessageProcessed(messageKey);
                }
            }
        },
    };
};

export default QuotaPlugin;
