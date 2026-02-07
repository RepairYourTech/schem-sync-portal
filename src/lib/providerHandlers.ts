import { Env } from "./env";
import type { WizardAuthContext } from "../components/wizard/types";

export const gdriveDirectAuth = (ctx: WizardAuthContext) => {
    // ✅ IMPROVED: Validate refs exist AND have content
    const clientId = ctx.refs.clientIdRef?.current?.trim();
    const clientSecret = ctx.refs.clientSecretRef?.current?.trim();

    // ✅ IMPROVED: Explicit validation with logging
    if (clientId && clientSecret && clientId.length > 0 && clientSecret.length > 0) {
        ctx.handleGdriveAuth(clientId, clientSecret);
    } else {
        // ✅ ADD: Log why we're falling back
        console.warn("[AUTH] Missing Google Drive credentials, using built-in OAuth");
        ctx.startGenericAuth("drive");
    }
};

export const genericAuthHandler = (provider: string) => (ctx: WizardAuthContext) => {
    ctx.startGenericAuth(provider);
};

export const b2DirectAuth = async (ctx: WizardAuthContext) => {
    const remoteName = ctx.wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
    try {
        await ctx.updateGenericRemote(remoteName, "b2", {
            account: ctx.refs.b2IdRef.current || "",
            key: ctx.refs.b2KeyRef.current || ""
        });
        const field = ctx.wizardContext === "source" ? "source_provider" : "backup_provider";
        ctx.updateConfig(prev => ({ ...prev, [field]: "b2" }));
        ctx.next();
    } catch (err) {
        console.error("[AUTH] B2 Auth failed", err);
    }
};

export const sftpDirectAuth = (ctx: WizardAuthContext) => {
    const remoteName = ctx.wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
    ctx.updateGenericRemote(remoteName, "sftp", {
        host: ctx.refs.urlRef.current,
        user: ctx.refs.userRef.current,
        pass: ctx.refs.passRef.current
    });
    const field = ctx.wizardContext === "source" ? "source_provider" : "backup_provider";
    ctx.updateConfig(prev => ({ ...prev, [field]: "sftp" }));
    ctx.next();
};

export const pcloudDirectAuth = async (ctx: WizardAuthContext) => {
    const remoteName = ctx.wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
    try {
        await ctx.updateGenericRemote(remoteName, "pcloud", {
            user: ctx.refs.userRef.current || "",
            pass: ctx.refs.passRef.current || ""
        });
        const field = ctx.wizardContext === "source" ? "source_provider" : "backup_provider";
        ctx.updateConfig(prev => ({ ...prev, [field]: "pcloud" }));
        ctx.next();
    } catch (err) {
        console.error("[AUTH] pCloud Auth failed", err);
    }
};

export const megaDirectAuth = (ctx: WizardAuthContext) => {
    const remoteName = ctx.wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
    ctx.updateGenericRemote(remoteName, "mega", {
        user: ctx.refs.userRef.current,
        pass: ctx.refs.passRef.current
    });
    const field = ctx.wizardContext === "source" ? "source_provider" : "backup_provider";
    ctx.updateConfig(prev => ({ ...prev, [field]: "mega" }));
    ctx.next();
};

export const r2DirectAuth = (ctx: WizardAuthContext) => {
    const remoteName = ctx.wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
    ctx.updateGenericRemote(remoteName, "s3", {
        access_key_id: ctx.refs.userRef.current,
        secret_access_key: ctx.refs.passRef.current,
        endpoint: ctx.refs.urlRef.current
    });
    const field = ctx.wizardContext === "source" ? "source_provider" : "backup_provider";
    ctx.updateConfig(prev => ({ ...prev, [field]: "r2" }));
    ctx.next();
};

export const s3DirectAuth = (ctx: WizardAuthContext) => {
    const remoteName = ctx.wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
    ctx.updateGenericRemote(remoteName, "s3", {
        access_key_id: ctx.refs.userRef.current,
        secret_access_key: ctx.refs.passRef.current,
        endpoint: ctx.refs.urlRef.current
    });
    const field = ctx.wizardContext === "source" ? "source_provider" : "backup_provider";
    ctx.updateConfig(prev => ({ ...prev, [field]: "s3" }));
    ctx.next();
};

