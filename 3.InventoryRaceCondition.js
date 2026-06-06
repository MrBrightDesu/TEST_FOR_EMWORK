async function placeOrder(orderId, items) {
    // 1. เริ่มต้นระบบ Database Transaction เพื่อความปลอดภัยระดับ Atomicity
    const transaction = await db.beginTransaction();
    
    try {
        // 2. วิธีแก้ปัญหา N+1 Query: รวบรวม IDs ทั้งหมดเพื่อไปเช็กและ Lock สต็อกในคำสั่งเดียว
        const itemIds = items.map(item => item.id);
        
        // ใช้เทคนิค Pessimistic Locking "FOR UPDATE" เพื่อล็อกแถวข้อมูลสินค้าเหล่านี้ไว้ชั่วคราว
        // ป้องกันไม่ให้ Request อื่นเข้ามาอ่านหรือแก้ไขข้อมูลสินค้าเหล่านี้จนกว่า Transaction นี้จะสิ้นสุด
        const currentStocks = await db.query(
            `SELECT id, stock FROM menu WHERE id IN (${itemIds.join(',')}) FOR UPDATE`,
            { transaction }
        );

        // สร้าง Map เพื่อให้เข้าถึงข้อมูลสต็อกในหน่วยความจำของแอปพลิเคชันได้ในเวลา O(1)
        const stockMap = new Map(currentStocks.map(p => [p.id, p.stock]));

        // 3. ตรวจสอบเงื่อนไขสต็อกล่วงหน้าก่อนเริ่มลงมืออัปเดตจริง
        for (const item of items) {
            const availableStock = stockMap.get(item.id);
            if (availableStock === undefined || availableStock < item.qty) {
                // หากสินค้าชิ้นใดชิ้นหนึ่งหมด ให้ส่งสัญญาณ Error เพื่อยกเลิกรายการทั้งหมดทันที
                throw new Error(`Insufficient stock or invalid product ID: ${item.id}`);
            }
        }

        // 4. แก้ปัญหา Race Condition ด้วย "Atomic Update" (อัปเดตแบบลบค่าตรง ๆ บน Database)
        // พร้อมเงื่อนไขตรวจสอบความปลอดภัยชั้นสุดท้าย (stock >= item.qty)
        for (const item of items) {
            const updateResult = await db.query(
                `UPDATE menu 
                 SET stock = stock - ${item.qty} 
                 WHERE id = ${item.id} AND stock >= ${item.qty}`,
                { transaction }
            );

            // ตรวจเช็กเผื่อเคสฉุกเฉินกรณีที่ผลการอัปเดตไม่มีการเปลี่ยนแปลงแถวข้อมูล
            if (updateResult.affectedRows === 0) {
                throw new Error(`Race condition safety triggered: Concurrency stock breakdown for item ID ${item.id}`);
            }
        }

        // 5. บันทึกข้อมูลคำสั่งซื้อใหม่หลังจากตัดสต็อกสำเร็จครบทุกชิ้น
        await Order.create({ id: orderId, status: 'confirmed' }, { transaction });

        // 6. กดบันทึกคำสั่งทั้งหมดลง Database พร้อมกัน (Commit)
        await transaction.commit();
        
    } catch (error) {
        // 7. หากเกิดข้อผิดพลาดแม้แต่จุดเดียว ให้สั่ง Rollback ย้อนกลับข้อมูลทั้งหมดให้เหมือนเดิมทันที
        await transaction.rollback();
        throw error; // ส่งต่อข้อยกเว้นออกไปให้ระบบดักจับ Error ส่วนกลางจัดการต่อ
    }
}