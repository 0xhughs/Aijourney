#!/usr/bin/env node
// Validates content/UXX.json against tools/CONTENT_SPEC.md
// Usage: node tools/validate-content.mjs [U01 U02 ...]   (no args = all files in content/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'content');
const CHARS = ['fanak', 'hughes', 'hasoub', 'sanad', 'reem', 'hudhud'];
const STEP_TYPES = ['learn', 'example', 'mcq', 'sort', 'match', 'order', 'fill', 'spot', 'build', 'write'];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;

export function stepPoints(s) {
  switch (s.type) {
    case 'mcq': return s.points ?? 1;
    case 'order': return s.points ?? 1;
    case 'sort': return s.items.length;
    case 'match': return s.pairs.length;
    case 'fill': return s.blanks.length;
    case 'spot': return s.segments.filter(g => g.tag).length;
    case 'build': return s.fields.length;
    case 'write': return s.rubric.length;
    default: return 0;
  }
}

function validateStep(s, where, errs, warns) {
  const e = m => errs.push(`${where}: ${m}`);
  if (!s || typeof s !== 'object') return e('step is not an object');
  if (!STEP_TYPES.includes(s.type)) return e(`unknown type "${s.type}"`);
  if (s.speaker && !CHARS.includes(s.speaker)) e(`unknown speaker "${s.speaker}"`);
  const str = (v, n) => { if (typeof v !== 'string' || !v.trim()) e(`missing/empty ${n}`); };
  switch (s.type) {
    case 'learn':
      if (!Array.isArray(s.body) || !s.body.length) e('learn.body must be non-empty array');
      else s.body.forEach((p, i) => { str(p, `body[${i}]`); if (p.split(/\s+/).length > 75) warns.push(`${where}: long paragraph (${p.split(/\s+/).length} words)`); });
      break;
    case 'example': str(s.scenario, 'scenario'); str(s.explanation, 'explanation'); break;
    case 'mcq': {
      str(s.prompt, 'prompt');
      if (!Array.isArray(s.options) || s.options.length < 2) { e('mcq needs >=2 options'); break; }
      s.options.forEach((o, i) => { str(o.text, `options[${i}].text`); if (typeof o.correct !== 'boolean') e(`options[${i}].correct must be boolean`); });
      const c = s.options.filter(o => o.correct).length;
      if (s.multi ? c < 1 : c !== 1) e(`mcq must have ${s.multi ? '>=1' : 'exactly 1'} correct option (has ${c})`);
      if (s.listen && !s.context) e('listen:true requires context');
      if (s.options.some(o => !o.correct && !o.feedback)) warns.push(`${where}: wrong option without feedback`);
      break;
    }
    case 'sort': {
      str(s.prompt, 'prompt');
      const ids = (s.buckets || []).map(b => b.id);
      if (ids.length < 2) e('sort needs >=2 buckets');
      (s.buckets || []).forEach((b, i) => str(b.label, `buckets[${i}].label`));
      if (!Array.isArray(s.items) || s.items.length < 2) e('sort needs >=2 items');
      else s.items.forEach((it, i) => { str(it.text, `items[${i}].text`); if (!ids.includes(it.bucket)) e(`items[${i}].bucket "${it.bucket}" not a bucket id`); });
      break;
    }
    case 'match':
      str(s.prompt, 'prompt');
      if (!Array.isArray(s.pairs) || s.pairs.length < 2 || s.pairs.length > 6) e('match needs 2–6 pairs');
      else {
        s.pairs.forEach((p, i) => { str(p.left, `pairs[${i}].left`); str(p.right, `pairs[${i}].right`); });
        const r = s.pairs.map(p => p.right); if (new Set(r).size !== r.length) e('match right sides must be unique');
        const l = s.pairs.map(p => p.left); if (new Set(l).size !== l.length) e('match left sides must be unique');
      }
      break;
    case 'order':
      str(s.prompt, 'prompt');
      if (!Array.isArray(s.items) || s.items.length < 2) e('order needs >=2 items');
      else if (new Set(s.items).size !== s.items.length) e('order items must be unique');
      break;
    case 'fill': {
      str(s.prompt, 'prompt'); str(s.text, 'text');
      if (!Array.isArray(s.blanks) || !s.blanks.length) { e('fill needs blanks'); break; }
      s.blanks.forEach((b, i) => {
        if (!s.text.includes(`{${i}}`)) e(`text missing placeholder {${i}}`);
        str(b.answer, `blanks[${i}].answer`);
        if (!Array.isArray(b.options) || !b.options.includes(b.answer)) e(`blanks[${i}].options must include the answer`);
        if (b.options && new Set(b.options).size !== b.options.length) e(`blanks[${i}] duplicate options`);
      });
      break;
    }
    case 'spot': {
      str(s.prompt, 'prompt'); str(s.source, 'source');
      const ids = (s.tags || []).map(t => t.id);
      if (ids.length < 2) e('spot needs >=2 tags');
      if (!Array.isArray(s.segments) || !s.segments.some(g => g.tag)) e('spot needs tagged segments');
      else s.segments.forEach((g, i) => { if (typeof g.text !== 'string') e(`segments[${i}].text`); if (g.tag && !ids.includes(g.tag)) e(`segments[${i}].tag "${g.tag}" unknown`); });
      break;
    }
    case 'build':
      str(s.prompt, 'prompt');
      if (!Array.isArray(s.fields) || !s.fields.length) { e('build needs fields'); break; }
      s.fields.forEach((f, i) => {
        str(f.label, `fields[${i}].label`);
        if (!Array.isArray(f.options) || f.options.length < 2) e(`fields[${i}] needs >=2 options`);
        else if (f.options.filter(o => o.correct).length !== 1) e(`fields[${i}] must have exactly 1 correct option`);
      });
      break;
    case 'write':
      str(s.prompt, 'prompt'); str(s.modelAnswer, 'modelAnswer');
      if (!Array.isArray(s.rubric) || !s.rubric.length) e('write needs rubric');
      else s.rubric.forEach((r, i) => str(r.text, `rubric[${i}].text`));
      break;
  }
}

export function validateUnit(u, file) {
  const errs = [], warns = [];
  const e = m => errs.push(`${file}: ${m}`);
  const raw = JSON.stringify(u);
  if (EMOJI.test(raw)) e('contains emoji characters');
  for (const k of ['id', 'title', 'tagline', 'track', 'summary', 'beforeYouStart', 'learningLimits']) if (typeof u[k] !== 'string' || !u[k].trim()) e(`missing ${k}`);
  if (!/^U\d\d$/.test(u.id || '')) e('id must be UXX');
  if (u.number !== parseInt((u.id || 'U0').slice(1), 10)) e('number must match id');
  if (!['core', 'advanced'].includes(u.track)) e('track must be core|advanced');
  if (typeof u.minutes !== 'number') e('minutes must be number');
  if (!Array.isArray(u.goals) || !u.goals.length) e('goals required');
  if (!Array.isArray(u.stages) || !u.stages.length) { e('stages required'); return { errs, warns }; }
  const seen = new Set(); let sinceBonus = 0, lessonCount = 0, bonusCount = 0;
  u.stages.forEach((st, si) => {
    const w = `${file} stage[${si}] ${st.id}`;
    if (!st.id || seen.has(st.id)) errs.push(`${w}: missing/duplicate id`); seen.add(st.id);
    if (!['lesson', 'bonus'].includes(st.kind)) errs.push(`${w}: kind must be lesson|bonus`);
    if (!st.title) errs.push(`${w}: title`);
    if (!CHARS.includes(st.mascot)) errs.push(`${w}: mascot must be one of ${CHARS}`);
    if (!st.audioIntro) errs.push(`${w}: audioIntro required`);
    else if (st.audioIntro.split(/\s+/).length > 40) warns.push(`${w}: audioIntro long`);
    if (!Array.isArray(st.steps) || !st.steps.length) { errs.push(`${w}: steps required`); return; }
    if (st.steps.length > 10) warns.push(`${w}: ${st.steps.length} steps (aim 4–8)`);
    if (!st.steps.some(s => !['learn', 'example'].includes(s.type))) errs.push(`${w}: needs at least one interactive step`);
    st.steps.forEach((s, i) => validateStep(s, `${w} step[${i}]`, errs, warns));
    if (st.kind === 'lesson') { lessonCount++; sinceBonus++; if (sinceBonus > 7) warns.push(`${w}: >7 lesson stages without a bonus`); }
    else { bonusCount++; sinceBonus = 0; }
  });
  if (bonusCount < Math.floor(lessonCount / 6)) warns.push(`${file}: only ${bonusCount} bonus stages for ${lessonCount} lesson stages`);
  const a = u.assessment;
  if (!a || !Array.isArray(a.components) || !a.components.length) e('assessment.components required');
  else {
    if (!a.completionRule) e('assessment.completionRule required');
    const cids = new Set();
    a.components.forEach((c, ci) => {
      const w = `${file} assessment[${ci}] ${c.id}`;
      if (!c.id || cids.has(c.id)) errs.push(`${w}: missing/duplicate id`); cids.add(c.id);
      if (!['quiz', 'task'].includes(c.kind)) errs.push(`${w}: kind quiz|task`);
      if (!c.threshold || typeof c.threshold.min !== 'number' || typeof c.threshold.of !== 'number') { errs.push(`${w}: threshold {min,of}`); return; }
      for (const key of ['items', 'altItems']) {
        const list = c[key]; if (key === 'altItems' && !list) continue;
        if (!Array.isArray(list) || !list.length) { errs.push(`${w}: ${key} required`); continue; }
        list.forEach((s, i) => validateStep(s, `${w} ${key}[${i}]`, errs, warns));
        const pts = list.reduce((n, s) => n + stepPoints(s), 0);
        if (pts !== c.threshold.of) errs.push(`${w}: ${key} points total ${pts} != threshold.of ${c.threshold.of}`);
      }
      if (c.threshold.min > c.threshold.of) errs.push(`${w}: min > of`);
    });
  }
  return { errs, warns, stats: { lessonCount, bonusCount, steps: u.stages.reduce((n, s) => n + s.steps.length, 0), components: (a?.components || []).map(c => `${c.id} ${c.threshold?.min}/${c.threshold?.of}${c.altItems ? ' +alt' : ''}`) } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let ids = process.argv.slice(2);
  if (!ids.length) ids = fs.readdirSync(contentDir).filter(f => /^U\d\d\.json$/.test(f)).map(f => f.slice(0, 3));
  let bad = 0;
  for (const id of ids) {
    const file = path.join(contentDir, `${id}.json`);
    let u; try { u = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { console.log(`✗ ${id}: ${err.message}`); bad++; continue; }
    const { errs, warns, stats } = validateUnit(u, id);
    warns.forEach(w => console.log(`  warn ${w}`));
    errs.forEach(x => console.log(`  ERR  ${x}`));
    console.log(`${errs.length ? '✗' : '✓'} ${id}: ${stats ? `${stats.lessonCount} lesson + ${stats.bonusCount} bonus stages, ${stats.steps} steps; assessment: ${stats.components.join(', ')}` : ''}`);
    if (errs.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
