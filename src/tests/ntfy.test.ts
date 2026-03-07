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

    function createMockStream(messages: string[]): ReadableStream<Uint8Array> {
        const encoder = new TextEncoder();
        let index = 0;

        return new ReadableStream({
            pull(controller) {
                if (index < messages.length) {
                    controller.enqueue(encoder.encode(messages[index] + "\n"));
                    index++;
                } else {
                    controller.close();
                }
            }
        });
    }

    it("connects to the correct URL with /json suffix", async () => {
        let capturedUrl = "";

        globalThis.fetch = mock(async (input: string | URL | Request) => {
            capturedUrl = typeof input === "string" ? input : input.toString();
            return new Response(createMockStream([]), { status: 200 });
        }) as unknown as typeof fetch;

        const listener = createNtfyListener(
            "https://ntfy.example.com/test-topic",
            () => { },
            () => { }
        );

        await new Promise(r => setTimeout(r, 50));
        listener.stop();

        expect(capturedUrl).toBe("https://ntfy.example.com/test-topic/json");
    });

    it("normalizes trailing slashes in URL", async () => {
        let capturedUrl = "";

        globalThis.fetch = mock(async (input: string | URL | Request) => {
            capturedUrl = typeof input === "string" ? input : input.toString();
            return new Response(createMockStream([]), { status: 200 });
        }) as unknown as typeof fetch;

        const listener = createNtfyListener(
            "https://ntfy.example.com/topic///",
            () => { },
            () => { }
        );

        await new Promise(r => setTimeout(r, 50));
        listener.stop();

        expect(capturedUrl).toBe("https://ntfy.example.com/topic/json");
    });

    it("calls onNotification for message events", async () => {
        const messages = [
            JSON.stringify({ event: "open" }),
            JSON.stringify({ event: "message", message: "new files available" }),
            JSON.stringify({ event: "message", message: "another update" })
        ];

        globalThis.fetch = mock(async () => {
            return new Response(createMockStream(messages), { status: 200 });
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
        const messages = [
            JSON.stringify({ event: "open" }),
            JSON.stringify({ event: "keepalive" }),
            JSON.stringify({ event: "keepalive" })
        ];

        globalThis.fetch = mock(async () => {
            return new Response(createMockStream(messages), { status: 200 });
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
        const messages = [
            JSON.stringify({ event: "open" })
        ];

        globalThis.fetch = mock(async () => {
            return new Response(createMockStream(messages), { status: 200 });
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
            return new Response(createMockStream([]), { status: 200 });
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

    it("attempts reconnect on HTTP error", async () => {
        let fetchCount = 0;

        globalThis.fetch = mock(async () => {
            fetchCount++;
            if (fetchCount === 1) {
                return new Response(null, { status: 500, statusText: "Internal Server Error" });
            }
            return new Response(createMockStream([]), { status: 200 });
        }) as unknown as typeof fetch;

        const statuses: NtfyStatus[] = [];
        const listener = createNtfyListener(
            "https://ntfy.example.com/topic",
            () => { },
            (status) => statuses.push(status)
        );

        await new Promise(r => setTimeout(r, 1500));
        listener.stop();

        expect(statuses.includes("error")).toBe(true);
        expect(statuses.includes("reconnecting")).toBe(true);
        expect(fetchCount).toBeGreaterThanOrEqual(2);
    });

    it("skips non-JSON lines without crashing", async () => {
        const messages = [
            "this is not json",
            JSON.stringify({ event: "message", message: "valid message" }),
            "another bad line"
        ];

        globalThis.fetch = mock(async () => {
            return new Response(createMockStream(messages), { status: 200 });
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
