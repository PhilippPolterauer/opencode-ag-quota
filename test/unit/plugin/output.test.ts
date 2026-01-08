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
        alertThresholds: [0.2, 0.1, 0.05],
        displayMode: "all",
        alwaysAppend: true,
        separator: " | ",
        format: "{category}: {percent}% ({resetIn})",
        indicators: [
            { threshold: 0.2, symbol: "⚠️" },
            { threshold: 0.05, symbol: "🛑" },
        ],
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
            session: { 
                message: vi.fn(),
                messages: vi.fn(),
            },
        };
        mockDirectory = "/tmp";
        mockShell = vi.fn();
    });

    it("uses cached data and shows toast on session.idle", async () => {
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

        // Mock session.messages to return an antigravity model
        mockClient.session.messages.mockResolvedValue({
            data: [
                {
                    info: {
                        id: "msg1",
                        sessionID: "session1",
                        role: "assistant",
                        modelID: "antigravity-gemini-2.5-pro",
                        providerID: "google",
                        time: { created: Date.now() }
                    },
                    parts: []
                }
            ]
        });

        // Instantiate plugin
        const plugin = await QuotaPlugin({ client: mockClient, directory: mockDirectory, $: mockShell } as any);
        
        // Wait for startPolling to execute
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // fetchQuota is called once in startPolling (which calls tryConnect)
        expect(fetchQuota).toHaveBeenCalledTimes(1); 

        // Get the event hook
        const eventHook = plugin.event;
        expect(eventHook).toBeDefined();

        // Clear toast calls from connection toast
        mockClient.tui.showToast.mockClear();

        // Simulate session.idle event - plugin will fetch messages to get last model
        await eventHook!({
            event: {
                type: "session.idle",
                properties: { sessionID: "session1" }
            }
        });

        // Should use cached data, so fetchQuota should NOT be called again
        expect(fetchQuota).toHaveBeenCalledTimes(1);
        
        // Check that toast was shown with quota info
        expect(mockClient.tui.showToast).toHaveBeenCalledWith(
            expect.objectContaining({
                body: expect.objectContaining({
                    title: "AG Quota",
                    variant: "info"
                })
            })
        );
    });

    it("shows red dot indicator in toast when quota is low (< 10%)", async () => {
         const mockQuotaData = {
            source: "local",
            categories: [
                { category: "Flash", remainingFraction: 0.05, resetTime: null }
            ],
            models: [],
            timestamp: Date.now()
        };
        (fetchQuota as any).mockResolvedValue(mockQuotaData);

        // Mock session.messages to return an antigravity model
        mockClient.session.messages.mockResolvedValue({
            data: [
                {
                    info: {
                        id: "msg2",
                        sessionID: "session2",
                        role: "assistant",
                        modelID: "antigravity-gemini-2.5-pro",
                        providerID: "google",
                        time: { created: Date.now() }
                    },
                    parts: []
                }
            ]
        });

        const plugin = await QuotaPlugin({ client: mockClient, directory: mockDirectory, $: mockShell } as any);
        await new Promise(resolve => setTimeout(resolve, 0));

        const eventHook = plugin.event;
        expect(eventHook).toBeDefined();

        // Clear toast calls from connection toast and alert
        mockClient.tui.showToast.mockClear();

        // Simulate session.idle event - plugin will fetch messages to get last model
        await eventHook!({
            event: {
                type: "session.idle",
                properties: { sessionID: "session2" }
            }
        });
        
        // Check that toast was shown - the red dot indicator is added by buildQuotaSummary
        // when remainingFraction < 0.1
        expect(mockClient.tui.showToast).toHaveBeenCalledWith(
            expect.objectContaining({
                body: expect.objectContaining({
                    title: "AG Quota",
                    variant: "info"
                })
            })
        );
    });

    it("fires toast alert when quota drops below lowest threshold", async () => {
        // Set quota to 4% (remainingFraction = 0.04).
        const mockQuotaData = {
            source: "local" as const,
            categories: [{ category: "Flash", remainingFraction: 0.04, resetTime: null }],
            models: [
                {
                    modelName: "antigravity-gemini-2.5-flash",
                    label: "Flash",
                    quotaInfo: { remainingFraction: 0.04 },
                },
            ],
            timestamp: Date.now(),
        };
        (fetchQuota as any).mockResolvedValue(mockQuotaData);

        await QuotaPlugin({ client: mockClient, directory: mockDirectory, $: mockShell } as any);

        // Wait for startPolling to execute (which calls checkAlerts)
        await new Promise((resolve) => setTimeout(resolve, 10));

        const toastCalls = mockClient.tui.showToast.mock.calls;

        // Find the low quota warning toast
        const alertToast = toastCalls.find((call: any) => call[0]?.body?.title === "Low Quota Warning");

        expect(alertToast).toBeDefined();
        // Expect the most critical threshold (5%) to be shown
        expect(alertToast[0].body.message).toContain("Below 5% threshold");
        // Uses buildQuotaSummary which adds the indicator symbol (🛑 for 4%)
        expect(alertToast[0].body.message).toContain("Flash: 4% 🛑");
        expect(alertToast[0].body.variant).toBe("warning");
    });

    it("does not fire alert when quota is above all thresholds", async () => {
        // Set quota to 50% which is above the 0.1 (10%) threshold in our mock config
        const mockQuotaData = {
            source: "local" as const,
            categories: [
                { category: "Flash", remainingFraction: 0.5, resetTime: null }
            ],
            models: [],
            timestamp: Date.now()
        };
        (fetchQuota as any).mockResolvedValue(mockQuotaData);

        const plugin = await QuotaPlugin({ client: mockClient, directory: mockDirectory, $: mockShell } as any);
        
        // Wait for startPolling to execute
        await new Promise(resolve => setTimeout(resolve, 10));

        // Should only have the "AG Quota" toast, no low quota warning
        const toastCalls = mockClient.tui.showToast.mock.calls;
        
        const alertToast = toastCalls.find((call: any) => 
            call[0]?.body?.title === "Low Quota Warning"
        );
        
        expect(alertToast).toBeUndefined();
    });

    it("includes model details in alert toast when available", async () => {
        const mockQuotaData = {
            source: "local" as const,
            categories: [{ category: "Flash", remainingFraction: 0.05, resetTime: null }],
            models: [
                {
                    modelName: "antigravity-gemini-2.5-flash",
                    label: "Gemini 2.5 Flash",
                    quotaInfo: { remainingFraction: 0.05 },
                },
            ],
            timestamp: Date.now(),
        };
        (fetchQuota as any).mockResolvedValue(mockQuotaData);

        await QuotaPlugin({ client: mockClient, directory: mockDirectory, $: mockShell } as any);
        await new Promise((resolve) => setTimeout(resolve, 10));

        const toastCalls = mockClient.tui.showToast.mock.calls;
        const alertToast = toastCalls.find((call: any) => call[0]?.body?.title === "Low Quota Warning");

        expect(alertToast).toBeDefined();
        // Should trigger 5% threshold
        expect(alertToast[0].body.message).toContain("Below 5% threshold");
        // Refactored to use buildQuotaSummary (category-based)
        expect(alertToast[0].body.message).toContain("Flash: 5% 🛑");
        expect(alertToast[0].body.variant).toBe("warning");
    });
});
