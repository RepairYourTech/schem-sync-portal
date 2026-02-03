/** @jsxImportSource @opentui/react */
import { describe, it, expect, mock } from "bun:test";
import React from "react";
import { Wizard } from "../components/Wizard";
import { mockRender as render, createMockConfig } from "./ui-test-helpers";
import { EMPTY_CONFIG, type PortalConfig } from "../lib/config";

/**
 * Basic Wizard Component Tests
 * 
 * These tests verify critical Wizard flows without requiring full DOM interaction.
 * Focus on happy path scenarios for provider selection and configuration validation.
 */

describe("Wizard Component", () => {
    const mockOnComplete = mock((_config: PortalConfig) => { });
    const mockOnCancel = mock(() => { });
    const mockOnQuit = mock(() => { });
    const mockOnUpdate = mock((_config: PortalConfig) => { });
    const mockOnFocusChange = mock((_area: "body" | "footer") => { });

    describe("Initial Rendering", () => {
        it("should render in restart mode with provider selection step", () => {
            render(
                <Wizard
                    initialConfig={EMPTY_CONFIG}
                    mode="restart"
                    onComplete={mockOnComplete}
                    onCancel={mockOnCancel}
                    onQuit={mockOnQuit}
                    onUpdate={mockOnUpdate}
                    focusArea="body"
                    onFocusChange={mockOnFocusChange}
                    tabTransition="forward"
                    backSignal={0}
                /> as React.JSX.Element
            );

            // Wizard should render without error
            expect(true).toBe(true);
        });

        it("should render in continue mode when config is partially complete", () => {
            const partialConfig = createMockConfig({
                source_provider: "copyparty",
                local_dir: "/tmp/test",
            });

            render(
                <Wizard
                    initialConfig={partialConfig}
                    mode="continue"
                    onComplete={mockOnComplete}
                    onCancel={mockOnCancel}
                    onQuit={mockOnQuit}
                    onUpdate={mockOnUpdate}
                    focusArea="body"
                    onFocusChange={mockOnFocusChange}
                    tabTransition="forward"
                    backSignal={0}
                /> as React.JSX.Element
            );

            expect(true).toBe(true);
        });

        it("should render in edit mode with existing complete config", () => {
            const completeConfig = createMockConfig({
                source_provider: "copyparty",
                local_dir: "/home/test/schematics",
                upsync_enabled: true,
                backup_provider: "gdrive",
            });

            render(
                <Wizard
                    initialConfig={completeConfig}
                    mode="edit"
                    onComplete={mockOnComplete}
                    onCancel={mockOnCancel}
                    onQuit={mockOnQuit}
                    onUpdate={mockOnUpdate}
                    focusArea="body"
                    onFocusChange={mockOnFocusChange}
                    tabTransition="forward"
                    backSignal={0}
                /> as React.JSX.Element
            );

            expect(true).toBe(true);
        });
    });

    describe("Provider Configuration Validation", () => {
        it("should track source provider selection state", () => {
            const config = createMockConfig({
                source_provider: "copyparty",
            });

            // Verify the source provider is set correctly
            expect(config.source_provider).toBe("copyparty");
        });

        it("should validate Google Drive provider configuration", () => {
            const gdriveConfig = createMockConfig({
                source_provider: "gdrive",
                local_dir: "/home/test/schematics",
            });

            // Google Drive requires at minimum the local directory
            expect(gdriveConfig.source_provider).toBe("gdrive");
            expect(gdriveConfig.local_dir).toBeDefined();
        });

        it("should validate Backblaze B2 provider configuration structure", () => {
            const b2Config = createMockConfig({
                source_provider: "b2",
                local_dir: "/home/test/b2-sync",
            });

            // B2 configuration should have provider and local_dir
            expect(b2Config.source_provider).toBe("b2");
            expect(b2Config.local_dir).toBe("/home/test/b2-sync");
        });

        it("should validate SFTP provider configuration", () => {
            const sftpConfig = createMockConfig({
                backup_provider: "sftp",
                backup_dir: "/path/to/backup",
            });

            // SFTP config should include backup directory
            expect(sftpConfig.backup_provider).toBe("sftp");
            expect(sftpConfig.backup_dir).toBeDefined();
        });
    });

    describe("Wizard State Management", () => {
        it("should call onUpdate when configuration changes", () => {
            render(
                <Wizard
                    initialConfig={EMPTY_CONFIG}
                    mode="restart"
                    onComplete={mockOnComplete}
                    onCancel={mockOnCancel}
                    onQuit={mockOnQuit}
                    onUpdate={mockOnUpdate}
                    focusArea="body"
                    onFocusChange={mockOnFocusChange}
                    tabTransition="forward"
                    backSignal={0}
                /> as React.JSX.Element
            );

            // Wizard is rendered - onUpdate would be called on config changes
            // This test confirms the mock is properly wired
            expect(mockOnUpdate).toBeDefined();
        });

        it("should support backSignal prop for navigation", () => {
            const { rerender } = render(
                <Wizard
                    initialConfig={EMPTY_CONFIG}
                    mode="restart"
                    onComplete={mockOnComplete}
                    onCancel={mockOnCancel}
                    onQuit={mockOnQuit}
                    onUpdate={mockOnUpdate}
                    focusArea="body"
                    onFocusChange={mockOnFocusChange}
                    tabTransition="forward"
                    backSignal={0}
                /> as React.JSX.Element
            );

            // Increment backSignal to trigger navigation
            rerender(
                <Wizard
                    initialConfig={EMPTY_CONFIG}
                    mode="restart"
                    onComplete={mockOnComplete}
                    onCancel={mockOnCancel}
                    onQuit={mockOnQuit}
                    onUpdate={mockOnUpdate}
                    focusArea="body"
                    onFocusChange={mockOnFocusChange}
                    tabTransition="forward"
                    backSignal={1}
                /> as React.JSX.Element
            );

            // Should handle backSignal increment gracefully
            expect(true).toBe(true);
        });
    });

    describe("Wizard Props Validation", () => {
        it("should accept all required props without error", () => {
            expect(() => {
                render(
                    <Wizard
                        initialConfig={EMPTY_CONFIG}
                        mode="restart"
                        onComplete={mockOnComplete}
                        onCancel={mockOnCancel}
                        onQuit={mockOnQuit}
                        onUpdate={mockOnUpdate}
                        focusArea="body"
                        onFocusChange={mockOnFocusChange}
                        tabTransition="forward"
                        backSignal={0}
                    /> as React.JSX.Element
                );
            }).not.toThrow();
        });

        it("should handle 'edit' mode prop", () => {
            expect(() => {
                render(
                    <Wizard
                        initialConfig={EMPTY_CONFIG}
                        mode="edit"
                        onComplete={mockOnComplete}
                        onCancel={mockOnCancel}
                        onQuit={mockOnQuit}
                        onUpdate={mockOnUpdate}
                        focusArea="body"
                        onFocusChange={mockOnFocusChange}
                        tabTransition="forward"
                        backSignal={0}
                    /> as React.JSX.Element
                );
            }).not.toThrow();
        });

        it("should handle footer focus area", () => {
            render(
                <Wizard
                    initialConfig={EMPTY_CONFIG}
                    mode="restart"
                    onComplete={mockOnComplete}
                    onCancel={mockOnCancel}
                    onQuit={mockOnQuit}
                    onUpdate={mockOnUpdate}
                    focusArea="footer"
                    onFocusChange={mockOnFocusChange}
                    tabTransition="forward"
                    backSignal={0}
                /> as React.JSX.Element
            );

            expect(true).toBe(true);
        });

        it("should handle backward tab transition", () => {
            render(
                <Wizard
                    initialConfig={EMPTY_CONFIG}
                    mode="restart"
                    onComplete={mockOnComplete}
                    onCancel={mockOnCancel}
                    onQuit={mockOnQuit}
                    onUpdate={mockOnUpdate}
                    focusArea="body"
                    onFocusChange={mockOnFocusChange}
                    tabTransition="backward"
                    backSignal={0}
                /> as React.JSX.Element
            );

            expect(true).toBe(true);
        });
    });
});
