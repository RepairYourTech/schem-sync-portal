import { useCallback } from "react";
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

    const handleAuth = useCallback(async () => {
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
                updateConfig(prev => ({ ...prev, source_provider: "copyparty", copyparty_method: "webdav", webdav_user: user, webdav_pass: pass }));
                next();
            } else {
                if (!pass) { setAuthStatus("⚠️ Password required."); setIsAuthLoading(false); return; }
                const cookie = await getCopypartyCookie(url, user || "", pass);
                if (cookie) {
                    const { createHttpRemote } = await import("../lib/rclone");
                    await createHttpRemote(Env.REMOTE_PORTAL_SOURCE, url, cookie);
                    updateConfig(prev => ({ ...prev, source_provider: "copyparty", copyparty_method: "http", cookie }));
                    next();
                } else setAuthStatus("❌ Auth failed.");
            }
        } catch (err) {
            setAuthStatus(`💥 Error: ${(err as Error).message}`);
        } finally {
            setIsAuthLoading(false);
        }
    }, [next, updateConfig, config.copyparty_method, setAuthStatus, setIsAuthLoading, urlRef, userRef, passRef]);

    const handleGdriveAuth = useCallback(async (clientId: string, clientSecret: string) => {
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
                next();
            }
        } catch (err) {
            if (!controller.signal.aborted) setAuthStatus(`❌ Error: ${(err as Error).message}`);
        } finally {
            if (authAbortControllerRef.current === controller) {
                authAbortControllerRef.current = null;
                setIsAuthLoading(false);
            }
        }
    }, [wizardContext, next, updateConfig, abortAuth, setAuthStatus, setIsAuthLoading, authAbortControllerRef, oauthTokenRef, pendingSourceProviderRef, pendingBackupProviderRef]);

    const startGenericAuth = useCallback(async (provider: string) => {
        abortAuth(); setIsAuthLoading(true); setAuthStatus(`🚀 Launching ${provider.toUpperCase()} Auth...`);
        const controller = new AbortController(); authAbortControllerRef.current = controller;
        try {
            const token = await authorizeRemote(provider, controller.signal);
            if (token) {
                oauthTokenRef.current = token;
                const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                await updateGenericRemote(remoteName, provider as PortalProvider, { token });
                const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                const pending = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                updateConfig(prev => ({ ...prev, [field]: pending }));
                next();
            }
        } catch (err) {
            if (!controller.signal.aborted) setAuthStatus(`❌ Error: ${(err as Error).message}`);
        } finally {
            if (authAbortControllerRef.current === controller) {
                authAbortControllerRef.current = null;
                setIsAuthLoading(false);
            }
        }
    }, [wizardContext, next, updateConfig, abortAuth, setAuthStatus, setIsAuthLoading, authAbortControllerRef, oauthTokenRef, pendingSourceProviderRef, pendingBackupProviderRef]);

    const dispatchDirectAuth = useCallback((provider: PortalProvider) => {
        const meta = getProviderMetadata(provider);
        if (meta.directAuthHandler) {
            meta.directAuthHandler({
                wizardContext,
                refs: { urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef },
                updateConfig,
                next,
                handleGdriveAuth,
                startGenericAuth,
                updateGenericRemote: updateGenericRemote as (remoteName: string, provider: PortalProvider, options: Record<string, string>) => void
            });
        }
    }, [wizardContext, urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef, updateConfig, next, handleGdriveAuth, startGenericAuth]);

    return {
        handleAuth,
        handleGdriveAuth,
        startGenericAuth,
        dispatchDirectAuth,
        refs: { urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef }
    };
}
