// Olympus web demo: the guided tour beside the phone. Each step drives the app through its small API.
import { api } from './app.js';

const STEPS = [
  { title: 'Today at a glance', text: 'Readiness compares last night\'s sleep with 7 hours and this morning\'s resting heart rate and HRV with your own last four weeks. Below it: the next session, the food rings and the race countdown.',
    run: () => { api.go('today'); api.highlight('#readiness-card'); } },
  { title: 'Log a set', text: 'The overload hint comes from double progression: every set reached 10 reps last time, so the weight goes up one plate jump. Ticking the set starts the rest timer, and 62.5 kg beats the old best, so a new record shows. The Plates button works out the bar.',
    run: () => { api.tickNext('bench'); api.highlight('#ex-bench'); } },
  { title: 'Only 30 minutes', text: 'The training engine reshapes the 42-minute session: it pairs push and pull work into supersets first, then cuts isolation sets, then compound sets down to two. Try other lengths with "Less time?".',
    run: () => { api.applyShort(30); api.highlight('#adapt-banner'); } },
  { title: 'Recovery map', text: 'Every hard set tires its muscles and fades over 48 or 72 hours. Yesterday\'s squats and this morning\'s run leave the quadriceps tired. Tap any muscle, or switch to the back view.',
    run: () => { api.selectMuscle('quadriceps'); api.highlight('#recovery-card'); } },
  { title: 'Eat and caffeine', text: 'An espresso goes in the log: the rings animate to the new totals, and the caffeine curve and the "last coffee" time are worked out again with the absorption and half-life model.',
    run: () => { api.addFood('espresso'); api.highlight('#caffeine-card'); } },
  { title: 'Race predictor', text: 'The trail race starts from the flat time Daniels\' VDOT gives, then adds altitude, hills, surface and heat one at a time, each with its source. The elevation profile is split into one-kilometre sections for the hill cost.',
    run: () => { api.openRace('trail'); api.highlight('#race-adjust'); } },
  { title: 'Yoga and breathing', text: 'Twelve stick figures drawn for the app move into each pose and hold it on a 4-second loop. The breathing pacer above them runs cyclic sighing, box breathing or six breaths a minute.',
    run: () => { api.yoga(); api.highlight('#poses'); } },
  { title: 'A coach that shows its sources', text: 'A scripted replay of the on-device coach. Each answer lists the app data it used. Here the model adds a percentile nobody measured, and the number guard underlines it in red.',
    run: () => { api.ask(3); setTimeout(() => api.highlight('#chat .msg.bot:last-child'), 50); } },
];

const list = document.getElementById('tour-steps');
const cap = document.getElementById('tour-caption');

let current = -1;

list.innerHTML = STEPS.map((s, i) => `<li><button type="button" class="tour-step" data-step="${i}" aria-current="false">
  <span class="tour-num">${String(i + 1).padStart(2, '0')}</span><span><span class="tour-title">${s.title}</span><span class="tour-text">${s.text}</span></span></button></li>`).join('');

function go(i, { fromList = false } = {}) {
  current = (i + STEPS.length) % STEPS.length;
  STEPS[current].run();
  list.querySelectorAll('.tour-step').forEach((b, k) => b.setAttribute('aria-current', k === current ? 'step' : 'false'));
  cap.querySelector('.cap-count').textContent = `Step ${current + 1} of ${STEPS.length}`;
  cap.querySelector('.cap-title').textContent = STEPS[current].title;
  // When the phone is not fully on screen (narrow screens, or a window too short to pin it), bring it back into view.
  const r = cap.closest('.ol-phone-col') ? cap.closest('.ol-phone-col').getBoundingClientRect() : cap.getBoundingClientRect();
  if (fromList && (r.top < 64 || r.bottom > window.innerHeight)) {
    cap.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
}
list.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) go(+b.dataset.step, { fromList: true }); });
cap.querySelector('[data-tour="prev"]').addEventListener('click', () => go(current < 0 ? 0 : current - 1));
cap.querySelector('[data-tour="next"]').addEventListener('click', () => go(current + 1));
