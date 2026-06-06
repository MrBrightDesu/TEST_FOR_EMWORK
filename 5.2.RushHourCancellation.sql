-- ตารางหลักสำหรับเก็บประวัติการยกเลิกงาน (Cancellation Logs)
CREATE TABLE rider_cancellation_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    rider_id VARCHAR(50) NOT NULL,
    reason_code VARCHAR(30) NOT NULL, -- เช่น 'TRAFFIC_JAM', 'RAIN', 'ACCIDENT', 'CLIENT_NOT_RESPONDING', 'CUSTOM'
    custom_reason TEXT NULL,
    
    -- เก็บสถานะพิกัดทางภูมิศาสตร์ ณ วินาทีที่กดยกเลิก เพื่อใช้ตรวจเช็ก Fraud
    cancelled_at_lat DECIMAL(10, 8) NOT NULL,
    cancelled_at_lon DECIMAL(11, 8) NOT NULL,
    
    -- เก็บรหัสพื้นที่แบบหกเหลี่ยม ณ จุดที่เกิดเหตุ (ใช้วิเคราะห์ Dynamic Zone)
    h3_zone_index VARCHAR(15) NOT NULL, 
    
    -- มิติด้านเวลา
    order_created_at TIMESTAMP NOT NULL,
    rider_accepted_at TIMESTAMP NOT NULL,
    cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- ตัวแปรแวดล้อมขณะนั้นเพื่อนำไปเข้าโมเดล AI ตรวจสอบการทุจริต (Fraud Detection Feature Store)
    distance_to_restaurant_meter INT NOT NULL, -- ระยะห่างจาก Rider ถึงร้านตอนกดยกเลิก
    current_surge_bonus DECIMAL(5, 2) DEFAULT 0.00, -- มูลค่าโบนัสล่อซื้อของโซนนั้น ณ เวลานั้น
    device_info JSON NOT NULL, -- เก็บ metadata เครื่องผู้ใช้ เช่น OS, Rooted Device Detection, GPS Mock App Detected
    
    INDEX idx_rider_time (rider_id, cancelled_at),
    INDEX idx_zone_time (h3_zone_index, cancelled_at)
);