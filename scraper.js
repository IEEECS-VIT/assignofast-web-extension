
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

        const options = Array.from(selectElement.children)
            .filter(option => option.value && !option.value.includes('Choose'))
            .map(option => ({
                id: option.value,
                name: option.textContent.trim(),
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