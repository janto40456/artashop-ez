# Artashop Ez — Full-stack starter

เว็บไซต์ธีมฟ้าอ่อน มีหน้า Login/Register, API backend, SQLite database, session cookies, rate limit, password hashing และหน้า admin สำหรับดูสมาชิก/จัดการสถานะคำสั่งซื้อ

## รันในเครื่อง
ต้องติดตั้ง Node.js 20 ขึ้นไป
1. แตก ZIP แล้วเปิด terminal ในโฟลเดอร์โปรเจกต์
2. คัดลอก `.env.example` เป็น `.env`
3. เปลี่ยน `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` ใน `.env` เป็นค่าของตัวเอง
4. รัน `npm install`
5. รัน `npm start`
6. เปิด http://localhost:3000
7. หน้า admin: http://localhost:3000/admin.html ใช้อีเมล/รหัสผ่านแอดมินที่ตั้งไว้ใน `.env`

## Deploy ให้ได้ลิงก์สาธารณะ
ตัวอย่างการ deploy: Render (Web Service)
1. อัปโหลดโปรเจกต์นี้ขึ้น GitHub repository ส่วนตัว
2. เข้า https://render.com/ แล้วสร้าง Web Service จาก repository
3. Build Command: `npm install`
4. Start Command: `npm start`
5. ตั้ง Environment Variables: `NODE_ENV=production`, `SESSION_SECRET` (สุ่มยาวอย่างน้อย 32 ตัวอักษร), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATABASE_PATH=/var/data/artashop.sqlite`
6. เพิ่ม Persistent Disk ที่ mount path `/var/data` เพื่อเก็บ SQLite database ให้ไม่หายเมื่อ redeploy
7. Deploy แล้ว Render จะแสดง URL สาธารณะให้ เช่น `https://ชื่อบริการ.onrender.com`

## ความปลอดภัย/ข้อจำกัด
- อย่า commit `.env` ขึ้น GitHub
- รหัสผ่านถูก hash ด้วย bcryptjs ไม่ได้เก็บเป็นข้อความธรรมดา
- ควรใช้ HTTPS และรหัสผ่านแอดมินที่ไม่ซ้ำกับบริการอื่น
- ปุ่มลืมรหัสผ่านในเดโมแจ้งให้ติดต่อผู้ดูแล ยังไม่มีอีเมลรีเซ็ต
- API orders รองรับการสร้างคำสั่งซื้อเมื่อมีการเรียก API โดยตรง แต่ยังไม่ได้เชื่อมกับแคตตาล็อกสินค้า/ตะกร้า/เกตเวย์ชำระเงินจริง
- ถ้าจะใช้จริง ควรเพิ่ม CSRF protection, การยืนยันอีเมล, การรีเซ็ตรหัสผ่าน และระบบสำรองฐานข้อมูลก่อนเปิดให้คนทั่วไปสมัคร
- อย่าใช้เว็บไซต์นี้เก็บรหัสผ่านบัญชีเกมของลูกค้า
