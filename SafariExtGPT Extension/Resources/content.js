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

browser.runtime.onMessage.addListener((request) => {
    if (request?.type !== "GET_PAGE_CONTEXT") {
        return;
    }

    return Promise.resolve(getPageContext());
});
