import { Logger } from "./logger";

/**
 * Simulates a login to copyparty to extract the cppws session cookie.
 */
export async function getCopypartyCookie(
    url: string,
    username: string,
    password: string
): Promise<string | null> {
    Logger.debug("AUTH", `--- AUTH ATTEMPT START ---`);
    Logger.debug("AUTH", `URL: ${url} | User: ${username} | PassLen: ${password.length}`);

    // Normalize URL
    let baseUrl = url.replace(/\/+$/, "");
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
        baseUrl = "https://" + baseUrl;
    }

    const loginUrl = `${baseUrl}/?login`;

    try {
        const browserHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Origin": baseUrl,
            "Referer": loginUrl,
        };

        const getCookies = (res: Response) => {
            return (res.headers as any).getSetCookie
                ? (res.headers as any).getSetCookie()
                : [res.headers.get("set-cookie")].filter(Boolean);
        };

        // STEP 0: Establish session
        Logger.debug("AUTH", `Step 0: GET ${loginUrl}`);
        const preAuthRes = await fetch(loginUrl, { headers: browserHeaders });
        let sessionCookies = getCookies(preAuthRes);
        Logger.debug("AUTH", `Captured Session Cookies: ${JSON.stringify(sessionCookies)}`);

        // STEP 1: POST Login (with high-resiliency retry loop)
        const formData = new FormData();
        formData.append("act", "login");
        formData.append("uname", username.trim());
        formData.append("cppwd", password.trim());
        formData.append("uhash", "");

        let response: Response;
        let activeCookies: string[] = [...sessionCookies];
        let attempts = 0;

        while (attempts < 2) {
            attempts++;
            const requestHeaders: any = { ...browserHeaders, "Origin": baseUrl };
            if (activeCookies.length > 0) {
                requestHeaders["Cookie"] = activeCookies.join("; ");
            }

            Logger.debug("AUTH", `Step 1 (Attempt ${attempts}): POST ${loginUrl}`);
            response = await fetch(loginUrl, {
                method: "POST",
                body: formData,
                redirect: "manual",
                headers: requestHeaders,
            });

            Logger.debug("AUTH", `POST Status: ${response.status}`);
            let postCookies = getCookies(response);
            activeCookies = [...activeCookies, ...postCookies];

            // Extract cppws
            for (const cookieStr of activeCookies) {
                const match = cookieStr.match(/cppws=([^;]+)/);
                if (match) {
                    Logger.info("AUTH", `✅ SUCCESS: Found cppws.`);
                    return `Cookie,cppws=${match[1]}`;
                }
            }

            // If we got 422 and it's our first attempt, maybe the session expired or was rejected.
            // Try Step 0 (GET) again to refresh state.
            if (response.status === 422 && attempts === 1) {
                Logger.info("AUTH", `Silent retry triggered: Refreshing session...`);
                const retryPreAuthRes = await fetch(loginUrl, { headers: browserHeaders });
                const freshCookies = getCookies(retryPreAuthRes);
                activeCookies = [...freshCookies];
                continue;
            }

            // STEP 2: Fallback (check redirect content)
            if (response.status === 302 || response.status === 200) {
                const followPath = response.headers.get("location") || "/";
                const followUrl = followPath.startsWith("http") ? followPath : baseUrl + (followPath.startsWith("/") ? "" : "/") + followPath;

                Logger.debug("AUTH", `Step 2: Follow ${followUrl}`);
                const followResponse = await fetch(followUrl, {
                    headers: {
                        ...browserHeaders,
                        "Cookie": activeCookies.join("; ")
                    }
                });

                const followCookies = getCookies(followResponse);
                for (const cookieStr of followCookies) {
                    const match = cookieStr.match(/cppws=([^;]+)/);
                    if (match) {
                        Logger.info("AUTH", `✅ SUCCESS: Found cppws in follow.`);
                        return `Cookie,cppws=${match[1]}`;
                    }
                }
            }

            // If we're here and didn't success, break unless we want to try again
            break;
        }

        Logger.error("AUTH", `❌ FAILURE: Handshake incomplete (Attempts: ${attempts}).`);
        return null;
    } catch (err) {
        Logger.error("AUTH", `💥 ERROR`, err);
        return null;
    }
}
