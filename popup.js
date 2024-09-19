document.addEventListener('DOMContentLoaded', async () => {
    const semesterSelect = document.getElementById('semesterSelect');
    const currentSemesterSpan = document.getElementById('currentSemester');

    // Load saved settings
    try {
        const savedSettings = await chrome.storage.local.get(['currentSemester', 'semesterOptions']);
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
            semesterSelect.innerHTML = '<option value="">No options available</option>';
        }
    } catch (error) {
        console.error('Error loading saved settings:', error);
        currentSemesterSpan.textContent = 'None';
    }

    // Event listener for semester selection
    semesterSelect.addEventListener('change', async (event) => {
        const selectedSemester = event.target.value;
        currentSemesterSpan.textContent = selectedSemester;
        try {
            await chrome.storage.local.set({currentSemester: selectedSemester});
            // Trigger set-da operation
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            await chrome.tabs.sendMessage(tab.id, {action: "triggerSetDa", semester: selectedSemester});
        } catch (error) {
            console.error('Error saving semester or triggering set-da:', error);
        }
    });
});