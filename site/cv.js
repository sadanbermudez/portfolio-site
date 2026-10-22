/* CV page: the role switch (AI engineer or software engineer) and the evidence map (select a skill,
   see the work that shows it). The page is complete without this script: it shows the AI engineer
   version, and every link works. #software in the URL opens the software engineer version. */
(function () {
  const cv = document.querySelector('.cv');
  const buttons = [...document.querySelectorAll('.cv-switch button')];
  const pdf = document.getElementById('cv-pdf');
  const PDF = { ai: 'data/Sergio_Adan_Bermudez_CV_AI_Engineer.pdf', swe: 'data/Sergio_Adan_Bermudez_CV_Software_Engineer.pdf' };

  function setRole(role) {
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.role === role)));
    document.querySelectorAll('[data-show]').forEach(el => { el.hidden = el.dataset.show !== role; });
    // the same items in both versions; only their order changes
    document.querySelectorAll('[data-ai][data-swe]').forEach(el => { el.style.order = el.dataset[role]; });
    pdf.href = PDF[role];
    document.title = (role === 'swe' ? 'CV, software engineer' : 'CV, AI engineer') + ' · Sergio Adan Bermudez';
  }
  buttons.forEach(b => b.addEventListener('click', () => {
    setRole(b.dataset.role);
    history.replaceState(null, '', b.dataset.role === 'swe' ? '#software' : location.pathname);
  }));
  setRole(location.hash === '#software' ? 'swe' : 'ai');

  // evidence map
  const skills = [...document.querySelectorAll('.skill')];
  skills.forEach(s => {
    s.setAttribute('aria-pressed', 'false');
    s.addEventListener('click', () => {
      const on = s.getAttribute('aria-pressed') !== 'true';
      skills.forEach(o => o.setAttribute('aria-pressed', 'false'));
      cv.classList.toggle('filtering', on);
      document.querySelectorAll('.cv-item').forEach(it => it.classList.remove('lit'));
      if (!on) return;
      s.setAttribute('aria-pressed', 'true');
      const lit = [...document.querySelectorAll('.cv-item')].filter(it => (it.dataset.skills || '').split(' ').includes(s.dataset.skill));
      lit.forEach(it => it.classList.add('lit'));
      if (lit[0]) lit[0].scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    });
  });
})();
