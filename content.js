chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === "scrapeData") {
        da_page().then(data => {
            sendResponse({ success: true, data: data });
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }
});

let da_page = async () => {
    try {
        let scrapedData = {
            reg_no: "",
            courses: []
        };

        // Scrape the registration number
        if (document.getElementsByClassName("navbar-text text-light small fw-bold")[0] != undefined) {
            scrapedData.reg_no = document.getElementsByClassName("navbar-text text-light small fw-bold")[0].innerText.replace("(STUDENT)", "").trim();
        } else {
            scrapedData.reg_no = document.getElementsByClassName("VTopHeaderStyle")[0].innerText.replace("(STUDENT)", "").trim();
        }

        let table = document.getElementsByClassName("customTable")[0].children[0];
        let csrf;
        try { csrf = document.getElementsByName("_csrf")[3].defaultValue; } catch { }

        for (let i = 1; i < table.children.length; i++) {
            let classid = table.children[i].children[1].innerHTML;

            if (table.children[i].children[3].children.length != 1) {
                let response = await fetch(
                    `${window.location.origin}/vtop/examinations/processDigitalAssignment`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                            "X-Requested-With": "XMLHttpRequest",
                        },
                        body: `authorizedID=${scrapedData.reg_no}&x=${new Date().toGMTString()}&classId=${classid}&_csrf=${csrf}`,
                    }
                );

                let data = await response.text();
                let parser = new DOMParser();
                let doc = parser.parseFromString(data, "text/html");
                let table_inner = doc.getElementsByClassName("fixedContent tableContent");
                let course_code = doc.getElementsByClassName("fixedContent tableContent")[0].children[1].innerText;
                let course_title = doc.getElementsByClassName("fixedContent tableContent")[0].children[2].innerText;

                let due_dates = [];
                Array.from(table_inner).forEach((row) => {
                    let date = row.childNodes[9].childNodes[1];
                    let is_uploaded = true;
                    let assessment_title = row.children[1].innerText; // Scraping assessment title
                    try {
                        is_uploaded = row.children[6].children[0].innerHTML === "";
                    } catch { }
                    try {
                        if (date.style.color == "green" && is_uploaded) {
                            due_dates.push({
                                assessment_title: assessment_title, // Adding assessment title
                                date_due: date.innerHTML
                            });
                        }
                    } catch { }
                });

                scrapedData.courses.push({
                    class_id: classid,
                    course_code: course_code,
                    course_title: course_title,
                    due_dates: due_dates
                });
            }
        }

        console.log(scrapedData);

        return scrapedData;
    } catch (err) {
        console.error("Error in da_page:", err);
        throw err;
    }
};
