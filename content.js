let hasRun = false;

async function fetchHtml(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Error fetching URL: ${url}`, error);
        return null;
    }
}

function extractCsrfTokenAndId(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    const csrfElement = doc.querySelector('input[name="_csrf"]');
    const idElement = doc.querySelector('input[name="authorizedID"]');

    if (!csrfElement || !idElement) {
        console.error("CSRF token or ID element not found");
        return null;
    }

    return {
        csrfToken: csrfElement.value,
        id: idElement.value,
    };
}

async function getSemesterOptions() {
    try {
        const htmlText = await fetchHtml('https://vtop.vit.ac.in/vtop/content');
        if (!htmlText) {
            throw new Error('Failed to load content page');
        }

        const { csrfToken, id } = extractCsrfTokenAndId(htmlText) || {};

        if (!csrfToken || !id) {
            throw new Error('Failed to extract CSRF token or ID');
        }

        const semesterHtml = await fetchHtml('https://vtop.vit.ac.in/vtop/examinations/StudentDA', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: `_csrf=${csrfToken}&authorizedID=${id}&verifyMenu=true&nocache=${new Date().getTime()}`,
        });

        if (!semesterHtml) {
            throw new Error('Failed to load semester options');
        }

        const parser = new DOMParser();
        const semesterDoc = parser.parseFromString(semesterHtml, 'text/html');

        const selectElement = semesterDoc.querySelector('select[name="semesterSubId"]');

        if (!selectElement) {
            throw new Error('Failed to find semester dropdown');
        }

        const options = Array.from(selectElement.children).map(option => ({
            value: option.value,
            text: option.textContent,
        }));

        await chrome.storage.local.set({ semesterOptions: options });
        chrome.runtime.sendMessage({ action: "semesterOptionsUpdated", options });

        return options;

    } catch (error) {
        console.error('Error fetching semester options:', error);
        return [];
    }
}

async function fetchClassIds(semesterSubId, authorizedID, csrfToken) {
    try {
        const formData = new URLSearchParams();
        formData.append('authorizedID', authorizedID);
        formData.append('semesterSubId', semesterSubId);
        formData.append('_csrf', csrfToken);

        const response = await fetch('https://vtop.vit.ac.in/vtop/examinations/doDigitalAssignment', {
            method: 'POST',
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
            },
            body: formData.toString(),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch class IDs: ${response.statusText}`);
        }

        const data = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');
        const classIds = Array.from(doc.querySelectorAll('.tableContent td:nth-child(2)')).map(td => td.textContent.trim());

        if (classIds.length === 0) {
            throw new Error('No class IDs found');
        }

        return classIds;
    } catch (error) {
        console.error('Error in fetchClassIds:', error);
        throw error;
    }
}

async function scrapeDigitalAssignments(classIds, authorizedID, csrfToken) {
    const fetchPromises = classIds.map(classId =>
        fetch(`https://vtop.vit.ac.in/vtop/examinations/processDigitalAssignment`, {
            method: 'POST',
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
            },
            body: `authorizedID=${authorizedID}&x=${new Date().toGMTString()}&classId=${classId}&_csrf=${csrfToken}`,
        })
            .then(response => response.text())
            .then(data => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data, 'text/html');
                const tableRows = doc.querySelectorAll(".fixedContent.tableContent");

                let course_code = '';
                let course_title = '';
                let assignments = [];

                if (tableRows.length > 0) {
                    const firstRow = tableRows[0];
                    course_code = firstRow.children[1]?.innerText || 'N/A';
                    course_title = firstRow.children[2]?.innerText || 'N/A';
                }

                tableRows.forEach((row, index) => {
                    if (index === 0) return;

                    const assessmentTitle = row.children[1]?.innerText?.trim() || 'N/A';
                    const dateElement = row.children[4]?.querySelector('span');
                    const dateDue = dateElement?.innerText?.trim() || 'N/A';
                    const dateColor = dateElement?.style.color;
                    const lastUpdated = row.children[6]?.innerText?.trim() || '';
                    const isSubmitted = lastUpdated !== '';

                    assignments.push({
                        assessment_title: assessmentTitle,
                        date_due: dateDue,
                        is_submitted: isSubmitted,
                        last_updated: lastUpdated,
                        status: dateColor === 'red' ? 'past_due' : 'upcoming'
                    });
                });

                return {
                    class_id: classId,
                    course_code: course_code,
                    course_title: course_title,
                    duedates: assignments
                };
            })
            .catch(error => {
                console.error(`Error processing class ID ${classId}:`, error);
                return {
                    class_id: classId,
                    error: error.message
                };
            })
    );

    const courses = await Promise.all(fetchPromises);
    const scrapedData = {
        reg_no: authorizedID,
        courses: courses.filter(course => !course.error)
    };

    return scrapedData;
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

async function checkAndPromptSemester() {
    try {
        const { semesterOptions } = await chrome.storage.local.get(['semesterOptions']);
        if (!semesterOptions || semesterOptions.length === 0) {
            // No semester options found, fetch them and prompt user
            const options = await getSemesterOptions();
            if (options && options.length > 0) {
                // Send message to background script to show popup
                chrome.runtime.sendMessage({
                    action: "showSemesterPrompt",
                    message: "Please select your current semester to start using Assignofast"
                });
            }
        }
    } catch (error) {
        console.error("Error checking semester options:", error);
    }
}

async function main() {
    try {
        if (window.location.href.includes('vtop.vit.ac.in/vtop/content')) {
            if (hasRun) return; // Prevent multiple runs
            hasRun = true; // Set flag immediately
            
            await checkAndPromptSemester();

            const { justSignedIn } = await chrome.storage.local.get(['justSignedIn']);
            const semesterOptions = await getSemesterOptions();

            if (justSignedIn) {
                if (semesterOptions && semesterOptions.length > 0) {
                    const currentSemester = semesterOptions[0].value;
                    await chrome.storage.local.set({ currentSemester, justSignedIn: false });
                    await scrapeAndSendData(currentSemester);
                }
            } else {
                const { currentSemester } = await chrome.storage.local.get(['currentSemester']);
                if (currentSemester) {
                    await scrapeAndSendData(currentSemester);
                }
            }
        }
    } catch (error) {
        console.error("Error in main function:", error);
        hasRun = false; 
    }
}

async function handleDaSubmission() {
    try {
        const { currentSemester } = await chrome.storage.local.get(['currentSemester']);
        if (currentSemester) {
            console.log("DA is updating ...");
            await scrapeAndSendData(currentSemester);
        } else {
            console.error("No current semester found for DA submission");
        }
    } catch (error) {
        console.error("Error handling DA submission:", error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerSetDa") {
        scrapeAndSendData(request.semester);
    } else if (request.action === "getSemesterOptions") {
        chrome.storage.local.get(['semesterOptions'], (result) => {
            sendResponse(result.semesterOptions || []);
        });
        return true;
    } else if (request.action === "triggerDaScrape") {
        handleDaSubmission();
    }
});

document.addEventListener('DOMContentLoaded', main);

const observer = new MutationObserver(() => {
    if (!hasRun && window.location.href.includes('vtop.vit.ac.in/vtop/content')) {
        main();
    }
});

observer.observe(document.body, { childList: true, subtree: true });

async function scrapeTimeTable(semesterSubId, authorizedID, csrfToken) {
    try {
        const response = await fetch('https://vtop.vit.ac.in/vtop/processViewTimeTable', {
            method: 'POST',
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
            },
            body: `_csrf=${csrfToken}&semesterSubId=${semesterSubId}&authorizedID=${authorizedID}&x=${new Date().toGMTString()}`
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch timetable: ${response.statusText}`);
        }

        const data = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');

        const tableBody = doc.querySelector("#studentDetailsList > div.form-group.table-responsive.col-sm-12.row > table > tbody");
        if (!tableBody) {
            console.log("Timetable table not found");
            return [];
        }

        const rows = Array.from(tableBody.querySelectorAll("tr")).slice(1, -1);
        const timeTableData = rows.map(row => ({
            subjectName: row.querySelector("td:nth-child(3) > p:nth-child(1)")?.textContent.trim() || "N/A",
            slotNumber: row.querySelector("td:nth-child(8) > p:nth-child(1)")?.textContent.trim() || "N/A",
            classNumber: row.querySelector("td:nth-child(8) > p:nth-child(3)")?.textContent.trim() || "N/A"
        }));

        console.log("Timetable Data:", timeTableData);
        const transformedTimeTable = transformTimeTable(timeTableData);
        console.log("Transformed Timetable:", transformedTimeTable);
        return transformedTimeTable;

    } catch (error) {
        console.error('Error scraping timetable:', error);
        return [];
    }
}

const theoryTimings = {
    // 8:00 AM - 8:50 AM
    'A1': ['8:00 AM - 8:50 AM', '9:00 AM - 9:50 AM'],  // Monday 8AM, Wednesday 9AM
    'A2': ['2:00 PM - 2:50 PM', '3:00 PM - 3:50 PM'],  // Monday 2PM, Wednesday 3PM

    // B slots
    'B1': ['8:00 AM - 8:50 AM', '9:00 AM - 9:50 AM'],  // Tuesday 8AM, Thursday 9AM
    'B2': ['2:00 PM - 2:50 PM', '3:00 PM - 3:50 PM'],  // Tuesday 2PM, Thursday 3PM

    // C slots
    'C1': ['8:00 AM - 8:50 AM', '9:00 AM - 9:50 AM'],  // Wednesday 8AM, Friday 9AM
    'C2': ['2:00 PM - 2:50 PM', '2:51 PM - 3:40 PM'],    // Wednesday 2PM, Friday 3PM

    // D slots
    'D1': ['10:00 AM - 10:50 AM', '8:00 AM - 8:50 AM'],  // Monday 10AM, Thursday 8AM
    'D2': ['4:00 PM - 4:50 PM', '2:00 PM - 2:50 PM'],      // Monday 4PM, Thursday 2PM

    // E slots
    'E1': ['10:00 AM - 10:50 AM', '8:00 AM - 8:50 AM'],  // Tuesday 10AM, Friday 8AM
    'E2': ['2:00 PM - 2:50 PM', '2:00 PM - 2:50 PM'],      // Tuesday 2PM, Friday 2PM

    // F slots
    'F1': ['9:00 AM - 9:50 AM', '10:00 AM - 10:50 AM'],    // Monday 9AM, Wednesday 10AM
    'F2': ['3:00 PM - 3:50 PM', '4:00 PM - 4:50 PM'],      // Monday 3PM, Wednesday 4PM

    // G slots
    'G1': ['10:00 AM - 10:50 AM', '9:00 AM - 9:50 AM'],    // Thursday 10AM, Tuesday 9AM
    'G2': ['4:00 PM - 4:50 PM', '3:00 PM - 3:50 PM'],      // Thursday 4PM, Tuesday 3PM

    // Theory Additional slots
    'TA1': '10:00 AM - 10:50 AM',
    'TA2': '4:00 PM - 4:50 PM',
    'TAA1': '12:00 PM - 12:50 PM',
    'TAA2': '6:00 PM - 6:50 PM',
    'TB1': '11:00 AM - 11:50 AM',
    'TB2': '5:00 PM - 5:50 PM',
    'TBB2': '6:00 PM - 6:50 PM',
    'TC1': '11:00 AM - 11:50 AM',
    'TC2': '5:00 PM - 5:50 PM',
    'TCC1': '12:00 AM - 12:50 AM',
    'TCC2': '6:00 PM - 6:50 PM',
    'TD1': '12:00 PM - 12:50 PM',
    'TD2': '5:00 PM - 5:50 PM',
    'TDD2': '6:00 PM - 6:50 PM',
    'TE1': '11:00 AM - 11:50 AM',
    'TE2': '5:00 PM - 5:50 PM',
    'TF1': '11:00 AM - 11:50 AM',
    'TF2': '5:00 PM - 5:50 PM',
    'TG1': '12:00 PM - 12:50 PM',
    'TG2': '6:00 PM - 6:50 PM',

    // Extra evening theory slots
    'V1': '11:00 AM - 11:50 AM',
    'V2': '12:00 PM - 12:50 PM',
    'V3': '7:01 PM - 7:50 PM',
    'V4': '7:01 PM - 7:50 PM',
    'V5': '7:01 PM - 7:50 PM',
    'V6': '7:01 PM - 7:50 PM',
    'V7': '7:01 PM - 7:50 PM'
};

const labTimings = {
    // Morning labs
    'L1': '8:00 AM - 8:50 AM',
    'L2': '8:51 AM - 9:40 AM',
    'L3': '9:51 AM - 10:40 AM',
    'L4': '10:41 AM - 11:30 AM',
    'L5': '11:40 AM - 12:30 PM',
    'L6': '12:31 PM - 1:20 PM',

    'L7': '8:00 AM - 8:50 AM',
    'L8': '8:51 AM - 9:40 AM',
    'L9': '9:51 AM - 10:40 AM',
    'L10': '10:41 AM - 11:30 AM',
    'L11': '11:40 AM - 12:30 PM',
    'L12': '12:31 PM - 1:20 PM',

    'L13': '8:00 AM - 8:50 AM',
    'L14': '8:51 AM - 9:40 AM',
    'L15': '9:51 AM - 10:40 AM',
    'L16': '10:41 AM - 11:30 AM',
    'L17': '11:40 AM - 12:30 PM',
    'L18': '12:31 PM - 1:20 PM',

    'L19': '8:00 AM - 8:50 AM',
    'L20': '8:51 AM - 9:40 AM',
    'L21': '9:51 AM - 10:40 AM',
    'L22': '10:41 AM - 11:30 AM',
    'L23': '11:40 AM - 12:30 PM',
    'L24': '12:31 PM - 1:20 PM',

    'L25': '8:00 AM - 8:50 AM',
    'L26': '8:51 AM - 9:40 AM',
    'L27': '9:51 AM - 10:40 AM',
    'L28': '10:41 AM - 11:30 AM',
    'L29': '11:40 AM - 12:30 PM',
    'L30': '12:31 PM - 1:20 PM',

    // Afternoon labs
    'L31': '2:00 PM - 2:50 PM',
    'L32': '2:51 PM - 3:40 PM',
    'L33': '3:51 PM - 4:40 PM',
    'L34': '4:41 PM - 5:30 PM',
    'L35': '5:40 PM - 6:30 PM',
    'L36': '6:31 PM - 7:20 PM',

    'L37': '2:00 PM - 2:50 PM',
    'L38': '2:51 PM - 3:40 PM',
    'L39': '3:51 PM - 4:40 PM',
    'L40': '4:41 PM - 5:30 PM',
    'L41': '5:40 PM - 6:30 PM',
    'L42': '6:31 PM - 7:20 PM',

    'L43': '2:00 PM - 2:50 PM',
    'L44': '2:51 PM - 3:40 PM',
    'L45': '3:51 PM - 4:40 PM',
    'L46': '4:41 PM - 5:30 PM',
    'L47': '5:40 PM - 6:30 PM',
    'L48': '6:31 PM - 7:20 PM',

    'L49': '2:00 PM - 2:50 PM',
    'L50': '2:51 PM - 3:40 PM',
    'L51': '3:51 PM - 4:40 PM',
    'L52': '4:41 PM - 5:30 PM',
    'L53': '5:40 PM - 6:30 PM',
    'L54': '6:31 PM - 7:20 PM',

    'L55': '2:00 PM - 2:50 PM',
    'L56': '2:51 PM - 3:40 PM',
    'L57': '3:51 PM - 4:40 PM',
    'L58': '4:41 PM - 5:30 PM',
    'L59': '5:40 PM - 6:30 PM',
    'L60': '6:31 PM - 7:20 PM'
};

// Comprehensive slot to day mapping
const slotDayMapping = {
    // A slots
    'A1': [['MONDAY', 0], ['WEDNESDAY', 1]],  // Index refers to which timing to use
    'A2': [['MONDAY', 0], ['WEDNESDAY', 1]],

    // B slots
    'B1': [['TUESDAY', 0], ['THURSDAY', 1]],
    'B2': [['TUESDAY', 0], ['THURSDAY', 1]],

    // C slots
    'C1': [['WEDNESDAY', 0], ['FRIDAY', 1]],
    'C2': [['WEDNESDAY', 0], ['FRIDAY', 1]],

    // D slots
    'D1': [['MONDAY', 0], ['THURSDAY', 1]],
    'D2': [['MONDAY', 0], ['THURSDAY', 1]],

    // E slots
    'E1': [['TUESDAY', 0], ['FRIDAY', 1]],
    'E2': [['TUESDAY', 0], ['FRIDAY', 1]],

    // F slots
    'F1': [['MONDAY', 0], ['WEDNESDAY', 1]],
    'F2': [['MONDAY', 0], ['WEDNESDAY', 1]],

    // G slots
    'G1': [['THURSDAY', 0], ['TUESDAY', 1]],
    'G2': [['THURSDAY', 0], ['TUESDAY', 1]],

    // Additional theory slots remain the same as they occur once
    'TA1': ['FRIDAY'],
    'TA2': ['FRIDAY'],
    'TAA1': ['TUESDAY'],
    'TAA2': ['TUESDAY'],
    'TB1': ['MONDAY'],
    'TB2': ['MONDAY'],
    'TBB2': ['WEDNESDAY'],
    'TC1': ['TUESDAY'],
    'TC2': ['TUESDAY'],
    'TCC1': ['THURSDAY'],
    'TCC2': ['THURSDAY'],
    'TD1': ['FRIDAY'],
    'TD2': ['WEDNESDAY'],
    'TDD2': ['FRIDAY'],
    'TE1': ['THURSDAY'],
    'TE2': ['THURSDAY'],
    'TF1': ['FRIDAY'],
    'TF2': ['FRIDAY'],
    'TG1': ['MONDAY'],
    'TG2': ['MONDAY'],
    'V1': ['WEDNESDAY'],
    'V2': ['WEDNESDAY'],
    'V3': ['MONDAY'],
    'V4': ['TUESDAY'],
    'V5': ['WEDNESDAY'],
    'V6': ['THURSDAY'],
    'V7': ['FRIDAY']
};


// Lab slot to day mapping
const labDayMapping = {
    'L1': 'MONDAY', 'L2': 'MONDAY', 'L3': 'MONDAY', 'L4': 'MONDAY', 'L5': 'MONDAY', 'L6': 'MONDAY',
    'L7': 'TUESDAY', 'L8': 'TUESDAY', 'L9': 'TUESDAY', 'L10': 'TUESDAY', 'L11': 'TUESDAY', 'L12': 'TUESDAY',
    'L13': 'WEDNESDAY', 'L14': 'WEDNESDAY', 'L15': 'WEDNESDAY', 'L16': 'WEDNESDAY', 'L17': 'WEDNESDAY', 'L18': 'WEDNESDAY',
    'L19': 'THURSDAY', 'L20': 'THURSDAY', 'L21': 'THURSDAY', 'L22': 'THURSDAY', 'L23': 'THURSDAY', 'L24': 'THURSDAY',
    'L25': 'FRIDAY', 'L26': 'FRIDAY', 'L27': 'FRIDAY', 'L28': 'FRIDAY', 'L29': 'FRIDAY', 'L30': 'FRIDAY',
    'L31': 'MONDAY', 'L32': 'MONDAY', 'L33': 'MONDAY', 'L34': 'MONDAY', 'L35': 'MONDAY', 'L36': 'MONDAY',
    'L37': 'TUESDAY', 'L38': 'TUESDAY', 'L39': 'TUESDAY', 'L40': 'TUESDAY', 'L41': 'TUESDAY', 'L42': 'TUESDAY',
    'L43': 'WEDNESDAY', 'L44': 'WEDNESDAY', 'L45': 'WEDNESDAY', 'L46': 'WEDNESDAY', 'L47': 'WEDNESDAY', 'L48': 'WEDNESDAY',
    'L49': 'THURSDAY', 'L50': 'THURSDAY', 'L51': 'THURSDAY', 'L52': 'THURSDAY', 'L53': 'THURSDAY', 'L54': 'THURSDAY',
    'L55': 'FRIDAY', 'L56': 'FRIDAY', 'L57': 'FRIDAY', 'L58': 'FRIDAY', 'L59': 'FRIDAY', 'L60': 'FRIDAY'
};


function transformTimeTable(scrapedData) {
    const timetable = {
        MONDAY: [],
        TUESDAY: [],
        WEDNESDAY: [],
        THURSDAY: [],
        FRIDAY: []
    };

    scrapedData.forEach(subject => {
        const slots = subject.slotNumber.replace(/-$/, '').split('+').map(s => s.trim());
        
        slots.forEach(slot => {
            if (slot.startsWith('L')) {
                // Handle lab slots
                const day = labDayMapping[slot];
                // Only process odd-numbered lab slots to avoid duplication
                if (day && parseInt(slot.slice(1)) % 2 !== 0) {
                    const labSlotNumber = parseInt(slot.slice(1));
                    const firstSlotTiming = labTimings[`L${labSlotNumber}`];
                    const secondSlotTiming = labTimings[`L${labSlotNumber + 1}`];
                    
                    // Extract start time from first slot and end time from second slot
                    const startTime = firstSlotTiming.split(' - ')[0];
                    const endTime = secondSlotTiming.split(' - ')[1];
                    
                    // Add to timetable only if location is not "NIL"
                    if (subject.classNumber !== 'NIL') {
                        timetable[day].push({
                            type: 'LAB',
                            subjectName: subject.subjectName,
                            timing: `${startTime} - ${endTime}`,
                            location: subject.classNumber,
                            slotNumber: slots.join('+')
                        });
                    }
                }
            } else {
                // Handle theory slots
                const dayMappings = slotDayMapping[slot];
                if (dayMappings) {
                    if (Array.isArray(dayMappings[0])) {
                        dayMappings.forEach(([day, timeIndex]) => {
                            const timings = theoryTimings[slot];
                            if (timings && timings[timeIndex] && subject.classNumber !== 'NIL') {
                                timetable[day].push({
                                    type: 'THEORY',
                                    subjectName: subject.subjectName,
                                    timing: timings[timeIndex],
                                    location: subject.classNumber,
                                    slotNumber: slots.join('+')
                                });
                            }
                        });
                    } else {
                        const day = dayMappings[0];
                        const timing = theoryTimings[slot];
                        if (timing && subject.classNumber !== 'NIL') {
                            timetable[day].push({
                                type: 'THEORY',
                                subjectName: subject.subjectName,
                                timing: timing,
                                location: subject.classNumber,
                                slotNumber: slots.join('+')
                            });
                        }
                    }
                }
            }
        });
    });

    return timetable;
}

// Data formatting functions
function formatAssignmentData(rawData) {
    if (!rawData || !rawData.courses) return null;
    
    const formattedClasses = rawData.courses.map(course => {
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

    return formattedClasses;
}

function formatTimeTableData(rawTimeTable) {
    // Return null if the input is invalid
    if (!rawTimeTable) return null;
    
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    const formattedTimeTable = {};
    
    days.forEach(day => {
        if (Array.isArray(rawTimeTable[day])) {
            // Map and sort the sessions for each day
            formattedTimeTable[day] = rawTimeTable[day]
                .map(session => ({
                    type: session.type,
                    subjectName: session.subjectName,
                    timing: session.timing,
                    location: session.location,
                    slotNumber: session.slotNumber
                }))
                .sort((a, b) => {
                    // Extract start times for comparison
                    const aStartTime = a.timing.split(' - ')[0];
                    const bStartTime = b.timing.split(' - ')[0];
                    
                    // Convert times to minutes for comparison
                    return convertTimeToMinutes(aStartTime) - convertTimeToMinutes(bStartTime);
                });
        } else {
            formattedTimeTable[day] = [];
        }
    });
    
    return formattedTimeTable;
}

// Helper function to convert time to minutes for sorting (kept for reference)
function convertTimeToMinutes(timeStr) {
    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
}
// Comparison functions
function areAssignmentsEqual(formatted1, formatted2) {
    if (!formatted1 || !formatted2) return false;
    if (formatted1.length !== formatted2.length) return false;
    
    return formatted1.every((course1, index) => {
        const course2 = formatted2[index];
        if (course1.class_id !== course2.class_id ||
            course1.course_code !== course2.course_code ||
            course1.course_title !== course2.course_title ||
            course1.course_assignments.length !== course2.course_assignments.length) {
            return false;
        }
        
        return course1.course_assignments.every((assignment1, i) => {
            const assignment2 = course2.course_assignments[i];
            return assignment1.assessment_title === assignment2.assessment_title &&
                   assignment1.date_due === assignment2.date_due &&
                   assignment1.is_submitted === assignment2.is_submitted &&
                   assignment1.last_updated === assignment2.last_updated &&
                   assignment1.status === assignment2.status;
        });
    });
}

function areTimeTablesEqual(formatted1, formatted2) {
    if (!formatted1 || !formatted2) return false;
    
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    
    return days.every(day => {
        if (!formatted1[day] || !formatted2[day]) return false;
        if (formatted1[day].length !== formatted2[day].length) return false;
        
        return formatted1[day].every((class1, index) => {
            const class2 = formatted2[day][index];
            return class1.type === class2.type &&
                   class1.subjectName === class2.subjectName &&
                   class1.timing === class2.timing &&
                   class1.location === class2.location &&
                   class1.slotNumber === class2.slotNumber;
        });
    });
}

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