from collections import Counter
from pathlib import Path

from ultralytics import YOLO


def main() -> None:
    model_path = Path(
        r"C:\CST\runs\detect\trash_yolov8s_soju_added\weights\best.pt"
    )

    # 분석할 사진 한 장의 실제 경로
    image_path = Path(
        r"C:\CST\capstons_dataset\test\images\000097_jpg.rf.38affa06ed7ef623f1281e1fc49baf55.jpg"
    )

    output_dir = Path(
        r"C:\CST\prediction_results"
    )

    if not model_path.exists():
        raise FileNotFoundError(f"모델 파일이 없습니다: {model_path}")

    if not image_path.exists():
        raise FileNotFoundError(f"이미지 파일이 없습니다: {image_path}")

    model = YOLO(str(model_path))

    results = model.predict(
        source=str(image_path),
        conf=0.25,
        imgsz=640,
        save=True,
        project=str(output_dir),
        name="result",
        exist_ok=True,
        verbose=True,
    )

    class_counts = Counter()

    for result in results:
        if result.boxes is None:
            continue

        for class_id in result.boxes.cls.tolist():
            class_name = model.names[int(class_id)]
            class_counts[class_name] += 1

    all_classes = ["glass", "metal", "other", "paper", "plastic"]

    print("\n========== 탐지 결과 ==========")

    total_count = 0

    for class_name in all_classes:
        count = class_counts.get(class_name, 0)
        total_count += count
        print(f"{class_name:8}: {count}개")

    print("-------------------------------")
    print(f"총 쓰레기 : {total_count}개")
    print("===============================")

    if results:
        print(f"바운딩박스 이미지 저장 위치: {results[0].save_dir}")


if __name__ == "__main__":
    main()