// firebase.js에서 실시간 데이터 구독 함수 가져오기
import {
    subscribeRiverData,
    subscribeSensorData,
    loginUser,
    logoutUser,
    observeAuth,
    checkAdmin,
    assignManager,
    getManagerAssignments,
    updateDetectionRecord,
    deleteDetectionRecord
} from "./firebase.js";

// ========================================
// 전역 변수
// ========================================

let riverData = [];
let sensorData = [];
let pollutionChart = null;
let trashChart = null;
let sensorManageChart = null;
let pollutionMap = null;

// ========================================
// 페이지네이션
// ========================================

const ITEMS_PER_PAGE = 10;

let detectionCurrentPage = 1;
let sensorCurrentPage = 1;

// 센서 기간 필터 적용 후 데이터 보관
let filteredSensorData = [];


// ========================================
// 숫자 변환
// ========================================

function toNumber(value) {

    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
}

function calculatePollution(data) {

    // =========================
    // 1. 쓰레기 점수
    // =========================
    const trashScore =
    toNumber(data.paper) * 1 +
    toNumber(data.metal) * 4 +
    toNumber(data.plastic) * 6 +
    toNumber(data.glass) * 10 +
    toNumber(data.other) * 6;


    // =========================
    // 2. pH 점수
    // =========================
    let phScore = 0;

    if (
        data.ph !== undefined &&
        data.ph !== null
    ) {

        const ph = toNumber(data.ph);

        if (ph < 6.0 || ph > 9.0) {
            phScore = 20;
        }
        else if (ph < 6.5 || ph > 8.5) {
            phScore = 10;
        }
    }


    // =========================
    // 3. 암모니아 점수
    // =========================
    let ammoniaScore = 0;

    if (
        data.ammonia !== undefined &&
        data.ammonia !== null
    ) {

        const ammonia =
            toNumber(data.ammonia);

        if (ammonia >= 1.0) {
            ammoniaScore = 20;
        }
        else if (ammonia >= 0.5) {
            ammoniaScore = 10;
        }
        else if (ammonia >= 0.2) {
            ammoniaScore = 5;
        }
    }


    // =========================
    // 4. 최종 오염도
    // =========================
    const finalScore =
        trashScore +
        phScore +
        ammoniaScore;

    return Math.max(
        0,
        Math.min(
            Math.round(finalScore),
            100
        )
    );
}

// ========================================
// 데이터 정렬
// ========================================

function getTimestamp(data) {

    if (
        data.timestamp &&
        typeof data.timestamp.toMillis === "function"
    ) {
        return data.timestamp.toMillis();
    }

    if (
        data.createdAt &&
        typeof data.createdAt.toMillis === "function"
    ) {
        return data.createdAt.toMillis();
    }

    if (Number.isFinite(Number(data.timestamp))) {
        return Number(data.timestamp);
    }

    const parsedTime = Date.parse(data.time);

    if (!Number.isNaN(parsedTime)) {
        return parsedTime;
    }

    return 0;
}

function findClosestSensorData(riverItem) {

    if (sensorData.length === 0) {
        return null;
    }

    const riverTime = getTimestamp(riverItem);

    if (riverTime === 0) {
        return null;
    }

    let closestSensor = null;
    let smallestDifference = Infinity;

    sensorData.forEach(sensor => {

        const sensorTime = getTimestamp(sensor);

        if (sensorTime === 0) {
            return;
        }

        const difference =
            Math.abs(riverTime - sensorTime);

        if (difference < smallestDifference) {

            smallestDifference = difference;
            closestSensor = sensor;
        }
    });

    // 너무 멀리 떨어진 센서값은 연결하지 않음
    // 현재는 60초
    const MAX_TIME_DIFFERENCE = 60 * 1000;

    if (smallestDifference > MAX_TIME_DIFFERENCE) {
        return null;
    }

    return closestSensor;
}


function formatTime(data) {

    if (
        data.timestamp &&
        typeof data.timestamp.toDate === "function"
    ) {
        return data.timestamp
            .toDate()
            .toLocaleString("ko-KR");
    }

    if (
        data.createdAt &&
        typeof data.createdAt.toDate === "function"
    ) {
        return data.createdAt
            .toDate()
            .toLocaleString("ko-KR");
    }

    return data.time ?? "-";
}


function sortRiverData(dataList) {

    return [...dataList].sort((a, b) => {

        const timeA = getTimestamp(a);
        const timeB = getTimestamp(b);

        // 타임스탬프가 있으면 타임스탬프로 정렬
        if (timeA !== 0 || timeB !== 0) {

            return timeA - timeB;
        }

        // 타임스탬프가 없으면 time 문자열로 정렬
        return String(a.time ?? "").localeCompare(
            String(b.time ?? ""),
            "ko"
        );
    });
}


// ========================================
// 오늘 날짜 표시
// ========================================

function updateCurrentDate() {

    const now = new Date();

    const year = now.getFullYear();

    const month = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        now.getDate()
    ).padStart(2, "0");

    const hour = String(
        now.getHours()
    ).padStart(2, "0");

    const minute = String(
        now.getMinutes()
    ).padStart(2, "0");

    const currentDate =
        document.getElementById("currentDate");

    if (currentDate) {

        currentDate.textContent =
            `${year}.${month}.${day} ${hour}:${minute}`;
    }
}


// 페이지 실행 시 날짜 표시
updateCurrentDate();

// 1분마다 날짜와 시간 갱신
setInterval(updateCurrentDate, 60000);


// ========================================
// 청주시 하천 오염도 지도
// ========================================

function initializePollutionMap() {

    const mapElement =
        document.getElementById("pollutionMap");

    if (!mapElement) return;

    // 이미 지도가 만들어졌으면 다시 만들지 않음
    if (pollutionMap) return;

    // 청주시 중심으로 지도 생성
    pollutionMap = L.map("pollutionMap").setView(
        [36.6424, 127.4890],
        15
    );

    // OpenStreetMap 지도 연결
    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
        }
    ).addTo(pollutionMap);
}

function updatePollutionMap(dataList) {

    if (!pollutionMap) return;
    if (!dataList || dataList.length === 0) return;

    // 충북대 A 데이터만 찾기
    const locationData = dataList.filter(
        data => data.location === "충북대 A"
    );

    if (locationData.length === 0) return;

    // 가장 최근 탐지 데이터
    const latestData = [...locationData].sort(
        (a, b) => getTimestamp(b) - getTimestamp(a)
    )[0];

    // 현재 프로젝트의 쓰레기 오염 점수 사용
    const score = toNumber(latestData.trash_score);

    let markerColor = "#22c55e";
    let statusText = "양호";

    if (score >= 70) {
        markerColor = "#ef4444";
        statusText = "심각";
    } else if (score >= 40) {
        markerColor = "#f97316";
        statusText = "주의";
    }

    // 충북대 A 위치 표시
    const marker = L.circleMarker(
        [36.6424, 127.4890],
        {
            radius: 14,
            color: markerColor,
            fillColor: markerColor,
            fillOpacity: 0.8,
            weight: 3
        }
    ).addTo(pollutionMap);

    marker.bindPopup(`
        <strong>충북대 A</strong><br>
        오염도: ${score}점<br>
        상태: ${statusText}<br>
        최근 탐지: ${formatTime(latestData)}
    `);
    // 마우스를 올리면 정보창 표시
    marker.on("mouseover", function () {
        this.openPopup();
    });

    // 마우스를 떼면 정보창 닫기
    marker.on("mouseout", function () {
        this.closePopup();
    });
}

// ========================================
// 오염도 경고 관리
// ========================================
function updatePollutionAlert(dataList) {

    const statusElement =
        document.getElementById("pollutionAlertStatus");

    const messageElement =
        document.getElementById("pollutionAlertMessage");

    if (!statusElement || !messageElement) return;
    if (!dataList || dataList.length === 0) return;

    // 가장 최근 탐지 데이터
    const latestData = [...dataList].sort(
        (a, b) => getTimestamp(b) - getTimestamp(a)
    )[0];

    const score = toNumber(latestData.trash_score);

    // 기존 클래스 초기화
    statusElement.classList.remove(
        "normal",
        "warning",
        "danger"
    );

    if (score >= 70) {

        statusElement.textContent = "위험";
        statusElement.classList.add("danger");

        messageElement.textContent =
            `현재 오염도 ${score}점 - 기준을 초과했습니다.`;

    } else if (score >= 40) {

        statusElement.textContent = "주의";
        statusElement.classList.add("warning");

        messageElement.textContent =
            `현재 오염도 ${score}점 - 주의가 필요합니다.`;

    } else {

        statusElement.textContent = "정상";
        statusElement.classList.add("normal");

        messageElement.textContent =
            `현재 오염도 ${score}점 - 정상 범위입니다.`;
    }
}

// ========================================
// 카메라 연결 상태 경고
// 최근 탐지 데이터가 5분 이상 없으면 연결 끊김
// ========================================
function updateCameraAlert(dataList) {

    const statusElement =
        document.getElementById("cameraAlertStatus");

    const messageElement =
        document.getElementById("cameraAlertMessage");

    if (!statusElement || !messageElement) return;

    statusElement.classList.remove(
        "normal",
        "warning",
        "danger"
    );

    // 탐지 데이터 자체가 없는 경우
    if (!dataList || dataList.length === 0) {

        statusElement.textContent = "연결 끊김";
        statusElement.classList.add("danger");

        messageElement.textContent =
            "카메라 탐지 데이터가 없습니다.";

        return;
    }

    // 가장 최근 카메라 탐지 데이터
    const latestData = [...dataList].sort(
        (a, b) => getTimestamp(b) - getTimestamp(a)
    )[0];

    const latestTime = getTimestamp(latestData);
    const now = Date.now();

    // 마지막 데이터 이후 경과 시간
    const elapsedMinutes =
        (now - latestTime) / (1000 * 60);

    // 5분 이상 데이터가 없으면 연결 끊김
    if (elapsedMinutes >= 5) {

        statusElement.textContent = "연결 끊김";
        statusElement.classList.add("danger");

        messageElement.textContent =
            `최근 탐지: ${formatTime(latestData)}`;

    } else {

        statusElement.textContent = "연결";
        statusElement.classList.add("normal");

        messageElement.textContent =
            `최근 탐지: ${formatTime(latestData)}`;
    }
}

// ========================================
// 카메라 장치 관리 정보 업데이트
// ========================================
function updateCameraDevice(dataList) {

    const deviceId =
        document.getElementById("cameraDeviceId");

    const locationElement =
        document.getElementById("cameraDeviceLocation");

    const statusElement =
        document.getElementById("cameraDeviceStatus");

    const lastSeenElement =
        document.getElementById("cameraDeviceLastSeen");

    if (
        !deviceId ||
        !locationElement ||
        !statusElement ||
        !lastSeenElement
    ) return;

    // 관리용 장치 ID
    deviceId.textContent = "CAM-001";

    statusElement.classList.remove(
        "connected",
        "disconnected"
    );

    // 데이터가 없는 경우
    if (!dataList || dataList.length === 0) {

        locationElement.textContent = "-";
        statusElement.textContent = "연결 끊김";
        statusElement.classList.add("disconnected");
        lastSeenElement.textContent = "-";

        return;
    }

    // 가장 최근 데이터
    const latestData = [...dataList].sort(
        (a, b) => getTimestamp(b) - getTimestamp(a)
    )[0];

    locationElement.textContent =
        latestData.location || "미등록";

    lastSeenElement.textContent =
        formatTime(latestData);

    const latestTime = getTimestamp(latestData);
    const elapsedMinutes =
        (Date.now() - latestTime) / (1000 * 60);

    // 최근 5분 기준
    if (elapsedMinutes >= 5) {

        statusElement.textContent = "연결 끊김";
        statusElement.classList.add("disconnected");

    } else {

        statusElement.textContent = "연결";
        statusElement.classList.add("connected");
    }
}

// ========================================
// 센서 연결 상태 경고
// 최근 센서 데이터가 5분 이상 없으면 연결 끊김
// ========================================
function updateSensorAlert(dataList) {

    const statusElement =
        document.getElementById("sensorAlertStatus");

    const messageElement =
        document.getElementById("sensorAlertMessage");

    if (!statusElement || !messageElement) return;

    statusElement.classList.remove(
        "normal",
        "warning",
        "danger"
    );

    // 센서 데이터가 없는 경우
    if (!dataList || dataList.length === 0) {

        statusElement.textContent = "연결 끊김";
        statusElement.classList.add("danger");

        messageElement.textContent =
            "센서 데이터가 없습니다.";

        return;
    }

    // 가장 최근 센서 데이터
    const latestData = [...dataList].sort(
        (a, b) => getTimestamp(b) - getTimestamp(a)
    )[0];

    const latestTime = getTimestamp(latestData);
    const now = Date.now();

    const elapsedMinutes =
        (now - latestTime) / (1000 * 60);

    // 5분 이상 센서 데이터가 없으면 연결 끊김
    if (elapsedMinutes >= 5) {

        statusElement.textContent = "연결 끊김";
        statusElement.classList.add("danger");

        messageElement.textContent =
            `최근 측정: ${formatTime(latestData)}`;

    } else {

        statusElement.textContent = "연결";
        statusElement.classList.add("normal");

        messageElement.textContent =
            `최근 측정: ${formatTime(latestData)}`;
    }
}

// ========================================
// 센서 장치 관리 정보 업데이트
// ========================================
function updateSensorDevice(dataList) {

    const deviceId =
        document.getElementById("sensorDeviceId");

    const locationElement =
        document.getElementById("sensorDeviceLocation");

    const statusElement =
        document.getElementById("sensorDeviceStatus");

    const lastSeenElement =
        document.getElementById("sensorDeviceLastSeen");

    if (
        !deviceId ||
        !locationElement ||
        !statusElement ||
        !lastSeenElement
    ) return;

    // 프로젝트 관리용 센서 ID
    deviceId.textContent = "SENSOR-001";

    statusElement.classList.remove(
        "connected",
        "disconnected"
    );

    // 센서 데이터가 없는 경우
    if (!dataList || dataList.length === 0) {

        locationElement.textContent = "-";
        statusElement.textContent = "연결 끊김";
        statusElement.classList.add("disconnected");
        lastSeenElement.textContent = "-";

        return;
    }

    // 가장 최근 센서 데이터
    const latestData = [...dataList].sort(
        (a, b) => getTimestamp(b) - getTimestamp(a)
    )[0];

    // 설치 위치
    locationElement.textContent =
        latestData.location || "미등록";

    // 마지막 데이터 수신 시간
    lastSeenElement.textContent =
        formatTime(latestData);

    const latestTime = getTimestamp(latestData);

    const elapsedMinutes =
        (Date.now() - latestTime) / (1000 * 60);

    // 최근 5분 기준
    if (elapsedMinutes >= 5) {

        statusElement.textContent = "연결 끊김";
        statusElement.classList.add("disconnected");

    } else {

        statusElement.textContent = "연결";
        statusElement.classList.add("connected");
    }
}

// ========================================
// 상태 표시
// ========================================

function updatePollutionStatus(score) {

    const pollutionStatus =
        document.querySelector("#pollutionValue + span");

    if (!pollutionStatus) {
        return;
    }

    if (score >= 31) {

        pollutionStatus.textContent = "위험";
        pollutionStatus.className = "danger";

    } else if (score >= 11) {

        pollutionStatus.textContent = "주의";
        pollutionStatus.className = "warning";

    } else {

        pollutionStatus.textContent = "정상";
        pollutionStatus.className = "normal";
    }
}
// ========================================
// 상단 카드 업데이트
// ========================================

function updateCards(latest) {

    console.log("updateCards 받은 값:", latest);
    console.log("pH:", latest.ph);
    console.log("암모니아:", latest.ammonia);

    const pollutionScore =
        calculatePollution(latest);

    const pollutionValue =
        document.getElementById("pollutionValue");

    const phValue =
        document.getElementById("phValue");

    const ammoniaValue =
        document.getElementById("ammoniaValue");

    const timeValue =
        document.getElementById("timeValue");


    if (pollutionValue) {
        pollutionValue.textContent =
            `${pollutionScore}점`;
    }

    if (phValue) {
        phValue.textContent =
            latest.ph !== undefined
                ? latest.ph
                : "-";
    }

    if (ammoniaValue) {
        ammoniaValue.textContent =
            latest.ammonia !== undefined
                ? `${latest.ammonia} ppm`
                : "-";
    }

    if (timeValue) {
        timeValue.textContent =
            formatTime(latest);
    }

    console.log(
    "화면 pH:",
    document.getElementById("phValue")?.textContent
);

console.log(
    "화면 암모니아:",
    document.getElementById("ammoniaValue")?.textContent
);

    updatePollutionStatus(pollutionScore);
}

// ========================================
// 관리자 페이지 업데이트
// ========================================

function updateAdminPage(latest) {

    const pollutionScore =
        calculatePollution(latest);

    document.getElementById(
        "adminPollution"
    ).textContent =
        `${pollutionScore}점`;

    document.getElementById(
        "adminPh"
    ).textContent =
        latest.ph ?? "-";

    document.getElementById(
        "adminAmmonia"
    ).textContent =
        latest.ammonia !== undefined
            ? `${latest.ammonia} ppm`
            : "-";

    document.getElementById(
        "adminTime"
    ).textContent =
        latest.time ?? "-";
}


// ========================================
// HTML 안전 처리
// ========================================

function escapeHTML(value) {

    return String(value ?? "-")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// ========================================
// 최근 탐지 기록 테이블
// ========================================

function updateTable(dataList) {

    const tableBody =
        document.getElementById("tableBody");

    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = "";

    [...dataList]
        .reverse()
        .slice(0, 5)
        .forEach(data => {
            const matchedSensor =
                findClosestSensorData(data);

            const mergedData = {
                ...data,
                ph: matchedSensor?.ph,
                ammonia: matchedSensor?.ammonia
            };

            const row =
                document.createElement("tr");

            row.innerHTML = `
                <td>${escapeHTML(formatTime(data))}</td>
                <td>${escapeHTML(data.location)}</td>
                <td>${toNumber(data.plastic)}</td>
                <td>${toNumber(data.metal)}</td>
                <td>${toNumber(data.paper)}</td>
                <td>${toNumber(data.glass)}</td>
                <td>${escapeHTML(mergedData.ph)}</td>
                <td>${escapeHTML(mergedData.ammonia)}</td>
                <td>${calculatePollution(mergedData)}</td>
            `;

            tableBody.appendChild(row);
        });
}

// ========================================
// 관리자 - 탐지 기록 관리 테이블
// ========================================

function updateDetectionManageTable(dataList) {

    const tableBody =
        document.getElementById("detectionManageBody");

    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = "";


    // 최신 기록부터 정렬
    const sortedData =
        [...dataList].reverse();


    // 전체 페이지 수
    const totalPages =
        Math.max(
            1,
            Math.ceil(
                sortedData.length / ITEMS_PER_PAGE
            )
        );


    // 현재 페이지가 범위를 벗어나지 않도록 처리
    if (detectionCurrentPage > totalPages) {
        detectionCurrentPage = totalPages;
    }

    if (detectionCurrentPage < 1) {
        detectionCurrentPage = 1;
    }


    // 현재 페이지 데이터 범위
    const startIndex =
        (detectionCurrentPage - 1)
        * ITEMS_PER_PAGE;

    const endIndex =
        startIndex + ITEMS_PER_PAGE;


    const pageData =
        sortedData.slice(
            startIndex,
            endIndex
        );


    // 데이터가 없는 경우
    if (sortedData.length === 0) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    탐지 기록이 없습니다.
                </td>
            </tr>
        `;

        renderDetectionPagination(1);

        return;
    }


    // 현재 페이지의 10개만 출력
    pageData.forEach(data => {
        console.log("탐지 이미지 URL:", data.imageUrl);

        const row =
            document.createElement("tr");


        const imageHTML =
            data.imageUrl
                ? `
                    <img
                        src="${escapeHTML(data.imageUrl)}"
                        class="detection-image"
                        alt="탐지 이미지"
                    >
                `
                : "이미지 없음";


        const resultHTML = `
            플라스틱: ${toNumber(data.plastic)}<br>
            금속: ${toNumber(data.metal)}<br>
            종이: ${toNumber(data.paper)}<br>
            유리: ${toNumber(data.glass)}<br>
            기타: ${toNumber(data.other)}
        `;


        const score =
            data.trash_score !== undefined
                ? toNumber(data.trash_score)
                : calculatePollution(data);


        row.innerHTML = `

            <td>
                ${imageHTML}
            </td>

            <td>
                ${escapeHTML(formatTime(data))}
            </td>

            <td>
                ${escapeHTML(data.location)}
            </td>

            <td>
                ${resultHTML}
            </td>

            <td>
                ${score}점
            </td>

            <td>

                <button
                    class="edit-detection-btn"
                    data-id="${escapeHTML(data.id)}"
                >
                    수정
                </button>

                <button
                    class="delete-detection-btn"
                    data-id="${escapeHTML(data.id)}"
                >
                    삭제
                </button>

            </td>
        `;

        tableBody.appendChild(row);
    });


    // 페이지 버튼 생성
    renderDetectionPagination(
        totalPages
    );
}

function renderDetectionPagination(totalPages) {

    const container =
        document.getElementById(
            "detectionPagination"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";


    // 이전 버튼
    const prevButton =
        document.createElement("button");

    prevButton.textContent = "이전";

    prevButton.disabled =
        detectionCurrentPage === 1;

    prevButton.addEventListener(
        "click",
        () => {

            if (detectionCurrentPage > 1) {

                detectionCurrentPage--;

                updateDetectionManageTable(
                    riverData
                );
            }
        }
    );

    container.appendChild(prevButton);


    // 페이지 번호
    for (
        let page = 1;
        page <= totalPages;
        page++
    ) {

        const pageButton =
            document.createElement("button");

        pageButton.textContent = page;

        if (
            page === detectionCurrentPage
        ) {
            pageButton.classList.add(
                "active"
            );
        }

        pageButton.addEventListener(
            "click",
            () => {

                detectionCurrentPage =
                    page;

                updateDetectionManageTable(
                    riverData
                );
            }
        );

        container.appendChild(
            pageButton
        );
    }


    // 다음 버튼
    const nextButton =
        document.createElement("button");

    nextButton.textContent = "다음";

    nextButton.disabled =
        detectionCurrentPage ===
        totalPages;

    nextButton.addEventListener(
        "click",
        () => {

            if (
                detectionCurrentPage <
                totalPages
            ) {

                detectionCurrentPage++;

                updateDetectionManageTable(
                    riverData
                );
            }
        }
    );

    container.appendChild(nextButton);
}

// ========================================
// 관리자 - 센서 데이터 관리 테이블
// ========================================

function updateSensorManageTable(dataList) {

    const tableBody =
        document.getElementById("sensorManageBody");

    const totalCount =
        document.getElementById("sensorTotalCount");

    const phAbnormalCount =
        document.getElementById("phAbnormalCount");

    const nh3AbnormalCount =
        document.getElementById("nh3AbnormalCount");


    if (!tableBody) {
        return;
    }


    tableBody.innerHTML = "";


    // 데이터가 없을 경우
    if (!dataList || dataList.length === 0) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="4">
                    저장된 센서 데이터가 없습니다.
                </td>
            </tr>
        `;

        if (totalCount) {
            totalCount.textContent = "0건";
        }

        if (phAbnormalCount) {
            phAbnormalCount.textContent = "0건";
        }

        if (nh3AbnormalCount) {
            nh3AbnormalCount.textContent = "0건";
        }

        return;
    }


    // ==============================
    // 이상값 개수 계산
    // ==============================

    let phAbnormal = 0;
    let nh3Abnormal = 0;


    dataList.forEach(data => {

        const ph =
            toNumber(data.ph);

        const ammonia =
            toNumber(data.ammonia);


        // pH 이상 기준
        if (ph < 6.0 || ph > 9.0) {
            phAbnormal++;
        }


        // NH3 이상 기준
        if (ammonia >= 1.0) {
            nh3Abnormal++;
        }
    });


    // ==============================
    // 위쪽 요약 카드
    // ==============================

    if (totalCount) {
        totalCount.textContent =
            `${dataList.length}건`;
    }

    if (phAbnormalCount) {
        phAbnormalCount.textContent =
            `${phAbnormal}건`;
    }

    if (nh3AbnormalCount) {
        nh3AbnormalCount.textContent =
            `${nh3Abnormal}건`;
    }


    // ==============================
// 센서 기록 페이지네이션
// ==============================

const sortedData =
    [...dataList].reverse();

const totalPages =
    Math.max(
        1,
        Math.ceil(
            sortedData.length / ITEMS_PER_PAGE
        )
    );

if (sensorCurrentPage > totalPages) {
    sensorCurrentPage = totalPages;
}

if (sensorCurrentPage < 1) {
    sensorCurrentPage = 1;
}

const startIndex =
    (sensorCurrentPage - 1)
    * ITEMS_PER_PAGE;

const endIndex =
    startIndex + ITEMS_PER_PAGE;

const pageData =
    sortedData.slice(
        startIndex,
        endIndex
    );


// ==============================
// 현재 페이지 센서 기록 출력
// ==============================

pageData.forEach(data => {

            const row =
                document.createElement("tr");


            const ph =
                data.ph !== undefined
                    ? toNumber(data.ph)
                    : "-";

            const ammonia =
                data.ammonia !== undefined
                    ? toNumber(data.ammonia)
                    : "-";


            // 이상 여부
            const phIsAbnormal =
                ph !== "-" &&
                (ph < 6.0 || ph > 9.0);

            const nh3IsAbnormal =
                ammonia !== "-" &&
                ammonia >= 1.0;


            // 상태 문구
            let statusText = "정상";
            let statusClass =
                "sensor-status-normal";


            if (phIsAbnormal && nh3IsAbnormal) {

                statusText =
                    "pH / NH₃ 이상";

                statusClass =
                    "sensor-status-abnormal";

            } else if (phIsAbnormal) {

                statusText =
                    "pH 이상";

                statusClass =
                    "sensor-status-abnormal";

            } else if (nh3IsAbnormal) {

                statusText =
                    "NH₃ 이상";

                statusClass =
                    "sensor-status-abnormal";
            }


            row.innerHTML = `
                <td>${escapeHTML(formatTime(data))}</td>

                <td>
                    ${escapeHTML(ph)}
                </td>

                <td>
                    ${escapeHTML(ammonia)}
                </td>

                <td>
                    <span class="${statusClass}">
                        ${statusText}
                    </span>
                </td>
            `;


            tableBody.appendChild(row);
    });

    renderSensorPagination(
        totalPages
    );
}


function renderSensorPagination(totalPages) {

    const container =
        document.getElementById(
            "sensorPagination"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";


    // 이전
    const prevButton =
        document.createElement("button");

    prevButton.textContent = "이전";

    prevButton.disabled =
        sensorCurrentPage === 1;

    prevButton.addEventListener(
        "click",
        () => {

            if (sensorCurrentPage > 1) {

                sensorCurrentPage--;

                updateSensorManageTable(
                    filteredSensorData
                );
            }
        }
    );

    container.appendChild(prevButton);


    // 페이지 번호
    for (
        let page = 1;
        page <= totalPages;
        page++
    ) {

        const pageButton =
            document.createElement("button");

        pageButton.textContent = page;

        if (page === sensorCurrentPage) {

            pageButton.classList.add(
                "active"
            );
        }


        pageButton.addEventListener(
            "click",
            () => {

                sensorCurrentPage = page;

                updateSensorManageTable(
                    filteredSensorData
                );
            }
        );


        container.appendChild(
            pageButton
        );
    }


    // 다음
    const nextButton =
        document.createElement("button");

    nextButton.textContent = "다음";

    nextButton.disabled =
        sensorCurrentPage === totalPages;


    nextButton.addEventListener(
        "click",
        () => {

            if (
                sensorCurrentPage <
                totalPages
            ) {

                sensorCurrentPage++;

                updateSensorManageTable(
                    filteredSensorData
                );
            }
        }
    );


    container.appendChild(nextButton);
}

// ========================================
// 관리자 - 센서 데이터 기간별 그래프
// ========================================

function updateSensorManageChart(dataList) {

    const canvas =
        document.getElementById("sensorManageChart");

    if (!canvas) {
        return;
    }


    // 기존 그래프 삭제
    if (sensorManageChart) {
        sensorManageChart.destroy();
    }


    // 데이터가 없으면 빈 그래프
    if (!dataList || dataList.length === 0) {

        sensorManageChart =
            new Chart(canvas, {

                type: "line",

                data: {
                    labels: [],
                    datasets: []
                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });

        return;
    }


    // 시간순 정렬
    const sortedData =
        [...dataList].sort(
            (a, b) =>
                getTimestamp(a) -
                getTimestamp(b)
        );


    sensorManageChart =
        new Chart(canvas, {

            type: "line",

            data: {

                labels:
                    sortedData.map(data =>
                        formatTime(data)
                    ),

                datasets: [

                    // =====================
                    // pH
                    // =====================
                    {
                        label: "pH",

                        data:
                            sortedData.map(data =>
                                toNumber(data.ph)
                            ),

                        borderColor: "#4A90E2",

                        backgroundColor:
                            "rgba(74, 144, 226, 0.1)",

                        borderWidth: 2,

                        tension: 0.3,

                        pointRadius: 2,

                        yAxisID: "yPh"
                    },


                    // =====================
                    // NH3
                    // =====================
                    {
                        label: "NH₃",

                        data:
                            sortedData.map(data =>
                                toNumber(data.ammonia)
                            ),

                        borderColor: "#FF6B6B",

                        backgroundColor:
                            "rgba(255, 107, 107, 0.1)",

                        borderWidth: 2,

                        tension: 0.3,

                        pointRadius: 2,

                        yAxisID: "yNh3"
                    }
                ]
            },


            options: {

                responsive: true,

                maintainAspectRatio: false,

                interaction: {
                    mode: "index",
                    intersect: false
                },

                scales: {

                    // pH 왼쪽 축
                    yPh: {

                        type: "linear",

                        position: "left",

                        title: {
                            display: true,
                            text: "pH"
                        }
                    },


                    // NH3 오른쪽 축
                    yNh3: {

                        type: "linear",

                        position: "right",

                        title: {
                            display: true,
                            text: "NH₃"
                        },

                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });
}

// ========================================
// 오염도 변화 그래프
// ========================================

function updatePollutionChart(dataList) {

    const canvas =
        document.getElementById("pollutionChart");

    if (!canvas) {

        return;
    }

    // 기존 그래프가 있으면 삭제
    if (pollutionChart) {

        pollutionChart.destroy();
    }

    pollutionChart = new Chart(canvas, {

        type: "line",

        data: {

            labels: dataList.map(data =>
    formatTime(data)
),

            datasets: [{

                label: "오염도",

                data: dataList.map(data =>
                    calculatePollution(data)
                ),

                borderColor: "#4A90E2",

                backgroundColor:
                    "rgba(74, 144, 226, 0.15)",

                fill: true,

                tension: 0.35,

                borderWidth: 3,

                pointRadius: 5,

                pointHoverRadius: 7
            }]
        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            scales: {

                y: {

                    beginAtZero: true,

                    max: 100,

                    ticks: {

                        stepSize: 20
                    }
                }
            },

            plugins: {

                legend: {

                    display: false
                },

                tooltip: {

                    callbacks: {

                        label(context) {

                            return `오염도: ${context.raw}점`;
                        }
                    }
                }
            }
        }
    });
}


// ========================================
// 쓰레기 종류 비율 그래프
// ========================================

function updateTrashChart(dataList) {

    const canvas =
        document.getElementById("trashChart");

    if (!canvas) {

        return;
    }

    const totalPlastic =
        dataList.reduce(
            (sum, data) =>
                sum + toNumber(data.plastic),
            0
        );

    const totalMetal =
    dataList.reduce(
        (sum, data) =>
            sum + toNumber(data.metal),
        0
    );

    const totalPaper =
        dataList.reduce(
            (sum, data) =>
                sum + toNumber(data.paper),
            0
        );

    const totalGlass =
    dataList.reduce(
        (sum, data) =>
            sum + toNumber(data.glass),
        0
    );

const totalOther =
    dataList.reduce(
        (sum, data) =>
            sum + toNumber(data.other),
        0
    );


    // 기존 그래프가 있으면 삭제
    if (trashChart) {

        trashChart.destroy();
    }

    trashChart = new Chart(canvas, {

        type: "doughnut",

        data: {

            labels: [
    "플라스틱",
    "금속",
    "종이",
    "유리",
    "기타"
],

            datasets: [{

               data: [
    totalPlastic,
    totalMetal,
    totalPaper,
    totalGlass,
    totalOther
],

                backgroundColor: [
    "#4A90E2",
    "#7EC8E3",
    "#A5D8FF",
    "#90CAF9",
    "#B0BEC5"
],

                borderWidth: 0
            }]
        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            cutout: "60%",

            plugins: {

                legend: {

                    position: "bottom"
                }
            }
        }
    });
}


function updateAdminStatus() {

    // =========================
    // 카메라 최근 탐지
    // =========================

    const cameraStatus =
        document.getElementById("cameraStatus");

    const cameraLastSeen =
        document.getElementById("cameraLastSeen");


    if (riverData.length > 0) {

        const latestRiver =
            riverData[riverData.length - 1];

        if (cameraStatus) {
            cameraStatus.textContent = "연결됨";
        }

        if (cameraLastSeen) {
            cameraLastSeen.textContent =
                `최근 탐지: ${formatTime(latestRiver)}`;
        }

    } else {

        if (cameraStatus) {
            cameraStatus.textContent = "데이터 없음";
        }

        if (cameraLastSeen) {
            cameraLastSeen.textContent = "-";
        }
    }


    // =========================
    // 센서 최근 수신
    // =========================

    const sensorStatus =
        document.getElementById("sensorStatus");

    const sensorLastSeen =
        document.getElementById("sensorLastSeen");


    if (sensorData.length > 0) {

        const latestSensor =
            sensorData[sensorData.length - 1];

        if (sensorStatus) {
            sensorStatus.textContent = "연결됨";
        }

        if (sensorLastSeen) {
            sensorLastSeen.textContent =
                `최근 수신: ${formatTime(latestSensor)}`;
        }

    } else {

        if (sensorStatus) {
            sensorStatus.textContent = "데이터 없음";
        }

        if (sensorLastSeen) {
            sensorLastSeen.textContent = "-";
        }
    }


    // =========================
    // 오늘 탐지된 쓰레기
    // =========================

    const today = new Date();

    const todayRiverData =
        riverData.filter(data => {

            const timestamp =
                getTimestamp(data);

            if (!timestamp) {
                return false;
            }

            const date =
                new Date(timestamp);

            return (
                date.getFullYear() === today.getFullYear() &&
                date.getMonth() === today.getMonth() &&
                date.getDate() === today.getDate()
            );
        });


    const todayTrash =
        todayRiverData.reduce((sum, data) => {

            return sum +
                toNumber(data.plastic) +
                toNumber(data.metal) +
                toNumber(data.paper) +
                toNumber(data.glass) +
                toNumber(data.other);

        }, 0);


    const todayTrashCount =
        document.getElementById("todayTrashCount");

    if (todayTrashCount) {
        todayTrashCount.textContent =
            `${todayTrash}개`;
    }


    // =========================
    // 최근 오염도
    // =========================

    const todayPollution =
        document.getElementById("todayPollution");


    if (
        todayPollution &&
        riverData.length > 0
    ) {

        const latestRiver =
            riverData[riverData.length - 1];

        const latestSensor =
            sensorData.length > 0
                ? sensorData[sensorData.length - 1]
                : {};

        const merged = {
            ...latestRiver,
            ph: latestSensor.ph,
            ammonia: latestSensor.ammonia
        };

        const score =
            calculatePollution(merged);

        todayPollution.textContent =
            `현재 오염도 ${score}점`;
    }
}


// ========================================
// 전체 화면 업데이트
// ========================================

function updateDashboard(dataList) {

    if (!Array.isArray(dataList)) {

        console.error(
            "Firestore 데이터 형식이 배열이 아닙니다.",
            dataList
        );

        return;
    }


    if (dataList.length === 0) {

        showEmptyState();

        return;
    }


    // riverData 시간순 정렬
    riverData = sortRiverData(dataList);


    // 가장 최근 카메라 탐지 데이터
    const latestRiver =
        riverData[riverData.length - 1];


    // 가장 최근 센서 데이터
    const latestSensor =
        sensorData.length > 0
            ? sensorData[sensorData.length - 1]
            : {};


    // 카메라 데이터 + 센서 데이터 합치기
    const latest = {

        ...latestRiver,

        ph: latestSensor.ph,

        ammonia: latestSensor.ammonia,

        timestamp:
            latestSensor.timestamp ??
            latestRiver.timestamp
    };


    console.log(
        "최종 최신 데이터:",
        latest
    );


    // 상단 카드
    updateCards(latest);


    // 최근 탐지 기록
    updateTable(riverData);


    // 오염도 그래프
    updatePollutionChart(riverData);


    // 쓰레기 종류 그래프
    updateTrashChart(riverData);


    // 관리자 탐지 기록
    updateDetectionManageTable(riverData);


    // 관리자 시스템 현황
    updateAdminStatus();


    console.log(
        "대시보드 데이터 업데이트 완료:",
        riverData
    );
}

// ========================================
// 데이터가 없을 때 화면 처리
// ========================================

function showEmptyState() {

    document.getElementById(
        "pollutionValue"
    ).textContent = "-";

    document.getElementById(
        "phValue"
    ).textContent = "-";

    document.getElementById(
        "ammoniaValue"
    ).textContent = "-";

    document.getElementById(
        "timeValue"
    ).textContent = "-";

    document.getElementById(
        "adminPollution"
    ).textContent = "-";

    document.getElementById(
        "adminPh"
    ).textContent = "-";

    document.getElementById(
        "adminAmmonia"
    ).textContent = "-";

    document.getElementById(
        "adminTime"
    ).textContent = "-";

    const tableBody =
        document.getElementById("tableBody");

    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9">
                    저장된 측정 데이터가 없습니다.
                </td>
            </tr>
        `;
    }
}


function downloadCSV() {

    if (riverData.length === 0) {

        alert("다운로드할 데이터가 없습니다.");

        return;
    }

    const header = [
        "시간",
        "위치",
        "플라스틱",
        "금속",
        "종이",
        "pH",
        "암모니아",
        "오염도"
    ];

    const rows = riverData.map(data => [

        formatTime(data),

        data.location ?? "",

        toNumber(data.plastic),

        toNumber(data.metal),

        toNumber(data.paper),

        data.ph ?? "",

        data.ammonia ?? "",

        calculatePollution(data)
    ]);

    const csvContent = [

        header.map(escapeCSV).join(","),

        ...rows.map(row =>
            row.map(escapeCSV).join(",")
        )

    ].join("\n");

    // UTF-8 BOM을 넣어 Excel 한글 깨짐 방지
    const blob = new Blob(

        ["\uFEFF" + csvContent],

        {
            type:
                "text/csv;charset=utf-8;"
        }
    );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;

    link.download =
        `riverData_${new Date()
            .toISOString()
            .slice(0, 10)}.csv`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
}


const downloadCSVButton =
    document.getElementById("downloadCSV");

if (downloadCSVButton) {

    downloadCSVButton.addEventListener(
        "click",
        downloadCSV
    );
}


// ========================================
// Firestore 실시간 데이터 구독
// ========================================

subscribeRiverData(dataList => {

    riverData = sortRiverData(dataList);

    updateDashboard(riverData);

    updatePollutionMap(riverData);

    // 관리자 오염도 경고 업데이트
    updatePollutionAlert(riverData);

    // 카메라 연결 상태 확인
    updateCameraAlert(riverData);

    // 카메라 장치 정보 업데이트
    updateCameraDevice(riverData);

});

subscribeSensorData(dataList => {

    sensorData = sortRiverData(dataList);
    filteredSensorData = [...sensorData];

    console.log(
        "센서 데이터 업데이트:",
        sensorData
    );

    // 센서 관리 테이블 업데이트
    updateSensorManageTable(sensorData);
    // 센서 관리 그래프 업데이트
    updateSensorManageChart(sensorData);

    if (riverData.length > 0) {
        updateDashboard(riverData);
    }
    // 센서 연결 상태 확인
    updateSensorAlert(dataList);

    // 센서 장치 정보 업데이트
    updateSensorDevice(dataList);
});

// ========================================
// 로그인 시스템
// ========================================

const loginPage =
    document.getElementById("loginPage");

const dashboardPage =
    document.getElementById("dashboardPage");

const loginButton =
    document.getElementById("loginButton");

const logoutButton =
    document.getElementById("logoutButton");

const loginEmail =
    document.getElementById("loginEmail");

const loginPassword =
    document.getElementById("loginPassword");

const loginMessage =
    document.getElementById("loginMessage");


// 로그인 버튼
if (loginButton) {

    loginButton.addEventListener(
        "click",

        async () => {

            const email =
                loginEmail.value.trim();

            const password =
                loginPassword.value;

            if (!email || !password) {

                loginMessage.textContent =
                    "이메일과 비밀번호를 입력하세요.";

                return;
            }

            try {

                await loginUser(
                    email,
                    password
                );

                loginMessage.textContent = "";

            }
            catch (error) {

                console.error(
                    "로그인 오류:",
                    error
                );

                loginMessage.textContent =
                    "이메일 또는 비밀번호를 확인하세요.";
            }
        }
    );
}


// 로그아웃 버튼
if (logoutButton) {

    logoutButton.addEventListener(
        "click",

        async (event) => {

            event.preventDefault();

            try {

                await logoutUser();

            }
            catch (error) {

                console.error(
                    "로그아웃 오류:",
                    error
                );
            }
        }
    );
}


// ========================================
// 로그인 상태 확인
// ========================================

observeAuth(async user => {

    const adminMenu =
        document.getElementById("adminMenu");

    const adminSection =
        document.querySelector(".admin-section");

    // =====================================
    // 1. 로그인하지 않은 일반 사용자
    // =====================================
    if (!user) {

        console.log("비로그인 일반 사용자");
        // 로그인 메뉴 표시
        if (loginMenu) {
            loginMenu.style.display = "block";
        }

        // 일반 대시보드 표시
        if (dashboardPage) {
            dashboardPage.style.display = "flex";
        }

        // 지도 크기 다시 계산
        setTimeout(() => {
            if (pollutionMap) {
                pollutionMap.invalidateSize();
            }
        }, 200);

        // 로그인 화면 숨김
        if (loginPage) {
            loginPage.style.display = "none";
        }

        // 관리자 메뉴 숨김
        if (adminMenu) {
            adminMenu.style.display = "none";
        }

        // 탐지 기록 관리 메뉴 숨김
        if (detectionManageMenu) {
            detectionManageMenu.style.display = "none";
        }

        // 센서 데이터 관리 메뉴 숨김
        if (sensorManageMenu) {
            sensorManageMenu.style.display = "none";
        }

        // 관리자 페이지 숨김
        if (adminSection) {
            adminSection.style.display = "none";
        }

        // 로그아웃 버튼 숨김
        if (logoutButton) {
            logoutButton.style.display = "none";
        }

        return;
    }


    // =====================================
    // 2. 로그인한 사용자
    // =====================================

    console.log("로그인 사용자:", user.email);

    // 로그인 상태에서는 로그인 메뉴 숨김
    if (loginMenu) {
        loginMenu.style.display = "none";
    }

    // 로그인 화면 숨기기
    if (loginPage) {
        loginPage.style.display = "none";
    }

    // 대시보드 표시
    if (dashboardPage) {
        dashboardPage.style.display = "flex";
    }

    // 지도 크기 다시 계산
    setTimeout(() => {
        if (pollutionMap) {
            pollutionMap.invalidateSize();
        }
    }, 200);

    // 관리자 여부 확인
    const isAdmin = await checkAdmin(user.uid);

    console.log("현재 UID:", user.uid);
    console.log("관리자 여부:", isAdmin);


    // =====================================
    // 3. 관리자
    // =====================================
    if (isAdmin) {

        console.log("관리자 계정");

        // 관리자 메뉴 표시
        if (adminMenu) {
            adminMenu.style.display = "block";
        }

        if (detectionManageMenu) {
            detectionManageMenu.style.display = "block";
        }

        if (sensorManageMenu) {
            sensorManageMenu.style.display = "block";
        }

        // 로그아웃 버튼 표시
        if (logoutButton) {
            logoutButton.style.display = "block";
        }

    }

    // =====================================
    // 4. 로그인했지만 관리자가 아님
    // =====================================
    else {

        console.log("일반 사용자 계정");

        if (adminMenu) {
            adminMenu.style.display = "none";
        }

        if (adminSection) {
            adminSection.style.display = "none";
        }

        if (logoutButton) {
            logoutButton.style.display = "block";
        }
    }
});

// ========================================
// 관리자 로그인 화면 열기
// ========================================

const loginMenu = document.getElementById("loginMenu");

if (loginMenu) {

    loginMenu.addEventListener("click", (event) => {

        event.preventDefault();

        // 대시보드 숨기기
        if (dashboardPage) {
            dashboardPage.style.display = "none";
        }

        // 로그인 화면 표시
        if (loginPage) {
            loginPage.style.display = "flex";
        }

    });
}

// ========================================
// 관리자 페이지 전환
// ========================================

const adminMenu =
    document.getElementById("adminMenu");

const adminSection =
    document.querySelector(".admin-section");

const cardsSection =
    document.querySelector(".cards");

const chartsSection =
    document.querySelector(".charts");

const tableSection =
    document.querySelector(".table-section");

const pollutionMapSection =
    document.querySelector(".pollution-map-section");

if (adminMenu) {
    adminMenu.addEventListener("click", (event) => {
        event.preventDefault();

        // 메뉴 선택 표시 변경
        document.querySelectorAll(".sidebar nav a").forEach(menu => {
            menu.classList.remove("active");
        });

        adminMenu.classList.add("active");

        if (cardsSection) {
            cardsSection.style.display = "none";
        }

        if (chartsSection) {
            chartsSection.style.display = "none";
        }

        if (tableSection) {
            tableSection.style.display = "none";
        }

        if (pollutionMapSection) {
            pollutionMapSection.style.display = "none";
        }

        // 탐지 기록 관리 화면 숨기기
        if (detectionManageSection) {
            detectionManageSection.style.display = "none";
        }

        // 센서 데이터 관리 화면 숨기기
        if (sensorManageSection) {
        sensorManageSection.style.display = "none";
        }

        // 관리자 화면 보이기
        if (adminSection) {
            adminSection.style.display = "block";
        }
    });
}

// ========================================
// 탐지 기록 관리 페이지 전환
// ========================================

const detectionManageMenu =
    document.getElementById("detectionManageMenu");

const detectionManageSection =
    document.querySelector(".detection-manage-section");

const sensorManageMenu =
    document.getElementById("sensorManageMenu");

const sensorManageSection =
    document.querySelector(".sensor-manage-section");


if (detectionManageMenu) {

    detectionManageMenu.addEventListener(
        "click",
        (event) => {

            event.preventDefault();
            // 메뉴 선택 표시 변경
            document.querySelectorAll(".sidebar nav a").forEach(menu => {
                menu.classList.remove("active");
            });

            detectionManageMenu.classList.add("active");


            // 일반 대시보드 숨기기
            if (cardsSection) {
                cardsSection.style.display = "none";
            }

            if (chartsSection) {
                chartsSection.style.display = "none";
            }

            if (tableSection) {
                tableSection.style.display = "none";
            }

            if (pollutionMapSection) {
                pollutionMapSection.style.display = "none";
            }


            // 관리자 페이지 숨기기
            if (adminSection) {
                adminSection.style.display = "none";
            }

            // 센서 데이터 관리 화면 숨기기
            if (sensorManageSection) {
                sensorManageSection.style.display = "none";
            }


            // 탐지 기록 관리 표시
            if (detectionManageSection) {
                detectionManageSection.style.display = "block";
            }


            // 현재 데이터로 테이블 업데이트
            updateDetectionManageTable(riverData);
        }
    );
}

// ========================================
// 센서 데이터 관리 페이지 전환
// ========================================

if (sensorManageMenu) {

    sensorManageMenu.addEventListener("click", (event) => {

        event.preventDefault();

        // 메뉴 선택 표시 변경
        document.querySelectorAll(".sidebar nav a").forEach(menu => {
            menu.classList.remove("active");
        });

        sensorManageMenu.classList.add("active");

        // 일반 대시보드 숨기기
        if (cardsSection) {
            cardsSection.style.display = "none";
        }

        if (chartsSection) {
            chartsSection.style.display = "none";
        }

        if (tableSection) {
            tableSection.style.display = "none";
        }

        if (pollutionMapSection) {
            pollutionMapSection.style.display = "none";
        }

        // 관리자 페이지 숨기기
        if (adminSection) {
            adminSection.style.display = "none";
        }

        // 탐지 기록 관리 숨기기
        if (detectionManageSection) {
            detectionManageSection.style.display = "none";
        }

        // 센서 데이터 관리 표시
        if (sensorManageSection) {
            sensorManageSection.style.display = "block";
        }
    });
}

// ========================================
// 센서 데이터 기간 필터
// ========================================

const sensorFilterButtons =
    document.querySelectorAll(".sensor-filter-btn");

sensorFilterButtons.forEach(button => {

    button.addEventListener("click", () => {

        // 선택된 버튼 표시
        sensorFilterButtons.forEach(btn => {
            btn.classList.remove("active");
        });

        button.classList.add("active");


        // 선택 기간
        const period =
            button.dataset.period;

        const now =
            new Date();

        let filteredData = [];


        // =====================================
        // 전체
        // =====================================
        if (period === "all") {

            filteredData =
                [...sensorData];
        }


        // =====================================
        // 오늘
        // =====================================
        else if (period === "today") {

            filteredData =
                sensorData.filter(data => {

                    const timestamp =
                        getTimestamp(data);

                    if (!timestamp) {
                        return false;
                    }

                    const date =
                        new Date(timestamp);

                    return (
                        date.getFullYear() === now.getFullYear() &&
                        date.getMonth() === now.getMonth() &&
                        date.getDate() === now.getDate()
                    );
                });
        }


        // =====================================
        // 최근 7일 / 최근 30일
        // =====================================
        else {

            const days =
                Number(period);

            const startTime =
                now.getTime() -
                (days * 24 * 60 * 60 * 1000);

            filteredData =
                sensorData.filter(data => {

                    const timestamp =
                        getTimestamp(data);

                    return (
                        timestamp &&
                        timestamp >= startTime &&
                        timestamp <= now.getTime()
                    );
                });
        }


        console.log(
            `센서 기간 필터 (${period}):`,
            filteredData
        );


        sensorCurrentPage = 1;

        filteredSensorData = [
            ...filteredData
        ];

        updateSensorManageTable(
            filteredSensorData
        );

        updateSensorManageChart(
            filteredSensorData
        );

    });
});

// ========================================
// 대시보드 페이지 전환
// ========================================

const dashboardMenu =
    document.getElementById("dashboardMenu");

if (dashboardMenu) {
    dashboardMenu.addEventListener("click", (event) => {
        event.preventDefault();

        document.querySelectorAll(".sidebar nav a").forEach(menu => {
            menu.classList.remove("active");    
        });

        dashboardMenu.classList.add("active");

        // 청주시 하천 오염도 지도 표시
        if (pollutionMapSection) {
            pollutionMapSection.style.display = "block";
        }

        // 숨겨져 있던 지도 크기 다시 계산
        setTimeout(() => {
            if (pollutionMap) {
                pollutionMap.invalidateSize();
            }
        }, 200);

        // 관리자 화면 숨기기
        if (adminSection) {
            adminSection.style.display = "none";
        }

        // 탐지 기록 관리 화면 숨기기
        if (detectionManageSection) {
            detectionManageSection.style.display = "none";
        }

        // 센서 데이터 관리 화면 숨기기
        if (sensorManageSection) {
        sensorManageSection.style.display = "none";
        }

        // 일반 대시보드 보이기
        if (cardsSection) {
            cardsSection.style.display = "";
        }

        if (chartsSection) {
            chartsSection.style.display = "";
        }

        if (tableSection) {
            tableSection.style.display = "";
        }
    });
}

// ========================================
// 담당자 배정
// ========================================

const assignButtons =
    document.querySelectorAll(".assign-btn");


assignButtons.forEach(button => {

    button.addEventListener("click", async () => {

        const zone =
            button.dataset.zone;

        const select =
            document.getElementById(
                `managerSelect${zone}`
            );

        const manager =
            select.value;


        if (!manager) {

            alert("담당자를 선택하세요.");

            return;
        }


        try {

            await assignManager(
                zone,
                manager
            );

            const managerText =
                document.getElementById(
                    `manager${zone}`
                );

            if (managerText) {
                managerText.textContent = manager;
            }

            alert(
                `충북대 ${zone} 담당자가 ${manager}(으)로 배정되었습니다.`
            );

        }
        catch (error) {

            console.error(
                "담당자 배정 오류:",
                error
            );

            alert("담당자 배정에 실패했습니다.");
        }
    });
});

// ========================================
// 기존 담당자 배정 불러오기
// ========================================

async function loadManagerAssignments() {

    try {

        const assignments =
            await getManagerAssignments();


        ["A", "B", "C"].forEach(zone => {

            const data =
                assignments[zone];

            if (!data) {
                return;
            }


            const managerText =
                document.getElementById(
                    `manager${zone}`
                );

            const managerSelect =
                document.getElementById(
                    `managerSelect${zone}`
                );


            if (managerText) {

                managerText.textContent =
                    data.manager || "미배정";
            }


            if (
                managerSelect &&
                data.manager
            ) {

                managerSelect.value =
                    data.manager;
            }

        });

    }
    catch (error) {

        console.error(
            "담당자 정보 불러오기 오류:",
            error
        );
    }
}

// ========================================
// 탐지 기록 수정 팝업
// ========================================

const detectionEditModal =
    document.getElementById("detectionEditModal");

const editDetectionId =
    document.getElementById("editDetectionId");

const editPlastic =
    document.getElementById("editPlastic");

const editMetal =
    document.getElementById("editMetal");

const editPaper =
    document.getElementById("editPaper");

const editGlass =
    document.getElementById("editGlass");

const editOther =
    document.getElementById("editOther");

const editTotalCount =
    document.getElementById("editTotalCount");

const editTrashScore =
    document.getElementById("editTrashScore");

const cancelDetectionEdit =
    document.getElementById("cancelDetectionEdit");

const saveDetectionEdit =
    document.getElementById("saveDetectionEdit");


// ========================================
// 수정값 계산
// ========================================

function calculateEditValues() {

    const plastic =
        Math.max(0, Number(editPlastic.value) || 0);

    const metal =
        Math.max(0, Number(editMetal.value) || 0);

    const paper =
        Math.max(0, Number(editPaper.value) || 0);

    const glass =
        Math.max(0, Number(editGlass.value) || 0);

    const other =
        Math.max(0, Number(editOther.value) || 0);


    // 전체 개수
    const totalCount =
        plastic +
        metal +
        paper +
        glass +
        other;


    // 오염 점수
    const trashScore =
        (paper * 1) +
        (metal * 4) +
        (plastic * 6) +
        (other * 6) +
        (glass * 10);


    editTotalCount.textContent =
        totalCount;

    editTrashScore.textContent =
        trashScore;


    return {
        plastic,
        metal,
        paper,
        glass,
        other,
        totalCount,
        trashScore
    };
}

// ========================================
// 탐지 기록 수정 버튼 클릭
// ========================================

document.addEventListener("click", (event) => {

    const editButton =
        event.target.closest(".edit-detection-btn");

    if (!editButton) {
        return;
    }

    const id = editButton.dataset.id;

    console.log("수정 버튼 클릭됨");
    console.log("수정 문서 ID:", id);

    const record =
        riverData.find(item => item.id === id);

    if (!record) {
        alert("수정할 탐지 기록을 찾을 수 없습니다.");
        return;
    }

    // 클릭하는 시점에 HTML 요소 다시 가져오기
    const modal =
        document.getElementById("detectionEditModal");

    const idInput =
        document.getElementById("editDetectionId");

    const plasticInput =
        document.getElementById("editPlastic");

    const metalInput =
        document.getElementById("editMetal");

    const paperInput =
        document.getElementById("editPaper");

    const glassInput =
        document.getElementById("editGlass");

    const otherInput =
        document.getElementById("editOther");

    const totalText =
        document.getElementById("editTotalCount");

    const scoreText =
        document.getElementById("editTrashScore");

    if (
        !modal ||
        !idInput ||
        !plasticInput ||
        !metalInput ||
        !paperInput ||
        !glassInput ||
        !otherInput ||
        !totalText ||
        !scoreText
    ) {
        alert("수정 팝업 요소를 찾을 수 없습니다.");
        return;
    }

    // 기존 데이터 입력
    idInput.value = record.id;

    plasticInput.value = toNumber(record.plastic);
    metalInput.value = toNumber(record.metal);
    paperInput.value = toNumber(record.paper);
    glassInput.value = toNumber(record.glass);
    otherInput.value = toNumber(record.other);

    // 총 개수
    const total =
        toNumber(record.plastic) +
        toNumber(record.metal) +
        toNumber(record.paper) +
        toNumber(record.glass) +
        toNumber(record.other);

    // 쓰레기 점수
    const score =
        toNumber(record.paper) * 1 +
        toNumber(record.metal) * 4 +
        toNumber(record.plastic) * 6 +
        toNumber(record.other) * 6 +
        toNumber(record.glass) * 10;

    totalText.textContent = total;
    scoreText.textContent = score;

    // 팝업 열기
    modal.style.display = "flex";

    console.log("수정 팝업 열기 성공");
});

// ========================================
// 입력값 변경 → 점수 실시간 계산
// ========================================
[
    editPlastic,
    editMetal,
    editPaper,
    editGlass,
    editOther

].forEach(input => {

    if (input) {

        input.addEventListener(
            "input",
            calculateEditValues
        );

    }

});

// ========================================
// 취소 버튼
// ========================================

if (cancelDetectionEdit) {

    cancelDetectionEdit.addEventListener(
        "click",
        () => {

            if (detectionEditModal) {
                detectionEditModal.style.display =
                    "none";
            }

        }
    );

}


// ========================================
// 팝업 바깥 클릭 → 닫기
// ========================================

if (detectionEditModal) {

    detectionEditModal.addEventListener(
        "click",
        (event) => {

            if (event.target === detectionEditModal) {

                detectionEditModal.style.display =
                    "none";

            }
        }
    );

}


// ========================================
// 저장 버튼
// ========================================
if (saveDetectionEdit) {
saveDetectionEdit.addEventListener(
    "click",
    async () => {

        const id =
            editDetectionId.value;


        if (!id) {

            alert(
                "수정할 기록을 찾을 수 없습니다."
            );

            return;
        }


        // 정수 검사
        const inputs = [
            editPlastic,
            editMetal,
            editPaper,
            editGlass,
            editOther
        ];


        const invalid =
            inputs.some(input => {

                const value =
                    Number(input.value);

                return (
                    input.value.trim() === "" ||
                    !Number.isInteger(value) ||
                    value < 0
                );
            });


        if (invalid) {

            alert(
                "쓰레기 개수는 0 이상의 정수로 입력해주세요."
            );

            return;
        }


        const values =
            calculateEditValues();


        try {

            // 중복 클릭 방지
            saveDetectionEdit.disabled =
                true;

            saveDetectionEdit.textContent =
                "저장 중...";


            await updateDetectionRecord(
                id,
                {
                    plastic:
                        values.plastic,

                    metal:
                        values.metal,

                    paper:
                        values.paper,

                    glass:
                        values.glass,

                    other:
                        values.other,

                    total_count:
                        values.totalCount,

                    trash_score:
                        values.trashScore
                }
            );


            // 팝업 닫기
            detectionEditModal.style.display =
                "none";

            alert(
                "탐지 기록이 수정되었습니다."
            );


        } catch (error) {

            console.error(
                "탐지 기록 수정 오류:",
                error
            );

            alert(
                "탐지 기록 수정 중 오류가 발생했습니다."
            );


        } finally {

            saveDetectionEdit.disabled =
                false;

            saveDetectionEdit.textContent =
                "저장";
        }
    }
);
}

// ========================================
// 탐지 기록 삭제
// ========================================

document.addEventListener("click", async (event) => {

    const deleteButton =
        event.target.closest(".delete-detection-btn");

    // 삭제 버튼이 아니면 종료
    if (!deleteButton) {
        return;
    }

    const id = deleteButton.dataset.id;

    console.log("삭제 버튼 클릭됨");
    console.log("삭제할 문서 ID:", id);

    if (!id) {
        alert("삭제할 문서 ID가 없습니다.");
        return;
    }

    const confirmed = confirm(
        "이 탐지 기록을 정말 삭제하시겠습니까?\n\n삭제한 기록은 복구할 수 없습니다."
    );

    if (!confirmed) {
        console.log("삭제 취소");
        return;
    }

    try {

        console.log("Firestore 삭제 시작:", id);

        deleteButton.disabled = true;
        deleteButton.textContent = "삭제 중...";

        await deleteDetectionRecord(id);

        console.log("Firestore 삭제 성공:", id);

        alert("탐지 기록이 삭제되었습니다.");

    } catch (error) {

        console.error("🔥 Firestore 삭제 실패:", error);

        alert(
            "삭제 실패\n\n" +
            (error?.code ?? "") +
            "\n" +
            (error?.message ?? error)
        );

        deleteButton.disabled = false;
        deleteButton.textContent = "삭제";
    }
});

initializePollutionMap();

// ================================
// 모바일 햄버거 메뉴
// ================================

const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileNav = document.querySelector(".sidebar nav");

if (mobileMenuBtn && mobileNav) {

    mobileMenuBtn.addEventListener("click", () => {

        mobileNav.classList.toggle("mobile-open");

        if (mobileNav.classList.contains("mobile-open")) {
            mobileMenuBtn.textContent = "✕ 메뉴 닫기";
        } else {
            mobileMenuBtn.textContent = "☰ 메뉴";
        }
    });

    // 메뉴 선택 후 자동으로 닫기
    mobileNav.querySelectorAll("a").forEach(menu => {

        menu.addEventListener("click", () => {

            if (window.innerWidth <= 768) {
                mobileNav.classList.remove("mobile-open");
                mobileMenuBtn.textContent = "☰ 메뉴";
            }
        });
    });
}