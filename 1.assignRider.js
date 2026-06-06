/**
 * คำนวณระยะทางระหว่างจุดสองจุดด้วยสูตร Haversine (หน่วย: กิโลเมตร)
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // รัศมีของโลก (กิโลเมตร)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c
    return distance ; // ระยะทางสุทธิ (กิโลเมตร)
}

/**
 * ฟังก์ชันหลักในการค้นหาและจัดสรร Rider ที่เหมาะสมที่สุด
 */
function assignRider(order, riders) {
    const NOW = new Date(order.timestamp || Date.now());
    const TWO_MINUTES_IN_MS = 2 * 60 * 1000;
    const MAX_INITIAL_DISTANCE = 5.0; // รัศมีเริ่มต้น 5 กิโลเมตร

    // 1. Filter และตรวจเช็กสถานะพิกัดเก่า (Stale Data Protection)
    const availableRiders = riders.filter(rider => {
        const lastUpdate = new Date(rider.lastUpdatedAt);
        const isStale = (NOW - lastUpdate) > TWO_MINUTES_IN_MS;
        
        if (isStale) return false; // ข้าม Rider ที่ข้อมูลพิกัดไม่อัปเดตเกิน 2 นาที

        // คำนวณระยะทางจากพิกัด Rider ปัจจุบันไปยังร้านอาหาร
        rider.distanceFromRestaurant = calculateHaversineDistance(
            rider.lat, rider.lon,
            order.restaurantLat, order.restaurantLon
        );

        return true;
    });

    if (availableRiders.length === 0) {
        return handleNoRiderFallback(order, riders, "No active riders within time constraint.");
    }

    // 2. Sort: จัดลำดับความคุ้มค่าตามเงื่อนไขทางธุรกิจและ Tie-breaker
    availableRiders.sort((a, b) => {
        const distanceDiff = a.distanceFromRestaurant - b.distanceFromRestaurant;

        // เงื่อนไข Tie-breaker: ถ้าระยะทางต่างกันไม่เกิน 500 เมตร (0.5 กิโลเมตร)
        if (Math.abs(distanceDiff) <= 0.5) {
            return b.rating - a.rating; // เลือกคนที่มี Rating สูงกว่า (เรียงจากมากไปน้อย)
        }

        return distanceDiff; // ถ้าระยะทางต่างกันเกิน 500 เมตร เลือกคนที่ใกล้ที่สุด (เรียงจากน้อยไปมาก)
    });

    // 3. ตรวจสอบขอบเขตรัศมี 5 กิโลเมตรแรก
    const bestRider = availableRiders[0];
    if (bestRider.distanceFromRestaurant <= MAX_INITIAL_DISTANCE) {
        return {
            status: "SUCCESS",
            riderId: bestRider.id,
            distanceKm: parseFloat(bestRider.distanceFromRestaurant.toFixed(2)),
            rating: bestRider.rating
        };
    } else {
        // หากคนที่ดีที่สุดอยู่ไกลเกิน 5 กิโลเมตร ให้เข้าสู่กระบวนการ Fallback ขยายวงค้นหา
        return handleNoRiderFallback(order, availableRiders, "No riders found within initial 5 km radius.");
    }
}

/**
 * Logic การจัดการ Edge Case แบบขั้นบันได (Dynamic Search Radius / Fallback)
 */
function handleNoRiderFallback(order, activeRiders, reason) {
    // ขยายวงค้นหาเป็นสเต็ป: ขั้นที่สอง 8 กม. และขั้นสูงสุด 12 กม.
    const EXPANSION_STEPS = [8.0, 12.0]; 
    
    // เรียงลำดับเฉพาะ Rider ที่พิกัดยัง Active อยู่ตามระยะทางจากใกล้ไปไกล
    const sortedActiveRiders = [...activeRiders].sort((a, b) => a.distanceFromRestaurant - b.distanceFromRestaurant);

    if (sortedActiveRiders.length > 0) {
        const nextBestRider = sortedActiveRiders[0];
        
        for (let radius of EXPANSION_STEPS) {
            if (nextBestRider.distanceFromRestaurant <= radius) {
                return {
                    status: "EXPANDED_MATCH",
                    riderId: nextBestRider.id,
                    distanceKm: parseFloat(nextBestRider.distanceFromRestaurant.toFixed(2)),
                    expandedRadiusKm: radius,
                    message: `Matched successfully after expanding search radius to ${radius} km.`
                };
            }
        }
    }

    // Final Level Fallback: หากขยายจนสุดรัศมีแล้วยังไม่มีใครพร้อมรับงาน
    return {
        status: "QUEUE_POOL",
        message: "No available riders nearby. Order pushed to global pending matching queue.",
        retryAfterSeconds: 30 // ส่งสัญญาณให้ระบบทำการ Re-trigger ฟังก์ชันประมวลผลจับคู่อีกครั้งในอีก 30 วินาที
    };
}