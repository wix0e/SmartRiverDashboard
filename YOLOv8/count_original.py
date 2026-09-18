from pathlib import Path
from collections import Counter

# 압축을 푼 데이터셋 최상위 폴더
dataset_folder = Path(r"C:\CST\archive (2)")

image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# 파일명에 아래 문자열이 있으면 증강본으로 판단
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

split_results = {}
augmentation_types = Counter()
original_files = []
augmented_files = []

for split in ["train", "valid", "test"]:
    image_folder = dataset_folder / split / "images"

    if not image_folder.exists():
        print(f"폴더 없음: {image_folder}")
        continue

    original_count = 0
    augmented_count = 0

    for image_path in image_folder.iterdir():
        if not image_path.is_file():
            continue

        if image_path.suffix.lower() not in image_extensions:
            continue

        filename = image_path.stem.lower()

        matched_keywords = [
            keyword for keyword in augmentation_keywords
            if keyword in filename
        ]

        if matched_keywords:
            augmented_count += 1
            augmented_files.append(image_path)

            for keyword in matched_keywords:
                augmentation_types[keyword] += 1
        else:
            original_count += 1
            original_files.append(image_path)

    split_results[split] = {
        "original": original_count,
        "augmented": augmented_count,
        "total": original_count + augmented_count,
    }

print("\n===== 분할별 결과 =====")

for split, result in split_results.items():
    print(f"\n[{split}]")
    print(f"원본 추정 이미지: {result['original']}장")
    print(f"증강 추정 이미지: {result['augmented']}장")
    print(f"전체 이미지: {result['total']}장")

total_original = len(original_files)
total_augmented = len(augmented_files)

print("\n===== 전체 결과 =====")
print(f"원본 추정 이미지: {total_original}장")
print(f"증강 추정 이미지: {total_augmented}장")
print(f"전체 이미지: {total_original + total_augmented}장")

if augmentation_types:
    print("\n===== 발견된 증강 유형 =====")
    for keyword, count in augmentation_types.most_common():
        print(f"{keyword}: {count}장")

print("\n===== 증강본 파일 예시 10개 =====")
for path in augmented_files[:10]:
    print(path.name)

print("\n===== 원본 파일 예시 10개 =====")
for path in original_files[:10]:
    print(path.name)