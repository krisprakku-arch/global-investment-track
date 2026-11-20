(function(){
  const tips=["สวัสดี! ผมชื่อ 'บูลบูล' 🐂","RSI ต่ำกว่า 30 = ขายมากเกินไป (Oversold)","ราคาเหนือ EMA200 = แนวโน้มขาขึ้นระยะยาว","ลองดูแผนที่โลกด้านบน สีบอกทิศทางตลาด!","อย่าลืมกระจายความเสี่ยงนะ 😉","กดที่ผมอีกได้ มีเกร็ดความรู้อีกเยอะ!","RRG ช่วยดูว่าตลาดไหนกำลังนำหรือตาม"];
  let i=0;
  const w=document.createElement("div");w.className="mascot";
  w.innerHTML='<div class="mascot-bubble" role="status"></div><button class="mascot-btn" type="button" aria-label="มาสคอตบูลบูล กดเพื่อดูเกร็ดความรู้"><img src="assets/mascot.png" alt="" width="96" height="96"></button><button class="mascot-x" type="button" aria-label="ซ่อนมาสคอต">×</button>';
  const b=w.querySelector(".mascot-bubble");
  const say=t=>{b.textContent=t;b.classList.add("show");clearTimeout(say.t);say.t=setTimeout(()=>b.classList.remove("show"),5000)};
  w.querySelector(".mascot-btn").onclick=()=>{w.classList.remove("jump");void w.offsetWidth;w.classList.add("jump");say(tips[i++%tips.length])};
  w.querySelector(".mascot-x").onclick=()=>w.remove();
  document.body.appendChild(w);setTimeout(()=>say(tips[i++]),1200);
})();
