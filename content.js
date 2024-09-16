console.log("Content script started");

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

        createDropdown(options);

    } catch (error) {
        console.error('Error fetching semester options:', error);
    }
}

function createDropdown(options) {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.right = '10px';
    container.style.backgroundColor = 'white';
    container.style.border = '1px solid #ccc';
    container.style.padding = '10px';
    container.style.zIndex = '9999';

    const label = document.createElement('label');
    label.textContent = 'Select Semester:';
    container.appendChild(label);

    const dropdown = document.createElement('select');
    dropdown.id = 'semesterDropdown';
    dropdown.style.marginTop = '5px';

    options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.text;
        dropdown.appendChild(opt);
    });

    container.appendChild(dropdown);
    document.body.appendChild(container);

    dropdown.addEventListener('change', async (event) => {
        const selectedSemester = event.target.value;
        if (selectedSemester) {
            console.log('Selected Semester:', selectedSemester);
            await fetchClassIds(selectedSemester);
        }
    });
}

async function fetchClassIds(semesterSubId) {
    try {
        const { csrfToken, id } = extractCsrfTokenAndId(document.documentElement.innerHTML);
        const formData = new URLSearchParams();
        formData.append('authorizedID', id);
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

        const scrapedData = await scrapeDigitalAssignments(classIds, id, csrfToken);
        console.log('Scraped Digital Assignment Data:', scrapedData);

    } catch (error) {
        console.error('Error fetching class IDs:', error);
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
                    if (index === 0) return; // Skip the first row as it contains course info

                    const assessmentTitle = row.children[1]?.innerText?.trim() || 'N/A';
                    const dateElement = row.children[4]?.querySelector('span');
                    const dateDue = dateElement?.innerText?.trim() || 'N/A';
                    const dateColor = dateElement?.style.color;
                    const lastUpdated = row.children[6]?.innerText?.trim() || '';
                    const isSubmitted = lastUpdated !== '';

                    // Include all assignments, regardless of due date color
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

    // Send the scraped data to the server
    try {
        const token = await login(authorizedID); // Get a fresh token
        const result = await formatAndSendData(scrapedData, token);
        console.log('Data sent successfully:', result);
    } catch (error) {
        console.error('Error sending data:', error);
    }

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
    const uid = data.reg_no; 
    const formattedClasses = data.courses.map(course => {
        // Ensure all required fields are present
        if (!course.class_id || !course.course_code || !course.course_title || !Array.isArray(course.duedates)) {
            console.error('Invalid course data:', course);
            return null; // Skip this course
        }

        // Ensure each duedate has the required fields
        const validDuedates = course.duedates.filter(duedate => 
            duedate.assessment_title && duedate.date_due !== undefined
        );

        return {
            class_id: course.class_id,
            course_code: course.course_code,
            course_title: course.course_title,
            duedates: validDuedates
        };
    }).filter(course => course !== null); // Remove any null courses

    const payload = {
        uid: uid,
        classes: formattedClasses
    };

    console.log('Payload being sent:', payload);

    try {
        console.log('Token being used:', token);
        
        const response = await fetch('https://assignofast-backend.vercel.app/set-da', {
            method: 'POST',
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

async function main() {
    console.log("Main function started");
    try {
        await getSemesterOptions();
        // The rest of the process will be triggered by user selecting a semester
    } catch (error) {
        console.error("Error in main function:", error);
    }
}

// Run the main function
main();