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
        (global as unknown as { fetch: unknown }).fetch = mock(async (_url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                return {
                    status: 200,
                    headers: new Headers({
                        "set-cookie": "cppws=session123; Path=/; HttpOnly"
                    }),
                    getSetCookie: () => ["cppws=session123; Path=/; HttpOnly"]
                } as unknown as Response;
            }
            return {
                status: 200,
                headers: new Headers(),
                getSetCookie: () => []
            } as unknown as Response;
        });

        const cookie = await getCopypartyCookie("http://localhost:3911", "user", "pass");
        expect(cookie).toBe("Cookie,cppws=session123");

        global.fetch = originalFetch;
    });

    test("should handle login failure", async () => {
        const originalFetch = global.fetch;
        (global as unknown as { fetch: unknown }).fetch = mock(async () => ({
            status: 401,
            headers: new Headers(),
            getSetCookie: () => []
        } as unknown as Response));

        const cookie = await getCopypartyCookie("http://localhost:3911", "wrong", "pass");
        expect(cookie).toBeNull();

        global.fetch = originalFetch;
    });
});
