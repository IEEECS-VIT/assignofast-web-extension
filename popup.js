document.addEventListener('DOMContentLoaded', async () => {
    const semesterSelect = document.getElementById('semesterSelect');
    const submitButton = document.getElementById('submitButton');
    const currentSemesterSpan = document.getElementById('currentSemester');

    function populateSemesterOptions(options) {
        semesterSelect.innerHTML = ''; // Clear existing options
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

    // Load saved settings
    try {
        const savedSettings = await chrome.storage.local.get(['currentSemester', 'semesterOptions']);

        // Display current semester
        if (savedSettings.currentSemester) {
            currentSemesterSpan.textContent = savedSettings.currentSemester;
        }

        // Populate semester options
        populateSemesterOptions(savedSettings.semesterOptions);

        if (savedSettings.currentSemester) {
            semesterSelect.value = savedSettings.currentSemester;
        }
    } catch (error) {
        console.error('Error loading saved settings:', error);
    }

    // Listen for updates to semester options
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "semesterOptionsUpdated") {
            populateSemesterOptions(request.options);
        }
    });

    // Event listener for submit button
    submitButton.addEventListener('click', async () => {
        const selectedSemester = semesterSelect.value;
        if (!selectedSemester) {
            alert('Please select a semester');
            return;
        }
        
        try {
            await chrome.storage.local.set({currentSemester: selectedSemester});
            currentSemesterSpan.textContent = selectedSemester;
            // Trigger set-da operation
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            await chrome.tabs.sendMessage(tab.id, {action: "triggerSetDa", semester: selectedSemester});
        } catch (error) {
            console.error('Error saving semester or triggering set-da:', error);
        }
    });

    // Request semester options update when popup opens
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {action: "getSemesterOptions"});
    });
});