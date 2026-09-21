function getPageContext() {
    const selection = window.getSelection()?.toString().trim() ?? "";
    const text = document.body?.innerText?.trim() ?? "";

    return {
        url: window.location.href,
        title: document.title,
        text,
        selection,
        textLength: text.length
    };
}

const SIDEBAR_ID = "safariextgpt-sidebar";
const SIDEBAR_WIDTH = 420;
const SIDEBAR_TOGGLE_ID = "safariextgpt-sidebar-toggle";
let safariExtGPTSidebarOpen = false;

const CHAT_STORAGE_KEY = "safariextgpt-chat-messages";

async function loadStoredChatMessages() {
    try {
        const result = await browser.storage.local.get(CHAT_STORAGE_KEY);
        const value = result?.[CHAT_STORAGE_KEY];
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

async function saveStoredChatMessages(messages) {
    try {
        await browser.storage.local.set({
            [CHAT_STORAGE_KEY]: messages
        });
    } catch {
        // Ignore storage failures; the sidebar should still keep working.
    }
}

function pageUsesGlobalColorInversion() {
    const htmlFilter = getComputedStyle(document.documentElement).filter;
    const bodyFilter = document.body ? getComputedStyle(document.body).filter : "none";

    return [htmlFilter, bodyFilter].some((filter) =>
        typeof filter === "string" && /invert\((1|100%)\)/.test(filter)
    );
}

async function ensureSafariExtGPTSidebar() {
    const existing = document.getElementById(SIDEBAR_ID);
    if (existing) {
        return existing;
    }

    const sidebar = document.createElement("aside");
    sidebar.id = SIDEBAR_ID;
    sidebar.setAttribute("aria-label", "SafariExtGPT Sidebar");
    sidebar.innerHTML = `
        <iframe
            id="safariextgpt-chatgpt-frame"
            src="https://chatgpt.com/"
            title="ChatGPT"
            allow="clipboard-read; clipboard-write"
        ></iframe>
    `;

    const toggle = document.createElement("button");
    toggle.id = SIDEBAR_TOGGLE_ID;
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Toggle SafariExtGPT Sidebar");
    toggle.textContent = "‹";

    const counterGlobalInversion = pageUsesGlobalColorInversion();

    const originalDocumentStyles = {
        width: document.documentElement.style.width,
        maxWidth: document.documentElement.style.maxWidth,
        overflowX: document.documentElement.style.overflowX
    };

    document.documentElement.dataset.safariextgptOriginalWidth = originalDocumentStyles.width;
    document.documentElement.dataset.safariextgptOriginalMaxWidth = originalDocumentStyles.maxWidth;
    document.documentElement.dataset.safariextgptOriginalOverflowX = originalDocumentStyles.overflowX;
    document.documentElement.style.transition = "width 180ms ease, max-width 180ms ease";

    const style = document.createElement("style");
    style.id = `${SIDEBAR_ID}-style`;
    style.textContent = `
        #${SIDEBAR_ID} {
            position: fixed;
            top: 0;
            right: 0;
            width: ${SIDEBAR_WIDTH}px;
            height: 100vh;
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            background: #2b2b2b !important;
            color: #f3f3f3 !important;
            color-scheme: dark;
            ${counterGlobalInversion ? "filter: invert(1);" : ""}
            border-left: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: none;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
            transform: translateX(${SIDEBAR_WIDTH}px);
            transition: transform 180ms ease;
        }

        #${SIDEBAR_ID}.safariextgpt-sidebar--open {
            transform: translateX(0);
        }

        #${SIDEBAR_ID},
        #${SIDEBAR_ID} * {
            box-sizing: border-box;
        }

        #${SIDEBAR_ID} #safariextgpt-chatgpt-frame {
            width: 100%;
            height: 100%;
            border: 0;
            display: block;
            background: #111;
        }

        #${SIDEBAR_TOGGLE_ID} {
            position: fixed;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            appearance: none !important;
            -webkit-appearance: none !important;
            top: 50% !important;
            right: 0 !important;
            z-index: 2147483647 !important;
            width: 26px !important;
            height: 64px !important;
            margin: 0;
            padding: 0;
            transform: translateY(-50%);
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-right: 0;
            border-radius: 12px 0 0 12px;
            background: #2b2b2b !important;
            color: #f3f3f3 !important;
            color-scheme: dark;
            ${counterGlobalInversion ? "filter: invert(1);" : ""}
            font: 24px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
            cursor: pointer;
            transition: right 180ms ease, background 120ms ease;
        }

        #${SIDEBAR_TOGGLE_ID}:hover {
            background: #3a3a3a;
        }

        #${SIDEBAR_TOGGLE_ID}.safariextgpt-sidebar-toggle--open {
            right: ${SIDEBAR_WIDTH}px !important;
        }
    `;


    document.documentElement.appendChild(style);
    document.documentElement.appendChild(sidebar);
    document.documentElement.appendChild(toggle);

    const chatGPTFrame = sidebar.querySelector("#safariextgpt-chatgpt-frame");
    chatGPTFrame?.addEventListener("load", () => {
        console.log("SafariExtGPT: ChatGPT iframe load event fired");
    });

    const setSidebarOpen = (open) => {
        safariExtGPTSidebarOpen = open;
        sidebar.classList.toggle("safariextgpt-sidebar--open", open);
        toggle.classList.toggle("safariextgpt-sidebar-toggle--open", open);
        toggle.textContent = open ? "›" : "‹";
        toggle.setAttribute("aria-expanded", String(open));

        if (open) {
            document.documentElement.style.width = `calc(100% - ${SIDEBAR_WIDTH}px)`;
            document.documentElement.style.maxWidth = `calc(100% - ${SIDEBAR_WIDTH}px)`;
            document.documentElement.style.overflowX = "hidden";
        } else {
            document.documentElement.style.width = originalDocumentStyles.width;
            document.documentElement.style.maxWidth = originalDocumentStyles.maxWidth;
            document.documentElement.style.overflowX = originalDocumentStyles.overflowX;
        }
    };

    toggle.addEventListener("click", () => {
        setSidebarOpen(!safariExtGPTSidebarOpen);
    });

    safariExtGPTSidebarOpen = false;
    sidebar.classList.remove("safariextgpt-sidebar--open");
    toggle.classList.remove("safariextgpt-sidebar-toggle--open");
    toggle.textContent = "‹";
    toggle.setAttribute("aria-expanded", "false");

    return sidebar;
}

ensureSafariExtGPTSidebar();

browser.runtime.onMessage.addListener((request) => {
    if (request?.type === "CHATGPT_BRIDGE_PING") {
        const url = new URL(window.location.href);
        const isChatGPT = url.hostname === "chatgpt.com" || url.hostname === "www.chatgpt.com";

        return Promise.resolve({
            ok: isChatGPT,
            type: "CHATGPT_BRIDGE_PONG",
            title: document.title,
            url: window.location.href,
            readyState: document.readyState
        });
    }

    if (request?.type === "CHATGPT_SEND_MESSAGE") {
        const url = new URL(window.location.href);
        const isChatGPT = url.hostname === "chatgpt.com" || url.hostname === "www.chatgpt.com";

        if (!isChatGPT) {
            return Promise.resolve({
                ok: false,
                error: "This tab is not ChatGPT"
            });
        }

        const text = typeof request.text === "string" ? request.text : "";
        const assistantSelector = "[data-message-author-role='assistant']";
        const assistantCountBeforeSend = document.querySelectorAll(assistantSelector).length;
        const candidates = [
            ["#prompt-textarea", document.querySelector("#prompt-textarea")],
            ["textarea[data-testid='prompt-textarea']", document.querySelector("textarea[data-testid='prompt-textarea']")],
            ["[contenteditable='true'][data-testid='prompt-textarea']", document.querySelector("[contenteditable='true'][data-testid='prompt-textarea']")],
            ["div[contenteditable='true']", document.querySelector("div[contenteditable='true']")]
        ];

        const match = candidates.find(([, element]) => element instanceof HTMLElement);

        if (!match) {
            return Promise.resolve({
                ok: false,
                error: "ChatGPT composer not found"
            });
        }

        const [selector, composer] = match;
        composer.focus();

        if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
            const prototype = composer instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

            if (valueSetter) {
                valueSetter.call(composer, text);
            } else {
                composer.value = text;
            }
        } else {
            composer.textContent = text;
        }

        composer.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: text
        }));
        composer.dispatchEvent(new Event("change", { bubbles: true }));

        const sendButton = document.querySelector("button[data-testid='send-button']")
            ?? document.querySelector("button[aria-label='Send prompt']")
            ?? document.querySelector("button[aria-label='Send message']");

        if (!(sendButton instanceof HTMLButtonElement)) {
            return Promise.resolve({
                ok: false,
                error: "ChatGPT send button not found"
            });
        }

        if (sendButton.disabled) {
            return Promise.resolve({
                ok: false,
                error: "ChatGPT send button is disabled"
            });
        }

        sendButton.click();

        return new Promise((resolve) => {
            const startedAt = Date.now();
            let lastText = "";
            let lastChangedAt = Date.now();
            let sawStreamingState = false;

            const finish = (payload) => {
                clearInterval(timer);
                resolve(payload);
            };

            const timer = setInterval(() => {
                const assistantMessages = Array.from(document.querySelectorAll(assistantSelector));
                const newestAssistant = assistantMessages.length > assistantCountBeforeSend
                    ? assistantMessages[assistantMessages.length - 1]
                    : null;
                const responseText = newestAssistant?.innerText?.trim() ?? "";

                if (responseText !== lastText) {
                    lastText = responseText;
                    lastChangedAt = Date.now();
                }

                const stopButton = document.querySelector("button[data-testid='stop-button']")
                    ?? document.querySelector("button[aria-label='Stop generating']")
                    ?? document.querySelector("button[aria-label='Stop streaming']")
                    ?? document.querySelector("button[aria-label='Stop response']");

                if (stopButton) {
                    sawStreamingState = true;
                }

                const stableForMs = Date.now() - lastChangedAt;
                const responseAgeMs = newestAssistant ? Date.now() - startedAt : 0;
                const generationClearlyFinished = sawStreamingState && !stopButton;
                const fallbackFinished = !sawStreamingState && responseText && responseAgeMs >= 5000 && stableForMs >= 2500;

                if (responseText && generationClearlyFinished && stableForMs >= 1200) {
                    finish({
                        ok: true,
                        type: "CHATGPT_RESPONSE_RECEIVED",
                        selector,
                        text: responseText
                    });
                    return;
                }

                if (fallbackFinished) {
                    finish({
                        ok: true,
                        type: "CHATGPT_RESPONSE_RECEIVED",
                        selector,
                        text: responseText
                    });
                    return;
                }

                if (Date.now() - startedAt >= 90000) {
                    finish({
                        ok: false,
                        error: responseText
                            ? "Timed out waiting for ChatGPT response to finish"
                            : "Timed out waiting for ChatGPT response"
                    });
                }
            }, 250);
        });
    }

    if (request?.type === "GET_PAGE_CONTEXT") {
        return Promise.resolve(getPageContext());
    }
});
