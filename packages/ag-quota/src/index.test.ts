import { describe, it, expect, vi } from "vitest";
import { fetchAntigravityStatus, type ShellRunner } from "./index.js";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

vi.mock("node:http");
vi.mock("node:https");

describe("fetchAntigravityStatus", () => {
    it("should fetch status correctly when discovery succeeds", async () => {
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

        // Mock the HTTP request
        const mockResponse = {
            userStatus: {
                cascadeModelConfigData: {
                    clientModelConfigs: [
                        { modelName: "test-model", quotaInfo: { remainingFraction: 0.5 } }
                    ]
                }
            }
        };

        // We need to intercept the http.request call or use a library like nock/msw
        // Since we are in a simple environment, let's try to use vi.spyOn on http
        const mockReq = {
            on: vi.fn().mockReturnThis(),
            write: vi.fn().mockReturnThis(),
            end: vi.fn().mockReturnThis(),
        };
        const mockRes = {
            on: vi.fn().mockImplementation((event, cb) => {
                if (event === "data") cb(Buffer.from(JSON.stringify(mockResponse)));
                if (event === "end") cb();
            }),
        };

        const mockImpl = (options: any, callback: any) => {
            if (callback) callback(mockRes);
            return mockReq;
        };

        vi.mocked(httpRequest).mockImplementation(mockImpl as any);
        vi.mocked(httpsRequest).mockImplementation(mockImpl as any);

        const result = await fetchAntigravityStatus(shellRunner);

        expect(result.userStatus).toEqual(mockResponse.userStatus);
        expect(shellRunner).toHaveBeenCalledWith(expect.stringContaining("ps aux"));
    });

    it("should throw error when CSRF token is not found", async () => {
        const shellRunner: ShellRunner = vi.fn().mockResolvedValue("");
        await expect(fetchAntigravityStatus(shellRunner)).rejects.toThrow("Antigravity CSRF token not found");
    });
});
