import { useCallback, useRef } from "react";
import { getCopypartyCookie } from "../lib/auth";
import { authorizeRemote, updateGdriveRemote, updateGenericRemote } from "../lib/rclone";
import { Env } from "../lib/env";
import type { PortalConfig, PortalProvider } from "../lib/config";
import { getProviderMetadata } from "../lib/providers";

interface WizardAuthProps {
    next: () => void;
    updateConfig: (fn: (prev: PortalConfig) => PortalConfig) => void;
    config: PortalConfig;
    setAuthStatus: (status: string) => void;
    setIsAuthLoading: (loading: boolean) => void;
    urlRef: React.RefObject<string>;
    userRef: React.RefObject<string>;
    passRef: React.RefObject<string>;
    clientIdRef: React.RefObject<string>;
    clientSecretRef: React.RefObject<string>;
    b2IdRef: React.RefObject<string>;
    b2KeyRef: React.RefObject<string>;
    authAbortControllerRef: React.MutableRefObject<AbortController | null>;
    oauthTokenRef: React.MutableRefObject<string | null>;
    wizardContext: "source" | "dest" | null;
    pendingSourceProviderRef: React.RefObject<PortalProvider>;
    pendingBackupProviderRef: React.RefObject<PortalProvider>;
    abortAuth: () => void;
}


export function useWizardAuth({
    next, updateConfig, config, setAuthStatus, setIsAuthLoading,
    urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef,
    authAbortControllerRef, oauthTokenRef,
    wizardContext, pendingSourceProviderRef, pendingBackupProviderRef, abortAuth
}: WizardAuthProps) {
    const activeAuthRequestRef = useRef<boolean>(false);

    const handleAuth = useCallback(async () => {
        if (activeAuthRequestRef.current) {
            console.warn("[AUTH] Auth already in progress, aborting duplicate call");
            return;
        }
        activeAuthRequestRef.current = true;
        console.log("[AUTH] handleAuth called", { method: config.copyparty_method });

        setIsAuthLoading(true);
        setAuthStatus("🔄 Authenticating...");
        const url = urlRef.current?.trim();
        const user = userRef.current?.trim();
        const pass = passRef.current?.trim();

        try {
            if (!url) { setAuthStatus("⚠️ URL is required."); setIsAuthLoading(false); return; }

            const method = config.copyparty_method || "webdav";

            if (method === "webdav") {
                const { createWebDavRemote } = await import("../lib/rclone");
                await createWebDavRemote(Env.REMOTE_PORTAL_SOURCE, url, user || "", pass || "");
                updateConfig(prev => ({ ...prev, source_provider: "copyparty", copyparty_method: "webdav" }));
                next();
            } else {
                if (!pass) { setAuthStatus("⚠️ Password required."); setIsAuthLoading(false); return; }
                const cookie = await getCopypartyCookie(url, user || "", pass);
                if (cookie) {
                    await createHttpRemote(Env.REMOTE_PORTAL_SOURCE, url, cookie);
                    updateConfig(prev => ({ ...prev, source_provider: "copyparty", copyparty_method: "http" }));
                    next();
                } else {
                    setAuthStatus("❌ Auth failed.");
                    return;
                }
            }
            console.log("[AUTH] Auth completed successfully");
        } catch (err) {
            setAuthStatus(`💥 Error: ${(err as Error).message}`);
        } finally {
            activeAuthRequestRef.current = false;
            setIsAuthLoading(false);
        }
    }, [next, updateConfig, config.copyparty_method, setAuthStatus, setIsAuthLoading, urlRef, passRef]);

    const handleGdriveAuth = useCallback(async (clientId: string, clientSecret: string) => {
        if (activeAuthRequestRef.current) {
            console.warn("[AUTH] Auth already in progress, aborting duplicate call");
            return;
        }
        activeAuthRequestRef.current = true;
        console.log("[AUTH] handleGdriveAuth called", { clientId: clientId.substring(0, 10) + "...", hasSecret: !!clientSecret });

        abortAuth(); setIsAuthLoading(true); setAuthStatus("🔄 Launching Google Handshake...");
        const controller = new AbortController(); authAbortControllerRef.current = controller;
        try {
            // Pass user's OAuth credentials to rclone authorize
            const token = await authorizeRemote("drive", controller.signal, clientId, clientSecret);
            if (token) {
                oauthTokenRef.current = token;
                const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                await updateGdriveRemote(remoteName, clientId, clientSecret, token);
                const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                const pending = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                updateConfig(prev => ({ ...prev, [field]: pending }));
                console.log("[AUTH] Auth completed successfully");
                next();
            }
        } catch (err) {
            if (!controller.signal.aborted) setAuthStatus(`❌ Error: ${(err as Error).message}`);
        } finally {
            activeAuthRequestRef.current = false;
            if (authAbortControllerRef.current === controller) {
                authAbortControllerRef.current = null;
                setIsAuthLoading(false);
            }
        }
    }, [wizardContext, next, updateConfig, abortAuth, setAuthStatus, setIsAuthLoading, authAbortControllerRef, oauthTokenRef, pendingSourceProviderRef, pendingBackupProviderRef]);

    const startGenericAuth = useCallback(async (provider: string) => {
        if (activeAuthRequestRef.current) {
            console.warn("[AUTH] Auth already in progress, aborting duplicate call");
            return;
        }
        activeAuthRequestRef.current = true;
        console.log("[AUTH] startGenericAuth called", { provider });

        abortAuth(); setIsAuthLoading(true); setAuthStatus(`🚀 Launching ${provider.toUpperCase()} Auth...`);
        const controller = new AbortController(); authAbortControllerRef.current = controller;
        try {
            const token = await authorizeRemote(provider, controller.signal);
            if (token) {
                oauthTokenRef.current = token;
                const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                await updateGenericRemote(remoteName, provider, { token });
                const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                const pending = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                updateConfig(prev => ({ ...prev, [field]: pending }));
                console.log("[AUTH] Auth completed successfully");
                next();
            }
        } catch (err) {
            if (!controller.signal.aborted) setAuthStatus(`❌ Error: ${(err as Error).message}`);
        } finally {
            activeAuthRequestRef.current = false;
            if (authAbortControllerRef.current === controller) {
                authAbortControllerRef.current = null;
                setIsAuthLoading(false);
            }
        }
    }, [wizardContext, next, updateConfig, abortAuth, setAuthStatus, setIsAuthLoading, authAbortControllerRef, oauthTokenRef, pendingSourceProviderRef, pendingBackupProviderRef]);

    const dispatchDirectAuth = useCallback((provider: PortalProvider) => {
        const meta = getProviderMetadata(provider);
        const isAsyncOAuth = provider === "gdrive" || provider === "onedrive" || provider === "dropbox" || provider === "b2" || provider === "pcloud";

        if (activeAuthRequestRef.current) {
            console.warn("[AUTH] Direct auth already in progress, aborting");
            return;
        }
        activeAuthRequestRef.current = true;
        console.log("[AUTH] Running direct auth handler for", provider);

        const runAsync = async () => {
            try {
                await meta.directAuthHandler?.({
                    wizardContext,
                    pendingSourceProvider: pendingSourceProviderRef.current,
                    pendingBackupProvider: pendingBackupProviderRef.current,
                    refs: { urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef },
                    updateConfig,
                    next,
                    handleGdriveAuth,
                    startGenericAuth,
                    updateGenericRemote: updateGenericRemote as (remoteName: string, provider: string, options: Record<string, string>) => void
                });
            } finally {
                activeAuthRequestRef.current = false;
            }
        };

        if (isAsyncOAuth) {
            runAsync();
        } else {
            try {
                meta.directAuthHandler?.({
                    wizardContext,
                    pendingSourceProvider: pendingSourceProviderRef.current,
                    pendingBackupProvider: pendingBackupProviderRef.current,
                    refs: { urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef },
                    updateConfig,
                    next,
                    handleGdriveAuth,
                    startGenericAuth,
                    updateGenericRemote: updateGenericRemote as (remoteName: string, provider: string, options: Record<string, string>) => void
                });
            } finally {
                activeAuthRequestRef.current = false;
            }
        }
    }, [wizardContext, urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef, updateConfig, next, handleGdriveAuth, startGenericAuth, pendingSourceProviderRef, pendingBackupProviderRef]);

    return {
        handleAuth,
        handleGdriveAuth,
        startGenericAuth,
        dispatchDirectAuth,
        activeAuthRequestRef, // ✅ EXPOSE THIS REF
        refs: { urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef }
    };
}
