// ========================================
// Firebase SDK
// ========================================

import { initializeApp }
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getFirestore,
    collection,
    onSnapshot,
    query,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc
}
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
}
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";


// ========================================
// Firebase 설정
// ========================================

const firebaseConfig = {
    apiKey: "AIzaSyCzjnxqE6jrVgIayQmkuBCiRA_yQ1jB1Iw",
    authDomain: "smartriverdashboard.firebaseapp.com",
    projectId: "smartriverdashboard",
    storageBucket: "smartriverdashboard.firebasestorage.app",
    messagingSenderId: "766494417291",
    appId: "1:766494417291:web:d43f8d1a405c6d6f6a0f8e"
};


// ========================================
// Firebase 초기화
// ========================================

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const auth = getAuth(app);


// ========================================
// Firestore riverData 컬렉션
// ========================================

const riverCollection = collection(
    db,
    "riverData"
);

const sensorCollection = collection(db, "sensorData");


// ========================================
// riverData 실시간 구독
// ========================================

export function subscribeRiverData(callback) {

    const q = query(riverCollection);

    const unsubscribe = onSnapshot(
        q,

        (snapshot) => {

            const dataList = [];

            snapshot.forEach((doc) => {

                dataList.push({
                    id: doc.id,
                    ...doc.data()
                });

            });

            console.log(
                "Firestore riverData:",
                dataList
            );

            callback(dataList);
        },

        (error) => {

            console.error(
                "Firestore 데이터 읽기 오류:",
                error
            );

        }
    );

    return unsubscribe;
}

export function subscribeSensorData(callback) {

    const q = query(sensorCollection);

    const unsubscribe = onSnapshot(
        q,

        (snapshot) => {

            const dataList = [];

            snapshot.forEach((doc) => {

                dataList.push({
                    id: doc.id,
                    ...doc.data()
                });

            });

            console.log(
                "Firestore sensorData:",
                dataList
            );

            callback(dataList);
        },

        (error) => {

            console.error(
                "Firestore sensorData 읽기 오류:",
                error
            );

        }
    );

    return unsubscribe;
}


// ========================================
// 로그인
// ========================================

export function loginUser(email, password) {

    return signInWithEmailAndPassword(
        auth,
        email,
        password
    );
}


// ========================================
// 로그아웃
// ========================================

export function logoutUser() {

    return signOut(auth);
}


// ========================================
// 로그인 상태 확인
// ========================================

export function observeAuth(callback) {

    return onAuthStateChanged(
        auth,
        callback
    );
}

// ========================================
// 관리자 권한 확인
// ========================================

export async function checkAdmin(uid) {

    const adminRef = doc(db, "admins", uid);

    const adminSnap = await getDoc(adminRef);

    return adminSnap.exists();
}

// ========================================
// 담당자 배정 저장
// ========================================

export async function assignManager(zone, manager) {

    const zoneRef =
        doc(db, "zones", zone);

    await setDoc(
        zoneRef,
        {
            name: `충북대 ${zone}`,
            manager: manager
        },
        {
            merge: true
        }
    );
}

// ========================================
// 담당자 배정 정보 불러오기
// ========================================

export async function getManagerAssignments() {

    const zones = ["A", "B", "C"];

    const assignments = {};

    for (const zone of zones) {

        const zoneRef =
            doc(db, "zones", zone);

        const zoneSnap =
            await getDoc(zoneRef);

        if (zoneSnap.exists()) {

            assignments[zone] =
                zoneSnap.data();

        }
    }

    return assignments;
}

// ========================================
// 탐지 기록 수정
// ========================================

export async function updateDetectionRecord(
    id,
    updatedData
) {

    const recordRef =
        doc(db, "riverData", id);

    await updateDoc(
        recordRef,
        updatedData
    );
}

// ========================================
// 탐지 기록 삭제
// ========================================

export async function deleteDetectionRecord(id) {

    const recordRef =
        doc(db, "riverData", id);

    await deleteDoc(recordRef);
}