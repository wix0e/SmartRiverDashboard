from pathlib import Path
import random
import shutil

# =========================
# 설정
# =========================
SOURCE_IMAGES = Path("C:\CST\images")
SOURCE_LABELS = Path("C:\CST\labels")
OUTPUT_DIR = Path("dataset_split")

TRAIN_RATIO = 0.8
VAL_RATIO = 0.1
TEST_RATIO = 0.1

RANDOM_SEED = 42

# 지원할 이미지 확장자
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def copy_pair(image_path: Path, label_path: Path, split_name: str) -> None:
    """이미지와 라벨 파일을 해당 split 폴더로 복사한다."""
    image_output_dir = OUTPUT_DIR / "images" / split_name
    label_output_dir = OUTPUT_DIR / "labels" / split_name

    image_output_dir.mkdir(parents=True, exist_ok=True)
    label_output_dir.mkdir(parents=True, exist_ok=True)

    shutil.copy2(image_path, image_output_dir / image_path.name)
    shutil.copy2(label_path, label_output_dir / label_path.name)


def main() -> None:
    # 비율 검사
    ratio_sum = TRAIN_RATIO + VAL_RATIO + TEST_RATIO

    if abs(ratio_sum - 1.0) > 1e-9:
        raise ValueError(
            f"train, val, test 비율의 합이 1이어야 합니다. 현재 합: {ratio_sum}"
        )

    if not SOURCE_IMAGES.exists():
        raise FileNotFoundError(f"이미지 폴더가 없습니다: {SOURCE_IMAGES}")

    if not SOURCE_LABELS.exists():
        raise FileNotFoundError(f"라벨 폴더가 없습니다: {SOURCE_LABELS}")

    valid_pairs = []
    missing_labels = []

    # 이미지 기준으로 동일한 이름의 txt 라벨 찾기
    for image_path in SOURCE_IMAGES.iterdir():
        if not image_path.is_file():
            continue

        if image_path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue

        label_path = SOURCE_LABELS / f"{image_path.stem}.txt"

        if label_path.exists():
            valid_pairs.append((image_path, label_path))
        else:
            missing_labels.append(image_path.name)

    if not valid_pairs:
        raise RuntimeError("분할할 이미지-라벨 쌍이 없습니다.")

    # 항상 같은 결과가 나오도록 시드 고정
    random.seed(RANDOM_SEED)
    random.shuffle(valid_pairs)

    total_count = len(valid_pairs)

    train_count = int(total_count * TRAIN_RATIO)
    val_count = int(total_count * VAL_RATIO)

    train_pairs = valid_pairs[:train_count]
    val_pairs = valid_pairs[train_count : train_count + val_count]
    test_pairs = valid_pairs[train_count + val_count :]

    # 파일 복사
    for image_path, label_path in train_pairs:
        copy_pair(image_path, label_path, "train")

    for image_path, label_path in val_pairs:
        copy_pair(image_path, label_path, "val")

    for image_path, label_path in test_pairs:
        copy_pair(image_path, label_path, "test")

    print("분할 완료")
    print(f"전체 이미지-라벨 쌍: {total_count}")
    print(f"train: {len(train_pairs)}")
    print(f"val:   {len(val_pairs)}")
    print(f"test:  {len(test_pairs)}")

    if missing_labels:
        print(f"\n라벨이 없어 제외된 이미지: {len(missing_labels)}개")
        for filename in missing_labels[:10]:
            print(f"  - {filename}")

        if len(missing_labels) > 10:
            print(f"  ... 외 {len(missing_labels) - 10}개")


if __name__ == "__main__":
    main()