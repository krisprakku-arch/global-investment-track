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
