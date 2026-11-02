/* Совместимость со старыми закладками общей страницы. */
(() => {
  const route = location.hash.slice(1).split('/')[0];
  const targets = {lecture:'./lecture.html',practice:'./agent-anatomy/index.html',teacher:'./agent-anatomy/guide.html'};
  if (Object.hasOwn(targets, route)) location.replace(targets[route]);
})();
