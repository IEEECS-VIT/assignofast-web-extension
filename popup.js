document.addEventListener('DOMContentLoaded', async () => {
    const signInContent = document.getElementById('signInContent');
    const semesterContent = document.getElementById('semesterContent');
    const signInButton = document.getElementById('signInButton');
    const semesterSelect = document.getElementById('semesterSelect');
    const submitButton = document.getElementById('submitButton');
    const currentSemesterSpan = document.getElementById('currentSemester');

    function showSignInContent() {
        signInContent.style.display = 'block';
        semesterContent.style.display = 'none';
    }

    function showSemesterContent() {
        signInContent.style.display = 'none';
        semesterContent.style.display = 'block';
    }

    function populateSemesterOptions(options) {
        semesterSelect.innerHTML = '<option value="">Select Your Current Semester</option>';
        if (options && Array.isArray(options)) {
            options.forEach(option => {
                const optElement = document.createElement('option');
                optElement.value = option.value;
                optElement.textContent = option.text;
                semesterSelect.appendChild(optElement);
            });
        }
    }

    // Check if user is signed in
    try {
        const { uid } = await chrome.storage.local.get(['uid']);
        if (uid) {
            showSemesterContent();
            const savedSettings = await chrome.storage.local.get(['currentSemester', 'semesterOptions']);
            if (savedSettings.currentSemester) {
                currentSemesterSpan.textContent = savedSettings.currentSemester;
                semesterSelect.value = savedSettings.currentSemester;
            }
            populateSemesterOptions(savedSettings.semesterOptions);
        } else {
            showSignInContent();
        }
    } catch (error) {
        console.error('Error checking sign-in status:', error);
        showSignInContent();
    }

    // Sign In button click handler
    signInButton.addEventListener('click', () => {
        chrome.tabs.create({ url: "signin.html" });
    });

    // Submit button click handler
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

    // Listen for updates to semester options
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "semesterOptionsUpdated") {
            populateSemesterOptions(request.options);
        }
    });

    // Request semester options update when popup opens
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {action: "getSemesterOptions"});
    });
});