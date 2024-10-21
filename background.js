// Service Worker Setup
self.addEventListener('install', (event) => {
    console.log('Service worker installed');
});

self.addEventListener('activate', (event) => {
    console.log('Service worker activated');
});

// Extension installation listener
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.tabs.create({ url: "signin.html" });
    }
    // Create an alarm that fires every 5 seconds
    chrome.alarms.create('xhrScraperCheck', { periodInMinutes: 1/12 });
});

// Alarm listener for periodic logging
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'xhrScraperCheck') {
        console.log("XHR scraper is listening...");
    }
});

// Message listener for getSemesterOptions
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

// Extension icon click listener
chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
    });
});

// Web request listener for XHR interception
chrome.webRequest.onBeforeRequest.addListener(
    function(details) {        
        if (details.method === "POST" && 
            (details.url.includes("examinations/doDAssignmentOtpUpload") ||
             details.url.includes("examinations/doDAssignmentUploadMethod"))) {
            console.log("Matching URL detected:", details.url);
            chrome.tabs.sendMessage(details.tabId, {action: "triggerScrape"});
        }
    },
    {urls: ["*://vtop.vit.ac.in/*"]},
    ["requestBody"]
);

// Additional message listener for triggerSetDa
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerSetDa") {
        chrome.tabs.sendMessage(sender.tab.id, {action: "triggerSetDa", semester: request.semester});
    }
});

console.log('Background script loaded');