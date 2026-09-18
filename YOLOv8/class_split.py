from pathlib import Path
import shutil

# ==========================
# 설정
# ==========================

DATASET_ROOT = Path(r"C:\CST\capstons_dataset_modi_modi_modi")

OUTPUT_ROOT = Path(r"C:\CST\class_dataset")

CLASS_NAMES = {
    0: "glass",
    1: "metal",
    2: "other",
    3: "paper",
    4: "plastic"
}

IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".bmp", ".webp"]

SPLITS = ["train", "valid", "test"]

# ==========================
# 폴더 생성
# ==========================

for class_name in CLASS_NAMES.values():
    for split in SPLITS:
        (OUTPUT_ROOT / class_name / split / "images").mkdir(parents=True, exist_ok=True)
        (OUTPUT_ROOT / class_name / split / "labels").mkdir(parents=True, exist_ok=True)

# ==========================
# 복사
# ==========================

for split in SPLITS:

    label_dir = DATASET_ROOT / split / "labels"
    image_dir = DATASET_ROOT / split / "images"

    for label_path in label_dir.glob("*.txt"):

        try:
            lines = label_path.read_text(encoding="utf-8").splitlines()
        except:
            continue

        classes_in_image = set()

        for line in lines:
            if not line.strip():
                continue

            class_id = int(line.split()[0])

            if class_id in CLASS_NAMES:
                classes_in_image.add(class_id)

        if not classes_in_image:
            continue

        # 이미지 찾기
        image_path = None

        for ext in IMAGE_EXTENSIONS:
            candidate = image_dir / (label_path.stem + ext)
            if candidate.exists():
                image_path = candidate
                break

        if image_path is None:
            continue

        # 포함된 모든 클래스 폴더에 복사
        for class_id in classes_in_image:

            class_name = CLASS_NAMES[class_id]

            shutil.copy2(
                image_path,
                OUTPUT_ROOT / class_name / split / "images" / image_path.name
            )

            shutil.copy2(
                label_path,
                OUTPUT_ROOT / class_name / split / "labels" / label_path.name
            )

print("완료!")