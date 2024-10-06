document.addEventListener('DOMContentLoaded', async () => {
    const signInContent = document.getElementById('signInContent');
    const semesterContent = document.getElementById('semesterContent');
    const signInButton = document.getElementById('signInButton');
    const semesterSelect = document.getElementById('semesterSelect');
    const submitButton = document.getElementById('submitButton');
    const currentSemesterSpan = document.getElementById('currentSemester');
    const confirmationModal = document.getElementById('confirmationModal');
    const confirmChangeButton = document.getElementById('confirmChange');
    const cancelChangeButton = document.getElementById('cancelChange');
    const userInfoDiv = document.getElementById('userInfo');
    const userEmailSpan = document.getElementById('userEmail');
    const logoutSpan = document.getElementById('logout');
    const loader = document.getElementById('loader');
    const completionMessage = document.getElementById('completionMessage');

    let selectedSemester = '';

    function showSignInContent() {
        signInContent.style.display = 'block';
        semesterContent.style.display = 'none';
        loader.style.display = 'none';
        completionMessage.style.display = 'none';
    }

    function showSemesterContent() {
        signInContent.style.display = 'none';
        semesterContent.style.display = 'block';
        loader.style.display = 'none';
        completionMessage.style.display = 'none';
    }

    function showLoader() {
        signInContent.style.display = 'none';
        semesterContent.style.display = 'none';
        loader.style.display = 'block';
        completionMessage.style.display = 'none';
    }

    function showCompletionMessage() {
        signInContent.style.display = 'none';
        semesterContent.style.display = 'none';
        loader.style.display = 'none';
        completionMessage.style.display = 'block';
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

    function showConfirmationModal() {
        confirmationModal.style.display = 'block';
    }

    function hideConfirmationModal() {
        confirmationModal.style.display = 'none';
    }

    async function updateSemester(newSemester) {
        try {
            showLoader();
            await chrome.storage.local.set({ currentSemester: newSemester });
            currentSemesterSpan.textContent = newSemester;
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, { action: "triggerSetDa", semester: newSemester });
            showCompletionMessage();
            setTimeout(() => {
                showSemesterContent();
            }, 3000); // Show completion message for 3 seconds
        } catch (error) {
            console.error('Error saving semester or triggering set-da:', error);
            showSemesterContent();
        }
    }

    async function checkAuthenticationStatus() {
        try {
            const { uid, email, authToken } = await chrome.storage.local.get(['uid', 'email', 'authToken']);
            if (uid && authToken) {
                showSemesterContent();
                userEmailSpan.textContent = email;
                userInfoDiv.style.display = 'block';
                const savedSettings = await chrome.storage.local.get(['currentSemester', 'semesterOptions']);
                if (savedSettings.currentSemester) {
                    currentSemesterSpan.textContent = savedSettings.currentSemester;
                    semesterSelect.value = savedSettings.currentSemester;
                }
                populateSemesterOptions(savedSettings.semesterOptions);
            } else {
                showSignInContent();
                userInfoDiv.style.display = 'none';
            }
        } catch (error) {
            console.error('Error checking authentication status:', error);
            showSignInContent();
            userInfoDiv.style.display = 'none';
        }
    }

    // Call checkAuthenticationStatus when the popup loads
    await checkAuthenticationStatus();

    // Sign In button click handler
    signInButton.addEventListener('click', () => {
        chrome.tabs.create({ url: "signin.html" });
    });

    // Submit button click handler
    submitButton.addEventListener('click', async () => {
        selectedSemester = semesterSelect.value;
        if (!selectedSemester) {
            alert('Please select a semester');
            return;
        }
        
        const { currentSemester } = await chrome.storage.local.get(['currentSemester']);
        
        if (!currentSemester || currentSemester === '') {
            // First time selection, update without confirmation
            updateSemester(selectedSemester);
        } else if (selectedSemester !== currentSemester) {
            // Semester change, show confirmation
            showConfirmationModal();
        } else {
            // Same semester selected, update without confirmation
            updateSemester(selectedSemester);
        }
    });

    // Confirm change button click handler
    confirmChangeButton.addEventListener('click', () => {
        hideConfirmationModal();
        updateSemester(selectedSemester);
    });

    // Cancel change button click handler
    cancelChangeButton.addEventListener('click', () => {
        hideConfirmationModal();
        semesterSelect.value = currentSemesterSpan.textContent;
    });

    // Listen for updates to semester options
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "semesterOptionsUpdated") {
            populateSemesterOptions(request.options);
        }
    });

    // Request semester options update when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "getSemesterOptions" });
    });

    function logout() {
        chrome.storage.local.remove(['uid', 'email', 'authToken'], () => {
            showSignInContent();
            userInfoDiv.style.display = 'none';
        });
    }

    logoutSpan.addEventListener('click', logout);
});