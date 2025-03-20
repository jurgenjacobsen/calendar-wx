chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getStorage") {
        chrome.storage.sync.get(null, sendResponse);
        return true; // Required for async response
    }
});