from ultralytics import YOLO

model = YOLO("C:\Users\j1506\OneDrive\Desktop\캡스톤\SmartRiverDashboard\capston-2-2-\backend\best.pt")

print("모델 로딩 성공")
print(model.names)