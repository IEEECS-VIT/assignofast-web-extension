// Generic error handlers
self.onerror = function(msg, url, line, col, error) {
    console.debug('Caught error:', { msg, url, line, col, error });
    return true; // Prevents the error from being shown
};

self.onunhandledrejection = function(event) {
    console.debug('Caught promise rejection:', event.reason);
    event.preventDefault(); // Prevents the error from being shown
};

// Wrap chrome messaging APIs to catch specific errors
const originalRuntimeSendMessage = chrome.runtime.sendMessage;
chrome.runtime.sendMessage = function(...args) {
    return new Promise((resolve) => {
        try {
            originalRuntimeSendMessage.call(chrome.runtime, ...args)
                .then(resolve)
                .catch(() => resolve(null));
        } catch {
            resolve(null);
        }
    });
};

if (chrome.tabs) {
    const originalTabsSendMessage = chrome.tabs.sendMessage;
    chrome.tabs.sendMessage = function(...args) {
        return new Promise((resolve) => {
            try {
                originalTabsSendMessage.call(chrome.tabs, ...args)
                    .then(resolve)
                    .catch(() => resolve(null));
            } catch {
                resolve(null);
            }
        });
    };
}

// Keep track of VTOP tabs
let vtopTabs = new Set();

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.tabs.create({ url: "signin.html" });
        chrome.tabs.create({ url: "https://assignofast.ieeecsvit.com/guide" });
    }
    chrome.alarms.create('xhrScraperCheck', { periodInMinutes: 1 / 2 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'xhrScraperCheck') {
        console.debug("VTOP status:", vtopTabs.size > 0 ? "Opened" : "Not Opened");
    }
});

// Function to extract form fields from multipart form data
function extractFormField(rawData, fieldName) {
    const regex = new RegExp(`name="${fieldName}"\\r\\n\\r\\n([^\\r\\n]+)`);
    const match = rawData.match(regex);
    return match ? match[1] : null;
}

// XHR listener for form submissions
function xhrListener(details) {
    if (details.method === "POST" &&
        details.url.includes("examinations/doDAssignmentUploadMethod") &&
        details.requestBody) {

        let classId = null;
        
        // Handle multipart form data
        if (details.requestBody.raw) {
            const rawBytes = details.requestBody.raw[0].bytes;
            const decoder = new TextDecoder('utf-8');
            const rawData = decoder.decode(rawBytes);

            // Extract all form fields
            const formFields = {
                authorizedID: extractFormField(rawData, 'authorizedID'),
                csrf: extractFormField(rawData, '_csrf'),
                code: extractFormField(rawData, 'code'),
                opt: extractFormField(rawData, 'opt'),
                classId: extractFormField(rawData, 'classId'),
                mCode: extractFormField(rawData, 'mCode')
            };

            classId = formFields.classId;
            console.debug('Extracted form fields:', formFields);
        }
        // Handle regular form data
        else if (details.requestBody.formData) {
            classId = details.requestBody.formData.classId?.[0];
            console.debug('Form data fields:', details.requestBody.formData);
        }

        if (classId) {
            console.debug('Found classId:', classId);
            chrome.tabs.sendMessage(details.tabId, { 
                action: "triggerSetDaSingle",
                classId: classId
            });
        } else {
            console.debug('Could not extract classId from payload');
        }
    }
}

// Listener management functions
function addXhrListener() {
    if (!chrome.webRequest.onBeforeRequest.hasListener(xhrListener)) {
        chrome.webRequest.onBeforeRequest.addListener(
            xhrListener,
            { 
                urls: ["*://vtop.vit.ac.in/*"],
                types: ["xmlhttprequest"]
            },
            ["requestBody"]
        );
        console.debug("DA listener added");
    }
}

function removeXhrListener() {
    if (chrome.webRequest.onBeforeRequest.hasListener(xhrListener)) {
        chrome.webRequest.onBeforeRequest.removeListener(xhrListener);
        console.debug("DA listener removed");
    }
}

function manageXhrListener() {
    if (vtopTabs.size > 0) {
        addXhrListener();
    } else {
        removeXhrListener();
    }
}

// Tab management functions
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
                await chrome.action.setPopup({
                    tabId: tabId,
                    popup: "popup.html"
                });

                chrome.action.setBadgeText({
                    text: "!",
                    tabId: tabId
                });

                chrome.action.setBadgeBackgroundColor({
                    color: "#FF0000",
                    tabId: tabId
                });

                chrome.action.openPopup();
            } else {
                chrome.action.setBadgeText({
                    text: "",
                    tabId: tabId
                });
            }
        } catch (error) {
            console.debug("Error checking semester status:", error);
        }
    }
}

// Tab event listeners
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

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSemesterOptions") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "getSemesterOptions" }, (response) => {
                sendResponse(response);
            });
        });
        return true;
    } else if (request.action === "showSemesterPrompt") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.action.setPopup({
                    tabId: tabs[0].id,
                    popup: "popup.html"
                });
                chrome.action.openPopup();
            }
        });
    }
});

// Initialize
chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
        checkAndManageVtopTab(tab.id, tab.url);
    });
});

console.debug('Background script loaded');