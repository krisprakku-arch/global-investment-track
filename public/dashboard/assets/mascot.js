(function(){
  const chars=[
    {img:"mascot.png",name:"บูลบูล",tips:["สวัสดี! ผมชื่อ 'บูลบูล' 🐂 ตลาดกระทิง!","ราคาเหนือ EMA200 = แนวโน้มขาขึ้นระยะยาว","RRG ช่วยดูว่าตลาดไหนกำลังนำหรือตาม"]},
    {img:"mascot-eagle.png",name:"อินทรีเมกา",tips:["ผมคือ 'อินทรีเมกา' 🦅 ดูแล S&P 500 กับ Nasdaq!","ดอลลาร์แข็ง (DXY ขึ้น) มักกดดันตลาดเกิดใหม่","Yield US10Y พุ่ง = หุ้นเทคมักผันผวน"]},
    {img:"mascot-panda.png",name:"แพนด้าหยวน",tips:["หนี๋ห่าว! ผมคือ 'แพนด้าหยวน' 🐼","ดู CSI300 / HSI / HSTECH เพื่อจับชีพจรตลาดจีน","อย่าลืมกระจายความเสี่ยงนะ 😉"]},
    {img:"mascot-bear.png",name:"หมีขาลง",tips:["ฮึ่ม! ผมคือ 'หมีขาลง' 🐻","RSI ต่ำกว่า 30 = ขายมากเกินไป (Oversold)","VIX สูง = ตลาดกลัว ระวังความผันผวน"]},
    {img:"mascot-elephant.png",name:"ช้างทอง",tips:["สวัสดีครับ ผมคือ 'ช้างทอง' 🐘 ดูแล SET และทองคำ","ทองมักขึ้นเมื่อตลาด Risk-Off","ลองดูแผนที่โลกด้านบน สีบอกทิศทางตลาด!"]}
  ];
  let c=0,i=0;
  const w=document.createElement("div");w.className="mascot";
  w.innerHTML='<div class="mascot-bubble" role="status"></div><button class="mascot-btn" type="button" aria-label="มาสคอต กดเพื่อดูเกร็ดความรู้"><img src="assets/mascot.png" alt="" width="96" height="96"></button><button class="mascot-x" type="button" aria-label="ซ่อนมาสคอต">×</button><button class="mascot-sw" type="button" aria-label="เปลี่ยนตัวละคร" title="เปลี่ยนตัวละคร">⇄</button>';
  const b=w.querySelector(".mascot-bubble"),img=w.querySelector("img");
  const say=t=>{b.textContent=t;b.classList.add("show");clearTimeout(say.t);say.t=setTimeout(()=>b.classList.remove("show"),5000)};
  const jump=()=>{w.classList.remove("jump");void w.offsetWidth;w.classList.add("jump")};
  const set=n=>{c=n%chars.length;i=0;img.src="assets/"+chars[c].img;jump();say(chars[c].tips[i++])};
  chars.forEach(x=>{new Image().src="assets/"+x.img});
  w.querySelector(".mascot-btn").onclick=()=>{jump();const t=chars[c].tips;say(t[i++%t.length])};
  w.querySelector(".mascot-sw").onclick=()=>set(c+1);
  w.querySelector(".mascot-x").onclick=()=>w.remove();
  document.body.appendChild(w);setTimeout(()=>set(Math.floor(Math.random()*chars.length)),1200);
})();
