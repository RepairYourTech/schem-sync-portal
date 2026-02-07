import { useState, useEffect, useCallback } from "react";
import { checkForUpdates, type UpdateInfo } from "../lib/versionChecker";

export function useUpdateCheck() {
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const check = useCallback(async (force = false) => {
        setIsChecking(true);
        setError(null);
        try {
            const info = await checkForUpdates(force);
            setUpdateInfo(info);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsChecking(false);
        }
    }, []);

    useEffect(() => {
        check();
    }, [check]);

    return {
        updateInfo,
        isChecking,
        error,
        refresh: () => check(true)
    };
}
