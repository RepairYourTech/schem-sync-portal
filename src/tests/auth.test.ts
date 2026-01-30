import { expect, test, describe, beforeAll, mock } from "bun:test";
import { getCopypartyCookie } from "../lib/auth";
import { Logger } from "../lib/logger";

describe("Authentication (Auth)", () => {
    beforeAll(() => {
        Logger.setLevel("DEBUG");
    });

    test("should extract cppws cookie on successful login", async () => {
        // Mock global fetch
        const originalFetch = global.fetch;
        (global as any).fetch = mock(async (url: string, init?: any) => {
            if (init?.method === "POST") {
                return {
                    status: 200,
                    headers: {
                        get: (name: string) => name === "set-cookie" ? "cppws=session123; Path=/; HttpOnly" : null,
                        getSetCookie: () => ["cppws=session123; Path=/; HttpOnly"]
                    }
                } as any;
            }
            return {
                status: 200,
                headers: {
                    get: () => null,
                    getSetCookie: () => []
                }
            } as any;
        });

        const cookie = await getCopypartyCookie("http://localhost:3911", "user", "pass");
        expect(cookie).toBe("Cookie,cppws=session123");

        global.fetch = originalFetch;
    });

    test("should handle login failure", async () => {
        const originalFetch = global.fetch;
        (global as any).fetch = mock(async () => ({
            status: 401,
            headers: { get: () => null, getSetCookie: () => [] }
        } as any));

        const cookie = await getCopypartyCookie("http://localhost:3911", "wrong", "pass");
        expect(cookie).toBeNull();

        global.fetch = originalFetch;
    });
});
