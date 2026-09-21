async function logDNRDiagnostics() {
    try {
        if (!browser.declarativeNetRequest) {
            console.error("SafariExtGPT DNR diagnostic: browser.declarativeNetRequest is unavailable");
            return;
        }

        const enabledRulesets = await browser.declarativeNetRequest.getEnabledRulesets();
        console.log("SafariExtGPT DNR diagnostic", {
            enabledRulesets,
            expectedRuleset: "chatgpt_frame_rules",
            expectedRulesetEnabled: enabledRulesets.includes("chatgpt_frame_rules")
        });
    } catch (error) {
        console.error("SafariExtGPT DNR diagnostic failed", {
            name: error?.name ?? null,
            message: error?.message ?? String(error)
        });
    }
}


async function logDNRMatchedRules() {
    try {
        if (!browser.declarativeNetRequest?.getMatchedRules) {
            console.error("SafariExtGPT DNR matched-rules diagnostic: getMatchedRules is unavailable");
            return;
        }

        const result = await browser.declarativeNetRequest.getMatchedRules({
            minTimeStamp: Date.now() - 5 * 60 * 1000
        });

        console.log("SafariExtGPT DNR matched rules", result);
    } catch (error) {
        console.error("SafariExtGPT DNR matched-rules diagnostic failed", {
            name: error?.name ?? null,
            message: error?.message ?? String(error)
        });
    }
}

void logDNRDiagnostics();
setTimeout(() => {
    void logDNRMatchedRules();
}, 5000);

browser.runtime.onMessage.addListener(async (request) => {
    if (request?.type === "GET_PAGE_CONTEXT") {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab?.id) {
            throw new Error("No active Safari tab found.");
        }

        return browser.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" });
    }

    if (request?.type === "FIND_CHATGPT_TAB") {
        try {
            const tabs = await browser.tabs.query({});
            const chatGPTTabs = tabs.filter((tab) => {
                try {
                    const url = new URL(tab?.url ?? "");
                    return url.hostname === "chatgpt.com" || url.hostname === "www.chatgpt.com";
                } catch {
                    return false;
                }
            });

            const tab = chatGPTTabs.find((candidate) => candidate.active) ?? chatGPTTabs[0] ?? null;

            if (!tab) {
                return {
                    ok: false,
                    found: false,
                    error: "No ChatGPT tab found"
                };
            }

            console.log("SafariExtGPT found ChatGPT tab", {
                id: tab.id ?? null,
                windowId: tab.windowId ?? null,
                active: tab.active ?? false,
                title: tab.title ?? null,
                url: tab.url ?? null
            });

            return {
                ok: true,
                found: true,
                tab: {
                    id: tab.id ?? null,
                    windowId: tab.windowId ?? null,
                    active: tab.active ?? false,
                    title: tab.title ?? null,
                    url: tab.url ?? null
                }
            };
        } catch (error) {
            console.error("SafariExtGPT ChatGPT tab lookup failed", error);
            return {
                ok: false,
                found: false,
                name: error?.name ?? null,
                error: error?.message ?? String(error)
            };
        }
    }

    if (request?.type === "PING_CHATGPT_BRIDGE") {
        try {
            const tabs = await browser.tabs.query({});
            const chatGPTTabs = tabs.filter((tab) => {
                try {
                    const url = new URL(tab?.url ?? "");
                    return url.hostname === "chatgpt.com" || url.hostname === "www.chatgpt.com";
                } catch {
                    return false;
                }
            });

            const tab = chatGPTTabs.find((candidate) => candidate.active) ?? chatGPTTabs[0] ?? null;

            if (!tab?.id) {
                return {
                    ok: false,
                    found: false,
                    error: "No ChatGPT tab found"
                };
            }

            const response = await browser.tabs.sendMessage(tab.id, {
                type: "CHATGPT_BRIDGE_PING"
            });

            return {
                ok: true,
                found: true,
                tabID: tab.id,
                response: response ?? null
            };
        } catch (error) {
            console.error("SafariExtGPT ChatGPT bridge ping failed", error);
            return {
                ok: false,
                name: error?.name ?? null,
                error: error?.message ?? String(error)
            };
        }
    }

    if (request?.type === "SEND_CHATGPT_MESSAGE") {
        try {
            const tabs = await browser.tabs.query({});
            const chatGPTTabs = tabs.filter((tab) => {
                try {
                    const url = new URL(tab?.url ?? "");
                    return url.hostname === "chatgpt.com" || url.hostname === "www.chatgpt.com";
                } catch {
                    return false;
                }
            });

            const tab = chatGPTTabs.find((candidate) => candidate.active) ?? chatGPTTabs[0] ?? null;

            if (!tab?.id) {
                return {
                    ok: false,
                    found: false,
                    error: "No ChatGPT tab found"
                };
            }

            const waitStartedAt = Date.now();
            let bridgeReady = false;
            let lastBridgeError = null;

            while (Date.now() - waitStartedAt < 20000) {
                try {
                    const ping = await browser.tabs.sendMessage(tab.id, {
                        type: "CHATGPT_BRIDGE_PING"
                    });

                    if (ping?.ok === true && ping?.type === "CHATGPT_BRIDGE_PONG") {
                        bridgeReady = true;
                        break;
                    }
                } catch (error) {
                    lastBridgeError = error;
                }

                await new Promise((resolve) => setTimeout(resolve, 250));
            }

            if (!bridgeReady) {
                return {
                    ok: false,
                    found: true,
                    tabID: tab.id,
                    error: lastBridgeError?.message ?? "ChatGPT tab did not become ready in time"
                };
            }

            const sendStartedAt = Date.now();
            let response = null;

            while (Date.now() - sendStartedAt < 20000) {
                response = await browser.tabs.sendMessage(tab.id, {
                    type: "CHATGPT_SEND_MESSAGE",
                    text: typeof request.text === "string" ? request.text : ""
                });

                if (response?.ok === true) {
                    break;
                }

                const retryableErrors = new Set([
                    "ChatGPT composer not found",
                    "ChatGPT send button not found",
                    "ChatGPT send button is disabled"
                ]);

                if (!retryableErrors.has(response?.error)) {
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            return {
                ok: response?.ok === true,
                found: true,
                tabID: tab.id,
                response: response ?? null
            };
        } catch (error) {
            console.error("SafariExtGPT ChatGPT send failed", error);
            return {
                ok: false,
                name: error?.name ?? null,
                error: error?.message ?? String(error)
            };
        }
    }

    if (request?.type === "TEST_CHATGPT_WEB_HISTORY") {
        try {
            const auth = await browser.runtime.sendNativeMessage("com.sitis.SafariExtGPT.Extension", {
                type: "GET_CHATGPT_AUTH_HEADERS"
            });

            if (!auth?.ok) {
                return {
                    ok: false,
                    authError: true,
                    error: auth?.error ?? "Could not get ChatGPT OAuth headers"
                };
            }

            const url = new URL("https://chatgpt.com/backend-api/conversations");
            url.searchParams.set("offset", "0");
            url.searchParams.set("limit", "10");
            url.searchParams.set("order", "updated");
            url.searchParams.set("expand", "false");
            url.searchParams.set("is_archived", "false");

            const response = await fetch(url.toString(), {
                method: "GET",
                credentials: "include",
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${auth.accessToken}`,
                    "ChatGPT-Account-ID": auth.accountID
                }
            });

            const contentType = response.headers.get("content-type") ?? "";
            const text = await response.text();

            if (!response.ok) {
                console.error("SafariExtGPT ChatGPT web history failed", {
                    status: response.status,
                    contentType,
                    bodyPreview: text.slice(0, 1000)
                });

                return {
                    ok: false,
                    status: response.status,
                    contentType,
                    bodyPreview: text.slice(0, 1000)
                };
            }

            const json = JSON.parse(text);
            const items = Array.isArray(json?.items) ? json.items : [];
            const conversations = items.map((item) => ({
                id: item?.id ?? null,
                title: item?.title ?? null
            }));

            console.log("SafariExtGPT ChatGPT web history succeeded", {
                status: response.status,
                total: json?.total ?? null,
                conversations
            });

            return {
                ok: true,
                status: response.status,
                total: json?.total ?? null,
                conversations
            };
        } catch (error) {
            console.error("SafariExtGPT ChatGPT web history request error", error);
            return {
                ok: false,
                requestError: true,
                name: error?.name ?? null,
                error: error?.message ?? String(error)
            };
        }
    }

    if (request?.type === "TEST_CHATGPT_WEB_CONVERSATION") {
        try {
            const auth = await browser.runtime.sendNativeMessage("com.sitis.SafariExtGPT.Extension", {
                type: "GET_CHATGPT_AUTH_HEADERS"
            });

            if (!auth?.ok) {
                return {
                    ok: false,
                    authError: true,
                    error: auth?.error ?? "Could not get ChatGPT OAuth headers"
                };
            }

            const conversationID = request?.conversationID;
            if (!conversationID) {
                return {
                    ok: false,
                    error: "conversationID is required"
                };
            }

            const url = `https://chatgpt.com/backend-api/conversation/${encodeURIComponent(conversationID)}`;
            const response = await fetch(url, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${auth.accessToken}`,
                    "ChatGPT-Account-ID": auth.accountID
                }
            });

            const contentType = response.headers.get("content-type") ?? "";
            const text = await response.text();

            if (!response.ok) {
                console.error("SafariExtGPT ChatGPT conversation read failed", {
                    status: response.status,
                    contentType,
                    bodyPreview: text.slice(0, 1000)
                });

                return {
                    ok: false,
                    status: response.status,
                    contentType,
                    bodyPreview: text.slice(0, 1000)
                };
            }

            const json = JSON.parse(text);
            const mapping = json?.mapping && typeof json.mapping === "object" ? json.mapping : {};
            const nodes = Object.values(mapping);
            const messages = nodes
                .map((node) => node?.message)
                .filter(Boolean)
                .map((message) => ({
                    id: message?.id ?? null,
                    role: message?.author?.role ?? null,
                    contentType: message?.content?.content_type ?? null,
                    parts: Array.isArray(message?.content?.parts)
                        ? message.content.parts.filter((part) => typeof part === "string")
                        : [],
                    modelSlug: message?.metadata?.model_slug ?? null,
                    defaultModelSlug: message?.metadata?.default_model_slug ?? null,
                    parentID: message?.metadata?.parent_id ?? null
                }));

            const currentNode = json?.current_node ?? null;
            const currentMessage = currentNode ? mapping?.[currentNode]?.message ?? null : null;
            const currentModelSlug = currentMessage?.metadata?.model_slug ?? null;
            const currentDefaultModelSlug = currentMessage?.metadata?.default_model_slug ?? null;
            const observedModelSlugs = [...new Set(
                messages
                    .map((message) => message.modelSlug)
                    .filter((value) => typeof value === "string" && value.length > 0)
            )];

            console.log("SafariExtGPT ChatGPT conversation read succeeded", {
                status: response.status,
                conversationID: json?.id ?? conversationID,
                title: json?.title ?? null,
                currentNode,
                currentModelSlug,
                observedModelSlugs,
                messageCount: messages.length
            });

            return {
                ok: true,
                status: response.status,
                conversationID: json?.id ?? conversationID,
                title: json?.title ?? null,
                currentNode,
                currentModelSlug,
                currentDefaultModelSlug,
                observedModelSlugs,
                messageCount: messages.length,
                messages
            };
        } catch (error) {
            console.error("SafariExtGPT ChatGPT conversation read request error", error);
            return {
                ok: false,
                requestError: true,
                name: error?.name ?? null,
                error: error?.message ?? String(error)
            };
        }
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
