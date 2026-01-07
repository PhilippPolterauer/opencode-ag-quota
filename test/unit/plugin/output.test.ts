import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    parseQuotaOutput,
    parseOpencodeJsonOutput,
    extractAssistantMessage,
    hasResetTimePattern,
    hasSeparator,
} from "../../helpers/parse-output";

// Import QuotaPlugin for logic tests
import QuotaPlugin from "../../../packages/opencode-ag-quota/src/plugin";
import { fetchQuota } from "ag-quota";

// Mock ag-quota
vi.mock("ag-quota", () => ({
    loadConfig: vi.fn(async () => ({
        quotaMarker: "> AG Quota:",
        pollingInterval: 100000, // Long interval to avoid loops in test
        quotaSource: "local",
        alertThresholds: [0.1],
        displayMode: "all",
        alwaysAppend: true,
        separator: " | ",
        format: "{category}: {percent}% ({resetIn})",
    })),
    fetchQuota: vi.fn(),
    formatRelativeTime: vi.fn(() => "1h"),
    formatAbsoluteTime: vi.fn(() => "10:00 PM"),
    formatQuotaEntry: vi.fn((fmt, data) => `${data.category}: ${data.percent}`),
    categorizeModel: vi.fn(),
    groupModelsByCategory: vi.fn(),
}));

// Mock auth
vi.mock("../../../packages/opencode-ag-quota/src/auth", () => ({
    getCloudCredentials: vi.fn(),
    hasCloudCredentials: vi.fn(async () => true),
}));

describe("parseQuotaOutput", () => {
    it("detects quota line presence", () => {
        const output = `Hello!


> AG Quota: Flash: 88% (4h 16m) | Pro: 45% (1h 37m)`;

        const result = parseQuotaOutput(output);
        expect(result.hasQuotaLine).toBe(true);
        expect(result.status).toBe("available");
    });

    it("returns false when no quota line", () => {
        const output = "Hello! How can I help you?";
        const result = parseQuotaOutput(output);
        expect(result.hasQuotaLine).toBe(false);
        expect(result.status).toBe(null);
    });

    it("parses unavailable status", () => {
        const output = `Hello!


> AG Quota: antigravity language server not found`;

        const result = parseQuotaOutput(output);
        expect(result.hasQuotaLine).toBe(true);
        expect(result.status).toBe("unavailable");
        expect(result.categories).toHaveLength(0);
    });

    it("parses unknown status", () => {
        const output = `Hello!


> AG Quota: unknown`;

        const result = parseQuotaOutput(output);
        expect(result.status).toBe("unknown");
    });

    it("parses error status", () => {
        const output = `Hello!


> AG Quota: error`;

        const result = parseQuotaOutput(output);
        expect(result.status).toBe("error");
    });

    it("extracts categories with reset times", () => {
        const output = `Hello!


> AG Quota: Claude/GPT: 93% (4h 41m) | Flash: 88% (4h 16m) | Pro: 45% (1h 37m)`;

        const result = parseQuotaOutput(output);
        expect(result.categories).toHaveLength(3);

        expect(result.categories[0]).toEqual({
            name: "Claude/GPT",
            percent: 93,
            resetTime: "4h 41m",
        });
        expect(result.categories[1]).toEqual({
            name: "Flash",
            percent: 88,
            resetTime: "4h 16m",
        });
        expect(result.categories[2]).toEqual({
            name: "Pro",
            percent: 45,
            resetTime: "1h 37m",
        });
    });

    it("extracts categories without reset times", () => {
        const output = `Hello!


> AG Quota: Flash: 88% | Pro: 45%`;

        const result = parseQuotaOutput(output);
        expect(result.categories).toHaveLength(2);
        expect(result.categories[0].resetTime).toBe(null);
        expect(result.categories[1].resetTime).toBe(null);
    });

    it("handles custom bracket format", () => {
        const output = `Hello!


> AG Quota: [Flash] 88% (4h 16m) · [Pro] 45% (1h 37m)`;

        const result = parseQuotaOutput(output);
        expect(result.categories).toHaveLength(2);
        expect(result.categories[0].name).toBe("Flash");
        expect(result.categories[1].name).toBe("Pro");
    });

    it("handles decimal percentages", () => {
        const output = `Hello!


> AG Quota: Current: 85.5%`;

        const result = parseQuotaOutput(output);
        expect(result.categories).toHaveLength(1);
        expect(result.categories[0].percent).toBe(85.5);
    });

    it("handles low quota warning (red dot)", () => {
        const output = `Hello!


> AG Quota: Flash: 5% 🔴 (4h 16m)`;

        const result = parseQuotaOutput(output);
        expect(result.categories).toHaveLength(1);
        expect(result.categories[0].name).toBe("Flash");
        expect(result.categories[0].percent).toBe(5);
        expect(result.categories[0].resetTime).toBe("4h 16m");
    });
});

describe("parseOpencodeJsonOutput", () => {
    it("parses multiple JSON events", () => {
        const output = `{"type":"session.start","properties":{}}
{"type":"assistant.message","properties":{"text":"Hello"}}
{"type":"session.end","properties":{}}`;

        const events = parseOpencodeJsonOutput(output);
        expect(events).toHaveLength(3);
        expect(events[0].type).toBe("session.start");
        expect(events[1].type).toBe("assistant.message");
        expect(events[2].type).toBe("session.end");
    });

    it("skips non-JSON lines", () => {
        const output = `some log message
{"type":"test","properties":{}}
another log`;

        const events = parseOpencodeJsonOutput(output);
        expect(events).toHaveLength(1);
    });
});

describe("extractAssistantMessage", () => {
    it("concatenates message text", () => {
        const events = [
            { type: "assistant.message", properties: { text: "Hello " } },
            { type: "assistant.message", properties: { text: "world!" } },
        ];

        const message = extractAssistantMessage(events);
        expect(message).toBe("Hello world!");
    });

    it("handles message.delta events", () => {
        const events = [
            { type: "message.delta", properties: { content: "Hi" } },
        ];

        const message = extractAssistantMessage(events);
        expect(message).toBe("Hi");
    });
});

describe("hasResetTimePattern", () => {
    it("matches hours and minutes", () => {
        expect(hasResetTimePattern("Flash: 88% (4h 16m)")).toBe(true);
    });

    it("matches minutes only", () => {
        expect(hasResetTimePattern("Flash: 88% (45m)")).toBe(true);
    });

    it("returns false when no pattern", () => {
        expect(hasResetTimePattern("Flash: 88%")).toBe(false);
    });
});

describe("hasSeparator", () => {
    it("finds pipe separator", () => {
        expect(hasSeparator("Flash: 88% | Pro: 45%", " | ")).toBe(true);
    });

    it("finds custom separator", () => {
        expect(hasSeparator("Flash: 88% · Pro: 45%", " · ")).toBe(true);
    });

    it("returns false when separator not found", () => {
        expect(hasSeparator("Flash: 88%", " | ")).toBe(false);
    });
});

describe("QuotaPlugin Logic", () => {
    let mockClient: any;
    let mockDirectory: string;
    let mockShell: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = {
            tui: { showToast: vi.fn() },
            session: { message: vi.fn() },
        };
        mockDirectory = "/tmp";
        mockShell = vi.fn();
    });

    it("uses cached data and does not fetch on message hook", async () => {
        // Setup initial quota data
        const mockQuotaData = {
            source: "local",
            categories: [
                { category: "Flash", remainingFraction: 0.5, resetTime: null }
            ],
            models: [],
            timestamp: Date.now()
        };
        (fetchQuota as any).mockResolvedValue(mockQuotaData);

        // Instantiate plugin
        const plugin = await QuotaPlugin({ client: mockClient, directory: mockDirectory, $: mockShell } as any);
        
        // Advance timers to trigger the first poll (if any async delay)
        // Note: startPolling calls fetchQuota immediately (async) but without await in root
        // So we need to wait for the promise to resolve.
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // fetchQuota is called once in startPolling (which calls tryConnect)
        expect(fetchQuota).toHaveBeenCalledTimes(1); 

        // Now call the hook
        const hook = plugin["experimental.text.complete"];
        const input = { sessionID: "1", messageID: "1", partID: "1" };
        const output = { text: "Hello" };

        mockClient.session.message.mockResolvedValue({
            data: { info: { role: "assistant", modelID: "google/gemini-pro" } }
        });

        if (hook) {
            await hook(input, output);
        }

        // Should use cached data, so fetchQuota should NOT be called again
        expect(fetchQuota).toHaveBeenCalledTimes(1);
        
        // Check output modification
        // We mocked formatQuotaEntry to return "Category: Percent"
        // Flash: 50%
        expect(output.text).toContain("> AG Quota: Flash: 50%");
    });

    it("shows red dot when quota is low (< 10%)", async () => {
         const mockQuotaData = {
            source: "local",
            categories: [
                { category: "Flash", remainingFraction: 0.05, resetTime: null }
            ],
            models: [],
            timestamp: Date.now()
        };
        (fetchQuota as any).mockResolvedValue(mockQuotaData);

        const plugin = await QuotaPlugin({ client: mockClient, directory: mockDirectory, $: mockShell } as any);
        await new Promise(resolve => setTimeout(resolve, 0));

        const hook = plugin["experimental.text.complete"];
        const input = { sessionID: "2", messageID: "2", partID: "1" };
        const output = { text: "Hello" };

        mockClient.session.message.mockResolvedValue({
            data: { info: { role: "assistant", modelID: "google/gemini-pro" } }
        });

        if (hook) {
            await hook(input, output);
        }
        
        // Check for red dot in output
        // The displayPercent logic adds 🔴 if < 0.1
        // formatQuotaEntry mock returns "Category: Percent"
        // So we expect "Flash: 5% 🔴"
        expect(output.text).toContain("Flash: 5% 🔴");
    });
});
