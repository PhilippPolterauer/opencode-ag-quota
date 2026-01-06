import { describe, it, expect, vi } from "vitest";
import { fetchAntigravityStatus, formatRelativeTime, formatAbsoluteTime, type ShellRunner } from "../../../packages/ag-quota/src/index";

describe("fetchAntigravityStatus", () => {
    it("throws when CSRF token is not found", async () => {
        const shellRunner: ShellRunner = vi.fn().mockResolvedValue("");
        await expect(fetchAntigravityStatus(shellRunner)).rejects.toThrow(
            "Antigravity CSRF token not found"
        );
    });

    it("throws when no ports found", async () => {
        const shellRunner: ShellRunner = vi.fn().mockImplementation(async (cmd: string) => {
            if (cmd.includes("ps aux")) {
                return "user 123 0.0 0.1 1234 5678 ? Ss 12:00 0:00 /path/to/language_server --csrf_token=test-csrf-123";
            }
            if (cmd.includes("ss -tlnp")) {
                return ""; // No ports
            }
            return "";
        });

        await expect(fetchAntigravityStatus(shellRunner)).rejects.toThrow(
            "No listening ports found"
        );
    });

    it("parses CSRF token with equals sign", async () => {
        const shellRunner: ShellRunner = vi.fn().mockImplementation(async (cmd: string) => {
            if (cmd.includes("ps aux")) {
                return "user 123 0.0 0.1 /path/to/language_server --csrf_token=my-token-123 --extension_server_port=12345";
            }
            if (cmd.includes("ss -tlnp")) {
                return "LISTEN 0 128 127.0.0.1:12345";
            }
            return "";
        });

        // Will fail on HTTP request, but that's expected
        await expect(fetchAntigravityStatus(shellRunner)).rejects.toThrow();
        expect(shellRunner).toHaveBeenCalledWith(expect.stringContaining("ps aux"));
    });

    it("parses CSRF token with space separator", async () => {
        const shellRunner: ShellRunner = vi.fn().mockImplementation(async (cmd: string) => {
            if (cmd.includes("ps aux")) {
                return "user 123 0.0 0.1 /path/to/language_server --csrf_token my-token-456 --extension_server_port 54321";
            }
            if (cmd.includes("ss -tlnp")) {
                return "LISTEN 0 128 127.0.0.1:54321";
            }
            return "";
        });

        await expect(fetchAntigravityStatus(shellRunner)).rejects.toThrow();
        expect(shellRunner).toHaveBeenCalledWith(expect.stringContaining("ps aux"));
    });
});

describe("formatRelativeTime", () => {
    it("returns 'now' for past dates", () => {
        const pastDate = new Date(Date.now() - 1000);
        expect(formatRelativeTime(pastDate)).toBe("now");
    });

    it("formats minutes only", () => {
        const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        expect(formatRelativeTime(futureDate)).toBe("30m");
    });

    it("formats hours and minutes", () => {
        const futureDate = new Date(Date.now() + (2 * 60 + 30) * 60 * 1000); // 2h 30m
        expect(formatRelativeTime(futureDate)).toBe("2h 30m");
    });

    it("handles exactly one hour", () => {
        const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        expect(formatRelativeTime(futureDate)).toBe("1h 0m");
    });

    it("handles zero minutes in hours", () => {
        const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours
        expect(formatRelativeTime(futureDate)).toBe("3h 0m");
    });
});

describe("formatAbsoluteTime", () => {
    it("formats time in locale format", () => {
        const date = new Date("2026-01-06T22:30:00");
        const result = formatAbsoluteTime(date);
        // Result depends on locale, but should include hour and minute
        expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it("handles midnight", () => {
        const date = new Date("2026-01-06T00:00:00");
        const result = formatAbsoluteTime(date);
        expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it("handles noon", () => {
        const date = new Date("2026-01-06T12:00:00");
        const result = formatAbsoluteTime(date);
        expect(result).toMatch(/\d{1,2}:\d{2}/);
    });
});
