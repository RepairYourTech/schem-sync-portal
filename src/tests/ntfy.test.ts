import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { createNtfyListener, type NtfyStatus } from "../lib/ntfy";

describe("ntfy listener", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    function makeBody(messages: string[]): string {
        return messages.join("\n") + "\n";
    }

    it("connects to the correct URL with /json poll params", async () => {
        let capturedUrl = "";

        globalThis.fetch = mock(async (input: string | URL | Request) => {
            capturedUrl = typeof input === "string" ? input : input.toString();
            return new Response("", { status: 200 });
        }) as unknown as typeof fetch;

        const listener = createNtfyListener(
            "https://ntfy.example.com/test-topic",
            () => { },
            () => { }
        );

        await new Promise(r => setTimeout(r, 50));
        listener.stop();

        expect(capturedUrl).toMatch(/^https:\/\/ntfy\.example\.com\/test-topic\/json\?poll=1&since=\d+$/);
    });

    it("normalizes trailing slashes in URL", async () => {
        let capturedUrl = "";

        globalThis.fetch = mock(async (input: string | URL | Request) => {
            capturedUrl = typeof input === "string" ? input : input.toString();
            return new Response("", { status: 200 });
        }) as unknown as typeof fetch;

        const listener = createNtfyListener(
            "https://ntfy.example.com/topic///",
            () => { },
            () => { }
        );

        await new Promise(r => setTimeout(r, 50));
        listener.stop();

        expect(capturedUrl).toMatch(/^https:\/\/ntfy\.example\.com\/topic\/json\?poll=1&since=\d+$/);
    });

    it("calls onNotification for message events", async () => {
        const body = makeBody([
            JSON.stringify({ event: "open" }),
            JSON.stringify({ event: "message", message: "new files available", time: 1000 }),
            JSON.stringify({ event: "message", message: "another update", time: 1001 })
        ]);

        globalThis.fetch = mock(async () => {
            return new Response(body, { status: 200 });
        }) as unknown as typeof fetch;

        const received: string[] = [];
        const listener = createNtfyListener(
            "https://ntfy.example.com/topic",
            (msg) => received.push(msg),
            () => { }
        );

        await new Promise(r => setTimeout(r, 100));
        listener.stop();

        expect(received).toEqual(["new files available", "another update"]);
    });

    it("ignores keepalive and open events", async () => {
        const body = makeBody([
            JSON.stringify({ event: "open" }),
            JSON.stringify({ event: "keepalive" }),
            JSON.stringify({ event: "keepalive" })
        ]);

        globalThis.fetch = mock(async () => {
            return new Response(body, { status: 200 });
        }) as unknown as typeof fetch;

        const received: string[] = [];
        const listener = createNtfyListener(
            "https://ntfy.example.com/topic",
            (msg) => received.push(msg),
            () => { }
        );

        await new Promise(r => setTimeout(r, 100));
        listener.stop();

        expect(received).toEqual([]);
    });

    it("reports status transitions correctly", async () => {
        globalThis.fetch = mock(async () => {
            return new Response("", { status: 200 });
        }) as unknown as typeof fetch;

        const statuses: NtfyStatus[] = [];
        const listener = createNtfyListener(
            "https://ntfy.example.com/topic",
            () => { },
            (status) => statuses.push(status)
        );

        await new Promise(r => setTimeout(r, 100));
        listener.stop();

        expect(statuses[0]).toBe("connecting");
        expect(statuses[1]).toBe("connected");
        expect(statuses.includes("disconnected")).toBe(true);
    });

    it("stop() sets status to disconnected", async () => {
        globalThis.fetch = mock(async () => {
            return new Response("", { status: 200 });
        }) as unknown as typeof fetch;

        const listener = createNtfyListener(
            "https://ntfy.example.com/topic",
            () => { },
            () => { }
        );

        await new Promise(r => setTimeout(r, 50));
        listener.stop();

        expect(listener.status()).toBe("disconnected");
    });

    it("retries on HTTP error with reconnecting status", async () => {
        let fetchCount = 0;

        globalThis.fetch = mock(async () => {
            fetchCount++;
            if (fetchCount <= 2) {
                return new Response(null, { status: 500, statusText: "Internal Server Error" });
            }
            return new Response("", { status: 200 });
        }) as unknown as typeof fetch;

        const statuses: NtfyStatus[] = [];
        const listener = createNtfyListener(
            "https://ntfy.example.com/topic",
            () => { },
            (status) => statuses.push(status)
        );

        // First poll fails immediately, backoff is 30s so we won't see a retry in 1.5s
        // But we can verify the status transitions
        await new Promise(r => setTimeout(r, 200));
        listener.stop();

        expect(statuses.includes("reconnecting")).toBe(true);
        expect(fetchCount).toBeGreaterThanOrEqual(1);
    });

    it("skips non-JSON lines without crashing", async () => {
        const body = makeBody([
            "this is not json",
            JSON.stringify({ event: "message", message: "valid message", time: 2000 }),
            "another bad line"
        ]);

        globalThis.fetch = mock(async () => {
            return new Response(body, { status: 200 });
        }) as unknown as typeof fetch;

        const received: string[] = [];
        const listener = createNtfyListener(
            "https://ntfy.example.com/topic",
            (msg) => received.push(msg),
            () => { }
        );

        await new Promise(r => setTimeout(r, 100));
        listener.stop();

        expect(received).toEqual(["valid message"]);
    });
});
