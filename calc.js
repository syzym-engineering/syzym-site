/* Расчётное ядро калькулятора: прил. Б СП 63.13330, односторонний платформенный стык.
   Rc (ηm, ηpl, ηj) — по исходному calculator.html. Несущая способность — через приведённую площадь:
     N = Rc · A_red,  A_red = (t·dj + n·(μ·t·dj + m_узл·π·d²/4)) · k_вкл,  n = Es / Eb,
     k_вкл = 1 − m_вкл·a·b / (t·dj);  без галочек узел и включение не учитываются.
   Единицы: МПа, мм, м², кН/м. */
(function(){
  var RB_TABLE = {
    'B1.5':0,'B2':0,'B2.5':0,'B3.5':2.1,'B5':2.8,'B7.5':4.5,'B10':6,'B12.5':7.5,
    'B15':8.5,'B20':11.5,'B25':14.5,'B30':17,'B35':19.5,'B40':22,'B45':25,'B50':27.5,
    'B55':30,'B60':33,'B70':37,'B80':41,'B90':44,'B100':47.5
  };
  // Начальный модуль упругости бетона Eb, МПа (СП 63.13330, табл. 6.11)
  var EB_TABLE = {
    'B3.5':9500,'B5':13000,'B7.5':16000,'B10':19000,'B12.5':21500,'B15':24000,'B20':27500,'B25':30000,
    'B30':32500,'B35':34500,'B40':36000,'B45':37000,'B50':38000,'B55':39000,'B60':39500,
    'B70':41000,'B80':42000,'B90':42500,'B100':43000
  };
  var ES = 200000;                  // модуль упругости стали, МПа
  var GAMMA_BI = 0.9 * 0.9 * 0.85;  // γb1·γb2·γb3
  var EMAIL = 'info.ahmet@yandex.ru';

  function classNumeric(cls){ return parseFloat(cls.replace('B','')); }
  function $(id){ return document.getElementById(id); }
  function num(id){ var el = $(id); return el ? parseFloat(el.value) : NaN; }
  function fmt(n, d){ return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d===undefined?3:d }); }

  function fillClass(sel, def){
    if (!sel) return;
    Object.keys(RB_TABLE).forEach(function(c){
      if (RB_TABLE[c] === 0) return;
      var o = document.createElement('option'); o.value = c; o.textContent = c.replace('B','В');
      if (c === def) o.selected = true; sel.appendChild(o);
    });
  }

  // ---------- Калибровочная таблица ηs (coefficients.json) ----------
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

  // ---------- Приведённая площадь контакта ----------
  // A     = t·dj                                   — базовая площадь контакта
  // As    = μ·A + m_узл·π·d²/4                     — арматура панели + узел как стержневая арматура
  // A_red = (A + n·As)·k_вкл,  n = Es / Eb(стены)  — приведённая площадь
  // k_вкл = 1 − m_вкл·a·b / A                      — включения вычитаются из площади контакта
  function reducedArea(base, opt, armPercent){
    var A = base.t * base.dj;
    var n = ES / (EB_TABLE[base.classWall] || 30000);
    var mu = Math.max(0, armPercent || 0) / 100;
    var AsArm = mu * A;
    var AsNode = (opt.nodeOn && opt.d > 0) ? Math.max(1, opt.nodeCount || 1) * Math.PI * opt.d * opt.d / 4 : 0;
    var kIncl = (opt.inclOn && opt.a > 0 && opt.b > 0) ? Math.max(0, 1 - Math.max(1, opt.inclCount || 1) * opt.a * opt.b / A) : 1;
    var Ared = (A + n * (AsArm + AsNode)) * kIncl;
    return { A:A, n:n, AsArm:AsArm, AsNode:AsNode, kIncl:kIncl, kArm:1 + n*mu, kNode:1 + n*AsNode/A, Ared:Ared };
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
    var Ared = p.Ared === undefined ? p.t * p.dj : p.Ared;  // мм²
    var NjN = Rc * Ared;                                   // Н (МПа · мм²)
    var NjLongN = 0.9 * NjN;
    var perM = p.dj / 1000;                                // длина стыка, м
    return { etaM:etaM, etaPl:etaPl, etaJ:etaJ, Rc:Rc, Ared:Ared, NjN:NjN, NjLongN:NjLongN,
             Nj_kNm: NjN / 1000 / perM, NjLong_kNm: NjLongN / 1000 / perM };
  }

  function readBase(px){
    return {
      t: num(px+'_t'), dj: num(px+'_dj'),
      classWall: $(px+'_classWall').value, classPlate: $(px+'_classPlate').value,
      Rm: num(px+'_Rm'), tmnom: num(px+'_tmnom'), bj: num(px+'_bj'),
      deltaW: num(px+'_deltaW'), deltaP: num(px+'_deltaP')
    };
  }
  function readOptions(px){
    return {
      inclOn: $(px+'_inclOn').checked, a: num(px+'_inclA'), b: num(px+'_inclB'), inclCount: num(px+'_inclN'),
      nodeOn: $(px+'_nodeOn').checked, d: num(px+'_nodeD'), nodeCount: num(px+'_nodeN')
    };
  }
  function valid(b){
    for (var k in b){ if (typeof b[k] === 'number' && !(isFinite(b[k]))) return false; }
    return b.t > 0 && b.dj > 0 && b.bj > 0;
  }

  function etaNote(look){
    if (look.empty) return 'ηs = 1,0 — калибровочная поправка по результатам численных серий пока не задана.';
    var msg = 'ηs = ' + fmt(look.value,4) + '. ' + (look.exact ? 'Точное совпадение с калибровочной точкой.' : 'Интерполяция по ' + look.sourceCount + ' калибровочным точкам.');
    if (look.usedFallbackType) msg += ' Для этого случая точек нет — использованы все.';
    if (look.value < 1 || look.value > 1.3) msg += ' Внимание: вне диапазона 1,0–1,3 по СП 63.13330.';
    return msg;
  }

  function optText(opt){
    return 'Включение: ' + (opt.inclOn ? (opt.inclCount || 1) + ' шт. × ' + opt.a + ' × ' + opt.b + ' мм' : 'нет') +
           '\nУзел: ' + (opt.nodeOn ? (opt.nodeCount || 1) + ' шт., стержневой аналог Ø' + opt.d + ' мм' : 'нет');
  }
  function mailtoFor(base, opt, extra, res){
    var body = 'Здравствуйте! Прошу проверить расчёт стыка.\n\n' +
      'Толщина панели t: ' + base.t + ' мм\nДлина стыка dj: ' + base.dj + ' мм\n' +
      'Бетон стены / плиты: ' + base.classWall.replace('B','В') + ' / ' + base.classPlate.replace('B','В') + '\n' +
      'Раствор Rm: ' + base.Rm + ' МПа, шов ' + base.tmnom + ' мм, bj ' + base.bj + ' мм\n' +
      optText(opt) + '\n' + extra +
      '\nРезультат: Nj,дл = ' + fmt(res.NjLong_kNm,1) + ' кН/м (Rc = ' + fmt(res.Rc,3) + ' МПа, A_red = ' + fmt(res.Ared/1e6,4) + ' м²)\n\nКонтакты для связи:\n';
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Заявка: расчёт стыка') + '&body=' + encodeURIComponent(body);
  }

  /* ---------- Калькулятор (prefix c): два режима, пересчёт на лету ---------- */
  function initCalc(){
    if (!$('c_t')) return;
    fillClass($('c_classWall'),'B25'); fillClass($('c_classPlate'),'B20');

    function mode(){ var r = document.querySelector('input[name="c_mode"]:checked'); return r ? r.value : 'direct'; }
    function cell(label, v){ return '<div><div class="label">' + label + '</div><div class="v">' + v + '</div></div>'; }

    function applyMode(){
      var m = mode();
      document.querySelectorAll('#calcShell .mode-direct').forEach(function(el){ el.hidden = (m !== 'direct'); });
      document.querySelectorAll('#calcShell .mode-select').forEach(function(el){ el.hidden = (m !== 'select'); });
    }
    function applyOptions(){
      [['c_inclOn','c_inclBody'],['c_nodeOn','c_nodeBody']].forEach(function(pair){
        var on = $(pair[0]).checked;
        $(pair[1]).hidden = !on;
        $(pair[0]).closest('.opt').classList.toggle('on', on);
      });
    }
    function kCells(ra){
      return cell('A<sub>red</sub>', fmt(ra.Ared/1e6,4) + ' м²') + cell('k<sub>арм</sub> = 1 + n·μ', fmt(ra.kArm,3)) +
             cell('k<sub>узел</sub>', fmt(ra.kNode,3)) + cell('k<sub>вкл</sub>', fmt(ra.kIncl,3));
    }
    function nNote(ra){ return 'n = Es / Eb = ' + fmt(ra.n,2) + '. A = t·dj = ' + fmt(ra.A/1e6,4) + ' м². '; }

    function run(){
      var base = readBase('c');
      if (!valid(base)) return;
      var opt = readOptions('c');
      var inclType = opt.inclOn ? 'с включением' : 'без включений';
      var ecc = num('c_ecc') || 0;
      if (mode() === 'direct') {
        var arm = num('c_arm') || 0;
        var ra = reducedArea(base, opt, arm);
        var look = lookupEtaS(arm, inclType, ecc);
        var res = computeJoint(Object.assign({}, base, { etaS: look.value, Ared: ra.Ared }));
        $('c_outLabel').textContent = 'Длительная несущая способность Nj';
        $('c_out').innerHTML = fmt(res.NjLong_kNm,0) + '<small>кН/м</small>';
        $('c_grid').innerHTML = cell('Rc', fmt(res.Rc,2) + ' МПа') + cell('Nj, кратковременная', fmt(res.Nj_kNm,0) + ' кН/м') + kCells(ra);
        $('c_note').textContent = nNote(ra) + etaNote(look);
        $('c_mail').href = mailtoFor(base, opt, 'Армирование μ: ' + arm + ' %, e = ' + ecc + ' мм', res);
      } else {
        var required = num('c_required'), maxArm = num('c_maxArm');
        if (!isFinite(required) || !isFinite(maxArm)) return;
        var found = null, last = null, lastRa = null, lastLook = null;
        for (var a = 0; a <= maxArm + 1e-9; a += 0.05) {
          var r_a = reducedArea(base, opt, a);
          var lk = lookupEtaS(a, inclType, ecc);
          var r = computeJoint(Object.assign({}, base, { etaS: lk.value, Ared: r_a.Ared }));
          last = r; lastRa = r_a; lastLook = lk;
          if (r.NjLong_kNm >= required) { found = { arm:a, res:r, ra:r_a, look:lk }; break; }
        }
        $('c_outLabel').textContent = 'Минимальное армирование';
        if (found) {
          $('c_out').innerHTML = fmt(found.arm,2) + '<small>%</small>';
          $('c_grid').innerHTML = cell('Nj, длительная', fmt(found.res.NjLong_kNm,0) + ' кН/м') + cell('Требуется', fmt(required,0) + ' кН/м') + kCells(found.ra);
          $('c_note').textContent = nNote(found.ra) + etaNote(found.look);
          $('c_mail').href = mailtoFor(base, opt, 'Подбор армирования: требуемая N = ' + required + ' кН/м, найдено μ = ' + fmt(found.arm,2) + ' %, e = ' + ecc + ' мм', found.res);
        } else {
          $('c_out').innerHTML = 'не достигнута';
          $('c_grid').innerHTML = cell('Максимум', fmt(last.NjLong_kNm,0) + ' кН/м') + cell('Требуется', fmt(required,0) + ' кН/м') + kCells(lastRa);
          $('c_note').textContent = 'До μ = ' + fmt(maxArm,1) + ' % требуемая нагрузка не обеспечена. Увеличьте толщину панели, класс бетона или диапазон перебора. ' + nNote(lastRa);
          $('c_mail').href = mailtoFor(base, opt, 'Подбор армирования: требуемая N = ' + required + ' кН/м не достигнута до μ = ' + maxArm + ' %', last);
        }
      }
    }

    document.querySelectorAll('#calcShell input, #calcShell select').forEach(function(el){
      el.addEventListener('input', run); el.addEventListener('change', run);
    });
    ['c_inclOn','c_nodeOn'].forEach(function(id){ $(id).addEventListener('change', function(){ applyOptions(); run(); }); });
    document.querySelectorAll('input[name="c_mode"]').forEach(function(r){ r.addEventListener('change', function(){ applyMode(); run(); }); });
    $('c_run').addEventListener('click', function(){ run(); if (window.innerWidth < 860) $('c_side').scrollIntoView({ behavior:'smooth', block:'start' }); });
    applyMode(); applyOptions(); setTimeout(run, 50); setTimeout(run, 700);
  }

  document.addEventListener('DOMContentLoaded', initCalc);
})();
