document.addEventListener('DOMContentLoaded', async () => {
    const semesterSelect = document.getElementById('semesterSelect');
    const currentSemesterSpan = document.getElementById('currentSemester');
    const autoScrapToggle = document.getElementById('autoScrapToggle');
    const manualScrapButton = document.getElementById('manualScrapButton');

    // Load saved settings
    try {
        const savedSettings = await chrome.storage.local.get(['currentSemester', 'autoScrap']);
        if (savedSettings.currentSemester) {
            currentSemesterSpan.textContent = savedSettings.currentSemester;
        }
        autoScrapToggle.checked = savedSettings.autoScrap || false;
    } catch (error) {
        console.error('Error loading saved settings:', error);
        // Set default values if storage access fails
        currentSemesterSpan.textContent = 'None';
        autoScrapToggle.checked = false;
    }

    // Fetch semester options
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {action: "getSemesterOptions"}, (response) => {
            if (response && Array.isArray(response)) {
                response.forEach(option => {
                    const optElement = document.createElement('option');
                    optElement.value = option.value;
                    optElement.textContent = option.text;
                    semesterSelect.appendChild(optElement);
                });

                // Set selected semester if saved
                chrome.storage.local.get(['currentSemester'], (result) => {
                    if (result.currentSemester) {
                        semesterSelect.value = result.currentSemester;
                    }
                });
            } else {
                console.error("Failed to fetch semester options");
                semesterSelect.innerHTML = '<option value="">Failed to load options</option>';
            }
        });
    });

    // Event listeners
    semesterSelect.addEventListener('change', (event) => {
        const selectedSemester = event.target.value;
        currentSemesterSpan.textContent = selectedSemester;
        chrome.storage.local.set({currentSemester: selectedSemester}, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving semester:', chrome.runtime.lastError);
            }
        });
    });

    autoScrapToggle.addEventListener('change', (event) => {
        chrome.storage.local.set({autoScrap: event.target.checked}, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving auto-scrap setting:', chrome.runtime.lastError);
            }
        });
    });

    manualScrapButton.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: "manualScrap"});
        });
    });
});