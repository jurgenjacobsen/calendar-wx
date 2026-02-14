"use strict";
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'getStorage') {
        chrome.storage.sync.get(null, sendResponse);
        return true; // Required for async response
    }
    return undefined;
});
