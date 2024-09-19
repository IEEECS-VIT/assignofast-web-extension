document.addEventListener('DOMContentLoaded', async () => {
    const semesterSelect = document.getElementById('semesterSelect');
    const currentSemesterSpan = document.getElementById('currentSemester');
    const autoScrapToggle = document.getElementById('autoScrapToggle');
    const manualScrapButton = document.getElementById('manualScrapButton');
    const signInStatus = document.getElementById('signInStatus');

    // Check if user is signed in
    chrome.storage.local.get(['uid'], (result) => {
        if (result.uid) {
            signInStatus.textContent = `Signed in`;
            loadSettings();
        } else {
            signInStatus.textContent = 'Not signed in';
            chrome.tabs.create({ url: "signin.html" });
        }
    });

    // Load saved settings
    async function loadSettings() {
        try {
            const savedSettings = await chrome.storage.local.get(['currentSemester', 'autoScrap', 'semesterOptions']);
            if (savedSettings.currentSemester) {
                currentSemesterSpan.textContent = savedSettings.currentSemester;
            }
            autoScrapToggle.checked = savedSettings.autoScrap || false;

            // Populate semester options
            if (savedSettings.semesterOptions && Array.isArray(savedSettings.semesterOptions)) {
                savedSettings.semesterOptions.forEach(option => {
                    const optElement = document.createElement('option');
                    optElement.value = option.value;
                    optElement.textContent = option.text;
                    semesterSelect.appendChild(optElement);
                });

                if (savedSettings.currentSemester) {
                    semesterSelect.value = savedSettings.currentSemester;
                }
            } else {
                semesterSelect.innerHTML = '<option value="">No options available</option>';
            }
        } catch (error) {
            console.error('Error loading saved settings:', error);
            currentSemesterSpan.textContent = 'None';
            autoScrapToggle.checked = false;
        }
    }

    // Event listeners
    semesterSelect.addEventListener('change', async (event) => {
        const selectedSemester = event.target.value;
        currentSemesterSpan.textContent = selectedSemester;
        try {
            await chrome.storage.local.set({ currentSemester: selectedSemester });
        } catch (error) {
            console.error('Error saving semester:', error);
        }
    });

    autoScrapToggle.addEventListener('change', async (event) => {
        try {
            await chrome.storage.local.set({ autoScrap: event.target.checked });
        } catch (error) {
            console.error('Error saving auto-scrap setting:', error);
        }
    });

    manualScrapButton.addEventListener('click', async () => {
        chrome.storage.local.get(['uid'], async (result) => {
            if (!result.uid) {
                alert('Please sign in first');
                chrome.tabs.create({ url: "signin.html" });
                return;
            }
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                await chrome.tabs.sendMessage(tab.id, { action: "manualScrap" });
            } catch (error) {
                console.error('Error triggering manual scrap:', error);
            }
        });
    });
});