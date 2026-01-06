import { describe, it, expect } from "vitest";
import {
    parseQuotaOutput,
    parseOpencodeJsonOutput,
    extractAssistantMessage,
    hasResetTimePattern,
    hasSeparator,
} from "../../helpers/parse-output";

describe("parseQuotaOutput", () => {
    it("detects quota line presence", () => {
        const output = `Hello!

---
*Quota: Flash: 88% (4h 16m) | Pro: 45% (1h 37m)*`;

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

---
*Quota: unavailable*`;

        const result = parseQuotaOutput(output);
        expect(result.hasQuotaLine).toBe(true);
        expect(result.status).toBe("unavailable");
        expect(result.categories).toHaveLength(0);
    });

    it("parses unknown status", () => {
        const output = `Hello!

---
*Quota: unknown*`;

        const result = parseQuotaOutput(output);
        expect(result.status).toBe("unknown");
    });

    it("parses error status", () => {
        const output = `Hello!

---
*Quota: error*`;

        const result = parseQuotaOutput(output);
        expect(result.status).toBe("error");
    });

    it("extracts categories with reset times", () => {
        const output = `Hello!

---
*Quota: Claude/GPT: 93% (4h 41m) | Flash: 88% (4h 16m) | Pro: 45% (1h 37m)*`;

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

---
*Quota: Flash: 88% | Pro: 45%*`;

        const result = parseQuotaOutput(output);
        expect(result.categories).toHaveLength(2);
        expect(result.categories[0].resetTime).toBe(null);
        expect(result.categories[1].resetTime).toBe(null);
    });

    it("handles custom bracket format", () => {
        const output = `Hello!

---
*Quota: [Flash] 88% (4h 16m) · [Pro] 45% (1h 37m)*`;

        const result = parseQuotaOutput(output);
        expect(result.categories).toHaveLength(2);
        expect(result.categories[0].name).toBe("Flash");
        expect(result.categories[1].name).toBe("Pro");
    });

    it("handles decimal percentages", () => {
        const output = `Hello!

---
*Quota: Current: 85.5%*`;

        const result = parseQuotaOutput(output);
        expect(result.categories).toHaveLength(1);
        expect(result.categories[0].percent).toBe(85.5);
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
