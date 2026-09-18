from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from pathlib import Path
import shutil


# =========================================================
# 경로 설정
# =========================================================

# 아래 폴더 안에 images, labels 폴더가 있어야 합니다.
#
# 예:
# C:\CST\underwater_merged
# ├─ images
# └─ labels
#
DATASET_DIR = Path(r"C:\CST\my-first-project-8bbgo-udkkp.v1i.yolov8\valid")

IMAGE_DIR = DATASET_DIR / "images"
LABEL_DIR = DATASET_DIR / "labels"

# 삭제 대상은 영구 삭제하지 않고 이 폴더로 이동합니다.
# 결과 확인 후 이 폴더를 직접 삭제하면 됩니다.
QUARANTINE_ROOT = DATASET_DIR.parent / f"{DATASET_DIR.name}_removed"

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp",
}


# =========================================================
# 보조 함수
# =========================================================

def normalize_stem(path: Path) -> str:
    """Windows 파일명 비교를 위해 대소문자를 무시한 stem을 반환합니다."""
    return path.stem.casefold()


def scan_images(image_dir: Path) -> dict[str, Path]:
    """이미지를 stem 기준으로 수집합니다."""
    grouped: defaultdict[str, list[Path]] = defaultdict(list)

    for path in image_dir.iterdir():
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            grouped[normalize_stem(path)].append(path)

    duplicates = {
        stem: paths
        for stem, paths in grouped.items()
        if len(paths) > 1
    }

    if duplicates:
        print("[오류] 확장자만 다른 동일 이름 이미지가 발견되었습니다.")
        print("잘못된 파일을 이동할 수 있으므로 작업을 중단합니다.\n")

        for stem, paths in list(duplicates.items())[:20]:
            print(f"- {stem}")
            for path in paths:
                print(f"  {path.name}")

        raise RuntimeError(
            "동일한 stem을 가진 이미지가 2개 이상 있습니다."
        )

    return {
        stem: paths[0]
        for stem, paths in grouped.items()
    }


def scan_labels(label_dir: Path) -> dict[str, Path]:
    """TXT 라벨을 stem 기준으로 수집합니다."""
    grouped: defaultdict[str, list[Path]] = defaultdict(list)

    for path in label_dir.glob("*.txt"):
        if path.is_file():
            grouped[normalize_stem(path)].append(path)

    duplicates = {
        stem: paths
        for stem, paths in grouped.items()
        if len(paths) > 1
    }

    if duplicates:
        print("[오류] 대소문자만 다른 동일 이름 라벨이 발견되었습니다.")
        print("잘못된 파일을 이동할 수 있으므로 작업을 중단합니다.\n")

        for stem, paths in list(duplicates.items())[:20]:
            print(f"- {stem}")
            for path in paths:
                print(f"  {path.name}")

        raise RuntimeError(
            "동일한 stem을 가진 라벨이 2개 이상 있습니다."
        )

    return {
        stem: paths[0]
        for stem, paths in grouped.items()
    }


def is_empty_label(label_path: Path) -> bool:
    """공백과 줄바꿈만 있는 라벨도 빈 파일로 판단합니다."""
    try:
        return not label_path.read_text(
            encoding="utf-8-sig",
        ).strip()
    except UnicodeDecodeError:
        # YOLO TXT는 보통 UTF-8이지만, 혹시 모를 경우 바이트 기준 확인
        return not label_path.read_bytes().strip()


def show_examples(title: str, paths: list[Path], limit: int = 10) -> None:
    """삭제 예정 파일 예시를 출력합니다."""
    if not paths:
        return

    print(f"\n{title} 예시:")
    for path in paths[:limit]:
        print(f"  - {path.name}")

    if len(paths) > limit:
        print(f"  ... 외 {len(paths) - limit}개")


def move_file(source: Path, destination_dir: Path) -> None:
    """파일을 격리 폴더로 안전하게 이동합니다."""
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / source.name

    if destination.exists():
        raise FileExistsError(
            f"격리 폴더에 같은 이름의 파일이 이미 있습니다: {destination}"
        )

    shutil.move(str(source), str(destination))


# =========================================================
# 메인 처리
# =========================================================

def main() -> None:
    if not IMAGE_DIR.exists():
        print(f"[오류] 이미지 폴더가 없습니다: {IMAGE_DIR}")
        return

    if not LABEL_DIR.exists():
        print(f"[오류] 라벨 폴더가 없습니다: {LABEL_DIR}")
        return

    images = scan_images(IMAGE_DIR)
    labels = scan_labels(LABEL_DIR)

    image_stems = set(images)
    label_stems = set(labels)

    empty_label_stems = {
        stem
        for stem, label_path in labels.items()
        if is_empty_label(label_path)
    }

    # 빈 라벨이 있고 대응 이미지도 있는 정상적인 '빈 라벨 쌍'
    empty_pair_stems = empty_label_stems & image_stems

    # 이미지에 대응 라벨 파일 자체가 없는 경우
    image_without_label_stems = image_stems - label_stems

    # 이미지 없이 라벨만 남은 경우
    label_without_image_stems = label_stems - image_stems

    # 빈 라벨인데 대응 이미지까지 없는 경우
    empty_label_without_image_stems = (
        empty_label_stems & label_without_image_stems
    )

    # 내용은 있지만 대응 이미지가 없는 라벨
    nonempty_label_without_image_stems = (
        label_without_image_stems - empty_label_stems
    )

    empty_pair_images = [
        images[stem]
        for stem in sorted(empty_pair_stems)
    ]
    empty_pair_labels = [
        labels[stem]
        for stem in sorted(empty_pair_stems)
    ]
    images_without_labels = [
        images[stem]
        for stem in sorted(image_without_label_stems)
    ]
    empty_labels_without_images = [
        labels[stem]
        for stem in sorted(empty_label_without_image_stems)
    ]
    nonempty_labels_without_images = [
        labels[stem]
        for stem in sorted(nonempty_label_without_image_stems)
    ]

    removal_count = (
        len(empty_pair_images)
        + len(empty_pair_labels)
        + len(images_without_labels)
        + len(empty_labels_without_images)
        + len(nonempty_labels_without_images)
    )

    print("===== 검사 결과 =====")
    print(f"전체 이미지: {len(images)}개")
    print(f"전체 라벨: {len(labels)}개")
    print()
    print(
        f"빈 라벨 쌍: {len(empty_pair_stems)}쌍 "
        f"(이미지와 TXT 모두 제거)"
    )
    print(
        f"라벨 파일이 없는 이미지: "
        f"{len(image_without_label_stems)}개"
    )
    print(
        f"이미지가 없는 빈 라벨: "
        f"{len(empty_label_without_image_stems)}개"
    )
    print(
        f"이미지가 없는 내용 있는 라벨: "
        f"{len(nonempty_label_without_image_stems)}개"
    )

    show_examples(
        "빈 라벨과 함께 제거될 이미지",
        empty_pair_images,
    )
    show_examples(
        "라벨 파일이 없어 제거될 이미지",
        images_without_labels,
    )
    show_examples(
        "이미지가 없어 제거될 라벨",
        (
            empty_labels_without_images
            + nonempty_labels_without_images
        ),
    )

    if removal_count == 0:
        print("\n제거할 파일이 없습니다. 데이터셋 짝이 정상입니다.")
        return

    print(
        f"\n총 {removal_count}개 파일을 데이터셋 밖으로 이동합니다."
    )
    answer = input(
        "계속하려면 y를 입력하세요. 취소하려면 Enter를 누르세요: "
    ).strip().lower()

    if answer != "y":
        print("작업을 취소했습니다. 어떤 파일도 변경하지 않았습니다.")
        return

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    quarantine_dir = QUARANTINE_ROOT / timestamp

    # 1. 빈 라벨 쌍: 이미지 + 라벨 모두 이동
    for image_path in empty_pair_images:
        move_file(
            image_path,
            quarantine_dir / "empty_label_pairs" / "images",
        )

    for label_path in empty_pair_labels:
        move_file(
            label_path,
            quarantine_dir / "empty_label_pairs" / "labels",
        )

    # 2. 라벨 파일이 없는 이미지 이동
    for image_path in images_without_labels:
        move_file(
            image_path,
            quarantine_dir / "images_without_labels",
        )

    # 3. 이미지가 없는 라벨 이동
    for label_path in empty_labels_without_images:
        move_file(
            label_path,
            quarantine_dir / "labels_without_images",
        )

    for label_path in nonempty_labels_without_images:
        move_file(
            label_path,
            quarantine_dir / "labels_without_images",
        )

    # 이동 후 다시 검사
    remaining_images = scan_images(IMAGE_DIR)
    remaining_labels = scan_labels(LABEL_DIR)

    remaining_empty_labels = [
        path
        for path in remaining_labels.values()
        if is_empty_label(path)
    ]
    remaining_images_without_labels = (
        set(remaining_images) - set(remaining_labels)
    )
    remaining_labels_without_images = (
        set(remaining_labels) - set(remaining_images)
    )

    print("\n===== 정리 완료 =====")
    print(f"남은 이미지: {len(remaining_images)}개")
    print(f"남은 라벨: {len(remaining_labels)}개")
    print(f"남은 빈 라벨: {len(remaining_empty_labels)}개")
    print(
        "남은 라벨 없는 이미지: "
        f"{len(remaining_images_without_labels)}개"
    )
    print(
        "남은 이미지 없는 라벨: "
        f"{len(remaining_labels_without_images)}개"
    )
    print(f"\n제거된 파일 보관 위치: {quarantine_dir}")

    if (
        not remaining_empty_labels
        and not remaining_images_without_labels
        and not remaining_labels_without_images
    ):
        print("이미지와 라벨이 모두 정상적으로 1:1 대응합니다.")
    else:
        print(
            "[주의] 정리 후에도 불일치가 남아 있습니다. "
            "위 수치를 확인해 주세요."
        )


if __name__ == "__main__":
    main()
