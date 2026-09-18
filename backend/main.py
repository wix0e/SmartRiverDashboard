from pydantic import BaseModel
from fastapi import FastAPI, UploadFile, File
from ultralytics import YOLO

from PIL import Image
import io
import uuid

import firebase_admin
from firebase_admin import credentials, firestore, storage


# =========================================================
# 1. FastAPI 서버 생성
# =========================================================

app = FastAPI()


# =========================================================
# 2. 센서 데이터 형식
# =========================================================

class SensorData(BaseModel):
    ph: float
    ammonia: float


# =========================================================
# 3. YOLO 모델 연결
# =========================================================

model = YOLO("best.pt")


# =========================================================
# 4. Firebase 연결
# =========================================================

cred = credentials.Certificate(
    "smartriverdashboard-firebase-adminsdk-fbsvc-bff2aa6f8c.json"
)

firebase_admin.initialize_app(
    cred,
    {
        "storageBucket": "smartriverdashboard.firebasestorage.app"
    }
)

db = firestore.client()

bucket = storage.bucket()


# =========================================================
# 5. 서버 확인
# =========================================================

@app.get("/")
def home():

    return {
        "message": "Server is running"
    }


# =========================================================
# 6. 센서 데이터 받기
# =========================================================

@app.post("/sensor")
def receive_sensor(data: SensorData):

    # 받은 센서값 출력
    print("pH:", data.ph)
    print("암모니아:", data.ammonia)

    # Firestore sensorData 컬렉션 저장
    db.collection("sensorData").add({

        "ph": data.ph,

        "ammonia": data.ammonia,

        "location": "충북대 A",

        "timestamp": firestore.SERVER_TIMESTAMP
    })

    return {

        "message": "sensor data received",

        "ph": data.ph,

        "ammonia": data.ammonia
    }


# =========================================================
# 7. 사진 받기 + YOLO 탐지
# =========================================================

@app.post("/detect")
async def detect(file: UploadFile = File(...)):

    # -----------------------------------------------------
    # 7-1. 사진 읽기
    # -----------------------------------------------------

    image_bytes = await file.read()

    image = Image.open(
        io.BytesIO(image_bytes)
    ).convert("RGB")


    # -----------------------------------------------------
    # 7-2. Firebase Storage에 원본 사진 저장
    # -----------------------------------------------------

    # 이미지마다 겹치지 않는 고유 ID 생성
    image_id = str(uuid.uuid4())

    # 기본 확장자
    extension = "jpg"

    # 전송된 파일에 확장자가 있으면 사용
    if file.filename and "." in file.filename:

        extension = (
            file.filename
            .rsplit(".", 1)[-1]
            .lower()
        )

    # Firebase Storage 저장 위치
    storage_path = (
        f"detection_images/"
        f"{image_id}.{extension}"
    )

    # Storage 파일 객체 생성
    blob = bucket.blob(storage_path)

    # 이미지 업로드
    blob.upload_from_string(
        image_bytes,
        content_type=file.content_type or "image/jpeg"
    )

    # -----------------------------------------------------
    # 현재 개발 단계에서는 이미지 조회를 위해 공개 URL 사용
    # -----------------------------------------------------

    blob.make_public()

    image_url = blob.public_url


    # -----------------------------------------------------
    # 7-3. YOLO 객체 탐지
    # -----------------------------------------------------

    results = model.predict(
        source=image,
        verbose=False
    )


    # -----------------------------------------------------
    # 7-4. 쓰레기 종류별 개수
    # -----------------------------------------------------

    trash_count = {

        "glass": 0,

        "metal": 0,

        "other": 0,

        "paper": 0,

        "plastic": 0
    }


    # -----------------------------------------------------
    # 7-5. YOLO 탐지 결과 개수 계산
    # -----------------------------------------------------

    for result in results:

        if result.boxes is None:
            continue

        for cls in result.boxes.cls:

            class_id = int(
                cls.item()
            )

            class_name = model.names[
                class_id
            ]

            if class_name in trash_count:

                trash_count[
                    class_name
                ] += 1


    # -----------------------------------------------------
    # 7-6. 쓰레기 종류별 가중치
    # -----------------------------------------------------

    trash_weight = {

        "paper": 1,

        "metal": 4,

        "plastic": 6,

        "other": 6,

        "glass": 10
    }


    # -----------------------------------------------------
    # 7-7. 쓰레기 오염 점수 계산
    #
    # 개수 × 가중치
    # -----------------------------------------------------

    trash_score = sum(

        trash_count[class_name]
        * trash_weight[class_name]

        for class_name in trash_weight
    )


    # -----------------------------------------------------
    # 7-8. 전체 탐지 쓰레기 개수
    # -----------------------------------------------------

    total_count = sum(
        trash_count.values()
    )


    # -----------------------------------------------------
    # 7-9. Firestore 문서 ID 미리 생성
    #
    # 나중에 관리자가 수정/삭제할 때 이 ID를 사용
    # -----------------------------------------------------

    document_reference = (
        db
        .collection("riverData")
        .document()
    )


    # -----------------------------------------------------
    # 7-10. Firestore riverData 저장
    # -----------------------------------------------------

    document_reference.set({

        # 쓰레기 탐지 결과
        "paper":
            trash_count["paper"],

        "metal":
            trash_count["metal"],

        "plastic":
            trash_count["plastic"],

        "glass":
            trash_count["glass"],

        "other":
            trash_count["other"],


        # 위치
        "location":
            "충북대 A",


        # 전체 쓰레기 개수
        "total_count":
            total_count,


        # 쓰레기 오염 점수
        "trash_score":
            trash_score,


        # Firebase Storage 이미지 URL
        "imageUrl":
            image_url,


        # Firebase Storage 실제 저장 위치
        # 나중에 이미지 삭제할 때 사용
        "imagePath":
            storage_path,


        # 측정 시간
        "timestamp":
            firestore.SERVER_TIMESTAMP
    })


    # -----------------------------------------------------
    # 7-11. 서버 콘솔 출력
    # -----------------------------------------------------

    print("=================================")

    print("탐지 완료")

    print("문서 ID:", document_reference.id)

    print("파일:", file.filename)

    print("탐지 결과:", trash_count)

    print("전체 개수:", total_count)

    print("오염 점수:", trash_score)

    print("이미지 경로:", storage_path)

    print("이미지 URL:", image_url)

    print("=================================")


    # -----------------------------------------------------
    # 7-12. 클라이언트에 결과 반환
    # -----------------------------------------------------

    return {

        "id":
            document_reference.id,

        "filename":
            file.filename,

        "counts":
            trash_count,

        "total_count":
            total_count,

        "trash_score":
            trash_score,

        "imageUrl":
            image_url,

        "imagePath":
            storage_path
    }
