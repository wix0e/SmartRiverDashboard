from pathlib import Path
import random
import shutil

import cv2
import numpy as np


# =========================================================
# 기본 설정
# =========================================================

# 이미 train/valid/test로 분할된 YOLO 데이터셋의 최상위 폴더
DATASET_DIR = Path(r"C:\CST\capstons_labels")

# train 데이터만 수중 변환한다.
TRAIN_IMAGES_DIR = DATASET_DIR / "train" / "images"
TRAIN_LABELS_DIR = DATASET_DIR / "train" / "labels"

# 원본을 건드리지 않고 변환본만 별도 폴더에 저장한다.
OUTPUT_IMAGES_DIR = Path(r"C:\CST\generated") / "train" / "images"
OUTPUT_LABELS_DIR = Path(r"C:\CST\generated") / "train" / "labels"

# 각 원본 이미지마다 만들 수중 변환본 개수
# 우선 1장을 권장한다.
AUGMENTATIONS_PER_IMAGE = 1

# 사용할 모드와 선택 가중치
# dark는 지나치게 많이 생성되지 않도록 확률을 낮췄다.
MODE_WEIGHTS = {
    "clear": 25,
    "green": 30,
    "muddy": 25,
    "dark": 5,
    "tank": 15,
}

SUPPORTED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp",
}


# 같은 결과를 다시 만들고 싶다면 숫자를 고정한다.
# 매번 완전히 다른 결과를 원한다면 이 줄을 삭제하거나 주석 처리한다.
random.seed(42)
np.random.seed(42)


# =========================================================
# 수중 환경별 설정값
# =========================================================

MODES = {
    "clear": {
        # 맑고 밝은 수조 또는 맑은 얕은 물
        "blue_gain": (1.05, 1.15),
        "green_gain": (1.00, 1.08),
        "red_gain": (0.75, 0.90),
        "contrast": (0.85, 0.95),
        "brightness": (-0.02, 0.05),
        "haze": (0.03, 0.10),
        "haze_color": (
            (145, 115, 65),
            (180, 150, 95),
        ),
        "blur_kernel": [1, 3],
        "particles": (10, 40),
        "noise_std": (0.0, 2.0),
        "vignette": (0.04, 0.12),
    },

    "green": {
        # 녹조 또는 수초가 많은 하천
        "blue_gain": (0.95, 1.08),
        "green_gain": (1.10, 1.30),
        "red_gain": (0.50, 0.75),
        "contrast": (0.70, 0.85),
        "brightness": (-0.08, 0.00),
        "haze": (0.10, 0.22),
        "haze_color": (
            (80, 125, 45),
            (125, 175, 80),
        ),
        "blur_kernel": [3, 5],
        "particles": (30, 90),
        "noise_std": (1.0, 4.0),
        "vignette": (0.08, 0.20),
    },

    "muddy": {
        # 흙과 침전물이 많은 탁한 물
        "blue_gain": (0.80, 0.95),
        "green_gain": (0.95, 1.10),
        "red_gain": (0.70, 0.90),
        "contrast": (0.50, 0.72),
        "brightness": (-0.15, -0.05),
        "haze": (0.20, 0.40),
        "haze_color": (
            (55, 85, 75),
            (90, 125, 115),
        ),
        "blur_kernel": [5, 7],
        "particles": (80, 180),
        "noise_std": (2.0, 6.0),
        "vignette": (0.12, 0.28),
    },

    "dark": {
        # 조명이 부족하거나 깊이가 있는 물
        "blue_gain": (1.05, 1.20),
        "green_gain": (0.90, 1.05),
        "red_gain": (0.45, 0.70),
        "contrast": (0.60, 0.80),
        "brightness": (-0.25, -0.12),
        "haze": (0.08, 0.18),
        "haze_color": (
            (80, 65, 30),
            (120, 95, 55),
        ),
        "blur_kernel": [3, 5],
        "particles": (20, 70),
        "noise_std": (3.0, 8.0),
        "vignette": (0.18, 0.38),
    },

    "tank": {
        # 발표용 수조처럼 비교적 깨끗하고 조명이 안정된 환경
        "blue_gain": (1.00, 1.10),
        "green_gain": (1.00, 1.10),
        "red_gain": (0.70, 0.88),
        "contrast": (0.82, 0.95),
        "brightness": (-0.03, 0.04),
        "haze": (0.03, 0.10),
        "haze_color": (
            (130, 120, 75),
            (165, 150, 105),
        ),
        "blur_kernel": [1, 3],
        "particles": (5, 25),
        "noise_std": (0.0, 2.0),
        "vignette": (0.03, 0.10),
    },
}


# =========================================================
# 한글 경로에서도 안전하게 이미지 읽기·저장
# =========================================================

def read_image(path: Path) -> np.ndarray | None:
    """Windows 한글 경로에서도 이미지를 안전하게 읽는다."""

    try:
        file_data = np.fromfile(str(path), dtype=np.uint8)
        image = cv2.imdecode(file_data, cv2.IMREAD_COLOR)
        return image
    except (OSError, ValueError):
        return None


def save_jpg(path: Path, image: np.ndarray, quality: int = 95) -> bool:
    """Windows 한글 경로에서도 JPG를 안전하게 저장한다."""

    path.parent.mkdir(parents=True, exist_ok=True)

    success, encoded = cv2.imencode(
        ".jpg",
        image,
        [cv2.IMWRITE_JPEG_QUALITY, quality],
    )

    if not success:
        return False

    try:
        encoded.tofile(str(path))
        return True
    except OSError:
        return False


# =========================================================
# 효과 처리 함수
# =========================================================

def apply_color_attenuation(
    image: np.ndarray,
    config: dict,
) -> np.ndarray:
    """파랑·초록은 강화하고 빨강은 감쇠한다."""

    result = image.astype(np.float32) / 255.0

    blue_gain = random.uniform(*config["blue_gain"])
    green_gain = random.uniform(*config["green_gain"])
    red_gain = random.uniform(*config["red_gain"])

    # OpenCV의 채널 순서는 B, G, R이다.
    result[:, :, 0] *= blue_gain
    result[:, :, 1] *= green_gain
    result[:, :, 2] *= red_gain

    return np.clip(result, 0.0, 1.0)


def apply_contrast_brightness(
    image: np.ndarray,
    config: dict,
) -> np.ndarray:
    """대비와 밝기를 조절한다."""

    contrast = random.uniform(*config["contrast"])
    brightness = random.uniform(*config["brightness"])

    # 0.5를 중심으로 대비를 줄이거나 높인다.
    result = (image - 0.5) * contrast + 0.5
    result += brightness

    return np.clip(result, 0.0, 1.0)


def apply_haze(
    image: np.ndarray,
    config: dict,
) -> np.ndarray:
    """청록색 또는 갈색 안개층을 섞어 물의 탁도를 표현한다."""

    haze_strength = random.uniform(*config["haze"])

    color_min, color_max = config["haze_color"]

    # BGR 순서의 안개 색상
    haze_bgr = np.array(
        [
            random.randint(color_min[0], color_max[0]),
            random.randint(color_min[1], color_max[1]),
            random.randint(color_min[2], color_max[2]),
        ],
        dtype=np.float32,
    ) / 255.0

    haze_layer = np.full_like(image, haze_bgr)

    result = (
        image * (1.0 - haze_strength)
        + haze_layer * haze_strength
    )

    return np.clip(result, 0.0, 1.0)


def apply_vignette(
    image: np.ndarray,
    config: dict,
) -> np.ndarray:
    """화면 가장자리를 조금 어둡게 해 광량 감쇠를 표현한다."""

    height, width = image.shape[:2]
    strength = random.uniform(*config["vignette"])

    x = np.linspace(-1.0, 1.0, width, dtype=np.float32)
    y = np.linspace(-1.0, 1.0, height, dtype=np.float32)

    xx, yy = np.meshgrid(x, y)
    distance = np.sqrt(xx ** 2 + yy ** 2)

    distance = np.clip(distance / np.sqrt(2.0), 0.0, 1.0)
    mask = 1.0 - strength * (distance ** 1.7)

    result = image * mask[:, :, np.newaxis]

    return np.clip(result, 0.0, 1.0)


def apply_blur(
    image: np.ndarray,
    config: dict,
) -> np.ndarray:
    """약한 가우시안 블러를 적용한다."""

    kernel_size = random.choice(config["blur_kernel"])

    # 커널 크기 1은 블러를 적용하지 않는다는 뜻이다.
    if kernel_size <= 1:
        return image

    # 가우시안 커널은 홀수여야 한다.
    if kernel_size % 2 == 0:
        kernel_size += 1

    sigma = random.uniform(0.4, max(0.8, kernel_size / 3))

    return cv2.GaussianBlur(
        image,
        (kernel_size, kernel_size),
        sigmaX=sigma,
    )


def add_particles(
    image: np.ndarray,
    config: dict,
) -> np.ndarray:
    """물속 먼지나 작은 부유물처럼 보이는 점을 추가한다."""

    height, width = image.shape[:2]
    particle_min, particle_max = config["particles"]

    # 사진 해상도에 따라 입자 수를 조금 보정한다.
    reference_pixels = 1920 * 1080
    resolution_ratio = (width * height) / reference_pixels
    resolution_ratio = max(0.5, min(resolution_ratio, 3.0))

    particle_count = int(
        random.randint(particle_min, particle_max)
        * resolution_ratio
    )

    particle_layer = np.zeros_like(image, dtype=np.uint8)

    for _ in range(particle_count):
        center_x = random.randint(0, width - 1)
        center_y = random.randint(0, height - 1)

        radius = random.choices(
            population=[1, 2, 3, 4, 5],
            weights=[45, 30, 15, 7, 3],
            k=1,
        )[0]

        intensity = random.randint(100, 230)

        # 완전한 흰색보다 약간 청록빛을 주는 편이 자연스럽다.
        particle_color = (
            intensity,
            min(255, intensity + random.randint(0, 20)),
            min(255, intensity + random.randint(0, 12)),
        )

        cv2.circle(
            particle_layer,
            (center_x, center_y),
            radius,
            particle_color,
            thickness=-1,
            lineType=cv2.LINE_AA,
        )

    particle_layer = cv2.GaussianBlur(
        particle_layer,
        (3, 3),
        sigmaX=0.7,
    )

    opacity = random.uniform(0.15, 0.40)

    return cv2.addWeighted(
        image,
        1.0,
        particle_layer,
        opacity,
        0,
    )


def add_sensor_noise(
    image: np.ndarray,
    config: dict,
) -> np.ndarray:
    """어두운 수중 카메라에서 생길 수 있는 약한 노이즈를 추가한다."""

    noise_std = random.uniform(*config["noise_std"])

    if noise_std <= 0.0:
        return image

    noise = np.random.normal(
        loc=0.0,
        scale=noise_std,
        size=image.shape,
    ).astype(np.float32)

    result = image.astype(np.float32) + noise

    return np.clip(result, 0, 255).astype(np.uint8)


# =========================================================
# 수중 변환 메인 함수
# =========================================================

def apply_underwater_effect(
    image: np.ndarray,
    mode_name: str,
) -> np.ndarray:
    """선택한 환경 모드에 맞게 수중 효과를 적용한다."""

    if mode_name not in MODES:
        raise ValueError(f"존재하지 않는 모드입니다: {mode_name}")

    if image is None or image.size == 0:
        raise ValueError("유효하지 않은 이미지입니다.")

    config = MODES[mode_name]

    # 1. BGR 채널의 수중 색 감쇠
    result = apply_color_attenuation(image, config)

    # 2. 대비와 밝기 변화
    result = apply_contrast_brightness(result, config)

    # 3. 물의 탁도
    result = apply_haze(result, config)

    # 4. 가장자리 광량 감소
    result = apply_vignette(result, config)

    # 0~1 실수 배열을 0~255 uint8 이미지로 변환
    result = np.clip(result * 255.0, 0, 255).astype(np.uint8)

    # 5. 약한 흐림
    result = apply_blur(result, config)

    # 6. 부유물
    result = add_particles(result, config)

    # 7. 센서 노이즈
    result = add_sensor_noise(result, config)

    return result


# =========================================================
# 폴더 전체 처리
# =========================================================

def find_image_paths(images_dir: Path) -> list[Path]:
    """입력 폴더와 모든 하위 폴더에서 이미지를 찾는다."""

    return sorted(
        path
        for path in images_dir.rglob("*")
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )


def choose_mode() -> str:
    """설정한 가중치에 따라 수중 모드를 하나 선택한다."""

    mode_names = list(MODE_WEIGHTS.keys())
    weights = list(MODE_WEIGHTS.values())

    return random.choices(
        population=mode_names,
        weights=weights,
        k=1,
    )[0]


def find_label_path(image_path: Path) -> Path:
    """train/images의 이미지에 대응하는 train/labels의 txt 경로를 만든다."""

    relative_image_path = image_path.relative_to(TRAIN_IMAGES_DIR)

    return (
        TRAIN_LABELS_DIR
        / relative_image_path.with_suffix(".txt")
    )


def main() -> None:
    if not TRAIN_IMAGES_DIR.exists():
        print(f"[오류] train 이미지 폴더가 없습니다: {TRAIN_IMAGES_DIR}")
        return

    if not TRAIN_LABELS_DIR.exists():
        print(f"[오류] train 라벨 폴더가 없습니다: {TRAIN_LABELS_DIR}")
        return

    image_paths = find_image_paths(TRAIN_IMAGES_DIR)

    if not image_paths:
        print(f"[오류] 이미지가 없습니다: {TRAIN_IMAGES_DIR}")
        return

    OUTPUT_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_LABELS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"입력 이미지 폴더: {TRAIN_IMAGES_DIR.resolve()}")
    print(f"입력 라벨 폴더: {TRAIN_LABELS_DIR.resolve()}")
    print(f"발견한 train 원본 이미지: {len(image_paths)}장")
    print(f"이미지당 변환본: {AUGMENTATIONS_PER_IMAGE}장")
    print(f"사용 모드: {', '.join(MODE_WEIGHTS.keys())}")
    print()

    saved_images = 0
    copied_labels = 0
    missing_labels = 0
    failed_count = 0

    for index, image_path in enumerate(image_paths, start=1):
        label_path = find_label_path(image_path)

        # 라벨이 없는 이미지는 잘못된 데이터일 가능성이 크므로 변환하지 않는다.
        if not label_path.exists():
            print(f"[라벨 없음 - 건너뜀] {image_path.name}")
            missing_labels += 1
            continue

        # 빈 라벨은 변환 대상에서 제외한다.
        try:
            if not label_path.read_text(encoding="utf-8").strip():
                print(f"[빈 라벨 - 건너뜀] {label_path.name}")
                missing_labels += 1
                continue
        except OSError as error:
            print(f"[라벨 읽기 실패] {label_path}: {error}")
            failed_count += 1
            continue

        image = read_image(image_path)

        if image is None:
            print(f"[이미지 읽기 실패] {image_path}")
            failed_count += 1
            continue

        relative_parent = image_path.parent.relative_to(TRAIN_IMAGES_DIR)

        image_output_dir = OUTPUT_IMAGES_DIR / relative_parent
        label_output_dir = OUTPUT_LABELS_DIR / relative_parent

        for augmentation_index in range(1, AUGMENTATIONS_PER_IMAGE + 1):
            mode_name = choose_mode()

            try:
                converted = apply_underwater_effect(
                    image=image,
                    mode_name=mode_name,
                )

                # 1장 생성이면 a_green.jpg,
                # 여러 장 생성이면 a_green_01.jpg처럼 저장한다.
                if AUGMENTATIONS_PER_IMAGE == 1:
                    output_stem = f"{image_path.stem}_{mode_name}"
                else:
                    output_stem = (
                        f"{image_path.stem}_{mode_name}_"
                        f"{augmentation_index:02d}"
                    )

                output_image_path = (
                    image_output_dir
                    / f"{output_stem}.jpg"
                )

                output_label_path = (
                    label_output_dir
                    / f"{output_stem}.txt"
                )

                # 같은 이름의 파일이 이미 있으면 덮어쓰지 않는다.
                if output_image_path.exists() or output_label_path.exists():
                    print(
                        f"[이미 존재 - 건너뜀] "
                        f"{output_stem}"
                    )
                    continue

                if not save_jpg(output_image_path, converted):
                    print(f"[이미지 저장 실패] {output_image_path}")
                    failed_count += 1
                    continue

                shutil.copy2(label_path, output_label_path)

                saved_images += 1
                copied_labels += 1

            except (ValueError, OSError, cv2.error) as error:
                print(
                    f"[변환 실패] {image_path.name} / "
                    f"{mode_name}: {error}"
                )
                failed_count += 1

        print(
            f"[{index}/{len(image_paths)}] "
            f"{image_path.name} 처리 완료"
        )

    print()
    print("수중 변환 작업이 끝났습니다.")
    print(f"저장된 변환 이미지: {saved_images}장")
    print(f"복사된 라벨 파일: {copied_labels}개")
    print(f"라벨 없음 또는 빈 라벨: {missing_labels}개")
    print(f"실패한 작업: {failed_count}건")
    print(f"출력 이미지 폴더: {OUTPUT_IMAGES_DIR.resolve()}")
    print(f"출력 라벨 폴더: {OUTPUT_LABELS_DIR.resolve()}")


if __name__ == "__main__":
    main()