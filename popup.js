document.addEventListener('DOMContentLoaded', async () => {
    const signinContent = document.getElementById('signin-content');
    const semesterContent = document.getElementById('semester-content');
    const signinBtn = document.getElementById('signin-btn');
    const semesterSelect = document.getElementById('semesterSelect');
    const submitButton = document.getElementById('submitButton');
    const currentSemesterSpan = document.getElementById('currentSemester');

    function showSigninContent() {
        signinContent.style.display = 'block';
        semesterContent.style.display = 'none';
    }

    function showSemesterContent() {
        signinContent.style.display = 'none';
        semesterContent.style.display = 'block';
    }

    function populateSemesterOptions(options) {
        semesterSelect.innerHTML = '';
        if (options && Array.isArray(options)) {
            options.forEach(option => {
                const optElement = document.createElement('option');
                optElement.value = option.value;
                optElement.textContent = option.text;
                semesterSelect.appendChild(optElement);
            });
        } else {
            semesterSelect.innerHTML = '<option value="">No options available</option>';
        }
    }

    async function checkSignInStatus() {
        const { uid } = await chrome.storage.local.get(['uid']);
        if (uid) {
            showSemesterContent();
            loadSavedSettings();
        } else {
            showSigninContent();
        }
    }

    async function loadSavedSettings() {
        try {
            const savedSettings = await chrome.storage.local.get(['currentSemester', 'semesterOptions']);

            if (savedSettings.currentSemester) {
                currentSemesterSpan.textContent = savedSettings.currentSemester;
            }

            populateSemesterOptions(savedSettings.semesterOptions);

            if (savedSettings.currentSemester) {
                semesterSelect.value = savedSettings.currentSemester;
            }
        } catch (error) {
            console.error('Error loading saved settings:', error);
        }
    }

    signinBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: "signin.html" });
        window.close(); // Close the popup
    });

    submitButton.addEventListener('click', async () => {
        const selectedSemester = semesterSelect.value;
        if (!selectedSemester) {
            alert('Please select a semester');
            return;
        }
        
        try {
            await chrome.storage.local.set({currentSemester: selectedSemester});
            currentSemesterSpan.textContent = selectedSemester;
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            await chrome.tabs.sendMessage(tab.id, {action: "triggerSetDa", semester: selectedSemester});
        } catch (error) {
            console.error('Error saving semester or triggering set-da:', error);
        }
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "semesterOptionsUpdated") {
            populateSemesterOptions(request.options);
        }
    });

    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {action: "getSemesterOptions"});
    });

    checkSignInStatus();
});