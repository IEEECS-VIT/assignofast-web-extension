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
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
    });
});