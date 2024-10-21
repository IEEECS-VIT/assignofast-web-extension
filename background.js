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
    }
});

chrome.action.onClicked.addListener((tab) => {
    if (tab.url.startsWith('https://vtop.vit.ac.in/vtop/content')) {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
    } else {
        chrome.tabs.create({ url: "https://vtop.vit.ac.in" });
    }
});