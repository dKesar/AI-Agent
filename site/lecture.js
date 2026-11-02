/* Автономный просмотр исходных изображений. Без загрузки данных из сети. */
(() => {
  'use strict';
  const count = 41;
  const image = document.getElementById('lecture-slide');
  const picker = document.getElementById('lecture-number');
  const back = document.getElementById('slide-back');
  const forward = document.getElementById('slide-forward');
  const error = document.getElementById('slide-error');
  const presenter = document.getElementById('presenter');
  const fullscreen = document.getElementById('fullscreen');
  const status = document.getElementById('viewer-status');
  let current = 1;
  for (let number = 1; number <= count; number++) {
    const option = document.createElement('option');
    option.value = number;
    option.textContent = number;
    picker.append(option);
  }
  function fromHash() {
    const match = /^#slide-(\d+)$/.exec(location.hash);
    return match ? Math.max(1, Math.min(count, Number(match[1]))) : 1;
  }
  function show(number, updateHash = true) {
    current = Math.max(1, Math.min(count, number));
    const source = './assets/slides/slide-' + current + '.png';
    if (image.getAttribute('src') !== source) {
      error.hidden = true;
      image.src = source;
    }
    image.alt = 'Слайд ' + current + ' из ' + count;
    picker.value = String(current);
    back.disabled = current === 1;
    forward.disabled = current === count;
    forward.textContent = current === count ? 'Последний слайд' : 'Вперёд →';
    document.getElementById('slide-count').textContent = 'из ' + count;
    document.title = 'Слайд ' + current + ' из ' + count + ' · Очная лекция';
    if (updateHash) history.replaceState(null, '', '#slide-' + current);
  }
  image.addEventListener('error', () => { error.hidden = false; });
  image.addEventListener('load', () => { error.hidden = true; });
  back.addEventListener('click', () => show(current - 1));
  forward.addEventListener('click', () => show(current + 1));
  picker.addEventListener('change', () => show(Number(picker.value)));
  window.addEventListener('hashchange', () => show(fromHash(), false));
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const targets = {ArrowLeft: current - 1, ArrowRight: current + 1, Home: 1, End: count};
    if (Object.hasOwn(targets, event.key)) { event.preventDefault(); show(targets[event.key]); }
  });
  if (document.fullscreenEnabled && typeof presenter.requestFullscreen === 'function') fullscreen.hidden = false;
  fullscreen.addEventListener('click', async () => {
    status.textContent = '';
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await presenter.requestFullscreen();
    } catch {
      status.textContent = 'Браузер не разрешил полный экран. Слайды можно продолжать смотреть в обычном режиме.';
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreen.textContent = document.fullscreenElement ? 'Выйти из полного экрана' : 'На весь экран';
  });
  show(fromHash(), false);
  if (image.complete && image.naturalWidth === 0) error.hidden = false;
})();
