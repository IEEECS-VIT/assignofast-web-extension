self.addEventListener('install', (event) => {
    console.log('Service worker installed');
});

self.addEventListener('activate', (event) => {
    console.log('Service worker activated');
});

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.tabs.create({ url: "signin.html" });
        chrome.tabs.create({ url: "https://assignofast.ieeecsvit.com/guide" });
    }
    chrome.alarms.create('xhrScraperCheck', { periodInMinutes: 1/2 });
});

// Keep track of VTOP tabs
let vtopTabs = new Set();

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'xhrScraperCheck') {
        console.log("VTOP status:", vtopTabs.size > 0 ? "Opened" : "Not Opened");
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

function xhrListener(details) {
    if (details.method === "POST" && 
        (details.url.includes("examinations/doDAssignmentOtpUpload") ||
         details.url.includes("examinations/doDAssignmentUploadMethod")) &&
        details.statusCode === 200) {
        
        console.log("DA updation detected:", details.url);
        chrome.tabs.sendMessage(details.tabId, {action: "triggerDaScrape"});
    }
}

function addXhrListener() {
    if (!chrome.webRequest.onCompleted.hasListener(xhrListener)) {
        chrome.webRequest.onCompleted.addListener(
            xhrListener,
            {urls: ["*://vtop.vit.ac.in/*"]},
            ["responseHeaders"]
        );
        console.log("DA listener added");
    }
}

function removeXhrListener() {
    if (chrome.webRequest.onCompleted.hasListener(xhrListener)) {
        chrome.webRequest.onCompleted.removeListener(xhrListener);
        console.log("DA listener removed");
    }
}

function manageXhrListener() {
    if (vtopTabs.size > 0) {
        addXhrListener();
    } else {
        removeXhrListener();
    }
}

function checkAndManageVtopTab(tabId, url) {
    if (url && url.includes("vtop.vit.ac.in")) {
        vtopTabs.add(tabId);
    } else {
        vtopTabs.delete(tabId);
    }
    manageXhrListener();
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        checkAndManageVtopTab(tabId, tab.url);
    }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        checkAndManageVtopTab(tab.id, tab.url);
    });
});

chrome.tabs.onRemoved.addListener((tabId) => {
    vtopTabs.delete(tabId);
    manageXhrListener();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerSetDa") {
        chrome.tabs.sendMessage(sender.tab.id, {action: "triggerSetDa", semester: request.semester});
    }
});

console.log('Background script loaded');