from ultralytics import YOLO

model = YOLO(
    r"C:\CST\runs\detect\trash_yolov8s_data_modi-2\weights\best.pt"
)

metrics = model.val(
    data=r"C:\CST\capstons_dataset_modi\data.yaml",
    split="test",
    imgsz=640,
    device=0,
    workers=0,
    plots=True
)

print(metrics)