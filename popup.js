// Global error handler for window context
window.onerror = function(msg, url, line, col, error) {
    console.debug('Caught error:', { msg, url, line, col, error });
    return true;
};

// Global error handler for unhandled promise rejections
window.onunhandledrejection = function(event) {
    console.debug('Caught promise rejection:', event.reason);
    event.preventDefault();
};

document.addEventListener('DOMContentLoaded', async () => {
    const signInContent = document.getElementById('signInContent');
    const semesterContent = document.getElementById('semesterContent');
    const signInButton = document.getElementById('signInButton');
    const semesterSelect = document.getElementById('semesterSelect');
    const submitButton = document.getElementById('submitSemester');
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

    function showInvalidSiteContent() {
        invalidSiteContent.style.display = 'block';
        signInContent.style.display = 'none';
        semesterContent.style.display = 'none';
        loader.style.display = 'none';
        completionMessage.style.display = 'none';
    }

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
                optElement.value = option.id;
                optElement.textContent = option.name;
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

    async function updateSemester(newSemesterId) {
        try {
            showLoader();
            const options = await chrome.storage.local.get(['semesterOptions']);
            const semesterName = options.semesterOptions.find(opt => opt.id === newSemesterId)?.name || '';
            
            await chrome.storage.local.set({ 
                currentSemester: newSemesterId,
                currentSemesterName: semesterName
            });
            
            currentSemesterSpan.textContent = semesterName;
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, { 
                action: "triggerSetDa", 
                semester: newSemesterId 
            });
    
            // Wait for the scraping and sending process to complete
            await new Promise(resolve => {
                chrome.runtime.onMessage.addListener(function listener(request) {
                    if (request.action === "scrapingComplete") {
                        chrome.runtime.onMessage.removeListener(listener);
                        resolve();
                    }
                });
            });
    
            showCompletionMessage();
            setTimeout(() => {
                showSemesterContent();
            }, 3000);
        } catch (error) {
            // console.error('Error saving semester or triggering set-da:', error);
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
                
                // Get current tab to check if we're on VTOP
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const isOnVtop = tab.url.startsWith('https://vtop.vit.ac.in/vtop/content');
                
                const savedSettings = await chrome.storage.local.get(['currentSemester', 'currentSemesterName', 'semesterOptions']);
                if (savedSettings.currentSemester) {
                    currentSemesterSpan.textContent = savedSettings.currentSemesterName;
                    semesterSelect.value = savedSettings.currentSemester;
                }

                // Only check for real-time semester options if we're on VTOP
                if (isOnVtop) {
                    // Send a message to content script to get current semester options
                    chrome.tabs.sendMessage(tab.id, { action: "getSemesterOptions" }, response => {
                        if (chrome.runtime.lastError) {
                            // console.error(chrome.runtime.lastError);
                            return;
                        }
                        
                        // If we got a response with options, use those
                        if (response && response.length > 0) {
                            populateSemesterOptions(response);
                            return;
                        }
                        
                        // If no response but we have saved options, use those
                        if (savedSettings.semesterOptions && savedSettings.semesterOptions.length > 0) {
                            populateSemesterOptions(savedSettings.semesterOptions);
                            return;
                        }

                        // Only show refresh message if we have neither current nor saved options
                        const refreshMessage = document.createElement('p');
                        refreshMessage.className = 'refresh-message';
                        refreshMessage.textContent = 'Please refresh the VTOP page to load semester options';
                        semesterContent.insertBefore(refreshMessage, semesterSelect.parentElement);
                    });
                } else if (savedSettings.semesterOptions && savedSettings.semesterOptions.length > 0) {
                    // If not on VTOP but have saved options, use those
                    populateSemesterOptions(savedSettings.semesterOptions);
                }
            } else {
                showSignInContent();
                userInfoDiv.style.display = 'none';
            }
        } catch (error) {
            // console.error('Error checking authentication status:', error);
            showSignInContent();
            userInfoDiv.style.display = 'none';
        }
    }
    

    // Call checkAuthenticationStatus when the popup loads
    // await checkAuthenticationStatus();

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
            // Remove any existing refresh message
            const existingMessage = document.querySelector('.refresh-message');
            if (existingMessage) {
                existingMessage.remove();
            }
        }
    });

    // Request semester options update when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "getSemesterOptions" });
    });

    function logout() {
        chrome.storage.local.remove(['uid', 'email', 'authToken', 'previousTimeTable' , 'previousAssignments' , 'currentSemester' , 'justSignedIn' , 'semesterOptions' , 'currentSemesterName'], () => {
            showSignInContent();
            userInfoDiv.style.display = 'none';
        });
    }

    logoutSpan.addEventListener('click', logout);

    async function checkCurrentSite() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab.url.startsWith('https://vtop.vit.ac.in/vtop/content')) {
                await checkAuthenticationStatus();
            } else {
                showInvalidSiteContent();
            }
        } catch (error) {
            // console.error('Error checking current site:', error);
            showInvalidSiteContent();
        }
    }

    // Call checkCurrentSite when the popup loads
    await checkCurrentSite();

    // Open VTOP button click handler
    openVtopButton.addEventListener('click', () => {
        chrome.tabs.create({ url: "https://vtop.vit.ac.in/vtop/content" });
    });

    
});