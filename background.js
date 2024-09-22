chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.tabs.create({ url: "signin.html" });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSemesterOptions") {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: "getSemesterOptions"}, (response) => {
                sendResponse(response);
            });
        });
        return true; // Indicates that the response is asynchronous
    } else if (request.action === "checkSignInStatus") {
        chrome.storage.local.get(['uid'], (result) => {
            sendResponse({isSignedIn: !!result.uid});
        });
        return true; // Indicates that the response is asynchronous
    }
});

chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
    });
});