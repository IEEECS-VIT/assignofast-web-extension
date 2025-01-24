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
const signInContent = document.getElementById('signInContent');
const semesterContent = document.getElementById('semesterContent');
const loader = document.getElementById('loader');
const completionMessage = document.getElementById('completionMessage');

function showSignInContent() {
    signInContent.style.display = 'block';
    semesterContent.style.display = 'none';
    loader.style.display = 'none';
    completionMessage.style.display = 'none';
}

function logout() {
    chrome.storage.local.remove(['uid', 'email', 'authToken', 'previousTimeTable', 'previousAssignments', 'currentSemester', 'justSignedIn', 'semesterOptions', 'currentSemesterName'], () => {
        showSignInContent();
        userInfoDiv.style.display = 'none';
    });
}

// API communication functions
async function sendAssignmentsToApi(formattedData) {
    try {
        const { uid, currentSemester, currentSemesterName , regNo , authorizedID} = await chrome.storage.local.get([
            'uid', 
            'currentSemester',
            'currentSemesterName',
            'regNo',
            'authorizedID'
        ]);
        const authToken = await checkAuthentication();
        
        if (authorizedID !== regNo) {
            console.debug('Unauthorized access - logging out');
            logout();
            return;
        }
        const payload = {
            uid: uid,
            classes: formattedData,
            semesterId: currentSemester,
            semesterName: currentSemesterName
        };

        const response = await fetch('https://assignofast-backend.vercel.app/assignments/set-da', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 403) {
            console.debug('Authentication failed (403) - logging out');
            logout();
            return;
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.debug('Error sending assignments to API:', error);
        if (error.message.includes('403')) {
            logout();
        }
    }
}

async function sendTimeTableToApi(formattedTimeTable) {
    try {
        const { uid, currentSemester, currentSemesterName , regNo , authorizedID} = await chrome.storage.local.get([
            'uid', 
            'currentSemester',
            'currentSemesterName',
            'regNo',
            'authorizedID'
        ]);
        const authToken = await checkAuthentication();
        
        if (authorizedID !== regNo) {
            console.debug('Unauthorized access - logging out');
            logout();
            return;
        }
        const payload = {
            uid: uid,
            timetable: formattedTimeTable,
            semesterId: currentSemester,
            semesterName: currentSemesterName
        };

        const response = await fetch('https://assignofast-backend.vercel.app/timetable/set-timetable', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });

        if (response.status === 403) {
            console.debug('Authentication failed (403) - logging out');
            logout();
            return;
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.debug('Error sending timetable to API:', error);
        if (error.message.includes('403')) {
            logout();
        }
    }
}

async function checkAuthentication() {
    try {
        const { authToken } = await chrome.storage.local.get(['authToken']);
        if (!authToken) {
            console.debug('No auth token found - logging out');
            logout();
            throw new Error('No auth token found');
        }
        return authToken;
    } catch (error) {
        console.debug('Authentication check failed:', error);
        logout();
        throw error;
    }
}

async function scrapeAndSendData(semesterSubId) {
    try {
        const { csrfToken, id } = extractCsrfTokenAndId(document.documentElement.innerHTML);
        if (!csrfToken || !id) {
            throw new Error('Failed to extract CSRF token or ID');
        }

        // Get previous data from storage
        const { previousTimeTable, previousAssignments } = await chrome.storage.local.get([
            'previousTimeTable',
            'previousAssignments'
        ]);

        // Handle TimeTable
        const timeTableData = await scrapeTimeTable(semesterSubId, id, csrfToken);
        const formattedTimeTable = formatTimeTableData(timeTableData);
        
        if (!areTimeTablesEqual(formattedTimeTable, previousTimeTable)) {
            console.debug("Timetable has changed, sending to API...");
            await sendTimeTableToApi(formattedTimeTable);
            await chrome.storage.local.set({ previousTimeTable: formattedTimeTable });
        } else {
            console.debug("Timetable unchanged, skipping API call");
        }

        // Handle Assignments
        const classIds = await fetchClassIds(semesterSubId, id, csrfToken);
        if (!classIds || classIds.length === 0) {
            throw new Error('No class IDs fetched');
        }

        const rawAssignmentData = await scrapeDigitalAssignments(classIds, id, csrfToken);
        const formattedAssignments = formatAssignmentData(rawAssignmentData);
        
        if (!areAssignmentsEqual(formattedAssignments, previousAssignments)) {
            console.debug("Assignments have changed, sending to API...");
            await sendAssignmentsToApi(formattedAssignments);
            await chrome.storage.local.set({ previousAssignments: formattedAssignments });
        } else {
            console.debug("Assignments unchanged, skipping API call");
        }

        chrome.runtime.sendMessage({ action: "scrapingComplete" });
    } catch (error) {
        console.debug('Error in scrapeAndSendData:', error);
        if (error.message.includes('403')) {
            logout();
        }
        chrome.runtime.sendMessage({ action: "scrapingFailed", error: error.message });
    }
}