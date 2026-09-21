async function testChatGPTWebSend() {
    const status = document.getElementById("auth-status");
    const output = document.getElementById("auth-error");

    status.textContent = "Sending one ordinary ChatGPT test message…";
    output.hidden = true;
    output.textContent = "";

    try {
        const response = await browser.runtime.sendMessage({
            type: "TEST_CHATGPT_WEB_SEND"
        });

        status.textContent = `Ordinary Chat send HTTP ${response?.status ?? "?"}${response?.ok ? " ✓" : ""}`;
        output.textContent = JSON.stringify(response, null, 2);
        output.hidden = false;
    } catch (error) {
        console.error(error);
        status.textContent = "Ordinary Chat send failed";
        output.textContent = error?.message ?? String(error);
        output.hidden = false;
    }
}
async function loadPageContext() {
    const output = document.getElementById("page-context");

    if (!output) {
        console.error("Missing #page-context element in popup.html");
        return;
    }

    output.textContent = "Reading current page…";

    try {
        const context = await browser.runtime.sendMessage({ type: "GET_PAGE_CONTEXT" });

        if (!context) {
            throw new Error("No page context returned.");
        }

        const preview = context.text.slice(0, 1500);
        output.textContent = [
            `TITLE\n${context.title || "—"}`,
            `URL\n${context.url || "—"}`,
            `TEXT LENGTH\n${context.textLength ?? 0} characters`,
            `SELECTION\n${context.selection || "—"}`,
            `TEXT PREVIEW\n${preview || "—"}`
        ].join("\n\n");
    } catch (error) {
        console.error(error);
        output.textContent = `Could not read this page.\n\n${error.message ?? error}`;
    }
}

async function prepareCodexOAuth() {
    const button = document.getElementById("sign-in-button");
    const status = document.getElementById("auth-status");
    const errorOutput = document.getElementById("auth-error");

    button.disabled = true;
    status.textContent = "Preparing ChatGPT OAuth…";
    errorOutput.hidden = true;
    errorOutput.textContent = "";

    try {
        const response = await browser.runtime.sendMessage({ type: "PREPARE_CODEX_OAUTH" });

        if (!response?.ok || response?.reply !== "OAUTH_REQUEST_READY") {
            throw new Error(`OAuth preparation failed: ${JSON.stringify(response)}`);
        }

        status.textContent = "OAUTH_REQUEST_READY ✓";
        errorOutput.textContent = JSON.stringify({
            ok: true,
            reply: response.reply
        }, null, 2);
        errorOutput.hidden = false;
    } catch (error) {
        console.error(error);
        status.textContent = "OAuth preparation failed";
        errorOutput.textContent = JSON.stringify({
            name: error?.name ?? null,
            message: error?.message ?? String(error),
            stack: error?.stack ?? null
        }, null, 2);
        errorOutput.hidden = false;
    } finally {
        button.disabled = false;
    }
}

async function testChatGPTWebHistory() {
    const status = document.getElementById("auth-status");
    const output = document.getElementById("auth-error");

    status.textContent = "Testing ChatGPT web history…";
    output.hidden = true;
    output.textContent = "";

    try {
        const response = await browser.runtime.sendMessage({ type: "TEST_CHATGPT_WEB_HISTORY" });

        if (!response?.ok) {
            throw new Error(JSON.stringify(response, null, 2));
        }

        const conversations = response.conversations ?? [];
        const firstConversation = conversations[0];

        if (!firstConversation?.id) {
            status.textContent = `ChatGPT web history OK ✓ (0 shown / ${response.total ?? "?"} total)`;
            output.textContent = "No conversation available to read.";
            output.hidden = false;
            return;
        }

        status.textContent = `History OK ✓ — reading: ${firstConversation.title ?? "<untitled>"}`;

        const conversation = await browser.runtime.sendMessage({
            type: "TEST_CHATGPT_WEB_CONVERSATION",
            conversationID: firstConversation.id
        });

        if (!conversation?.ok) {
            throw new Error(JSON.stringify(conversation, null, 2));
        }

        const messageLines = (conversation.messages ?? [])
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => {
                const text = (message.parts ?? []).join("\n").trim();
                return `${message.role ?? "unknown"}: ${text || "<no text>"}`;
            });

        status.textContent = `Conversation read OK ✓ (${conversation.messageCount ?? 0} messages)`;
        output.textContent = [
            `${conversation.conversationID ?? firstConversation.id} | ${conversation.title ?? firstConversation.title ?? "<untitled>"}`,
            "",
            ...messageLines
        ].join("\n");
        output.hidden = false;
    } catch (error) {
        console.error(error);
        status.textContent = "ChatGPT conversation read failed";
        output.textContent = error?.message ?? String(error);
        output.hidden = false;
    }
}

async function inspectLatestChatGPTConversation() {
    const status = document.getElementById("auth-status");
    const output = document.getElementById("auth-error");

    status.textContent = "Reading latest ordinary ChatGPT conversation…";
    output.hidden = true;
    output.textContent = "";

    try {
        const history = await browser.runtime.sendMessage({
            type: "TEST_CHATGPT_WEB_HISTORY"
        });

        if (!history?.ok || !Array.isArray(history.conversations) || history.conversations.length === 0) {
            throw new Error(JSON.stringify(history, null, 2));
        }

        const firstConversation = history.conversations[0];
        const conversation = await browser.runtime.sendMessage({
            type: "TEST_CHATGPT_WEB_CONVERSATION",
            conversationID: firstConversation.id
        });

        if (!conversation?.ok) {
            throw new Error(JSON.stringify(conversation, null, 2));
        }

        const modelSlug = conversation.currentModelSlug
            ?? conversation.currentDefaultModelSlug
            ?? "unknown";

        status.textContent = `Ordinary Chat model: ${modelSlug}`;
        output.textContent = JSON.stringify({
            conversationID: conversation.conversationID,
            title: conversation.title,
            currentNode: conversation.currentNode,
            currentModelSlug: conversation.currentModelSlug,
            currentDefaultModelSlug: conversation.currentDefaultModelSlug,
            observedModelSlugs: conversation.observedModelSlugs
        }, null, 2);
        output.hidden = false;
    } catch (error) {
        console.error(error);
        status.textContent = "Conversation inspection failed";
        output.textContent = error?.message ?? String(error);
        output.hidden = false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadPageContext();
    document.getElementById("sign-in-button")?.addEventListener("click", prepareCodexOAuth);
});
