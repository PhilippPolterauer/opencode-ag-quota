import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAntigravityStatus, type ShellRunner } from "./index.js";

type HttpRequestModule = typeof import("node:http");
type HttpsRequestModule = typeof import("node:https");

type MockedHttpModule = HttpRequestModule & { request: ReturnType<typeof vi.fn> };
type MockedHttpsModule = HttpsRequestModule & { request: ReturnType<typeof vi.fn> };

vi.mock("node:http", () => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));

describe("fetchAntigravityStatus", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("should fetch status correctly when discovery succeeds", async () => {
        const http = (await import("node:http")) as unknown as MockedHttpModule;
        const https = (await import("node:https")) as unknown as MockedHttpsModule;

        const mockCsrf = "test-csrf-123";
        const mockPort = 12345;

        const shellRunner: ShellRunner = vi.fn().mockImplementation(async (cmd: string) => {
            if (cmd.includes("ps aux")) {
                return `user 123 0.0 0.1 1234 5678 ? Ss 12:00 0:00 /path/to/language_server --csrf_token=${mockCsrf} --extension_server_port=${mockPort}`;
            }
            if (cmd.includes("ss -tlnp")) {
                return `LISTEN 0 128 127.0.0.1:${mockPort} 0.0.0.0:* users:(("language_server",pid=123,fd=4))`;
            }
            return "";
        });

        const mockResponse = {
            userStatus: {
                cascadeModelConfigData: {
                    clientModelConfigs: [
                        { modelName: "test-model", quotaInfo: { remainingFraction: 0.5 } },
                    ],
                },
            },
        };

        // Mock https.request to fail (trigger fallback to http)
        https.request.mockImplementationOnce((_options: unknown, _cb: unknown) => {
            let errorHandler: (() => void) | null = null;
            const req = {
                on: vi.fn().mockImplementation((event: string, handler: () => void) => {
                    if (event === "error") {
                        errorHandler = handler;
                    }
                    return req;
                }),
                write: vi.fn(),
                end: vi.fn().mockImplementation(() => {
                    // Trigger error after end() to simulate connection failure
                    if (errorHandler) errorHandler();
                }),
            };
            return req as unknown as ReturnType<HttpsRequestModule["request"]>;
        });

        // Mock http.request to succeed
        http.request.mockImplementationOnce((_options: unknown, cb: unknown) => {
            const mockRes = {
                on: vi.fn().mockImplementation((event: string, handler: (arg?: unknown) => void) => {
                    if (event === "data") handler(Buffer.from(JSON.stringify(mockResponse)));
                    if (event === "end") handler();
                    return mockRes;
                }),
            };
            if (typeof cb === "function") {
                cb(mockRes);
            }
            const req = {
                on: vi.fn().mockReturnThis(),
                write: vi.fn().mockReturnThis(),
                end: vi.fn().mockReturnThis(),
            };
            return req as unknown as ReturnType<HttpRequestModule["request"]>;
        });

        const result = await fetchAntigravityStatus(shellRunner);

        expect(result.userStatus).toEqual(mockResponse.userStatus);
        expect(shellRunner).toHaveBeenCalledWith(expect.stringContaining("ps aux"));
    });

    it("should throw error when CSRF token is not found", async () => {
        const shellRunner: ShellRunner = vi.fn().mockResolvedValue("");
        await expect(fetchAntigravityStatus(shellRunner)).rejects.toThrow(
            "Antigravity CSRF token not found",
        );
    });
});
