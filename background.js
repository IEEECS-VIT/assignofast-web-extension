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
    chrome.alarms.create('xhrScraperCheck', { periodInMinutes: 1 / 2 });
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
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "getSemesterOptions" }, (response) => {
                sendResponse(response);
            });
        });
        return true;
    } else if (request.action === "showSemesterPrompt") {
        // Get the current tab ID
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                // Create popup for that tab
                chrome.action.setPopup({
                    tabId: tabs[0].id,
                    popup: "popup.html"
                });

                // Programmatically open the popup
                chrome.action.openPopup();
            }
        });
    }
});

// chrome.action.onClicked.addListener((tab) => {
//     if (tab.url.startsWith('https://vtop.vit.ac.in/vtop/content')) {
//         chrome.scripting.executeScript({
//             target: { tabId: tab.id },
//             files: ['content.js']
//         });
//     } else {
//         chrome.tabs.create({ url: "https://vtop.vit.ac.in" });
//     }
// });

function xhrListener(details) {
    if (details.method === "POST" &&
        (details.url.includes("examinations/doDAssignmentOtpUpload") ||
            details.url.includes("examinations/doDAssignmentUploadMethod")) &&
        details.statusCode === 200) {

        console.log("DA updation detected:", details.url);
        chrome.tabs.sendMessage(details.tabId, { action: "triggerDaScrape" });
    }
}

function addXhrListener() {
    if (!chrome.webRequest.onCompleted.hasListener(xhrListener)) {
        chrome.webRequest.onCompleted.addListener(
            xhrListener,
            { urls: ["*://vtop.vit.ac.in/*"] },
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

async function checkSemesterStatus(tabId, url) {
    if (url && url.includes('vtop.vit.ac.in/vtop/content')) {
        try {
            const result = await chrome.storage.local.get(['semesterOptions', 'currentSemester']);

            if (!result.semesterOptions || result.semesterOptions.length === 0 || !result.currentSemester) {
                // Set popup for this specific tab
                await chrome.action.setPopup({
                    tabId: tabId,
                    popup: "popup.html"
                });

                // Show notification to user
                chrome.action.setBadgeText({
                    text: "!",
                    tabId: tabId
                });

                chrome.action.setBadgeBackgroundColor({
                    color: "#FF0000",
                    tabId: tabId
                });

                // Try to open popup automatically
                chrome.action.openPopup();
            } else {
                // Clear any existing badge
                chrome.action.setBadgeText({
                    text: "",
                    tabId: tabId
                });
            }
        } catch (error) {
            console.error("Error checking semester status:", error);
        }
    }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        checkAndManageVtopTab(tabId, tab.url);
        checkSemesterStatus(tabId, tab.url);
    }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        checkAndManageVtopTab(tab.id, tab.url);
        checkSemesterStatus(tab.id, tab.url);
    });
});

chrome.tabs.onRemoved.addListener((tabId) => {
    vtopTabs.delete(tabId);
    manageXhrListener();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerSetDa") {
        chrome.tabs.sendMessage(sender.tab.id, {
            action: "triggerSetDa",
            semester: request.semester
        });
    }
});

console.log('Background script loaded');