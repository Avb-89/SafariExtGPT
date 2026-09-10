browser.runtime.onMessage.addListener(async (request) => {
    if (request?.type === "GET_PAGE_CONTEXT") {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab?.id) {
            throw new Error("No active Safari tab found.");
        }

        return browser.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" });
    }

    if (request?.type === "PING_NATIVE") {
        try {
            const response = await browser.runtime.sendNativeMessage("com.sitis.SafariExtGPT.Extension", {
                type: "PING_NATIVE"
            });

            return {
                diagnostic: true,
                responseType: typeof response,
                response: response ?? null
            };
        } catch (error) {
            return {
                diagnostic: true,
                nativeError: true,
                name: error?.name ?? null,
                message: error?.message ?? String(error),
                stack: error?.stack ?? null
            };
        }
    }
    if (request?.type === "PREPARE_CODEX_OAUTH") {
        try {
            const response = await browser.runtime.sendNativeMessage("com.sitis.SafariExtGPT.Extension", {
                type: "PREPARE_CODEX_OAUTH"
            });

            return response;
        } catch (error) {
            return {
                ok: false,
                name: error?.name ?? null,
                error: error?.message ?? String(error)
            };
        }
    }
});
