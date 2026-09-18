from pathlib import Path

dataset_folder = Path(r"C:\CST\metal.v1i.yolov8")

label_folders = [
    dataset_folder / "train" / "labels",
    dataset_folder / "valid" / "labels",
    dataset_folder / "test" / "labels",
]

class_mapping = {
    0: None,
    1: 1,
    2: 1,
    3: 1,
    4: 1,
    5: 1,
    6: 1,
    7: 1
}

changed_files = 0
changed_labels = 0
deleted_labels = 0

for label_folder in label_folders:
    if not label_folder.exists():
        print(f"폴더 없음: {label_folder}")
        continue

    for txt_path in label_folder.glob("*.txt"):
        new_lines = []

        with txt_path.open("r", encoding="utf-8") as file:
            for line_number, line in enumerate(file, start=1):
                stripped = line.strip()

                if not stripped:
                    continue

                values = stripped.split()
                old_class_id = int(values[0])

                if old_class_id not in class_mapping:
                    raise ValueError(
                        f"{txt_path.name}의 {line_number}번째 줄에 "
                        f"알 수 없는 클래스 번호 {old_class_id}가 있습니다."
                    )

                new_class_id = class_mapping[old_class_id]

                # nothing 라벨은 해당 줄 자체를 삭제
                if new_class_id is None:
                    deleted_labels += 1
                    continue

                values[0] = str(new_class_id)
                new_lines.append(" ".join(values))
                changed_labels += 1

        # 기존 txt 파일을 수정된 내용으로 덮어쓰기
        with txt_path.open("w", encoding="utf-8") as file:
            if new_lines:
                file.write("\n".join(new_lines) + "\n")

        changed_files += 1

print(f"완료: {changed_files}개 파일 처리")
print(f"유지 및 변환된 라벨: {changed_labels}개")
print(f"삭제된 nothing 라벨: {deleted_labels}개")