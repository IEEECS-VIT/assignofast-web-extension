self.addEventListener('install', (event) => {
    console.log('Service worker installed');
});

self.addEventListener('activate', (event) => {
    console.log('Service worker activated');
});

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.tabs.create({ url: "signin.html" });
    }
    chrome.alarms.create('xhrScraperCheck', { periodInMinutes: 1/2 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'xhrScraperCheck') {
        console.log("Request listening...");
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSemesterOptions") {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: "getSemesterOptions"}, (response) => {
                sendResponse(response);
            });
        });
        return true; 
    }
});

chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
    });
});

async function hasActiveVtopTab() {
    const tabs = await chrome.tabs.query({url: "*://vtop.vit.ac.in/*", active: true});
    return tabs.length > 0;
}

chrome.webRequest.onCompleted.addListener(
    async function(details) {
        if (details.method === "POST" && 
            (details.url.includes("examinations/doDAssignmentOtpUpload") ||
             details.url.includes("examinations/doDAssignmentUploadMethod"))) {
            
            console.log("Matching URL detected:", details.url);
            
            const isVtopActive = await hasActiveVtopTab();
            
            if (isVtopActive && details.statusCode === 200) {
                chrome.tabs.sendMessage(details.tabId, {action: "triggerDaScrape"});
            } else {
                console.log("DA scrape not triggered: VTOP not active or status code not 200");
            }
        }
    },
    {urls: ["*://vtop.vit.ac.in/*"]},
    ["responseHeaders"]
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerSetDa") {
        chrome.tabs.sendMessage(sender.tab.id, {action: "triggerSetDa", semester: request.semester});
    }
});

console.log('Background script loaded');