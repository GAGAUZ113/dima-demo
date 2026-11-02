/* ДА-медиа — общий движок для всех вариантов сайта.
   Подключается одной строкой: <script src="assets/da.js"></script>
   Каждый вариант задаёт свой вид через CSS, поведение здесь одно на всех. */
(function(){
'use strict';

/* ══════════════════════════════════════════════════════════════
   ДИМА, ЦИФРЫ И ЦЕНЫ МЕНЯЮТСЯ ЗДЕСЬ — и сразу во всех вариантах
   ══════════════════════════════════════════════════════════════ */
var CFG = window.DA_CFG = {
  ЭКРАНОВ_ВСЕГО: 100,
  КОНТАКТОВ_НА_ЭКРАН: 400,  // сколько человек в день видит один экран
  ТЕЛЕФОН: '+7 (4012) 37-77-42',
  ТЕЛЕФОН_СЫРОЙ: '+74012377742',
  ПОЧТА: 'info@damedia39.ru',
  TELEGRAM: 'https://t.me/damedia39',
  WHATSAPP: 'https://wa.me/79000000000',
  MAX: 'https://max.ru/damedia39',
  РАЙОНЫ: [
    {k:'lenin', n:'Ленинградский', s:'Сельма, Сев. гора', e:22},
    {k:'centr', n:'Центр',         s:'Пл. Победы, вокзал', e:26},
    {k:'mosk',  n:'Московский',    s:'Восток, Балтрайон', e:20},
    {k:'chkal', n:'Чкаловск',      s:'',                  e:12},
    {k:'pribr', n:'Прибрежный',    s:'',                  e:10},
    {k:'obl',   n:'Борисово и область', s:'',             e:10}
  ]
};

var ru = function(n){ return Math.round(n).toLocaleString('ru-RU'); };

/* ── 1. КУРСОР «от рекламщиков»: точка-пятно + кольцо ───────────── */
function курсор(){
  if (matchMedia('(hover:none)').matches) return;         // на телефоне не нужен
  var dot = document.createElement('div'), ring = document.createElement('div');
  dot.className = 'da-cur-dot'; ring.className = 'da-cur-ring';
  document.body.appendChild(dot); document.body.appendChild(ring);
  document.documentElement.classList.add('da-cursor-on');
  var x=innerWidth/2, y=innerHeight/2, rx=x, ry=y, show=false;
  addEventListener('mousemove', function(e){
    x=e.clientX; y=e.clientY;
    if(!show){ show=true; dot.style.opacity=1; ring.style.opacity=1; }
    dot.style.transform='translate('+x+'px,'+y+'px)';
  }, {passive:true});
  addEventListener('mouseout', function(e){ if(!e.relatedTarget){ dot.style.opacity=0; ring.style.opacity=0; show=false; } });
  (function tick(){                                        // кольцо догоняет с запозданием
    rx += (x-rx)*0.16; ry += (y-ry)*0.16;
    ring.style.transform='translate('+rx+'px,'+ry+'px)';
    requestAnimationFrame(tick);
  })();
  var СЕЛЕКТОР = 'a,button,input,label,select,[data-cur]';
  addEventListener('mouseover', function(e){
    var t = e.target.closest && e.target.closest(СЕЛЕКТОР);
    ring.classList.toggle('on', !!t);
    ring.dataset.label = (t && t.dataset.cur) || '';
  }, {passive:true});
  addEventListener('mousedown', function(){ ring.classList.add('press') });
  addEventListener('mouseup',   function(){ ring.classList.remove('press') });
}

/* ── 2. СКРЫТЫЙ ТЕЛЕФОН: номер появляется по нажатию ────────────── */
function телефон(){
  document.querySelectorAll('[data-phone]').forEach(function(el){
    var скрыт = el.dataset.phone || 'Показать телефон';
    el.textContent = скрыт;
    el.setAttribute('role','button'); el.setAttribute('tabindex','0');
    el.dataset.cur = 'нажми';
    function открыть(e){
      if (el.classList.contains('open')) return;           // второй клик — уже звонок
      e.preventDefault();
      el.classList.add('open');
      el.textContent = CFG.ТЕЛЕФОН;
      el.setAttribute('href','tel:'+CFG.ТЕЛЕФОН_СЫРОЙ);
      el.dataset.cur = 'позвонить';
      el.animate([{opacity:0,filter:'blur(6px)'},{opacity:1,filter:'blur(0)'}],
                 {duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
    }
    el.addEventListener('click', открыть);
    el.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' ') открыть(e) });
  });
}

/* ── 4. ЗАЯВКА: письмо на почту без сервера ─────────────────────── */
function заявка(){
  document.querySelectorAll('form[data-mail]').forEach(function(f){
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var d = new FormData(f), стр = [];
      d.forEach(function(v,k){ if(String(v).trim()) стр.push(k+': '+v) });
      /* Имя файла из адреса приходит уже процентно-закодированным (у нас имена
         кириллицей), а ниже тело письма кодируется ещё раз — менеджер получал
         «%D0%B2%D0%B0%D1%80…» вместо «вариант-23-concrete.html». Раскодируем. */
      var имяСтраницы = location.pathname.split('/').pop();
      try { имяСтраницы = decodeURIComponent(имяСтраницы); } catch (e) {}
      var тело = 'Заявка с сайта ДА-медиа\n\n'+стр.join('\n')+
                 '\n\nСтраница: '+имяСтраницы;
      location.href = 'mailto:'+CFG.ПОЧТА+
        '?subject='+encodeURIComponent('Заявка на рекламу — ДА-медиа')+
        '&body='+encodeURIComponent(тело);
      var ок = f.querySelector('[data-mail-ok]');
      if (ок){ ок.hidden=false; ок.textContent='Открываем почту… Если окно не появилось — пишите на '+CFG.ПОЧТА; }
    });
  });
}

/* ── 5. КОНТАКТЫ: ссылки подставляются из настроек ──────────────── */
function контакты(){
  var карта = {tg:CFG.TELEGRAM, wa:CFG.WHATSAPP, max:CFG.MAX, mail:'mailto:'+CFG.ПОЧТА};
  document.querySelectorAll('[data-link]').forEach(function(a){
    var u = карта[a.dataset.link];
    if (u) a.href = u;
    a.target = '_blank'; a.rel = 'noopener';
  });
  document.querySelectorAll('[data-mailtext]').forEach(function(e){ e.textContent = CFG.ПОЧТА });
}

/* ── 6. ПОЯВЛЕНИЕ ПРИ ПРОКРУТКЕ ─────────────────────────────────── */
function появление(){
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){
      if(!e.isIntersecting) return;
      var d = +(e.target.dataset.delay||0);
      e.target.animate([{opacity:0,transform:'translateY(22px)'},{opacity:1,transform:'none'}],
        {duration:760, delay:d, easing:'cubic-bezier(.22,1,.36,1)', fill:'both'});
      io.unobserve(e.target);
    });
  },{threshold:.14, rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('[data-rv]').forEach(function(el,i){
    el.dataset.delay = (i%5)*60; io.observe(el);
  });
}

/* ── 7. ШАПКА ТЕМНЕЕТ ПРИ ПРОКРУТКЕ ─────────────────────────────── */
function шапка(){
  var h = document.querySelector('[data-header]'); if(!h) return;
  var f = function(){ h.classList.toggle('on', scrollY>40) };
  addEventListener('scroll', f, {passive:true}); f();
}

function старт(){ курсор(); телефон(); заявка(); контакты(); появление(); шапка(); }
document.readyState==='loading' ? addEventListener('DOMContentLoaded',старт) : старт();
})();
