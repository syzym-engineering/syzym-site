document.documentElement.classList.add('js');
document.addEventListener('DOMContentLoaded', function(){
  var nav = document.getElementById('topnav');
  if (nav) {
    window.addEventListener('scroll', function(){ nav.classList.toggle('scrolled', window.scrollY > 8); }, { passive:true });
    var t = nav.querySelector('.menu-toggle');
    if (t) t.addEventListener('click', function(){ var o = nav.classList.toggle('open'); t.setAttribute('aria-expanded', o ? 'true' : 'false'); });
  }

  // Логотип: прорисовка при загрузке
  var brand = document.querySelector('.brand');
  if (brand && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    setTimeout(function(){ brand.classList.add('is-drawing'); setTimeout(function(){ brand.classList.remove('is-drawing'); }, 1350); }, 180);
  }

  // Плавное появление блоков
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add('is-visible'); io.unobserve(e.target); } }); }, { threshold:.1, rootMargin:'0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function(el){ el.classList.add('is-visible'); });
  }

  // Схема стыка ↔ легенда ↔ поля калькулятора: подсветка «что к чему относится»
  var layers = document.querySelectorAll('.j-layer'), rows = document.querySelectorAll('.legend li');
  function showPart(part){
    layers.forEach(function(l){ l.classList.toggle('active', (' ' + l.dataset.parts + ' ').indexOf(' ' + part + ' ') > -1); });
    rows.forEach(function(r){ r.classList.toggle('active', r.dataset.part === part); });
    document.querySelectorAll('#calcShell .field[data-part]').forEach(function(f){ f.classList.toggle('linked', f.dataset.part === part); });
  }
  layers.forEach(function(l){ var p = l.dataset.parts.split(' ')[0]; ['mouseenter','focus','click'].forEach(function(ev){ l.addEventListener(ev, function(){ showPart(p); }); }); });
  rows.forEach(function(r){ ['mouseenter','focus','click'].forEach(function(ev){ r.addEventListener(ev, function(){ showPart(r.dataset.part); }); }); });
  document.querySelectorAll('#calcShell .field[data-part] input, #calcShell .field[data-part] select').forEach(function(el){
    el.addEventListener('focus', function(){ showPart(el.closest('.field').dataset.part); });
  });

  // Раскрытие выпадающего блока по якорю (Новости, Калькулятор)
  function openHash(){
    if (!location.hash) return;
    var el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el && el.tagName === 'DETAILS') {
      el.open = true;
      document.querySelectorAll('details.dd.target').forEach(function(d){ d.classList.remove('target'); });
      el.classList.add('target');
      setTimeout(function(){ el.scrollIntoView({ block:'start' }); window.scrollBy(0, -90); }, 60);
    }
  }
  openHash(); window.addEventListener('hashchange', openHash);

  // Форма заявки → письмо
  var form = document.getElementById('requestForm');
  if (form) form.addEventListener('submit', function(e){
    e.preventDefault();
    var f = form.elements;
    var body = 'Имя: ' + f.name.value + '\nОрганизация: ' + f.org.value + '\nТелефон / e-mail: ' + f.contact.value + '\nТема: ' + f.topic.value + '\n\n' + f.message.value;
    location.href = 'mailto:' + form.dataset.email + '?subject=' + encodeURIComponent('Заявка с сайта: ' + f.topic.value) + '&body=' + encodeURIComponent(body);
  });
});
