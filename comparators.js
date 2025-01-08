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
