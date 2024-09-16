document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startScraping');

    startButton.addEventListener('click', () => {
        console.log('Start Scraping button clicked!'); // Log for button click

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            console.log('Executing content script on tab:', tab.id); // Log before injecting the script

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            }, () => {
                console.log('Content script injected'); // Log after script injection
            });
        });
    });
});
