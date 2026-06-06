WITH MonthlyRestaurantAOV AS (
    SELECT 
        r.category,
        r.id AS restaurant_id,
        r.name AS restaurant_name,
        -- ใช้ COALESCE เพื่อจัดการกรณีร้านไม่มีออเดอร์เลยในเดือนนั้น ให้ค่าเฉลี่ย AOV เป็น 0
        COALESCE(AVG(o.total_amount), 0) AS average_order_value,
        -- ใช้ DENSE_RANK() ในการจัดอันดับเพื่อรองรับกรณีที่ร้านค้าทำยอด AOV เท่ากันในอันดับที่ 3
        DENSE_RANK() OVER (
            PARTITION BY r.category 
            ORDER BY COALESCE(AVG(o.total_amount), 0) DESC
        ) AS rank_in_category
    FROM 
        restaurants r
    LEFT JOIN 
        orders o ON r.id = o.restaurant_id 
        AND o.status = 'delivered'
        -- กรองเฉพาะเดือนปัจจุบันและปีปัจจุบันแบบ Dynamic (คำสั่งทำงานได้บน MySQL 8.0+)
        AND YEAR(o.created_at) = YEAR(CURRENT_DATE())
        AND MONTH(o.created_at) = MONTH(CURRENT_DATE())
    GROUP BY 
        r.category, 
        r.id, 
        r.name
)
SELECT 
    category,
    restaurant_id,
    restaurant_name,
    ROUND(average_order_value, 2) AS top_average_order_value,
    rank_in_category
FROM 
    MonthlyRestaurantAOV
WHERE 
    rank_in_category <= 3
ORDER BY 
    category ASC, 
    rank_in_category ASC;