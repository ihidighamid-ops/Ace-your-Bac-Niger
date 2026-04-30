'use strict';

const CSS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Space+Mono:wght@400;700&family=Noto+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;}
body{font-family:'Noto Sans',sans-serif;background:#080D1A;min-height:100vh;color:white;}
.ht{font-family:'Syne',sans-serif;}
.mono{font-family:'Space Mono',monospace;}
.flag{background:linear-gradient(90deg,#FF7518 33.3%,#FFFFFF 33.3%,#FFFFFF 66.6%,#29AB47 66.6%);height:5px;width:100%;position:fixed;top:0;left:0;right:0;z-index:9999;}

.inp{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:white;border-radius:12px;padding:14px 16px;width:100%;font-size:15px;font-family:'Noto Sans',sans-serif;transition:border-color 0.25s,box-shadow 0.25s;-webkit-appearance:none;appearance:none;}
.inp:focus{border-color:#FF7518;outline:none;background:rgba(255,255,255,0.10);box-shadow:0 0 0 3px rgba(255,117,24,0.15);}
.inp::placeholder{color:rgba(255,255,255,0.3);}
select.inp option{background:#1a1f35;color:white;}

.btn-orange{background:linear-gradient(135deg,#FF7518,#FF4500);color:white;border:none;border-radius:14px;padding:16px 24px;font-family:'Syne',sans-serif;font-weight:700;font-size:15px;cursor:pointer;width:100%;transition:transform 0.2s,box-shadow 0.2s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;display:block;text-align:center;text-decoration:none;line-height:1.3;}
.btn-orange:hover,.btn-orange:active{transform:translateY(-2px);box-shadow:0 8px 25px rgba(255,117,24,0.4);}
.btn-green{background:linear-gradient(135deg,#29AB47,#1a7a32);color:white;border:none;border-radius:14px;padding:16px 24px;font-family:'Syne',sans-serif;font-weight:700;font-size:15px;cursor:pointer;width:100%;transition:transform 0.2s,box-shadow 0.2s;-webkit-tap-highlight-color:transparent;display:block;text-align:center;text-decoration:none;line-height:1.3;}
.btn-green:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(41,171,71,0.4);}
.btn-ghost{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);border-radius:14px;padding:16px 24px;font-family:'Syne',sans-serif;font-weight:700;font-size:15px;cursor:pointer;width:100%;transition:background 0.2s;-webkit-tap-highlight-color:transparent;display:block;text-align:center;text-decoration:none;line-height:1.3;}
.btn-ghost:hover{background:rgba(255,255,255,0.10);color:white;}

.err{background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.3);color:#fca5a5;border-radius:12px;padding:14px 16px;font-size:13px;margin-bottom:16px;line-height:1.5;}
.suc{background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);color:#86efac;border-radius:12px;padding:14px 16px;font-size:13px;margin-bottom:16px;}
.info{background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);color:#93c5fd;border-radius:12px;padding:14px 16px;font-size:13px;margin-bottom:16px;}

.label{color:rgba(255,255,255,0.5);font-size:12px;margin-bottom:6px;display:block;font-weight:600;letter-spacing:0.03em;}
.glass{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:20px;}
.card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;}

.stars-bg{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:hidden;}
.star{position:absolute;background:white;border-radius:50%;animation:twinkle linear infinite;}
@keyframes twinkle{0%,100%{opacity:0.04;}50%{opacity:0.35;}}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
@keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-7px);}}
@keyframes popIn{from{opacity:0;transform:scale(0.93);}to{opacity:1;transform:scale(1);}}
.fadeUp{animation:fadeUp 0.45s ease forwards;}
.float{animation:float 3s ease-in-out infinite;}

::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}
button,a{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
</style>`;

const STARS_JS = `<script>
(function(){
  var bg=document.createElement('div');
  bg.className='stars-bg';
  document.body.prepend(bg);
  for(var i=0;i<50;i++){
    var s=document.createElement('div');
    s.className='star';
    var sz=Math.random()*2+0.5;
    s.style.cssText='width:'+sz+'px;height:'+sz+'px;left:'+Math.random()*100+'%;top:'+Math.random()*100+'%;animation-duration:'+(5+Math.random()*8)+'s;animation-delay:'+(Math.random()*8)+'s;';
    bg.appendChild(s);
  }
})();
</script>`;

module.exports = { CSS, STARS_JS };
