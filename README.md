# Global investment Track 

ปรึกษาการทำ Project ใหม่ครับ

This project was built with [Lovable](https://lovable.dev).

## GitHub Pages (เปิดให้ใช้งานได้จริง)

1. เปิด Project settings → Git → GitHub แล้วกด Connect (ระบบสร้างที่เก็บโค้ดส่วนตัวใหม่ในบัญชีคุณ)
2. ไปที่ Settings → Pages ของที่เก็บโค้ด แล้วเลือก Source เป็น **GitHub Actions**
3. เปิด Actions tab แล้วรันทีชือ **Deploy dashboard to GitHub Pages** (กด Run workflow)
4. เปิด **Update market data** ด้วย เพื่อดึงข้อมูลล่านสุด (อัตโนมัติ 05:00, 09:00, 12:00, 15:00, 18:00 น. จันทร์–เสาร์ เวลาไทย)

ที่อยู่เว็บจะเป็น `https://<ชื่อบัญชี>.github.io/<ชื่อที่เก็บโค้ด>/`

- ไฟล์ทีกินทีกินหน้า: `.github/workflows/deploy-pages.yml` คัด `public/dashboard` เป็นตั่วเว็บทังหมด
- ถ้าทียังเป็นส่วนตัว (private) ที่อยู่เว็บจะเปิดให้คนที่มีสทิธเิข้าที่เก็บโค้ดเท่านั้น on the Free plan — ตองการใหทุ้กคนเห็น ใหเปลียนที่เก็บโค้ดเป็น public

## ผลตอบแทนกองทุนบัวหลวง (BBLAM)

- เปิด `funds.html` จากแถบนำทาง เพื่อค้นหาและกรองกองทุน ดูตารางหรือการ์ดผลตอบแทนเทียบ Benchmark และส่วนต่างอัลฟ่า
- รายชื่อเริ่มต้นเปิดใช้ได้ทันที แต่ผลตอบแทนและความเสี่ยงที่ยังไม่ยืนยันแสดงเป็น `—` ไม่ใช่ตัวเลขสมมติ หมวดหมู่/นโยบายเริ่มต้นเป็นข้อมูลเบื้องต้นที่จะถูกแทนที่ด้วยข้อมูล SEC
- สมัคร SEC Open Data API ที่ https://secopendata.sec.or.th/ และขอสิทธิ Fund API v2 จาก developer portal
- ใน GitHub ของที่เก็บโค้ดนี้ เปิด **Settings → Secrets and variables → Actions → New repository secret** ตั้งชื่อ **SEC_API_KEY** และใส่ Subscription Key ของ SEC (อย่าใส่ในโค้ดหรือส่งในแชต)
- รัน **Actions → Update market data → Run workflow** สคริปต์จะดึงข้อมูล SEC ต่อจากข้อมูลตลาดและบันทึก `public/dashboard/data/funds.json` รอบตรวจข้อมูลคือ 05:00, 09:00, 12:00, 15:00, 18:00 น. จันทร์–เสาร์ เวลาไทย แต่ Factsheet เป็นข้อมูลรายเดือน ไม่ใช่เรียลไทม์
- เมื่อไม่มี Key หรือ API ล้มเหลว จะเก็บข้อมูลเดิมและวันที่เดิมไว้; บางกองทุนอาจไม่มีผลตอบแทนบางช่วง แสดง `—` และแยกชนิดหน่วยลงทุน ไม่รวมตัวเลขต่าง Class
- 3 ปีและ 5 ปีเป็นผลตอบแทนเฉลี่ยต่อปี; อัลฟ่าบนหน้านี้คือผลตอบแทนกองทุนลบ Benchmark เป็นจุดเปอร์เซ็นต์ ไม่ใช่อัลฟ่าที่ปรับความเสี่ยงแล้ว
- ตรวจสคริปต์ด้วย `python3 -m unittest discover -s scripts -p 'test_*.py'` และกฎการค้นหา/อัลฟ่าด้วย `bun test public/dashboard/assets/funds.test.js`

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/24a9f27b-2c19-4304-a94b-f04472d26732).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
