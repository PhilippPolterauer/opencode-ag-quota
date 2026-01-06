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
    type ShellRunner,
} from "./quota-service.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const QuotaPlugin: Plugin = async ({
    project,
    client,
    $,
    directory,
    worktree,
}) => {
    // Use child_process instead of the BunShell $ helper to avoid runtime errors
    const shellRunner: ShellRunner = async (cmd: string) => {
        try {
            const { stdout } = await execAsync(cmd);
            return stdout;
        } catch (e: any) {
            return "";
        }
    };

    const log = async (
        level: "info" | "warn" | "error" | "debug",
        message: string,
        extra?: any,
    ) => {
        try {
            await client.app.log(message as any);
        } catch (e) {
            // Fallback if app logging fails
            console.error(`[opencode-ag-quota] ${message}`, extra);
        }
    };

    let hasWarned = false;

    await log("info", "Plugin initialized");

    return {
        "experimental.text.complete": async (input, output) => {
            try {
                const { sessionID, messageID } = input;

                // 1. Get the current model first to check if we should even proceed
                const messageResp = await client.session.message({
                    path: { id: sessionID, messageID: messageID },
                });

                if (
                    !messageResp.data ||
                    !messageResp.data.info ||
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
                    await log("debug", "Skipping non-google model", {
                        modelID,
                    });
                    return;
                }

                await log("debug", "Checking quota for model", { modelID });

                // 2. Fetch status using shared service
                let userStatus;
                try {
                    const result = await fetchAntigravityStatus(shellRunner);
                    userStatus = result.userStatus;
                    hasWarned = false; // Reset warning if successful
                    await log("debug", "Successfully fetched user status");
                } catch (error: any) {
                    await log("warn", "Failed to fetch user status", {
                        error: error.message,
                    });

                    // If we haven't warned the user yet, show a toast
                    if (!hasWarned) {
                        client.tui.showToast({
                            body: {
                                title: "Antigravity Quota Unavailable",
                                message:
                                    "Language Server not found. Is your IDE open?",
                                variant: "warning",
                            },
                        });
                        hasWarned = true;
                    }
                    return;
                }

                const modelConfigs =
                    userStatus.cascadeModelConfigData?.clientModelConfigs || [];

                const config = modelConfigs.find(
                    (m: any) =>
                        m.modelName === modelID ||
                        (m.label &&
                            m.label
                                .toLowerCase()
                                .includes(modelID.toLowerCase())),
                );

                if (config && config.quotaInfo) {
                    const fraction = config.quotaInfo.remainingFraction;
                    // Default to 0 if missing/NaN but quotaInfo exists (matching ag-usage logic)
                    const modelQuota =
                        typeof fraction === "number" &&
                        Number.isFinite(fraction)
                            ? fraction
                            : 0;
                    const remaining = (modelQuota * 100).toFixed(1);

                    await log("info", "Displaying quota", {
                        modelID,
                        remaining,
                        resetTime: config.quotaInfo.resetTime,
                    });

                    let display = `\n\n---\n*📊 Quota Remaining for ${modelID}: ${remaining}%*`;
                    if (config.quotaInfo.resetTime) {
                        const resetDate = new Date(config.quotaInfo.resetTime);
                        display += `  \n*(Resets in: ${formatRelativeTime(resetDate)})*`;
                    }
                    output.text += display;
                } else {
                    await log("warn", "No quota info found for model", {
                        modelID,
                    });
                }
            } catch (error: any) {
                // Silently fail for other errors to avoid disrupting TUI
                await log("error", "Plugin runtime error", {
                    error: error.message,
                    stack: error.stack,
                });
            }
        },
    };
};

export default QuotaPlugin;
