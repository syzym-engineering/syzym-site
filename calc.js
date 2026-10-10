/* Расчётное ядро калькулятора: прил. Б СП 63.13330, односторонний платформенный стык.
   Логика расчёта перенесена из исходного calculator.html без изменений. */
(function(){
  var RB_TABLE = {
    'B1.5':0,'B2':0,'B2.5':0,'B3.5':2.1,'B5':2.8,'B7.5':4.5,'B10':6,'B12.5':7.5,
    'B15':8.5,'B20':11.5,'B25':14.5,'B30':17,'B35':19.5,'B40':22,'B45':25,'B50':27.5,
    'B55':30,'B60':33,'B70':37,'B80':41,'B90':44,'B100':47.5
  };
  var GAMMA_BI = 0.9 * 0.9 * 0.85; // γb1·γb2·γb3
  var INCLUSION_TYPES = ['без включений','эл. коробка на НСП','эл. коробка на ВСП','эл. коробки на обеих панелях'];
  // Отображаемые подписи (значения совпадают с coefficients.json)
  var INCLUSION_LABELS = { 'без включений':'без включений', 'эл. коробка на НСП':'в нижней СП', 'эл. коробка на ВСП':'в верхней СП', 'эл. коробки на обеих панелях':'в обеих СП' };
  var EMAIL = 'info.ahmet@yandex.ru';

  function classNumeric(cls){ return parseFloat(cls.replace('B','')); }
  function $(id){ return document.getElementById(id); }
  function num(id){ var el = $(id); return el ? parseFloat(el.value) : NaN; }
  function fmt(n, d){ return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d===undefined?3:d }); }

  function fillClass(sel, def){
    if (!sel) return;
    Object.keys(RB_TABLE).forEach(function(c){
      if (RB_TABLE[c] === 0) return; // классы без Rb в таблице не предлагаем
      var o = document.createElement('option'); o.value = c; o.textContent = c.replace('B','В');
      if (c === def) o.selected = true; sel.appendChild(o);
    });
  }
  function fillIncl(sel){
    if (!sel) return;
    INCLUSION_TYPES.forEach(function(t){ var o = document.createElement('option'); o.value = t; o.textContent = INCLUSION_LABELS[t] || t; sel.appendChild(o); });
  }

  var coeffData = { rows: [] };
  fetch('coefficients.json').then(function(r){ return r.json(); }).then(function(d){ coeffData = d; })
    .catch(function(){ /* нет файла — ηs = 1.0 */ });

  function lookupEtaS(armPercent, inclusionType, eccentricity){
    var rows = (coeffData && coeffData.rows) || [];
    if (!rows.length) return { value: 1.0, sourceCount: 0, exact: false, empty: true };
    var pool = rows.filter(function(r){ return r.inclusionType === inclusionType; });
    var usedFallbackType = false;
    if (!pool.length) { pool = rows; usedFallbackType = true; }
    var exact = pool.find(function(r){ return Math.abs(r.armPercent - armPercent) < 1e-9 && Math.abs(r.eccentricity - eccentricity) < 1e-9; });
    if (exact) return { value: exact.coefficient, sourceCount: 1, exact: true, usedFallbackType: usedFallbackType };
    var wSum = 0, vSum = 0;
    pool.forEach(function(r){
      var dA = r.armPercent - armPercent, dE = r.eccentricity - eccentricity;
      var dist = Math.sqrt(dA*dA + dE*dE) || 1e-6, w = 1/(dist*dist);
      wSum += w; vSum += w * r.coefficient;
    });
    return { value: vSum / wSum, sourceCount: pool.length, exact: false, usedFallbackType: usedFallbackType };
  }

  function computeJoint(p){
    var RbwGamma = RB_TABLE[p.classWall] * GAMMA_BI;
    var RbpGamma = RB_TABLE[p.classPlate] * GAMMA_BI;
    var Bw = classNumeric(p.classWall);
    var tm = 1.4 * p.tmnom;
    var deltaPl = Math.sqrt(p.deltaP*p.deltaP + p.deltaW*p.deltaW);
    var bm = p.bj - deltaPl;
    var etaM = 1 - (2 - tm/bm) * (tm/bm) / (1 + 2*p.Rm/Bw);
    var etaPl = (RbpGamma < RbwGamma) ? (1 - Math.pow(1 - RbpGamma/RbwGamma, 2)) : 1;
    var etaJ = (p.bj - deltaPl) * 1.0 * etaPl / p.t;
    var Rc = RbwGamma * etaM * etaJ * p.etaS;
    var NjN = Rc * p.t * p.dj;
    var NjLongN = 0.9 * NjN;
    var NjLong_tPerM = (NjLongN / (p.dj/1000)) / 9806.65;
    return { etaM:etaM, etaPl:etaPl, etaJ:etaJ, Rc:Rc, NjN:NjN, NjLongN:NjLongN, NjLong_tPerM:NjLong_tPerM };
  }

  function readBase(px){
    return {
      t: num(px+'_t'), dj: num(px+'_dj'),
      classWall: $(px+'_classWall').value, classPlate: $(px+'_classPlate').value,
      Rm: num(px+'_Rm'), tmnom: num(px+'_tmnom'), bj: num(px+'_bj'),
      deltaW: num(px+'_deltaW'), deltaP: num(px+'_deltaP')
    };
  }
  function valid(b){
    for (var k in b){ if (typeof b[k] === 'number' && !(isFinite(b[k]))) return false; }
    return b.t > 0 && b.dj > 0 && b.bj > 0;
  }

  function etaNote(look){
    if (look.empty) return 'ηs = 1,0 — базовое значение. Калибровочные коэффициенты по армированию будут добавлены по результатам численных серий.';
    var msg = 'ηs = ' + fmt(look.value,4) + '. ' + (look.exact ? 'Точное совпадение с калибровочной точкой.' : 'Интерполяция по ' + look.sourceCount + ' калибровочным точкам.');
    if (look.usedFallbackType) msg += ' Для этого типа включений точек нет — использованы все.';
    if (look.value < 1 || look.value > 1.3) msg += ' Внимание: вне диапазона 1,0–1,3 по СП 63.13330.';
    return msg;
  }

  function mailtoFor(base, extra, res){
    var body = 'Здравствуйте! Прошу проверить расчёт стыка.\n\n' +
      'Толщина панели t: ' + base.t + ' мм\nШирина стыка dj: ' + base.dj + ' мм\n' +
      'Бетон стены / плиты: ' + base.classWall + ' / ' + base.classPlate + '\n' +
      'Раствор Rm: ' + base.Rm + ' МПа, шов ' + base.tmnom + ' мм, bj ' + base.bj + ' мм\n' +
      extra + '\nРезультат: Nj,дл = ' + fmt(res.NjLong_tPerM,2) + ' тс/м (Rc = ' + fmt(res.Rc,3) + ' МПа)\n\nКонтакты для связи:\n';
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Заявка: расчёт стыка') + '&body=' + encodeURIComponent(body);
  }

  /* ---------- Калькулятор (prefix c): два режима, пересчёт на лету ---------- */
  function initCalc(){
    if (!$('c_t')) return;
    fillClass($('c_classWall'),'B25'); fillClass($('c_classPlate'),'B20'); fillIncl($('c_inclusion'));

    function mode(){ var r = document.querySelector('input[name="c_mode"]:checked'); return r ? r.value : 'direct'; }
    function cell(label, v){ return '<div><div class="label">' + label + '</div><div class="v">' + v + '</div></div>'; }

    function applyMode(){
      var m = mode();
      document.querySelectorAll('#calcShell .mode-direct').forEach(function(el){ el.hidden = (m !== 'direct'); });
      document.querySelectorAll('#calcShell .mode-select').forEach(function(el){ el.hidden = (m !== 'select'); });
    }

    function run(){
      var base = readBase('c');
      if (!valid(base)) return;
      var incl = $('c_inclusion').value, ecc = num('c_ecc') || 0;
      if (mode() === 'direct') {
        var arm = num('c_arm') || 0;
        var look = lookupEtaS(arm, incl, ecc);
        var res = computeJoint(Object.assign({}, base, { etaS: look.value }));
        $('c_outLabel').textContent = 'Длительная несущая способность Nj';
        $('c_out').innerHTML = fmt(res.NjLong_tPerM,1) + '<small>тс/м</small>';
        $('c_grid').innerHTML = cell('Rc', fmt(res.Rc,2) + ' МПа') + cell('Nj, мгновенная', fmt(res.NjN/1000,0) + ' кН') + cell('ηm', fmt(res.etaM,3)) + cell('ηj', fmt(res.etaJ,3));
        $('c_note').textContent = etaNote(look);
        $('c_mail').href = mailtoFor(base, 'Армирование: ' + arm + ' %, включения: ' + (INCLUSION_LABELS[incl] || incl) + ', e = ' + ecc + ' мм', res);
      } else {
        var required = num('c_required'), maxArm = num('c_maxArm');
        if (!isFinite(required) || !isFinite(maxArm)) return;
        var found = null, last = null, lastLook = null;
        for (var a = 0; a <= maxArm + 1e-9; a += 0.05) {
          var lk = lookupEtaS(a, incl, ecc);
          var r = computeJoint(Object.assign({}, base, { etaS: lk.value }));
          last = r; lastLook = lk;
          if (r.NjLong_tPerM >= required) { found = { arm:a, res:r, look:lk }; break; }
        }
        $('c_outLabel').textContent = 'Минимальное армирование';
        if (found) {
          $('c_out').innerHTML = fmt(found.arm,2) + '<small>%</small>';
          $('c_grid').innerHTML = cell('Nj, длительная', fmt(found.res.NjLong_tPerM,1) + ' тс/м') + cell('Требуется', fmt(required,1) + ' тс/м') + cell('Rc', fmt(found.res.Rc,2) + ' МПа') + cell('ηs', fmt(found.look.value,3));
          $('c_note').textContent = etaNote(found.look);
          $('c_mail').href = mailtoFor(base, 'Подбор армирования: требуемая N = ' + required + ' тс/м, найдено ' + fmt(found.arm,2) + ' %, включения: ' + (INCLUSION_LABELS[incl] || incl) + ', e = ' + ecc + ' мм', found.res);
        } else {
          $('c_out').innerHTML = 'не достигнута';
          $('c_grid').innerHTML = cell('Максимум', fmt(last.NjLong_tPerM,1) + ' тс/м') + cell('Требуется', fmt(required,1) + ' тс/м');
          $('c_note').textContent = 'До ' + fmt(maxArm,1) + ' % армирования требуемая нагрузка не обеспечена. Увеличьте толщину панели, класс бетона или диапазон перебора. ' + etaNote(lastLook);
          $('c_mail').href = mailtoFor(base, 'Подбор армирования: требуемая N = ' + required + ' тс/м не достигнута до ' + maxArm + ' %', last);
        }
      }
    }

    document.querySelectorAll('#calcShell input, #calcShell select').forEach(function(el){
      el.addEventListener('input', run); el.addEventListener('change', run);
    });
    document.querySelectorAll('input[name="c_mode"]').forEach(function(r){ r.addEventListener('change', function(){ applyMode(); run(); }); });
    $('c_run').addEventListener('click', function(){ run(); if (window.innerWidth < 860) $('c_side').scrollIntoView({ behavior:'smooth', block:'start' }); });
    applyMode(); setTimeout(run, 50); setTimeout(run, 700);
  }

  document.addEventListener('DOMContentLoaded', initCalc);
})();
