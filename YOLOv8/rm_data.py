from pathlib import Path
import shutil

# 원본 데이터셋 폴더
source_dataset = Path(r"C:\CST\archive (2)")

# 원본 이미지만 저장할 폴더
target_dataset = Path(r"C:\CST\underwater_original")

# 증강 이미지 판별 키워드
augmentation_keywords = [
    "__flip",
    "__fliph",
    "__flipv",
    "__rotate",
    "__rot",
    "__brightness",
    "__contrast",
    "__blur",
    "__noise",
    "__crop",
    "__shear",
    "__hue",
    "__saturation",
    "__exposure",
]

image_count = 0

for split in ["train", "valid", "test"]:

    image_src = source_dataset / split / "images"
    label_src = source_dataset / split / "labels"

    image_dst = target_dataset / split / "images"
    label_dst = target_dataset / split / "labels"

    image_dst.mkdir(parents=True, exist_ok=True)
    label_dst.mkdir(parents=True, exist_ok=True)

    for image_path in image_src.iterdir():

        if not image_path.is_file():
            continue

        filename = image_path.stem.lower()

        # 증강 이미지면 건너뜀
        if any(keyword in filename for keyword in augmentation_keywords):
            continue

        # 이미지 복사
        shutil.copy2(image_path, image_dst / image_path.name)

        # 라벨 복사
        label_path = label_src / f"{image_path.stem}.txt"

        if label_path.exists():
            shutil.copy2(label_path, label_dst / label_path.name)

        image_count += 1

print(f"완료!")
print(f"원본 이미지 {image_count}장 복사 완료")