// Inicio, the topic hub, Progreso and Ajustes (HomeScreen.kt, TopicScreen.kt, ProgressScreen.kt, SettingsScreen.kt).
import { h, btn, acc, Palette, SECTIONS, SECTION_ORDER, topicAccent, percent } from './dom.js';
import { App, TOPIC_ID, sheet } from './core.js';
import {
  frOf, loc, labelEsFr, sectionTitle, softCard, cardHead, tag, progressRow, progressBar, emojiCircle, expandable, accentHeader,
  keyIdeasCard, statusPill, statChip, headerPill, outlineButton,
} from './components.js';
import { levelFor, weakPoints, dayKey, Xp } from '../logic/progress.js';

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function setPlace(place) { App.progress = { ...App.progress, lastPlace: place }; try { localStorage.setItem('st-demo-progress-v1', JSON.stringify(App.progress)); } catch { /* ignore */ } }

/** Opens a section of the topic like the app: a single lesson opens directly, Tests opens its list. */
export function openSection(key) {
  if (key === 'tests') return App.go('testsList');
  const id = App.sectionKeys(key)[0];
  if (id) App.go('lesson', { id, section: key });
}

// ── Inicio ──
App.screens.home = () => {
  const hour = new Date().getHours();
  const [hi, hiFr] = hour >= 5 && hour <= 11 ? ['¡Buenos días!', 'Bonjour !'] : hour <= 19 && hour >= 12 ? ['¡Buenas tardes!', 'Bon après-midi !'] : ['¡Buenas noches!', 'Bonsoir !'];
  const now = new Date();
  const dateEs = cap(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(now));
  const dateFr = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const s = App.streak();
  const topic = App.data.topic;
  const place = App.progress.lastPlace;
  const accent = place && place.section ? SECTIONS[place.section].color : topicAccent(TOPIC_ID);
  const tiles = [
    { emoji: '🧩', es: 'Gramática B2', fr: 'Grammaire B2', color: '#6a1b9a', progress: App.topicFraction(), go: () => App.go('topic') },
    { emoji: '❓', es: 'Preguntas y dudas', fr: 'Questions et doutes', color: Palette.Questions, go: () => App.tab('search', true) },
    { emoji: '💬', es: 'Hablar con el tutor', fr: 'Parler avec le tuteur', color: Palette.Speak, go: () => { App.emit('chat-free'); App.tab('tutor', true); } },
    { emoji: '⚙️', es: 'Ajustes', fr: 'Réglages', color: Palette.Settings, go: settingsSheet },
  ];
  return h('div', { class: 'screen home' },
    h('div', { class: 'greeting' },
      h('h2', { class: 't-headlineMedium', 'data-title': '', text: hi + ' 👋' }),
      h('p', { class: 't-titleMedium muted', text: dateEs }),
      App.fr(hiFr) ? h('p', { class: 't-bodyMedium muted it', lang: 'fr', text: `${hiFr} · ${dateFr}` }) : null,
      h('p', { class: 'stats-line t-titleMedium' },
        h('span', { text: s > 0 ? `🔥 ${s} ${s === 1 ? 'día' : 'días'} seguidos` : '🔥 ¡Empieza hoy tu racha!' }),
        h('span', { text: `⭐ ${App.progress.xp} XP` }))),
    btn({ class: 'search-box', on: { click: () => { App.tab('search', true); App.emit('focus-search'); } } },
      h('span', { class: 'emoji-28', 'aria-hidden': 'true', text: '🔎' }),
      h('span', { class: 'grow' }, h('span', { class: 't-titleMedium db', text: '¿Qué quieres saber?' }),
        App.fr('Que veux-tu savoir ?') ? h('span', { class: 't-bodyMedium muted it db', text: 'Que veux-tu savoir ?' }) : null)),
    btn({ class: 'continue-card acc', style: acc(accent), on: { click: () => (place && place.lessonId ? App.go('lesson', { id: place.lessonId, section: place.section }) : App.go('topic')) } },
      h('span', { class: 'emoji-40', 'aria-hidden': 'true', text: (place && place.emoji) || topic.emoji }),
      h('span', { class: 'grow' },
        h('span', { class: 't-labelLarge read db', text: (place ? 'Continuar' : 'Empieza aquí') + (App.fr('x') ? (place ? ' · Continuer' : ' · Commence ici') : '') }),
        h('span', { class: 't-titleLarge db', text: (place && place.title) || topic.title.es }),
        App.fr((place && place.titleFr) || frOf(topic.title)) ? h('span', { class: 't-bodyMedium muted it db', text: (place && place.titleFr) || frOf(topic.title) }) : null),
      h('span', { class: 'play-disc', 'aria-hidden': 'true', text: '▶︎' })),
    h('div', { class: 'tile-grid' }, tiles.map(t => btn({ class: 'home-tile acc', style: acc(t.color), on: { click: t.go } },
      h('span', { class: 'emoji-40', 'aria-hidden': 'true', text: t.emoji }),
      h('span', { class: 't-titleMedium db', text: t.es }),
      App.fr(t.fr) ? h('span', { class: 't-bodySmall muted it db', text: t.fr }) : null,
      t.progress > 0 ? h('span', { class: 'tile-progress' }, progressBar(t.progress, { height: 8, track: 'color-mix(in srgb, var(--on) 12%, transparent)', label: 'Progreso de ' + t.es }),
        h('span', { class: 't-labelLarge', text: t.progress >= 0.999 ? '✓' : percent(t.progress) })) : null))),
    h('p', { class: 'demo-note t-bodySmall muted', text: 'Demo web: un tema de 68, con sus lecciones reales. · Démo : un thème sur 68.' }));
};

// ── the topic hub ──
App.screens.topic = () => {
  const t = App.data.topic;
  const accent = topicAccent(t.id);
  setPlace({ title: t.title.es, titleFr: frOf(t.title), emoji: t.emoji });
  const status = App.topicStatus();
  const subtitle = key => {
    if (key === 'tests') { const n = App.sectionKeys('tests').length - 1; return `${n} tests + 🎓 examen`; }
    const id = App.sectionKeys(key)[0];
    return id ? App.data.lessons[id].title.es : null;
  };
  return h('div', { class: 'screen' },
    accentHeader({ accent, title: t.title.es, emoji: t.emoji, overline: '🧩 Tema de lengua', subtitle: t.tagline.es, subtitleFr: App.fr(frOf(t.tagline)),
      bottom: [h('div', { class: 'chips' }, tag(t.cefr, { bg: '#fff', fg: 'var(--ch)' }), tag(`⏱ ${t.estimatedMinutes} min`, { bg: '#fff', fg: 'var(--ch)' })),
        progressRow(App.topicFraction(), { color: '#fff', track: 'rgba(255,255,255,.3)', textColor: 'var(--con)', height: 12, label: null })] }),
    h('div', { class: 'pad' }, loc(t.summary, { cls: 't-bodyLarge' })),
    h('div', { class: 'pad' }, keyIdeasCard(t.keyIdeas, accent)),
    h('div', { class: 'pad' }, sectionTitle('Secciones', { emoji: '🧭', fr: 'Sections' })),
    h('div', { class: 'pad stack-6', 'data-tour': 'sections' }, SECTION_ORDER.map(key => {
      const st = SECTIONS[key], s = status[key];
      return btn({ class: 'section-card acc', style: acc(st.color), 'data-section': key, disabled: s.state === 'UNAVAILABLE', on: { click: () => openSection(key) } },
        emojiCircle(st.emoji, 'var(--ch)', 58, 30),
        h('span', { class: 'grow' }, labelEsFr(st.es, st.fr, { tag: 'span' }), h('span', { class: 't-bodyMedium muted db clamp2', text: subtitle(key) || '' })),
        statusPill(s, st.color));
    })),
    h('div', { class: 'pad' }, btn({ class: 'free-talk acc', style: acc(Palette.Speak), on: { click: () => { App.emit('chat-free'); App.tab('tutor', true); } } },
      h('span', { class: 'emoji-34', 'aria-hidden': 'true', text: '💬' }),
      h('span', { class: 'grow' }, h('span', { class: 't-titleMedium bold db', text: 'Charla libre sobre el tema' }),
        App.fr('Discussion libre sur le thème') ? h('span', { class: 't-bodyMedium it db', text: 'Discussion libre sur le thème' }) : null,
        h('span', { class: 't-bodyMedium db', text: `«${t.title.es}» con tu tutor` })),
      h('span', { class: 'play-disc white', 'aria-hidden': 'true', text: '▶︎' }))),
    h('div', { class: 'pad' }, expandable('Palabras clave', 'Mots-clés', () => h('p', { class: 't-bodyMedium muted', text: t.tags.join(' · ') }))),
    h('div', { class: 'end-space' }));
};

// ── Progreso ──
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
App.screens.progress = () => {
  const p = App.progress, lv = levelFor(p.xp), s = App.streak();
  const today = dayKey(new Date());
  const todayXp = p.dayXp[today] || 0;
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  const known = Object.values(p.lessons).reduce((n, l) => n + (l.known || []).length, 0);
  const accuracy = p.quizAnswered ? p.quizCorrect / p.quizAnswered : null;
  const weak = weakPoints(p);
  const status = App.topicStatus();
  return h('div', { class: 'screen' },
    accentHeader({ accent: Palette.Progress, title: 'Mi progreso', emoji: '🏆', back: false, overline: '',
      subtitle: `Nivel ${lv.number}  ·  🔥 ${s} ${s === 1 ? 'día' : 'días'}`, subtitleFr: App.fr('Mes progrès'),
      actions: [headerPill('Ajustes', '⚙️', settingsSheet)],
      bottom: [progressRow(App.topicFraction(), { color: '#fff', track: 'rgba(255,255,255,.3)', textColor: 'var(--con)', height: 12, label: 'Tema «Ser o estar»' + (App.fr('x') ? ' · Thème' : '') })] }),
    h('div', { class: 'pad stack-12 top-16' },
      softCard(Palette.Gold,
        h('div', { class: 'row' }, h('span', { class: 'level-disc', 'aria-hidden': 'true', text: String(lv.number) }),
          h('div', { class: 'grow' }, labelEsFr(`Nivel ${lv.number}`, `Niveau ${lv.number}`, { big: true }),
            h('p', { class: 't-bodyMedium', text: `Faltan ${lv.nextXp - p.xp} XP para el nivel ${lv.number + 1}` }))),
        progressBar(lv.fraction, { color: '#b37a00', height: 12, label: 'Progreso del nivel' }),
        h('p', { class: 't-bodyMedium', text: todayXp > 0 ? `Hoy: +${todayXp} XP ✨` : 'Hoy todavía no has sumado puntos: ¡una sección y listo!' })),
      softCard(Palette.Flame,
        h('div', { class: 'row' }, h('span', { class: 'emoji-30', 'aria-hidden': 'true', text: '🔥' }),
          labelEsFr(s === 0 ? 'Sin racha todavía' : `Racha: ${s} ${s === 1 ? 'día' : 'días seguidos'}`, s === 0 ? 'Pas encore de série' : `Série : ${s} jour${s === 1 ? '' : 's'}`)),
        h('div', { class: 'week', role: 'list', 'aria-label': 'Esta semana' }, week.map((d, i) => {
          const k = dayKey(d), xp = p.dayXp[k] || 0;
          return h('div', { class: 'day' + (xp > 0 ? ' did' : '') + (k === today ? ' today' : ''), role: 'listitem', 'aria-label': `${WEEKDAYS[i]} ${d.getDate()}: ${xp} XP` },
            h('span', { class: 't-labelSmall', text: WEEKDAYS[i] }), h('span', { class: 't-labelLarge', text: String(d.getDate()) }));
        }))),
      h('div', { class: 'chips wrap' }, statChip('🔥', String(s), s === 1 ? 'día' : 'días'), statChip('⭐', String(p.xp), 'XP'),
        statChip('🎯', accuracy == null ? '—' : percent(accuracy), 'aciertos'), statChip('🔤', String(known), 'palabras'), statChip('💬', String(p.chatTurns), 'mensajes')),
      softCard(Palette.Progress, labelEsFr('Por secciones', 'Par section', { big: true }),
        SECTION_ORDER.map(k => progressRow(status[k].total ? status[k].done / status[k].total : 0,
          { color: SECTIONS[k].color, label: `${SECTIONS[k].emoji} ${SECTIONS[k].es} · ${status[k].done}/${status[k].total}` }))),
      softCard(Palette.Tests, labelEsFr('🎯 A repasar', 'À revoir', { big: true }),
        weak.length ? weak.map(w => h('div', { class: 'weak-row' }, h('span', { class: 'grow' }, h('span', { class: 't-titleSmall bold db', text: w.label || w.target }),
          h('span', { class: 't-bodySmall muted db', text: (App.data.lessons[w.lessonId] || { title: { es: 'Examen del tema' } }).title.es })),
        h('span', { class: 't-labelLarge bold', text: Math.round(w.accuracy * 100) + ' %' })))
          : [h('p', { class: 't-bodyLarge', text: 'Nada por ahora. Aquí aparecerá lo que falles varias veces.' }),
            App.fr('x') ? h('p', { class: 't-bodyMedium muted it', text: "Rien pour l'instant. Ici s'afficheront les points ratés plusieurs fois." }) : null]),
      softCard(Palette.Settings, labelEsFr('¿Cómo gano puntos?', 'Comment gagner des points ?', { big: true }),
        h('ul', { class: 'xp-help t-bodyMedium' },
          [[`Sección terminada`, Xp.SECTION_DONE], ['Respuesta correcta', Xp.CORRECT_ANSWER], ['Test aprobado (80 %)', Xp.QUIZ_PASSED], ['Test perfecto', '+' + Xp.QUIZ_PERFECT],
            ['Examen del tema aprobado', Xp.FINAL_EXAM_PASSED], ['Palabra que ya sabes', Xp.CARD_KNOWN], ['Mensaje al tutor', Xp.CHAT_TURN], ['Primer punto del día', '+' + Xp.DAILY_BONUS]]
            .map(([k, v]) => h('li', {}, h('span', { text: k }), h('strong', { text: String(v).startsWith('+') ? v : '+' + v }))))),
      outlineButton('🗑️ Borrar mi progreso de la demo', () => { if (window.confirm('¿Borrar el progreso de esta demo en este navegador?')) App.resetProgress(); }, 'danger')),
    h('div', { class: 'end-space' }));
};

// ── Ajustes (a sheet here; a full screen in the app) ──
export function settingsSheet() {
  const group = (label, labelFr, key, choices) => h('div', { class: 'setting', role: 'group', 'aria-label': label },
    labelEsFr(label, labelFr),
    h('div', { class: 'seg' }, choices.map(([v, es, fr]) => {
      const b = btn({ class: 'seg-btn', 'aria-pressed': String(App.settings[key] === v) },
        h('span', { class: 't-titleSmall db', text: es }), App.fr(fr) ? h('span', { class: 't-labelMedium it db', text: fr }) : null);
      b.addEventListener('click', () => {
        App.setSetting(key, v);
        for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b));
        if (key === 'french') App.render(true);
      });
      return b;
    })));
  sheet('⚙️ Ajustes', h('div', { class: 'stack-12' },
    group('Tamaño del texto', 'Taille du texte', 'scale', [[1, 'Normal', 'Normal'], [1.15, 'Grande', 'Grand'], [1.3, 'Muy grande', 'Très grand']]),
    group('Tema', 'Thème', 'dark', [[false, '☀️ Claro', 'Clair'], [true, '🌙 Oscuro', 'Sombre']]),
    group('Francés', 'Français', 'french', [['tap', 'Al tocar 🇫🇷', 'Au toucher'], ['always', 'Siempre', 'Toujours'], ['never', 'Nunca', 'Jamais']])),
  { label: 'Ajustes' });
}
App.settingsSheet = settingsSheet;
