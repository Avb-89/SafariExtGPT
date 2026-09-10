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

document.addEventListener("DOMContentLoaded", () => {
    loadPageContext();
    document.getElementById("sign-in-button")?.addEventListener("click", prepareCodexOAuth);
});
