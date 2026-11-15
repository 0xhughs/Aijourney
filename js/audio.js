/* Audio & Speech layer:
 * 1. Offline pre-rendered Arabic voice clips (assets/audio/*.m4a via AUDIO_MANIFEST)
 * 2. Web Speech Synthesis (speechSynthesis ar-*) fallback
 * 3. Synthesized WebAudio musical chimes (respects Store sound setting)
 * 4. Optional Arabic Speech-to-Text (SpeechRecognition / webkitSpeechRecognition) with honest fallback
 */
(function () {
  'use strict';

  function fnv1aKey(str) {
    const s = String(str || '').trim();
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0') + '_' + s.length;
  }

  let currentAudio = null;
  let currentKey = null;
  const subs = new Set();

  function notify() {
    const st = status();
    subs.forEach(fn => { try { fn(st); } catch (_) {} });
  }

  function findClip(text) {
    const m = window.AUDIO_MANIFEST || {};
    return m[fnv1aKey(text)] || null;
  }

  function hasArabicTTS() {
    try {
      if (!('speechSynthesis' in window)) return false;
      const voices = speechSynthesis.getVoices() || [];
      return voices.some(v => /^ar\b/i.test(v.lang));
    } catch (_) { return false; }
  }

  function stop() {
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (_) {}
      currentAudio = null;
    }
    try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (_) {}
    currentKey = null;
    notify();
  }

  function status() {
    return { playing: !!currentKey, key: currentKey };
  }

  async function speak(text, key) {
    const clean = String(text || '').trim();
    if (!clean) return { ok: false, reason: 'empty' };
    const id = key || fnv1aKey(clean);
    if (currentKey === id) {
      stop();
      return { ok: true, toggledOff: true };
    }
    stop();

    const clipUrl = findClip(clean);
    if (clipUrl) {
      try {
        const a = new Audio(clipUrl);
        currentAudio = a;
        currentKey = id;
        notify();
        a.addEventListener('ended', () => { if (currentAudio === a) { currentAudio = null; currentKey = null; notify(); } });
        a.addEventListener('error', () => { if (currentAudio === a) { currentAudio = null; currentKey = null; notify(); } });
        await a.play();
        return { ok: true, mode: 'clip' };
      } catch (err) {
        currentAudio = null;
        currentKey = null;
        notify();
      }
    }

    if ('speechSynthesis' in window) {
      try {
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = 'ar-SA';
        u.rate = 0.96;
        const voices = speechSynthesis.getVoices() || [];
        const arVoice = voices.find(v => /^ar/i.test(v.lang));
        if (arVoice) u.voice = arVoice;
        currentKey = id;
        notify();
        u.onend = () => { if (currentKey === id) { currentKey = null; notify(); } };
        u.onerror = () => { if (currentKey === id) { currentKey = null; notify(); } };
        speechSynthesis.speak(u);
        return { ok: true, mode: arVoice ? 'tts-ar' : 'tts-default' };
      } catch (_) {
        currentKey = null;
        notify();
      }
    }
    return { ok: false, reason: 'لا يتوفر محرك نطق عربي في هذا المتصفح حالياً؛ يمكنك قراءة النص المكتوب مباشرة.' };
  }

  /* ---------- WebAudio chimes ---------- */
  let actx = null;
  function soundEnabled() {
    const p = window.Store && Store.active();
    return p ? p.settings.sound !== false : true;
  }
  function ctx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === 'suspended') { actx.resume().catch(() => {}); }
    return actx;
  }
  function tone(freq, start, dur, type, gainVal) {
    const c = ctx(); if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(0.0001, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gainVal || 0.12, c.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    osc.connect(g).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + dur + 0.02);
  }
  function sfx(kind) {
    if (!soundEnabled()) return;
    try {
      if (kind === 'correct') {
        tone(523.25, 0, 0.14, 'triangle', 0.11);
        tone(659.25, 0.07, 0.16, 'triangle', 0.12);
        tone(783.99, 0.14, 0.24, 'sine', 0.13);
      } else if (kind === 'wrong') {
        tone(293.66, 0, 0.14, 'sine', 0.09);
        tone(246.94, 0.11, 0.2, 'sine', 0.09);
      } else if (kind === 'stage') {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.08, 0.28, 'triangle', 0.12));
      } else if (kind === 'cert') {
        [440, 554.37, 659.25, 880, 1108.73].forEach((f, i) => tone(f, i * 0.09, 0.34, 'triangle', 0.13));
      } else if (kind === 'tap') {
        tone(620, 0, 0.045, 'sine', 0.04);
      }
    } catch (_) {}
  }

  /* ---------- Arabic Speech Recognition (optional spoken responses) ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  function speechSupport() {
    if (!SR) {
      return {
        supported: false,
        note: 'الإدخال الصوتي غير مدعوم في هذا المتصفح (مثل Firefox أو بعض متصفحات الأجهزة اللوحية). يمكنك اختيار الإجابة باللمس أو لوحة المفاتيح مباشرة.'
      };
    }
    if (location.protocol === 'file:') {
      return {
        supported: false,
        note: 'يتطلب التعرف على الكلام فتح الصفحة عبر خادم محلي آمن (localhost) ولا يعمل عبر فتح الملف المباشر (file://). يمكنك اختيار الإجابة مباشرة.'
      };
    }
    return {
      supported: true,
      note: 'انقر الميكروفون وتحدث بالعربية لاختيار الإجابة صوتياً (أو اخترها باللمس مباشرة).'
    };
  }

  function normAr(s) {
    return String(s || '')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function matchSpokenToOption(transcript, options) {
    const t = normAr(transcript);
    if (!t) return -1;
    // Check ordinal / letter shortcuts first ("الخيار الاول", "الف", "باء", "جيم", "دال", "1", "2"...)
    const ordinals = [
      ['الاول', 'اول', 'واحد', '1', 'خيار ا', 'الاجابه ا'],
      ['الثاني', 'ثاني', 'اثنين', 'اثنان', '2', 'باء', 'خيار ب', 'الاجابه ب'],
      ['الثالث', 'ثالث', 'ثلاثه', '3', 'جيم', 'خيار ج', 'الاجابه ج'],
      ['الرابع', 'رابع', 'اربعه', '4', 'دال', 'خيار د', 'الاجابه د'],
    ];
    for (let i = 0; i < Math.min(options.length, ordinals.length); i++) {
      if (ordinals[i].some(k => t === k || t.startsWith(k + ' ') || t.endsWith(' ' + k))) return i;
    }
    // Token overlap score
    const tWords = new Set(t.split(' ').filter(w => w.length > 1));
    let bestIdx = -1, bestScore = 0;
    options.forEach((opt, idx) => {
      const o = normAr(typeof opt === 'string' ? opt : opt.text);
      if (!o) return;
      if (o.includes(t) || t.includes(o)) {
        const sc = 0.9 + Math.min(t.length, o.length) / Math.max(t.length, o.length, 1) * 0.1;
        if (sc > bestScore) { bestScore = sc; bestIdx = idx; }
        return;
      }
      const oWords = o.split(' ').filter(w => w.length > 1);
      if (!oWords.length) return;
      let hits = 0;
      for (const w of oWords) {
        if (tWords.has(w) || [...tWords].some(tw => tw.length >= 3 && (w.includes(tw) || tw.includes(w)))) hits++;
      }
      const score = hits / Math.sqrt(oWords.length * Math.max(tWords.size, 1));
      if (score > bestScore) { bestScore = score; bestIdx = idx; }
    });
    return bestScore >= 0.22 ? bestIdx : -1;
  }

  let activeRec = null;
  function listenOnce(callbacks) {
    const sup = speechSupport();
    if (!sup.supported) {
      callbacks.onError && callbacks.onError(sup.note);
      return () => {};
    }
    if (activeRec) { try { activeRec.abort(); } catch (_) {} activeRec = null; }
    stop();
    const rec = new SR();
    activeRec = rec;
    rec.lang = 'ar-SA';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    let settled = false;
    rec.onstart = () => callbacks.onStart && callbacks.onStart();
    rec.onresult = (ev) => {
      settled = true;
      const alts = [];
      for (let i = 0; i < ev.results[0].length; i++) alts.push(ev.results[0][i].transcript);
      callbacks.onResult && callbacks.onResult(alts[0] || '', alts);
    };
    rec.onerror = (ev) => {
      settled = true;
      const map = {
        'not-allowed': 'لم يُمنح إذن الميكروفون. يمكنك السماح به من إعدادات المتصفح أو اختيار الإجابة باللمس مباشرة.',
        'service-not-allowed': 'خدمة التعرف الصوتي غير مفعّلة في هذا المتصفح؛ اختر الإجابة مباشرة.',
        'network': 'يتطلب التعرف الصوتي في المتصفح اتصالاً بالشبكة حالياً؛ اختر الإجابة باللمس مباشرة.',
        'no-speech': 'لم يُلتقط صوت واضح. حاول التحدث مجدداً أو اختر الإجابة باللمس.',
      };
      callbacks.onError && callbacks.onError(map[ev.error] || 'تعذّر التعرف على الصوت في هذه اللحظة؛ يمكنك اختيار الإجابة باللمس مباشرة.');
    };
    rec.onend = () => {
      if (activeRec === rec) activeRec = null;
      if (!settled) callbacks.onEnd && callbacks.onEnd();
      else callbacks.onEnd && callbacks.onEnd();
    };
    try { rec.start(); } catch (e) {
      activeRec = null;
      callbacks.onError && callbacks.onError('تعذّر بدء الاستماع الصوتي في هذا المتصفح؛ اختر الإجابة باللمس.');
    }
    return () => { try { rec.abort(); } catch (_) {} activeRec = null; };
  }

  window.AudioEngine = {
    speak, stop, status, findClip, hasArabicTTS, sfx,
    speechSupport, listenOnce, matchSpokenToOption, normAr,
    onChange: fn => { subs.add(fn); return () => subs.delete(fn); },
  };
})();
