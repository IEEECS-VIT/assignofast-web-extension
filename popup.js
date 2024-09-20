document.addEventListener('DOMContentLoaded', async () => {
    const semesterSelect = document.getElementById('semesterSelect');
    const submitButton = document.getElementById('submitButton');
    const currentSemesterSpan = document.getElementById('currentSemester');

    // Load saved settings
    try {
        const savedSettings = await chrome.storage.local.get(['currentSemester', 'semesterOptions']);

        // Display current semester
        if (savedSettings.currentSemester) {
            currentSemesterSpan.textContent = savedSettings.currentSemester;
        }

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
            semesterSelect.innerHTML += '<option value="">No options available</option>';
        }
    } catch (error) {
        console.error('Error loading saved settings:', error);
    }

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
});