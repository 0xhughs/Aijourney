/* رحلة — local profile & progress store (no sign-in, device-only) */
(function () {
  'use strict';
  const KEY = 'rihla.v1';
  const BACKUP_FORMAT = 'rihla-backup';
  const BACKUP_VERSION = 1;

  const XP = {
    stepFirstTry: 10,
    stepRetry: 4,
    write: 8,
    stageDone: 20,
    bonusDone: 40,
    replayStage: 5,
    componentPass: 50,
    certificate: 100,
  };

  const defaultSettings = () => ({ sound: true, autoAudio: false, speech: true, reduceMotion: false, textSize: 'm' });

  function emptyDB() { return { version: 1, activeId: null, profiles: {} }; }

  let db = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyDB();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.profiles) return emptyDB();
      return parsed;
    } catch (e) {
      console.warn('store load failed', e);
      return emptyDB();
    }
  }

  let storageOk = true;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      storageOk = true;
    } catch (e) {
      storageOk = false;
      console.warn('store save failed', e);
    }
    listeners.forEach(fn => { try { fn(); } catch (_) {} });
  }

  function uid(prefix) {
    const r = (crypto && crypto.getRandomValues) ? Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 14);
    return `${prefix}-${r}`;
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function dayDiff(a, b) {
    const pa = new Date(a + 'T00:00:00'), pb = new Date(b + 'T00:00:00');
    return Math.round((pb - pa) / 86400000);
  }

  function active() { return db.activeId ? db.profiles[db.activeId] || null : null; }

  function createProfile(name, companion) {
    const id = uid('p');
    db.profiles[id] = {
      id, name: String(name).trim().slice(0, 40), companion: companion || 'fanak',
      createdAt: new Date().toISOString(),
      xp: 0, streak: { count: 0, last: null, best: 0 },
      settings: defaultSettings(), units: {}, log: [],
      ackStorage: true,
    };
    db.activeId = id;
    save();
    return db.profiles[id];
  }

  function switchProfile(id) { if (db.profiles[id]) { db.activeId = id; save(); } }
  function deleteProfile(id) {
    delete db.profiles[id];
    if (db.activeId === id) db.activeId = Object.keys(db.profiles)[0] || null;
    save();
  }
  function listProfiles() { return Object.values(db.profiles).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)); }

  function unitState(unitId, p) {
    p = p || active();
    if (!p) return null;
    if (!p.units[unitId]) p.units[unitId] = { stages: {}, writes: {}, assessment: { components: {} }, certificate: null, startedAt: null };
    return p.units[unitId];
  }

  function touchStreak(p) {
    const t = today();
    const s = p.streak;
    if (s.last === t) return;
    if (s.last && dayDiff(s.last, t) === 1) s.count += 1; else s.count = 1;
    s.last = t;
    s.best = Math.max(s.best || 0, s.count);
  }

  function addXP(amount, reason) {
    const p = active(); if (!p || !amount) return 0;
    p.xp += amount;
    p.log.push({ t: Date.now(), xp: amount, r: reason });
    if (p.log.length > 300) p.log.splice(0, p.log.length - 300);
    save();
    return amount;
  }

  function completeStage(unitId, stage, result) {
    const p = active(); if (!p) return { xp: 0 };
    const u = unitState(unitId, p);
    if (!u.startedAt) u.startedAt = new Date().toISOString();
    const prev = u.stages[stage.id];
    let bonusXp;
    if (prev && prev.done) bonusXp = XP.replayStage;
    else bonusXp = stage.kind === 'bonus' ? XP.bonusDone : XP.stageDone;
    const stepXp = prev && prev.done ? 0 : (result.stepXp || 0);
    u.stages[stage.id] = {
      done: true,
      completedAt: (prev && prev.completedAt) || new Date().toISOString(),
      lastPlayed: new Date().toISOString(),
      accuracy: Math.max(prev ? prev.accuracy || 0 : 0, result.accuracy || 0),
      plays: (prev ? prev.plays || 0 : 0) + 1,
    };
    touchStreak(p);
    const total = stepXp + bonusXp;
    p.xp += total;
    p.log.push({ t: Date.now(), xp: total, r: `stage:${stage.id}` });
    save();
    return { xp: total, stepXp, bonusXp, replay: !!(prev && prev.done) };
  }

  function saveWrite(unitId, key, text) {
    const u = unitState(unitId); if (!u) return;
    u.writes[key] = { text: String(text).slice(0, 4000), at: new Date().toISOString() };
    save();
  }
  function getWrite(unitId, key) { const u = unitState(unitId); return u && u.writes[key] ? u.writes[key].text : ''; }

  function recordComponent(unitId, compId, attempt) {
    const p = active(); if (!p) return;
    const u = unitState(unitId, p);
    const c = u.assessment.components[compId] || (u.assessment.components[compId] = { passed: false, attempts: [] });
    c.attempts.push({ ...attempt, at: new Date().toISOString() });
    let gained = 0;
    if (attempt.passed && !c.passed) { c.passed = true; c.passedAt = new Date().toISOString(); gained = XP.componentPass; p.xp += gained; }
    touchStreak(p);
    save();
    return gained;
  }

  function issueCertificate(unitId) {
    const p = active(); if (!p) return null;
    const u = unitState(unitId, p);
    if (u.certificate) return u.certificate;
    u.certificate = { issuedAt: new Date().toISOString(), serial: uid('RH').toUpperCase(), name: p.name };
    p.xp += XP.certificate;
    p.log.push({ t: Date.now(), xp: XP.certificate, r: `cert:${unitId}` });
    save();
    return u.certificate;
  }

  function updateSettings(patch) { const p = active(); if (!p) return; Object.assign(p.settings, patch); save(); }
  function rename(name) { const p = active(); if (!p) return; p.name = String(name).trim().slice(0, 40) || p.name; save(); }
  function setCompanion(c) { const p = active(); if (!p) return; p.companion = c; save(); }

  /* ---------- backup / restore ---------- */
  function checksum(str) { // FNV-1a 32-bit, to catch accidental corruption (not security)
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  function exportBackup(scope) {
    const profiles = scope === 'all' ? db.profiles : (active() ? { [active().id]: active() } : {});
    const payload = JSON.stringify(profiles);
    return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), app: 'rihla-ai', checksum: checksum(payload), profiles }, null, 2);
  }
  function parseBackup(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('الملف ليس نسخة احتياطية صالحة (صيغة غير مقروءة).'); }
    if (!obj || obj.format !== BACKUP_FORMAT || !obj.profiles || typeof obj.profiles !== 'object') throw new Error('هذا الملف ليس نسخة احتياطية من رحلة.');
    if (obj.version > BACKUP_VERSION) throw new Error('النسخة الاحتياطية من إصدار أحدث من التطبيق.');
    if (obj.checksum && checksum(JSON.stringify(obj.profiles)) !== obj.checksum) throw new Error('يبدو أن الملف تغيّر أو تلف بعد التصدير.');
    const list = Object.values(obj.profiles).filter(p => p && p.id && typeof p.name === 'string' && p.units && typeof p.xp === 'number');
    if (!list.length) throw new Error('لا يحتوي الملف على ملفات تعريف صالحة.');
    return list;
  }
  function importProfiles(list, mode) {
    // mode: 'replace' (same id overwritten) | 'copy' (always new id)
    let last = null;
    for (const src of list) {
      const p = JSON.parse(JSON.stringify(src));
      p.settings = Object.assign(defaultSettings(), p.settings || {});
      p.log = Array.isArray(p.log) ? p.log : [];
      p.streak = p.streak || { count: 0, last: null, best: 0 };
      if (mode === 'copy' && db.profiles[p.id]) { p.id = uid('p'); p.name = p.name + ' (نسخة)'; }
      db.profiles[p.id] = p;
      last = p.id;
    }
    if (last) db.activeId = last;
    save();
    return last;
  }

  function wipeAll() { db = emptyDB(); save(); }

  async function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const already = await navigator.storage.persisted();
        if (already) return true;
        return await navigator.storage.persist();
      }
    } catch (_) {}
    return false;
  }

  window.Store = {
    XP, active, createProfile, switchProfile, deleteProfile, listProfiles, unitState, addXP,
    completeStage, saveWrite, getWrite, recordComponent, issueCertificate, updateSettings, rename, setCompanion,
    exportBackup, parseBackup, importProfiles, wipeAll, requestPersistence,
    onChange: fn => listeners.add(fn), storageOk: () => storageOk, today,
    _reload: () => { db = load(); },
  };
})();
