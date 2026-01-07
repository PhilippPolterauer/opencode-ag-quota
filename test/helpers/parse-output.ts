/**
 * Output parsing helpers for test assertions
 */

export interface ParsedQuotaOutput {
    hasQuotaLine: boolean;
    quotaText: string | null;
    categories: Array<{
        name: string;
        percent: number;
        resetTime: string | null;
    }>;
    status: "available" | "unavailable" | "unknown" | "error" | null;
}

/**
 * Parse quota line from assistant message output
 */
export function parseQuotaOutput(output: string): ParsedQuotaOutput {
    const result: ParsedQuotaOutput = {
        hasQuotaLine: false,
        quotaText: null,
        categories: [],
        status: null,
    };

    // Match the quota line pattern: > AG Quota: ...
    const quotaMatch = output.match(/> AG Quota: (.*)/);
    if (!quotaMatch) {
        return result;
    }

    result.hasQuotaLine = true;
    result.quotaText = quotaMatch[1].trim();

    // Check for special statuses
    if (result.quotaText === "unavailable" || result.quotaText === "antigravity language server not found") {
        result.status = "unavailable";
        return result;
    }
    if (result.quotaText === "unknown") {
        result.status = "unknown";
        return result;
    }
    if (result.quotaText === "error") {
        result.status = "error";
        return result;
    }

    result.status = "available";

    // Parse categories: "Flash: 88% (4h 16m) | Pro: 45% (1h 37m)" or "Flash: 5% 🔴 (4h 16m)"
    const categoryPattern = /(\w+(?:\/\w+)?)\s*:\s*(\d+(?:\.\d+)?)\s*%(?:\s*🔴)?(?:\s*\(([^)]+)\))?/g;
    let match;
    while ((match = categoryPattern.exec(result.quotaText)) !== null) {
        result.categories.push({
            name: match[1],
            percent: parseFloat(match[2]),
            resetTime: match[3] || null,
        });
    }

    // Also check for custom format like "[Flash] 88%"
    const customPattern = /\[(\w+(?:\/\w+)?)\]\s*(\d+(?:\.\d+)?)\s*%(?:\s*🔴)?(?:\s*\(([^)]+)\))?/g;
    while ((match = customPattern.exec(result.quotaText)) !== null) {
        result.categories.push({
            name: match[1],
            percent: parseFloat(match[2]),
            resetTime: match[3] || null,
        });
    }

    return result;
}

/**
 * Parse JSON output from opencode run --format json
 */
export interface OpencodeJsonEvent {
    type: string;
    properties?: {
        text?: string;
        content?: string;
        [key: string]: unknown;
    };
}

export function parseOpencodeJsonOutput(output: string): OpencodeJsonEvent[] {
    const events: OpencodeJsonEvent[] = [];
    const lines = output.split("\n").filter((l) => l.trim());

    for (const line of lines) {
        try {
            const event = JSON.parse(line) as OpencodeJsonEvent;
            events.push(event);
        } catch {
            // Skip non-JSON lines
        }
    }

    return events;
}

/**
 * Extract assistant message text from opencode JSON events
 */
export function extractAssistantMessage(events: OpencodeJsonEvent[]): string {
    let message = "";

    for (const event of events) {
        if (event.type === "assistant.message" || event.type === "message.delta") {
            if (event.properties?.text) {
                message += event.properties.text;
            }
            if (event.properties?.content) {
                message += event.properties.content;
            }
        }
    }

    return message;
}

/**
 * Check if output contains reset time pattern (e.g., "2h 30m" or "45m")
 */
export function hasResetTimePattern(text: string): boolean {
    return /\(\d+h\s+\d+m\)|\(\d+m\)/.test(text);
}

/**
 * Check if output contains the category separator
 */
export function hasSeparator(text: string, separator: string): boolean {
    return text.includes(separator);
}
