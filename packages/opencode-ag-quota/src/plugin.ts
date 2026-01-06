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
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { type Plugin } from "@opencode-ai/plugin";
import {
    fetchAntigravityStatus,
    formatRelativeTime,
    formatAbsoluteTime,
    loadConfig,
    formatQuotaEntry,
    type ShellRunner,
} from "ag-quota";

const RETRY_INTERVAL_MS = 10000;
const MAX_RETRIES = 3;

export const QuotaPlugin: Plugin = async ({ client, directory, $ }) => {
    // Load configuration
    const config = loadConfig(directory);

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
    let isConnected = false;
    let retryCount = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    // Try to connect to the language server with retries
    const tryConnect = async (): Promise<boolean> => {
        try {
            await fetchAntigravityStatus(shellRunner);
            return true;
        } catch {
            return false;
        }
    };

    // Background connection checker
    const startConnectionChecker = () => {
        const check = async () => {
            const connected = await tryConnect();
            
            if (connected && !isConnected) {
                // Just became connected
                isConnected = true;
                retryCount = 0;
                client.tui.showToast({
                    body: {
                        title: "Quota Connected",
                        message: "Language Server connection established",
                        variant: "success",
                    },
                });
            } else if (!connected && isConnected) {
                // Just became disconnected
                isConnected = false;
                client.tui.showToast({
                    body: {
                        title: "Quota Disconnected",
                        message: "Language Server connection lost",
                        variant: "warning",
                    },
                });
            } else if (!connected && !isConnected) {
                // Still not connected, retry
                retryCount++;
                if (retryCount <= MAX_RETRIES) {
                    retryTimeout = setTimeout(check, RETRY_INTERVAL_MS);
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
            try {
                const { sessionID, messageID } = input;

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

                // If not connected, show unavailable
                if (!isConnected) {
                    if (config.alwaysAppend) {
                        output.text += `\n\n---\n*Quota: unavailable*`;
                    }
                    return;
                }

                let userStatus;
                try {
                    const result = await fetchAntigravityStatus(shellRunner);
                    userStatus = result.userStatus;
                } catch (error) {
                    // Unexpected error when we thought we were connected
                    isConnected = false;
                    client.tui.showToast({
                        body: {
                            title: "Quota Fetch Failed",
                            message: "Unexpected error retrieving quota data",
                            variant: "error",
                        },
                    });
                    // Restart connection checker
                    retryCount = 0;
                    startConnectionChecker();
                    
                    if (config.alwaysAppend) {
                        output.text += `\n\n---\n*Quota: error*`;
                    }
                    return;
                }

                const modelConfigs =
                    userStatus.cascadeModelConfigData?.clientModelConfigs || [];

                if (config.displayMode === "current") {
                    // Show only current model's quota
                    const currentConfig = modelConfigs.find(
                        (m) =>
                            m.modelName === modelID ||
                            m.label?.toLowerCase().includes(modelID.toLowerCase()),
                    );

                    if (currentConfig?.quotaInfo) {
                        const fraction = currentConfig.quotaInfo.remainingFraction;
                        const percent = (
                            typeof fraction === "number" && Number.isFinite(fraction)
                                ? fraction * 100
                                : 0
                        ).toFixed(1);

                        const resetDate = currentConfig.quotaInfo.resetTime
                            ? new Date(currentConfig.quotaInfo.resetTime)
                            : null;

                        const formatted = formatQuotaEntry(config.format, {
                            category: "Current",
                            percent,
                            resetIn: resetDate ? formatRelativeTime(resetDate) : null,
                            resetAt: resetDate ? formatAbsoluteTime(resetDate) : null,
                            model: modelID,
                        });

                        output.text += `\n\n---\n*Quota: ${formatted}*`;
                    } else if (config.alwaysAppend) {
                        output.text += `\n\n---\n*Quota: unknown*`;
                    }
                } else {
                    // Show all quota categories
                    const categories: Record<
                        string,
                        { quota: number; resetTime: string | null; label: string }
                    > = {};

                    for (const model of modelConfigs) {
                        const label = model.label || model.modelName || "";
                        const lowerLabel = label.toLowerCase();

                        // Determine category
                        let category: string;
                        if (lowerLabel.includes("flash")) {
                            category = "Flash";
                        } else if (lowerLabel.includes("gemini")) {
                            category = "Pro";
                        } else {
                            category = "Claude/GPT";
                        }

                        const fraction = model.quotaInfo?.remainingFraction;
                        const quota =
                            typeof fraction === "number" && Number.isFinite(fraction)
                                ? fraction
                                : 0;

                        if (!categories[category] || quota < categories[category].quota) {
                            categories[category] = {
                                quota,
                                resetTime: model.quotaInfo?.resetTime || null,
                                label: category,
                            };
                        }
                    }

                    // Build display string with all categories
                    const parts: string[] = [];
                    for (const [name, data] of Object.entries(categories).sort((a, b) =>
                        a[0].localeCompare(b[0]),
                    )) {
                        const percent = (data.quota * 100).toFixed(0);
                        const resetDate = data.resetTime
                            ? new Date(data.resetTime)
                            : null;

                        const formatted = formatQuotaEntry(config.format, {
                            category: name,
                            percent,
                            resetIn: resetDate ? formatRelativeTime(resetDate) : null,
                            resetAt: resetDate ? formatAbsoluteTime(resetDate) : null,
                            model: modelID,
                        });
                        parts.push(formatted);
                    }

                    if (parts.length > 0) {
                        output.text += `\n\n---\n*Quota: ${parts.join(config.separator)}*`;
                    } else if (config.alwaysAppend) {
                        output.text += `\n\n---\n*Quota: unknown*`;
                    }
                }
            } catch {
                // Silently fail to avoid disrupting TUI
                if (config.alwaysAppend) {
                    output.text += `\n\n---\n*Quota: error*`;
                }
            }
        },
    };
};

export default QuotaPlugin;
