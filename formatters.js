// Data formatting functions
function formatAssignmentData(rawData) {
    if (!rawData || !rawData.courses) return null;
    
    const formattedClasses = rawData.courses.map(course => {
        if (!course.class_id || !course.course_code || !course.course_title || !Array.isArray(course.duedates)) {
            // console.error('Invalid course data:', course);
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