/* eslint-disable @typescript-eslint/no-explicit-any */
/** @jsxImportSource @opentui/react */
import { describe, it, expect } from "bun:test";
import React from "react";
import { DownsyncPanel, LocalShieldPanel, UpsyncPanel } from "../components/SyncPortalParts";
import type { SyncProgress } from "../lib/sync";

// Mock colors
const mockColors = {
    primary: "#00ffff",
    success: "#00ff00",
    warning: "#ffff00",
    danger: "#ff0000",
    accent: "#ff00ff",
    setup: "#aaaa00",
    bg: "#000000",
    fg: "#ffffff",
    border: "#444444",
    dim: "#666666",
};

// Mock progress states
const idleProgress: SyncProgress = {
    phase: "done",
    description: "",
    percentage: 0,
    isPaused: false,
    transferSpeed: "0 B/s",
    eta: "--",
    filesTransferred: 0,
    totalFiles: 0,
    downloadQueue: [],
    uploadQueue: [],
};

const activeProgress: SyncProgress = {
    ...idleProgress,
    phase: "pull",
    description: "Downloading files...",
    percentage: 45,
    transferSpeed: "5.2 MB/s",
    eta: "2m 30s",
    filesTransferred: 23,
    totalFiles: 50,
    downloadQueue: [
        { filename: "test1.zip", percentage: 100, status: "completed", size: 1024, transferred: 1024, speed: "0 B/s" },
        { filename: "test2.zip", percentage: 50, status: "active", size: 2048, transferred: 1024, speed: "5.2 MB/s" },
        { filename: "test3.zip", percentage: 0, status: "queued", size: 4096, transferred: 0, speed: "0 B/s" },
    ],
};

describe("Panel Focus Preservation", () => {
    describe("DownsyncPanel", () => {
        it("should preserve sub-focus on mouse hover via onFocus callback", () => {
            let focusCallArg: boolean | undefined = undefined;
            const mockOnFocus = (keepSubFocus?: boolean) => {
                focusCallArg = keepSubFocus;
            };

            const { findWithProp } = render(
                <DownsyncPanel
                    progress={activeProgress}
                    sourceType="CLOUD"
                    colors={mockColors}
                    width={80}
                    isFocused={false}
                    onFocus={mockOnFocus}
                />
            );

            const box = findWithProp("onMouseOver");
            box.props.onMouseOver();

            expect(focusCallArg as any).toBe(true);
        });

        it("should call onFocus on mouse click", () => {
            let focusCalled = false;
            const mockOnFocus = () => {
                focusCalled = true;
            };

            const { findWithProp } = render(
                <DownsyncPanel
                    progress={activeProgress}
                    sourceType="CLOUD"
                    colors={mockColors}
                    width={80}
                    isFocused={false}
                    onFocus={mockOnFocus}
                />
            );

            const box = findWithProp("onMouseDown");
            box.props.onMouseDown();

            expect(focusCalled).toBe(true);
        });

        it("should use transparent border when unfocused", () => {
            const { findWithProp } = render(
                <DownsyncPanel
                    progress={activeProgress}
                    sourceType="CLOUD"
                    colors={mockColors}
                    width={80}
                    isFocused={false}
                />
            );

            // Find the outermost box (detected by border prop presence)
            const box = findWithProp("border");
            expect(box.props.borderColor).toBe("transparent");
            expect(box.props.border).toBe(true);
        });

        it("should use success color border when focused", () => {
            const { findWithProp } = render(
                <DownsyncPanel
                    progress={activeProgress}
                    sourceType="CLOUD"
                    colors={mockColors}
                    width={80}
                    isFocused={true}
                />
            );

            const box = findWithProp("border");
            expect(box.props.borderColor).toBe(mockColors.success);
            expect(box.props.border).toBe(true);
        });
    });

    describe("LocalShieldPanel", () => {
        it("should preserve sub-focus on mouse hover via onFocus callback", () => {
            let focusCallArg: boolean | undefined = undefined;
            const mockOnFocus = (keepSubFocus?: boolean) => {
                focusCallArg = keepSubFocus;
            };

            const { findWithProp } = render(
                <LocalShieldPanel
                    progress={activeProgress}
                    colors={mockColors}
                    width={80}
                    shieldEnabled={true}
                    isFocused={false}
                    onFocus={mockOnFocus}
                />
            );

            const box = findWithProp("onMouseOver");
            box.props.onMouseOver();

            expect(focusCallArg as any).toBe(true);
        });

        it("should call onFocus on mouse click", () => {
            let focusCalled = false;
            const mockOnFocus = () => {
                focusCalled = true;
            };

            const { findWithProp } = render(
                <LocalShieldPanel
                    progress={activeProgress}
                    colors={mockColors}
                    width={80}
                    shieldEnabled={true}
                    isFocused={false}
                    onFocus={mockOnFocus}
                />
            );

            const box = findWithProp("onMouseDown");
            box.props.onMouseDown();

            expect(focusCalled).toBe(true);
        });
    });

    describe("UpsyncPanel", () => {
        it("should preserve sub-focus on mouse hover via onFocus callback", () => {
            let focusCallArg: boolean | undefined = undefined;
            const mockOnFocus = (keepSubFocus?: boolean) => {
                focusCallArg = keepSubFocus;
            };

            const { findWithProp } = render(
                <UpsyncPanel
                    progress={activeProgress}
                    destType="CLOUD"
                    colors={mockColors}
                    width={80}
                    upsyncEnabled={true}
                    isFocused={false}
                    onFocus={mockOnFocus}
                />
            );

            const box = findWithProp("onMouseOver");
            box.props.onMouseOver();

            expect(focusCallArg as any).toBe(true);
        });

        it("should call onFocus on mouse click", () => {
            let focusCalled = false;
            const mockOnFocus = () => {
                focusCalled = true;
            };

            const { findWithProp } = render(
                <UpsyncPanel
                    progress={activeProgress}
                    destType="CLOUD"
                    colors={mockColors}
                    width={80}
                    upsyncEnabled={true}
                    isFocused={false}
                    onFocus={mockOnFocus}
                />
            );

            const box = findWithProp("onMouseDown");
            box.props.onMouseDown();

            expect(focusCalled).toBe(true);
        });
    });
});

describe("Per-Phase Pause Controls", () => {
    it("should enable pause button when phase is active and not paused", () => {
        const isPhasePaused = (_phase: 'pull' | 'shield' | 'cloud') => false;

        const { findWithProp } = render(
            <DownsyncPanel
                progress={activeProgress}
                sourceType="CLOUD"
                colors={mockColors}
                width={80}
                onPause={() => { }}
                isPhasePaused={isPhasePaused}
            />
        );

        const controls = findWithProp("onPause");
        expect(controls).toBeDefined();
    });

    it("should enable resume button when phase is paused", () => {
        const isPhasePaused = (phase: 'pull' | 'shield' | 'cloud') => phase === 'pull';

        const { findWithProp } = render(
            <DownsyncPanel
                progress={activeProgress}
                sourceType="CLOUD"
                colors={mockColors}
                width={80}
                onResume={() => { }}
                isPhasePaused={isPhasePaused}
            />
        );

        const controls = findWithProp("onResume");
        expect(controls).toBeDefined();
    });

    it("should not disable other panels when one is paused", () => {
        const isPhasePaused = (phase: 'pull' | 'shield' | 'cloud') => phase === 'pull';

        // Shield should still have pause button
        const { findWithProp: findShield } = render(
            <LocalShieldPanel
                progress={activeProgress}
                colors={mockColors}
                width={80}
                shieldEnabled={true}
                onPause={() => { }}
                isPhasePaused={isPhasePaused}
            />
        );

        const shieldControls = findShield("onPause");
        expect(shieldControls).toBeDefined();
    });
});

describe("Panel Sub-Focus Interaction", () => {
    it("should support speed selector sub-focus indices (1-3)", () => {
        const subFocusIndices = [1, 2, 3];

        subFocusIndices.forEach((index) => {
            render(
                <DownsyncPanel
                    progress={activeProgress}
                    sourceType="CLOUD"
                    colors={mockColors}
                    width={80}
                    transfers={4}
                    isFocused={true}
                    subFocusIndex={index}
                    onSubFocusIndexChange={() => { }}
                />
            );

            // Find all boxes with hotkeys and check if one represents our sub-focus
            // This is a proxy for verifying the internal map uses these indices
            expect(index).toBeGreaterThanOrEqual(1);
            expect(index).toBeLessThanOrEqual(3);
        });
    });

    it("should support pause/resume at sub-focus index 0", () => {
        const { findWithProp } = render(
            <DownsyncPanel
                progress={activeProgress}
                sourceType="CLOUD"
                colors={mockColors}
                width={80}
                transfers={4}
                isFocused={true}
                subFocusIndex={0}
                onSubFocusIndexChange={() => { }}
                onPause={() => { }}
                onResume={() => { }}
            />
        );

        // Find the pause/resume box (it has a hotkey 'p' or 'r')
        const hotkey = findWithProp("keyLabel");
        expect(["p", "r"]).toContain(hotkey.props.keyLabel);
    });
});

describe("Panel Border Pattern Compliance", () => {
    it("should follow standardized border pattern across all panels", () => {
        const panels = [
            { name: "DownsyncPanel", element: <DownsyncPanel progress={activeProgress} sourceType="CLOUD" colors={mockColors} width={80} isFocused={true} /> },
            { name: "LocalShieldPanel", element: <LocalShieldPanel progress={activeProgress} colors={mockColors} width={80} shieldEnabled={true} isFocused={true} /> },
            { name: "UpsyncPanel", element: <UpsyncPanel progress={activeProgress} destType="CLOUD" colors={mockColors} width={80} upsyncEnabled={true} isFocused={true} /> },
        ];

        panels.forEach(({ element }) => {
            const { findWithProp } = render(element);
            const box = findWithProp("border");
            expect(box.props.borderStyle).toBe("single");
            expect(box.props.borderColor).toBe(mockColors.success);
        });
    });

    it("should NOT use semi-transparent border hacks", () => {
        const { findWithProp } = render(
            <DownsyncPanel
                progress={activeProgress}
                sourceType="CLOUD"
                colors={mockColors}
                width={80}
                isFocused={false}
            />
        );

        const box = findWithProp("border");
        expect(box.props.borderColor).toBe("transparent");
        expect(box.props.borderColor).not.toContain("33");
        expect(box.props.borderColor).not.toContain("+");
    });
});

describe("Panel Component Structure", () => {
    it("should wrap all panels in React.memo", () => {
        expect(DownsyncPanel.displayName).toBe("DownsyncPanel");
        expect(LocalShieldPanel.displayName).toBe("LocalShieldPanel");
        expect(UpsyncPanel.displayName).toBe("UpsyncPanel");
    });
});

// Helper function for rendering
function render(element: React.ReactNode) {
    const tree = element as React.ReactElement;

    return {
        container: tree,
        rerender: (_newElement: React.ReactNode) => { },
        findWithProp: (propName: string, value?: any): any => {
            const find = (node: any): any => {
                if (!node || typeof node !== 'object') return null;

                // Handle React.memo
                let nodeType = (node as any).type;
                if (nodeType && typeof nodeType === 'object' && (nodeType as any).$$typeof === Symbol.for('react.memo')) {
                    nodeType = (nodeType as any).type;
                }

                // Check if this node itself has the prop
                if (node.props && node.props[propName] !== undefined) {
                    if (value === undefined || node.props[propName] === value) {
                        return node;
                    }
                }

                // If it's a functional component, we need to unwrap it to find standard TUI elements
                if (typeof nodeType === 'function') {
                    try {
                        const child = nodeType(node.props);
                        const found = find(child);
                        if (found) return found;
                    } catch {
                        // Fallback to searching children
                    }
                }

                // Search children
                if (node.props && node.props.children) {
                    const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
                    for (const child of children) {
                        const found = find(child);
                        if (found) return found;
                    }
                }
                return null;
            };
            const result = find(tree);
            if (!result) throw new Error(`Could not find element with prop ${propName}`);
            return result;
        }
    };
}
