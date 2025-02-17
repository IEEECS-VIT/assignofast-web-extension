// Helper function to convert time to minutes for sorting (kept for reference)
function convertTimeToMinutes(timeStr) {
    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
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
    'C2': ['2:00 PM - 2:50 PM', '3:00 PM - 3:50 PM'],    // Wednesday 2PM, Friday 3PM

    // D slots
    'D1': ['10:00 AM - 10:50 AM', '8:00 AM - 8:50 AM'],  // Monday 10AM, Thursday 8AM
    'D2': ['4:00 PM - 4:50 PM', '2:00 PM - 2:50 PM'],      // Monday 4PM, Thursday 2PM

    // E slots
    'E1': ['10:00 AM - 10:50 AM', '8:00 AM - 8:50 AM'],  // Tuesday 10AM, Friday 8AM
    'E2': ['4:00 PM - 4:50 PM', '2:00 PM - 2:50 PM'],      // Tuesday 4PM, Friday 2PM

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
    'TCC1': '12:00 PM - 12:50 PM',
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

