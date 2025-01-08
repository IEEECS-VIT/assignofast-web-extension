let hasRun = false;

async function main() {
    try {
        if (window.location.href.includes('vtop.vit.ac.in/vtop/content')) {
            if (hasRun) return;
            hasRun = true;
            
            await checkAndPromptSemester();

            const { justSignedIn } = await chrome.storage.local.get(['justSignedIn']);
            const semesterOptions = await getSemesterOptions();

            if (justSignedIn) {
                if (semesterOptions && semesterOptions.length > 0) {
                    const currentSemester = semesterOptions[0].value;
                    await chrome.storage.local.set({ currentSemester, justSignedIn: false });
                    await scrapeAndSendData(currentSemester);
                }
            } else {
                const { currentSemester } = await chrome.storage.local.get(['currentSemester']);
                if (currentSemester) {
                    await scrapeAndSendData(currentSemester);
                }
            }
        }
    } catch (error) {
        console.error("Error in main function:", error);
        hasRun = false;
    }
}

async function handleDaSubmission() {
    try {
        const { currentSemester } = await chrome.storage.local.get(['currentSemester']);
        if (currentSemester) {
            console.log("DA is updating ...");
            await scrapeAndSendData(currentSemester);
        } else {
            console.error("No current semester found for DA submission");
        }
    } catch (error) {
        console.error("Error handling DA submission:", error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerSetDa") {
        scrapeAndSendData(request.semester);
    } else if (request.action === "getSemesterOptions") {
        chrome.storage.local.get(['semesterOptions'], (result) => {
            sendResponse(result.semesterOptions || []);
        });
        return true;
    } else if (request.action === "triggerDaScrape") {
        handleDaSubmission();
    }
});

document.addEventListener('DOMContentLoaded', main);

const observer = new MutationObserver(() => {
    if (!hasRun && window.location.href.includes('vtop.vit.ac.in/vtop/content')) {
        main();
    }
});

observer.observe(document.body, { childList: true, subtree: true });