from ultralytics import YOLO

def main():
    model = YOLO("yolov8s.pt")

    model.train(
    data=r"C:\CST\capstons_dataset_modi\data.yaml",
    epochs=100,
    imgsz=640,
    batch=8,
    device=0,
    workers=0,
    patience=25,
    project=r"C:\CST\runs\detect",
    name="trash_yolov8s_data_modi"
)

if __name__ == "__main__":
    main()