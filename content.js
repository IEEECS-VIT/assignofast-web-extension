console.log("Content script started");

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

        console.log('CSRF Token and ID extracted:', csrfToken, id);

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

        console.log('Semester options:', options);

        // Store the options in chrome.storage and notify the popup
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
        console.log('Class ID Data:', data);

        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');
        const classIds = Array.from(doc.querySelectorAll('.tableContent td:nth-child(2)')).map(td => td.textContent.trim());

        console.log('Extracted Class IDs:', classIds);

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

async function login(uid) {
    try {
        const response = await fetch(`https://assignofast-backend.vercel.app/login?uid=${uid}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Login Response:', result);
        return result.token;
    } catch (error) {
        console.error('Error during login:', error);
        throw error;
    }
}

async function formatAndSendData(data, token) {
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
            duedates: validDuedates
        };
    }).filter(course => course !== null);

    const { uid } = await chrome.storage.local.get(['uid']);

    const payload = {
        uid: uid,
        classes: formattedClasses,
        registrationNumber: data.reg_no
    };

    console.log('Payload being sent:', payload);

    try {
        console.log('Token being used:', token);

        const response = await fetch('https://assignofast-backend.vercel.app/set-da', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        console.log('API Response:', result);

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

        const classIds = await fetchClassIds(semesterSubId, id, csrfToken);
        if (!classIds || classIds.length === 0) {
            throw new Error('No class IDs fetched');
        }

        // Get the UID from Chrome storage
        const { uid } = await chrome.storage.local.get(['uid']);
        if (!uid) {
            throw new Error('UID not found in storage');
        }

        const token = await login(uid);
        const scrapedData = await scrapeDigitalAssignments(classIds, id, csrfToken);
        console.log('Scraped Digital Assignment Data:', scrapedData);

        const result = await formatAndSendData(scrapedData, token);
        console.log('Data sent successfully:', result);
    } catch (error) {
        console.error('Error in scrapeAndSendData:', error);
    }
}

async function main() {
    if (hasRun) return;
    hasRun = true;

    console.log("Main function started");
    try {
        if (window.location.href.includes('vtop.vit.ac.in/vtop/content')) {
            const { justSignedIn } = await chrome.storage.local.get(['justSignedIn']);

            // Always fetch semester options when the content page loads
            const semesterOptions = await getSemesterOptions();
            
            // The storage update is now handled in getSemesterOptions()

            if (justSignedIn) {
                console.log("User just signed in, fetching semester options and triggering set-da");
                if (semesterOptions && semesterOptions.length > 0) {
                    const currentSemester = semesterOptions[0].value; // Select the first semester
                    await chrome.storage.local.set({ currentSemester, justSignedIn: false });
                    await scrapeAndSendData(currentSemester);
                }
            } else {
                // Check if there's a current semester and trigger set-da
                const { currentSemester } = await chrome.storage.local.get(['currentSemester']);
                if (currentSemester) {
                    await scrapeAndSendData(currentSemester);
                }
            }
        }
    } catch (error) {
        console.error("Error in main function:", error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerSetDa") {
        scrapeAndSendData(request.semester);
    } else if (request.action === "getSemesterOptions") {
        chrome.storage.local.get(['semesterOptions'], (result) => {
            sendResponse(result.semesterOptions || []);
        });
        return true; // Indicates that the response is asynchronous
    }
});

document.addEventListener('DOMContentLoaded', main);

const observer = new MutationObserver(() => {
    if (!hasRun && window.location.href.includes('vtop.vit.ac.in/vtop/content')) {
        main();
    }
});

observer.observe(document.body, { childList: true, subtree: true });