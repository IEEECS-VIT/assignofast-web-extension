// API communication functions
async function sendAssignmentsToApi(formattedData) {
    try {
        const { uid } = await chrome.storage.local.get(['uid']);
        const authToken = await checkAuthentication();

        const payload = {
            uid: uid,
            classes: formattedData
        };

        const response = await fetch('https://assignofast-backend.vercel.app/assignments/set-da', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error sending assignments to API:', error);
        throw error;
    }
}

async function sendTimeTableToApi(formattedTimeTable) {
    try {
        const { uid } = await chrome.storage.local.get(['uid']);
        const authToken = await checkAuthentication();

        const payload = {
            uid: uid,
            timetable: formattedTimeTable
        };

        const response = await fetch('https://assignofast-backend.vercel.app/timetable/set-timetable', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error sending timetable to API:', error);
        throw error;
    }
}

async function checkAuthentication() {
    try {
        const { authToken } = await chrome.storage.local.get(['authToken']);
        if (!authToken) {
            throw new Error('No auth token found');
        }
        return authToken;
    } catch (error) {
        console.error('Authentication check failed:', error);
        throw error;
    }
}

async function formatAndSendData(data) {
    const formattedClasses = data.courses.map(course => {
        if (!course.class_id || !course.course_code || !course.course_title || !Array.isArray(course.duedates)) {
            console.error('Invalid course data:', course);
            return null;
        }

        const validDuedates = course.duedates.filter(duedate =>
            duedate.assessment_title && duedate.date_due !== undefined
        );

        return {
            class_id: course.class_id,
            course_code: course.course_code,
            course_title: course.course_title,
            course_assignments: validDuedates
        };
    }).filter(course => course !== null);

    const { uid } = await chrome.storage.local.get(['uid']);

    const payload = {
        uid: uid,
        classes: formattedClasses
    };

    try {
        const authToken = await checkAuthentication();

        const response = await fetch('https://assignofast-backend.vercel.app/assignments/set-da', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error sending data:', error);
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
            console.log("Timetable has changed, sending to API...");
            await sendTimeTableToApi(formattedTimeTable);
            await chrome.storage.local.set({ previousTimeTable: formattedTimeTable });
        } else {
            console.log("Timetable unchanged, skipping API call");
        }

        // Handle Assignments
        const classIds = await fetchClassIds(semesterSubId, id, csrfToken);
        if (!classIds || classIds.length === 0) {
            throw new Error('No class IDs fetched');
        }

        const rawAssignmentData = await scrapeDigitalAssignments(classIds, id, csrfToken);
        const formattedAssignments = formatAssignmentData(rawAssignmentData);
        
        if (!areAssignmentsEqual(formattedAssignments, previousAssignments)) {
            console.log("Assignments have changed, sending to API...");
            await sendAssignmentsToApi(formattedAssignments);
            await chrome.storage.local.set({ previousAssignments: formattedAssignments });
        } else {
            console.log("Assignments unchanged, skipping API call");
        }

        chrome.runtime.sendMessage({ action: "scrapingComplete" });
    } catch (error) {
        console.error('Error in scrapeAndSendData:', error);
        chrome.runtime.sendMessage({ action: "scrapingFailed", error: error.message });
    }
}

