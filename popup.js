document.addEventListener('DOMContentLoaded', function () {
    var scrapeButton = document.getElementById('scrapeButton');
    scrapeButton.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "scrapeData" }, function (response) {
                if (response && response.success) {
                    displayData(response.data);
                } else {
                    document.getElementById('data').innerHTML = "Error scraping data. Make sure you're on the correct page.";
                }
            });
        });
    });
});

function displayData(data) {
    var dataDiv = document.getElementById('data');
    dataDiv.innerHTML = '';

    var regNo = document.createElement('p');
    regNo.textContent = `Registration Number: ${data.reg_no}`;
    dataDiv.appendChild(regNo);

    data.courses.forEach(function (course) {
        var courseDiv = document.createElement('div');
        courseDiv.className = 'course';

        var courseInfo = document.createElement('p');
        courseInfo.textContent = `${course.course_code}: ${course.course_title}`;
        courseDiv.appendChild(courseInfo);

        course.due_dates.forEach(function (dueDate) {
            var dueDateP = document.createElement('p');
            dueDateP.className = 'due-date';
            dueDateP.textContent = `Due: ${dueDate.date_due}`;
            courseDiv.appendChild(dueDateP);
        });

        dataDiv.appendChild(courseDiv);
    });
}