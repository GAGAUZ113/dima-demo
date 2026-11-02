/* ══════════════════════════════════════════════════════════════════════════
   ПОТОК — текущие световые нити. Один файл, без зависимостей, работает офлайн.

   ОТКУДА ТЕХНИКА
   Из демо «Vary: WebGPU Curl lines» (omma.build). Там three.js + WebGPU + TSL:
   3600 нитей по 72 сегмента, трёхмерное поле завихрений, свечение через bloom.
   Взято оттуда: многооктавный curl noise, подсветка «головы» нити и разброс
   оттенка между нитями.

   ЧЕМ ОТЛИЧАЕТСЯ И ПОЧЕМУ
   · Оригинал тянет three.webgpu.js (~1,5 МБ) с чужого CDN — наши сайты обязаны
     работать без интернета, поэтому зависимости не годятся.
   · WebGPU поддержан не везде; WebGL2 есть во всех браузерах с 2017 года.
   · Вместо симуляции частиц со следами — «размазывание» редкого зерна вдоль
     течения прямо в шейдере (line integral convolution).

   ДВА ПРОХОДА — ИНАЧЕ НЕ ТЯНЕТ
   Первый вариант считал поле завихрений заново в каждом пикселе экрана:
   768 обращений к шуму на пиксель, 7 кадров в секунду на MacBook Air.
   Теперь поле считается один раз в текстуру 512×512 (проход «поле»),
   а нити только читают из неё готовые направления (проход «нити»).
   Тот же рисунок, в десятки раз дешевле.

   ПОДКЛЮЧЕНИЕ
     <canvas id="фон"></canvas>
     <script src="../assets/js/поток.js"></script>
     <script>Поток.запустить('#фон', { цвет:'#FF6A13', цвет2:'#7FE3FF' })</script>

   НАСТРОЙКИ (все необязательны)
     цвет      основной цвет нитей          '#FF6A13'
     цвет2     холодный подсвет на бликах   '#7FE3FF'
     скорость  как быстро течёт             0.14
     масштаб   крупность завихрений         1.4   (меньше = крупнее вихри)
     густота   сколько нитей                110   (больше = нити тоньше и чаще)
     порог     где начинается свечение      0.115 (больше = темнее, нитей меньше)
     размах    мягкость края нити           0.06
     яркость   общая сила свечения          1.0
     октавы    слоёв шума: 1..4             3     (больше = сложнее рисунок)
     чёткость  предел плотности пикселей    1.25  (меньше = быстрее на слабых)

   ВОЗВРАЩАЕТ  { стоп, пуск, настроить } либо null, если WebGL2 нет.
   ══════════════════════════════════════════════════════════════════════════ */
(function (глобал) {
'use strict';

/* Шейдеры пишутся на латинице: GLSL не принимает кириллицу в именах.
   Соответствие имён:
     screen=экран  time=время  mouse=мышь  tint/tint2=оттенок/подсвет
     half_=половина области поля  flow()=чтение поля  step_len=шаг хода
     density=густота  bright=яркость  oct=октавы
     floorv=порог  spread=размах  curl()=поле завихрений  fbm()=слоистый шум */

var ВЕРШИННЫЙ = [
'#version 300 es',
'in vec2 pos;',
'void main(){ gl_Position = vec4(pos, 0.0, 1.0); }'
].join('\n');

/* Общая часть обоих шейдеров: шум. */
var ШУМ = [
'float hash21(vec2 p){',
'  p = fract(p * vec2(123.34, 456.21));',
'  p += dot(p, p + 45.32);',
'  return fract(p.x * p.y);',
'}',
'',
'float vnoise(vec2 p){',
'  vec2 i = floor(p), f = fract(p);',
'  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);',
'  return mix(mix(hash21(i),                 hash21(i + vec2(1.0, 0.0)), u.x),',
'             mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);',
'}'
].join('\n');

/* ПРОХОД 1 «поле» — направление течения в каждой точке, в текстуру 512×512.
   Направление пакуется в цвет: -1..1 → 0..1, точности байта здесь хватает. */
var ПОЛЕ_ФРАГ = [
'#version 300 es',
'precision highp float;',
'out vec4 outColor;',
'uniform vec2  half_;',
'uniform vec2  fieldSize;',
'uniform float time;',
'uniform int   oct;',
ШУМ,
'float fbm(vec2 p){',
'  float s = 0.0, a = 0.5, an = 0.0;',
'  for (int i = 0; i < 4; i++){',
'    if (i >= oct) break;',
'    s += a * vnoise(p);',
'    an += a;',
'    p *= 2.07; a *= 0.45;',
'  }',
'  return an > 0.0 ? s / an : 0.0;',
'}',
'',
'void main(){',
'  vec2 tc = gl_FragCoord.xy / fieldSize;',
'  vec2 p  = (tc * 2.0 - 1.0) * half_;',
'  float e = 0.06;',
'  float a = fbm(p + vec2(0.0,  e) + time);',
'  float b = fbm(p + vec2(0.0, -e) + time);',
'  float c = fbm(p + vec2( e, 0.0) + time);',
'  float d = fbm(p + vec2(-e, 0.0) + time);',
'  vec2 v = vec2(a - b, -(c - d));',
'  float L = length(v);',
'  v = L > 1e-5 ? v / L : vec2(1.0, 0.0);',
/* Крутизна поворота течения — её потом используем для холодного блика.
   Считаем здесь же, пока поле под рукой, и кладём в третий канал. */
'  float turn = clamp(L * 26.0, 0.0, 1.0);',
'  outColor = vec4(v * 0.5 + 0.5, turn, 1.0);',
'}'
].join('\n');

/* ПРОХОД 2 «нити» — идём по течению и размазываем вдоль него редкое зерно.
   Ключ к тонким нитям: зерно должно быть РЕДКИМ. pow(шум, 6) оставляет редкие
   яркие точки, ход по полю вытягивает каждую в нить. Если размазывать гладкий
   шум как есть — выходят мраморные пятна, а не линии. */
var НИТИ_ФРАГ = [
'#version 300 es',
'precision highp float;',
'out vec4 outColor;',
'uniform sampler2D field;',
'uniform vec2  screen;',
'uniform vec2  half_;',
'uniform float time;',
'uniform vec2  mouse;',
'uniform vec3  tint;',
'uniform vec3  tint2;',
'uniform float scale;',
'uniform float density;',
'uniform float bright;',
'uniform float floorv;',
'uniform float spread;',
'uniform float corner;',
ШУМ,
'vec3 flow(vec2 q){',
'  vec2 tc = q / half_ * 0.5 + 0.5;',
'  vec3 s = texture(field, clamp(tc, 0.001, 0.999)).xyz;',
'  vec2 v = s.xy * 2.0 - 1.0;',
'  float L = length(v);',
'  return vec3(L > 1e-4 ? v / L : vec2(1.0, 0.0), s.z);',
'}',
'',
'void main(){',
'  vec2 frag = gl_FragCoord.xy;',
/* Нормируем по МЕНЬШЕЙ стороне: иначе на вертикальном экране телефона вихри
   растягиваются в годовые кольца — рисунок должен быть одинаково крупным
   и на десктопе, и на телефоне. */
'  vec2 uv = (frag - 0.5 * screen) / min(screen.x, screen.y);',
'',
'  vec2 toMouse = uv - (mouse - 0.5) * screen / min(screen.x, screen.y);',
'  float pull = 0.45 / (1.0 + dot(toMouse, toMouse) * 10.0);',
'',
'  vec2 p = uv * scale;',
'',
'  const int STEPS = 40;',
/* Шаг обязан быть меньше зерна, иначе ход проскакивает ячейки шума и нить
   выходит пунктиром. Половина ячейки — надёжно. */
'  float step_len = 0.5 / max(density, 1.0);',
'  float sum = 0.0, w = 0.0, turn = 0.0;',
'  vec2 fwd = p, bwd = p;',
'  for (int i = 0; i < STEPS; i++){',
'    vec3 f1 = flow(fwd), f2 = flow(bwd);',
'    fwd += f1.xy * step_len;',
'    bwd -= f2.xy * step_len;',
'    if (i == 0) turn = f1.z;',
/* Бегущая волна по весам — свет едет вдоль нити, а не просто мерцает. */
'    float k = (1.0 - float(i) / float(STEPS)) * (0.85 + 0.15 * cos(float(i) * 0.42 - time * 4.0));',
'    float a = vnoise(fwd * density);',
'    float b = vnoise(bwd * density);',
'    a = a * a; a = a * a * a;',
'    b = b * b; b = b * b * b;',
'    sum += (a + b) * k;',
'    w   += 2.0 * k;',
'  }',
'  float lines = w > 0.0 ? sum / w : 0.0;',
'  lines = smoothstep(floorv, floorv + spread, lines);',
'',
'  float glint = smoothstep(0.30, 1.0, turn) * lines;',
'',
'  float lot = hash21(floor(p * 3.0));',
'  float shift = (lot - 0.5) * 0.5;',
'',
'  float r = length(uv * vec2(0.86, 1.0)) / corner;',
'  float vign = smoothstep(1.05, 0.08, r);',
'',
'  float power = lines * vign * (0.75 + pull);',
'',
'  vec3 c = tint * power;',
'  c.r *= 1.0 + shift * 0.35;',
'  c.g *= 1.0 - shift * 0.25;',
'  c = mix(c, tint2, glint * 0.45 * vign);',
'  c += tint * power * power * 0.6;',
'  c *= bright;',
'  c += (hash21(frag + time) - 0.5) * 0.012;',
'',
'  outColor = vec4(max(c, 0.0), 1.0);',
'}'
].join('\n');

function вЧисла (hex) {
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}

function собрать (gl, тип, код) {
  var ш = gl.createShader(тип);
  gl.shaderSource(ш, код);
  gl.compileShader(ш);
  if (!gl.getShaderParameter(ш, gl.COMPILE_STATUS)) {
    console.warn('Поток — шейдер не собрался:\n' + gl.getShaderInfoLog(ш));
    gl.deleteShader(ш);
    return null;
  }
  return ш;
}

function программа (gl, фрагмент) {
  var вш = собрать(gl, gl.VERTEX_SHADER,   ВЕРШИННЫЙ);
  var фш = собрать(gl, gl.FRAGMENT_SHADER, фрагмент);
  if (!вш || !фш) return null;
  var пр = gl.createProgram();
  gl.attachShader(пр, вш); gl.attachShader(пр, фш); gl.linkProgram(пр);
  if (!gl.getProgramParameter(пр, gl.LINK_STATUS)) {
    console.warn('Поток — программа не слинковалась:\n' + gl.getProgramInfoLog(пр));
    return null;
  }
  return пр;
}

function адреса (gl, пр, имена) {
  var U = {};
  имена.forEach(function(имя){ U[имя] = gl.getUniformLocation(пр, имя); });
  return U;
}

var РАЗМЕР_ПОЛЯ = 512;

function запустить (цель, н) {
  var холст = typeof цель === 'string' ? document.querySelector(цель) : цель;
  if (!холст) { console.warn('Поток: холст не найден —', цель); return null; }
  н = н || {};

  var цвет     = вЧисла(н.цвет  || '#FF6A13');
  var цвет2    = вЧисла(н.цвет2 || '#7FE3FF');
  var скорость = н.скорость !== undefined ? н.скорость : 0.14;
  var масштаб  = н.масштаб  !== undefined ? н.масштаб  : 1.4;
  var чёткость = н.чёткость !== undefined ? н.чёткость : 1.25;
  var тихо = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var gl = холст.getContext('webgl2', {antialias:false, alpha:false, powerPreference:'high-performance'});
  if (!gl) { холст.style.display = 'none'; return null; }

  var прогПоле = программа(gl, ПОЛЕ_ФРАГ);
  var прогНити = программа(gl, НИТИ_ФРАГ);
  if (!прогПоле || !прогНити) { холст.style.display = 'none'; return null; }

  var буфер = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, буфер);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  [прогПоле, прогНити].forEach(function(пр){
    var поз = gl.getAttribLocation(пр, 'pos');
    gl.enableVertexAttribArray(поз);
    gl.vertexAttribPointer(поз, 2, gl.FLOAT, false, 0, 0);
  });

  /* текстура поля + кадровый буфер, в который её рисуем */
  var текстура = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, текстура);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, РАЗМЕР_ПОЛЯ, РАЗМЕР_ПОЛЯ, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  var кб = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, кб);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, текстура, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  var UП = адреса(gl, прогПоле, ['half_','fieldSize','time','oct']);
  var UН = адреса(gl, прогНити, ['field','screen','half_','time','mouse','tint','tint2',
                                 'scale','density','bright','floorv','spread','corner']);

  gl.useProgram(прогПоле);
  gl.uniform2f(UП.fieldSize, РАЗМЕР_ПОЛЯ, РАЗМЕР_ПОЛЯ);
  gl.uniform1i(UП.oct, н.октавы !== undefined ? н.октавы : 3);

  gl.useProgram(прогНити);
  gl.uniform1i(UН.field, 0);
  gl.uniform3f(UН.tint,  цвет[0],  цвет[1],  цвет[2]);
  gl.uniform3f(UН.tint2, цвет2[0], цвет2[1], цвет2[2]);
  gl.uniform1f(UН.scale,   масштаб);
  gl.uniform1f(UН.density, н.густота !== undefined ? н.густота : 110.0);
  gl.uniform1f(UН.bright,  н.яркость !== undefined ? н.яркость : 1.0);
  gl.uniform1f(UН.floorv,  н.порог  !== undefined ? н.порог  : 0.115);
  gl.uniform1f(UН.spread,  н.размах !== undefined ? н.размах : 0.060);

  var мx = 0.5, мy = 0.5, цx = 0.5, цy = 0.5;
  addEventListener('mousemove', function(e){
    var к = холст.getBoundingClientRect();
    if (!к.width || !к.height) return;
    цx = (e.clientX - к.left) / к.width;
    цy = 1.0 - (e.clientY - к.top) / к.height;
  }, {passive:true});

  /* Область, которую покрывает текстура поля: экран плюс запас, потому что
     ход по течению уводит за край кадра. */
  var полХ = 1, полY = 1;
  function пересчитатьОбласть (w, h) {
    var мин = Math.min(w, h);
    полХ = 0.5 * (w / мин) * масштаб + 0.6;
    полY = 0.5 * (h / мин) * масштаб + 0.6;
    var уголок = Math.sqrt(Math.pow(0.86 * 0.5 * w / мин, 2) + Math.pow(0.5 * h / мин, 2));
    gl.useProgram(прогПоле); gl.uniform2f(UП.half_, полХ, полY);
    gl.useProgram(прогНити); gl.uniform2f(UН.half_, полХ, полY);
    gl.uniform1f(UН.corner, уголок);
  }

  function размер () {
    var пр = Math.min(devicePixelRatio || 1, чёткость);
    var w = Math.max(1, Math.floor(холст.clientWidth  * пр));
    var h = Math.max(1, Math.floor(холст.clientHeight * пр));
    if (холст.width !== w || холст.height !== h) {
      холст.width = w; холст.height = h;
      gl.useProgram(прогНити);
      gl.uniform2f(UН.screen, w, h);
      пересчитатьОбласть(w, h);
    }
  }
  addEventListener('resize', function(){
    размер();
    if (тихо) { идёт = true; кадр = requestAnimationFrame(рисовать); }
  }, {passive:true});
  размер();

  var видно = true, идёт = true, t0 = performance.now(), кадр = 0;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function(з){ видно = з[0].isIntersecting; }, {threshold:0}).observe(холст);
  }
  document.addEventListener('visibilitychange', function(){ видно = !document.hidden; });

  function рисовать (сейчас) {
    if (!идёт) return;
    кадр = requestAnimationFrame(рисовать);
    if (!видно) return;                       /* за экраном — не тратим батарею */
    размер();
    var t = тихо ? 3.7 : (сейчас - t0) * 0.001 * скорость;

    /* проход 1 — поле течения в текстуру */
    gl.bindFramebuffer(gl.FRAMEBUFFER, кб);
    gl.viewport(0, 0, РАЗМЕР_ПОЛЯ, РАЗМЕР_ПОЛЯ);
    gl.useProgram(прогПоле);
    gl.uniform1f(UП.time, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* проход 2 — нити на экран */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, холст.width, холст.height);
    gl.useProgram(прогНити);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, текстура);
    мx += (цx - мx) * 0.06;
    мy += (цy - мy) * 0.06;
    gl.uniform2f(UН.mouse, мx, мy);
    gl.uniform1f(UН.time, тихо ? 0.0 : (сейчас - t0) * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (тихо) { идёт = false; cancelAnimationFrame(кадр); }   /* тихий режим — один кадр */
  }
  кадр = requestAnimationFrame(рисовать);

  return {
    стоп: function(){ идёт = false; cancelAnimationFrame(кадр); },
    пуск: function(){ if (!идёт) { идёт = true; t0 = performance.now(); кадр = requestAnimationFrame(рисовать); } },
    настроить: function(о){
      if (о.скорость !== undefined) скорость = о.скорость;
      gl.useProgram(прогПоле);
      if (о.октавы   !== undefined) gl.uniform1i(UП.oct, о.октавы);
      gl.useProgram(прогНити);
      if (о.яркость  !== undefined) gl.uniform1f(UН.bright,  о.яркость);
      if (о.густота  !== undefined) gl.uniform1f(UН.density, о.густота);
      if (о.порог    !== undefined) gl.uniform1f(UН.floorv,  о.порог);
      if (о.размах   !== undefined) gl.uniform1f(UН.spread,  о.размах);
      if (о.масштаб  !== undefined) {
        масштаб = о.масштаб;
        gl.uniform1f(UН.scale, масштаб);
        пересчитатьОбласть(холст.width, холст.height);
      }
      if (о.цвет)  { var c = вЧисла(о.цвет);  gl.uniform3f(UН.tint,  c[0], c[1], c[2]); }
      if (о.цвет2) { var d = вЧисла(о.цвет2); gl.uniform3f(UН.tint2, d[0], d[1], d[2]); }
    }
  };
}

глобал.Поток = { запустить: запустить };
})(window);
