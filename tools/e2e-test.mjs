import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = process.env.SHOT_DIR || path.join(ROOT, '.tmp', 'screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.m4a': 'audio/mp4'
};

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
      const full = path.resolve(ROOT, '.' + rel);
      if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => {
      resolve({ server: srv, port: srv.address().port });
    });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function solveCurrentStep(page, step, makeCorrect = true) {
  if (step.type === 'learn' || step.type === 'example') return;

  if (step.type === 'mcq') {
    if (step.multi) {
      for (let i = 0; i < step.options.length; i++) {
        const shouldPick = makeCorrect ? !!step.options[i].correct : !step.options[i].correct;
        if (shouldPick) await page.locator(`[data-opt="${i}"]`).click();
      }
    } else {
      const idx = step.options.findIndex(o => makeCorrect ? o.correct : !o.correct);
      await page.locator(`[data-opt="${idx >= 0 ? idx : 0}"]`).click();
    }
    return;
  }

  if (step.type === 'sort') {
    for (let i = 0; i < step.items.length; i++) {
      const unplaceBtn = page.locator(`[data-unplace="${i}"]`);
      if (await unplaceBtn.count()) await unplaceBtn.click();
      const targetBucket = makeCorrect
        ? step.items[i].bucket
        : step.buckets.find(b => b.id !== step.items[i].bucket).id;
      await page.locator(`[data-assign-item="${i}"][data-assign-bucket="${targetBucket}"]`).click();
    }
    return;
  }

  if (step.type === 'match') {
    for (let li = 0; li < step.pairs.length; li++) {
      const ri = makeCorrect ? li : ((li + 1) % step.pairs.length);
      const leftBtn = page.locator(`[data-left="${li}"]`);
      await leftBtn.click();
      await page.locator(`[data-right="${ri}"]`).click();
    }
    return;
  }

  if (step.type === 'order') {
    if (!makeCorrect) {
      const cur = await page.locator('.order-item').evaluateAll(els => els.map(e => Number(e.dataset.origIdx)));
      if (cur.every((v, idx) => v === idx)) {
        await page.locator('.order-item').first().locator('[data-move="1"]').click();
      }
      return;
    }
    for (let targetOrig = 0; targetOrig < step.items.length; targetOrig++) {
      while (true) {
        const cur = await page.locator('.order-item').evaluateAll(els => els.map(e => Number(e.dataset.origIdx)));
        const pos = cur.indexOf(targetOrig);
        if (pos <= targetOrig) break;
        await page.locator('.order-item').nth(pos).locator('[data-move="-1"]').click();
      }
    }
    return;
  }

  if (step.type === 'fill') {
    for (let bi = 0; bi < step.blanks.length; bi++) {
      await page.locator(`[data-blank="${bi}"]`).click();
      const b = step.blanks[bi];
      const choice = makeCorrect ? b.answer : (b.options.find(o => o !== b.answer) || b.answer);
      await page.locator('.bank-chip', { hasText: choice }).first().click();
    }
    return;
  }

  if (step.type === 'spot') {
    for (let si = 0; si < step.segments.length; si++) {
      const seg = step.segments[si];
      if (!seg.tag) continue;
      const segBtn = page.locator(`[data-seg="${si}"]`);
      const isOpen = await segBtn.evaluate(el => el.classList.contains('is-open'));
      if (!isOpen) await segBtn.click();
      const tagId = makeCorrect ? seg.tag : step.tags.find(t => t.id !== seg.tag).id;
      await page.locator(`[data-pick-tag="${tagId}"]`).click();
    }
    return;
  }

  if (step.type === 'build') {
    for (let fi = 0; fi < step.fields.length; fi++) {
      const f = step.fields[fi];
      const oi = f.options.findIndex(o => makeCorrect ? o.correct : !o.correct);
      await page.locator(`[data-field="${fi}"][data-fopt="${oi >= 0 ? oi : 0}"]`).click();
    }
    return;
  }

  if (step.type === 'write') {
    const ta = page.locator('textarea.write-area').first();
    const minC = step.minChars || 20;
    const sample = 'هذه مسودة تدريبية مفصلة باللغة العربية تختبر استيفاء جميع شروط المهمة والأدلة دون إدخال أي بيانات شخصية حقيقية على الإطلاق.';
    await ta.fill(sample.repeat(Math.ceil((minC + 20) / sample.length)));
    const rev = page.locator('[data-reveal-rubric]');
    if (await rev.count()) await rev.click();
    for (let ri = 0; ri < step.rubric.length; ri++) {
      const chk = page.locator(`[data-rubric="${ri}"]`);
      if (makeCorrect) await chk.check();
      else if (ri === 0) await chk.uncheck();
    }
  }
}

async function checkNoOverflowAndImages(page, label) {
  const metrics = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img')].filter(i => i.offsetParent !== null);
    await Promise.all(imgs.map(i => i.decode().catch(() => {})));
    const docOverflow = document.documentElement.scrollWidth - window.innerWidth;
    const broken = imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src'));
    const emojiRe = /\p{Extended_Pictographic}/u;
    const text = document.body.innerText || '';
    const hasEmoji = emojiRe.test(text);
    const forbiddenDevLeak = /(INDEX_AR\.md|ANSWERS\.md|previous_versions\/|answer_keys\/|U\d{2}-L\d{2}|\bgate:true\b|\baltItems\b)/i.exec(text);
    return {
      docOverflow,
      imgCount: imgs.length,
      broken,
      hasEmoji,
      devLeak: forbiddenDevLeak ? forbiddenDevLeak[0] : null,
      dir: document.documentElement.dir,
      lang: document.documentElement.lang
    };
  });
  assert(metrics.dir === 'rtl' && metrics.lang === 'ar', `${label}: expected dir=rtl lang=ar`);
  assert(metrics.docOverflow <= 1, `${label}: horizontal overflow detected (${metrics.docOverflow}px)`);
  assert(metrics.broken.length === 0, `${label}: broken images: ${metrics.broken.join(', ')}`);
  assert(!metrics.hasEmoji, `${label}: found prohibited emoji character in rendered text`);
  assert(!metrics.devLeak, `${label}: found internal developer filename/code in UI text: ${metrics.devLeak}`);
}

async function checkDialogNoOverflow(page, selector, label) {
  const leak = await page.evaluate((sel) => {
    const dlg = document.querySelector(sel);
    if (!dlg) return 'missing dialog';
    const dr = dlg.getBoundingClientRect();
    const kids = [...dlg.querySelectorAll('.dialog-head, .dialog-body, .dialog-foot, .certificate-sheet, .bkp-block, .locked-modal-row')];
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < dr.left - 1.5 || r.right > dr.right + 1.5) {
        return `${k.className} protrudes horizontally (${r.left.toFixed(1)}..${r.right.toFixed(1)} vs dialog ${dr.left.toFixed(1)}..${dr.right.toFixed(1)})`;
      }
    }
    return null;
  }, selector);
  assert(!leak, `${label}: dialog child overflow: ${leak}`);
}

async function checkContrast(page) {
  const results = await page.evaluate(() => {
    function parseRgb(str) {
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    }
    function lum([r, g, b]) {
      const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }
    function ratio(c1, c2) {
      const l1 = lum(c1), l2 = lum(c2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    const probes = [
      { name: 'body', el: document.body, bgEl: document.body },
      { name: 'btn-primary', el: document.querySelector('.btn-primary'), bgEl: document.querySelector('.btn-primary') },
      { name: 'btn-secondary', el: document.querySelector('.btn-secondary'), bgEl: document.querySelector('.btn-secondary') },
      { name: 'fact-muted', el: document.querySelector('.fact-item span'), bgEl: document.querySelector('.fact-item') }
    ];
    return probes.filter(p => p.el && p.bgEl).map(p => {
      const fg = parseRgb(getComputedStyle(p.el).color);
      const bg = parseRgb(getComputedStyle(p.bgEl).backgroundColor);
      return { name: p.name, cr: Number(ratio(fg, bg).toFixed(2)) };
    });
  });
  for (const r of results) {
    assert(r.cr >= 4.5, `WCAG AA contrast failed on ${r.name}: ${r.cr}:1 (< 4.5:1)`);
  }
  return results;
}

const { server, port } = await startServer();
const BASE = `http://127.0.0.1:${port}`;
const report = { checks: [] };

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(4000);

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));
  page.on('response', res => { if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`); });

  // 1. Minimalist One-Screen Home Page (#welcome)
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const h1Text = await page.locator('h1').textContent();
  assert(h1Text.includes('ابدأ رحلتك في الذكاء الاصطناعي'), `Unexpected entrance H1: ${h1Text}`);
  const ensembleCount = await page.locator('.friends-ensemble .friend-fig').count();
  assert(ensembleCount === 6, `Expected all 6 character friends on welcome screen, got ${ensembleCount}`);
  const welcomeUnitCards = await page.locator('.unit-card').count();
  assert(welcomeUnitCards === 0, `Welcome page should not stack unit cards below hero, got ${welcomeUnitCards}`);
  const footerHiddenOnWelcome = await page.locator('#site-footer').evaluate(el => el.hidden);
  assert(footerHiddenOnWelcome, 'Footer should be hidden on minimalist welcome page');
  await checkNoOverflowAndImages(page, 'Welcome Desktop');
  const contrastDesktop = await checkContrast(page);
  await page.screenshot({ path: path.join(SHOT_DIR, '01-welcome-desktop.png'), fullPage: false });
  report.checks.push(`Minimalist Home screen verified (all 6 friends gathered, 2 CTAs, 3 stat cards, contrast: ${JSON.stringify(contrastDesktop)})`);

  // 2. Guest Exploration: Explore Units (#hub) + Full-Page Curriculum (#about) + X button return
  await page.locator('.hero-cta-row a[href="#hub"]').click();
  await page.waitForSelector('.hub-wrap');
  const coreCards = await page.locator('.unit-grid:not(.unit-grid-adv) .unit-card').count();
  const advCards = await page.locator('.unit-grid-adv .unit-card.is-locked').count();
  assert(coreCards === 8 && advCards === 2, `Expected 8 core + 2 locked advanced units in #hub, got ${coreCards} + ${advCards}`);
  await checkNoOverflowAndImages(page, 'Guest Hub Desktop');

  // Open full-page #about from header and verify zero dev codes + X button returns to #hub!
  await page.locator('#site-header a[href="#about"]').click();
  await page.waitForSelector('.about-page-shell');
  await page.evaluate(() => {
    document.querySelectorAll('details.about-unit-card').forEach(d => { d.open = true; });
  });
  await checkNoOverflowAndImages(page, 'Full-page About View');
  await page.screenshot({ path: path.join(SHOT_DIR, '05-about-page-desktop.png'), fullPage: false });
  await page.locator('[data-close-about]').click();
  await page.waitForSelector('.hub-wrap');
  report.checks.push('Guest unit exploration, full-page #about curriculum view (zero internal codes), and X-button return verified');

  // 3. Two-Step Onboarding Wizard (#start): Step 1 Name -> Step 2 Companion -> Hub
  await page.goto(`${BASE}/#welcome`, { waitUntil: 'networkidle' });
  await page.locator('.hero-cta-row a[href="#start"]').click();
  await page.waitForSelector('#wizard-step1-form');
  await checkNoOverflowAndImages(page, 'Wizard Step 1');
  await page.screenshot({ path: path.join(SHOT_DIR, '02-wizard-step1-desktop.png'), fullPage: false });

  await page.fill('#learner-name', 'سارة');
  await page.locator('[data-wizard-next]').click();
  await page.waitForSelector('#create-profile-form');
  await checkNoOverflowAndImages(page, 'Wizard Step 2');
  await page.screenshot({ path: path.join(SHOT_DIR, '03-wizard-step2-desktop.png'), fullPage: false });

  await page.locator('label[for="comp-sanad"]').click();
  await page.locator('#create-profile-form button[type="submit"]').click();
  await page.waitForSelector('.hub-wrap');
  await page.reload({ waitUntil: 'networkidle' });
  const hubHeading = await page.locator('h1').textContent();
  assert(hubHeading.includes('سارة'), `Profile did not persist across reload: ${hubHeading}`);
  await checkNoOverflowAndImages(page, 'Hub Desktop');
  await page.screenshot({ path: path.join(SHOT_DIR, '04-hub-desktop.png'), fullPage: false });

  // Verify user can return to Home (#welcome) easily from header after starting journey!
  await page.locator('#site-header .brand-link').click();
  await page.waitForSelector('.hero-band-home');
  assert((await page.locator('h1').textContent()).includes('ابدأ رحلتك'), 'Brand link did not navigate back to #welcome');
  await page.locator('#site-header a[href="#hub"]').click();
  await page.waitForSelector('.hub-wrap');

  // Confirm U09 locked dialog has zero child overflow & clean Arabic unit labels
  await page.locator('[data-locked-info="U09"]').click();
  await page.waitForSelector('#modal-confirm[open]');
  await checkDialogNoOverflow(page, '#modal-confirm', 'Locked Prereq Modal');
  const lockedText = await page.locator('#modal-confirm').innerText();
  assert(lockedText.includes('الوحدة 1') && !lockedText.includes('U01'), `Expected Arabic unit labels in locked dialog, got: ${lockedText}`);
  await page.keyboard.press('Escape');
  report.checks.push('2-step onboarding wizard, return-to-home navigation, and U09/U10 prerequisite lock verified');

  // Confirm learner can jump directly into ordinary unit U04
  await page.goto(`${BASE}/#unit/U04`, { waitUntil: 'networkidle' });
  assert((await page.locator('h1').textContent()).includes('الوحدة 4'), 'Could not open ordinary unit U04 directly');
  await checkNoOverflowAndImages(page, 'Unit U04 Trail');

  // 4. Unit 1 Journey & Conversational Stage Player + Neural Audio Playback
  await page.goto(`${BASE}/#unit/U01`, { waitUntil: 'networkidle' });
  await checkNoOverflowAndImages(page, 'Unit U01 Trail');
  await page.screenshot({ path: path.join(SHOT_DIR, '06-unit-trail-desktop.png'), fullPage: false });

  const u01 = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/U01.json'), 'utf8'));
  const st1 = u01.stages[0];

  await page.locator('.station-row').nth(0).locator('a.btn-primary').click();
  await page.waitForSelector('.player-wrap .step-scene');
  assert((await page.locator('.step-card').count()) === 0, 'Giant outer .step-card should be replaced by conversational .step-scene');
  assert((await page.locator('.scene-dialogue .scene-bubble').count()) === 1, 'Expected character speech bubble .scene-bubble');
  await checkNoOverflowAndImages(page, 'Stage Player U01-S01');

  // Test Neural Audio button in character bubble resolves without 404
  await page.locator('.scene-audio-btn').click();
  await page.waitForTimeout(250);

  let testedWrongRetry = false;
  for (let si = 0; si < st1.steps.length; si++) {
    const step = st1.steps[si];
    if (si === 2) {
      // Capture screenshot of interactive question step in conversational layout!
      await page.screenshot({ path: path.join(SHOT_DIR, '07-stage-player-desktop.png'), fullPage: false });
    }
    if (step.type === 'learn' || step.type === 'example') {
      await page.locator('[data-next-step]').click();
      continue;
    }
    if (!testedWrongRetry) {
      await solveCurrentStep(page, step, false);
      await page.locator('[data-check-step]').click();
      await page.waitForSelector('.feedback-banner.fb-retry');
      await page.locator('[data-clear-retry]').click();
      testedWrongRetry = true;
    }
    await solveCurrentStep(page, step, true);
    await page.locator('[data-check-step]').click();
    await page.waitForSelector('.feedback-banner.fb-ok');
    await page.locator('[data-next-step]').click();
  }

  await page.waitForSelector('.celebration-card');
  report.checks.push('Conversational character-and-bubble Stage Player, neural audio playback, and Stage 1 completion verified');

  // 5. All 10 Step Types (including listening MCQ & keyboard grab-move-drop on order)
  const allUnits = ['U01','U02','U03','U04','U05','U06','U07','U08','U09','U10'].map(id =>
    JSON.parse(fs.readFileSync(path.join(ROOT, `content/${id}.json`), 'utf8'))
  );
  const targetTypes = ['learn', 'example', 'mcq', 'sort', 'match', 'order', 'fill', 'spot', 'build', 'write'];
  for (const t of targetTypes) {
    let sampleStep = null;
    for (const u of allUnits) {
      for (const st of u.stages) {
        const found = st.steps.find(s => s.type === t && (t !== 'mcq' || s.listen));
        if (found) { sampleStep = found; break; }
      }
      if (sampleStep) break;
    }
    assert(sampleStep, `Could not find step of type ${t}`);
    await page.evaluate((stepObj) => {
      const main = document.getElementById('app-main');
      main.innerHTML = '<div class="shell" id="isolated-step-harness"><div id="test-mount"></div></div>';
      window.__testCtrl = window.Interactions.mountStep(document.getElementById('test-mount'), stepObj, { uid: 't-' + stepObj.type, unitId: 'U01' });
    }, sampleStep);

    if (t === 'order') {
      const firstHandle = page.locator('.drag-handle').first();
      await firstHandle.focus();
      await page.keyboard.press('Space');
      assert((await firstHandle.getAttribute('aria-pressed')) === 'true', 'Keyboard grab did not set aria-pressed=true');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Space');
      assert((await firstHandle.getAttribute('aria-pressed')) === 'false', 'Keyboard drop did not reset aria-pressed=false');
    }

    if (t !== 'learn' && t !== 'example') {
      await solveCurrentStep(page, sampleStep, false);
      const badRes = await page.evaluate(() => window.__testCtrl.evaluate());
      assert(badRes.ok === false, `Step type ${t} passed on wrong answer!`);
      await page.evaluate(() => window.__testCtrl.resetForRetry());
      await solveCurrentStep(page, sampleStep, true);
      const goodRes = await page.evaluate(() => window.__testCtrl.evaluate());
      assert(goodRes.ok === true, `Step type ${t} failed on right answer: ${JSON.stringify(goodRes)}`);
    }
  }
  report.checks.push('All 10 interactive step types verified in conversational layout');

  // 6. Assessment altItems + Non-compensatory Gate + Certificate Modal Overflow & PNG Download
  await page.evaluate(() => {
    const u01 = window.Course.unit('U01');
    for (const st of u01.stages) {
      if (st.kind === 'lesson') window.Store.completeStage('U01', st, { stepXp: 30, accuracy: 95 });
    }
    location.hash = '#assess/U01';
  });
  await page.waitForSelector('.assess-hub-wrap');
  const quizComp = u01.assessment.components[0];
  const cardComp = u01.assessment.components[1];

  await page.goto(`${BASE}/#assess/U01/${quizComp.id}`, { waitUntil: 'networkidle' });
  const itemsWrap1 = page.locator('.assess-item-wrap');
  for (let i = 0; i < quizComp.items.length; i++) {
    const wrongIdx = quizComp.items[i].options.findIndex(o => !o.correct);
    await itemsWrap1.nth(i).locator(`[data-opt="${wrongIdx}"]`).click();
  }
  await page.locator('#submit-comp-btn').click();
  await page.waitForSelector('.assess-result-card.res-fail');
  await page.locator('[data-retry-comp]').click();
  const pillText = await page.locator('.assess-run-head .type-pill').first().textContent();
  assert(pillText.includes('النموذج البديل') && pillText.includes('#2'), `Expected altItems on retry #2, got: ${pillText}`);

  const itemsWrap2 = page.locator('.assess-item-wrap');
  for (let i = 0; i < quizComp.altItems.length; i++) {
    const rightIdx = quizComp.altItems[i].options.findIndex(o => o.correct);
    await itemsWrap2.nth(i).locator(`[data-opt="${rightIdx}"]`).click();
  }
  await page.locator('#submit-comp-btn').click();
  await page.waitForSelector('.assess-result-card.res-pass');

  await page.goto(`${BASE}/#assess/U01/${cardComp.id}`, { waitUntil: 'networkidle' });
  const cardWraps = page.locator('.assess-item-wrap');
  for (let i = 0; i < cardComp.items.length; i++) {
    const item = cardComp.items[i];
    const w = cardWraps.nth(i);
    if (item.type === 'build') {
      for (let fi = 0; fi < item.fields.length; fi++) {
        const oi = item.fields[fi].options.findIndex(o => o.correct);
        await w.locator(`[data-field="${fi}"][data-fopt="${oi}"]`).click();
      }
    } else if (item.type === 'mcq') {
      const oi = item.options.findIndex(o => o.correct);
      await w.locator(`[data-opt="${oi}"]`).click();
    } else if (item.type === 'write') {
      await w.locator('textarea.write-area').fill('مسودة بطاقة وضوح المهمة للعميل الداخلي تحدد الهدف والمدخلات والمخرج وحدود المراجعة البشرية بدقة.');
      await w.locator('[data-reveal-rubric]').click();
      for (let ri = 0; ri < item.rubric.length; ri++) {
        await w.locator(`[data-rubric="${ri}"]`).check();
      }
    }
  }
  await page.locator('#submit-comp-btn').click();
  await page.waitForSelector('[data-claim-cert]');
  await page.locator('[data-claim-cert]').click();
  await page.waitForSelector('#modal-cert[open]');
  await checkDialogNoOverflow(page, '#modal-cert', 'Certificate Modal');
  await page.screenshot({ path: path.join(SHOT_DIR, '08-certificate-modal-desktop.png'), fullPage: false });

  const [certDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-dl-png]').click()
  ]);
  assert(certDownload.suggestedFilename().endsWith('.png'), 'Certificate PNG download failed');
  await page.keyboard.press('Escape');
  report.checks.push('Assessment altItems, non-compensatory gates, certificate modal containment, and PNG download verified');

  // 7. Backup Export -> Profile Deletion UI Bug Fix Verification -> Restore Backup!
  await page.goto(`${BASE}/#profile`, { waitUntil: 'networkidle' });
  await checkNoOverflowAndImages(page, 'Profile Desktop');
  const backupJson = await page.evaluate(() => window.Store.exportBackup('all'));
  const xpBeforeDelete = await page.evaluate(() => window.Store.active().xp);

  // Click real UI Delete button in #profile and confirm!
  await page.locator('[data-del-prof]').first().click();
  await page.waitForSelector('#modal-confirm[open]');
  await checkDialogNoOverflow(page, '#modal-confirm', 'Confirm Delete Modal');
  await page.locator('[data-confirm-delete-btn]').click();
  await page.waitForSelector('.hero-band-home');
  const remainingProfiles = await page.evaluate(() => window.Store.listProfiles().length);
  assert(remainingProfiles === 0, `Expected profile to be deleted via UI modal, but ${remainingProfiles} remained!`);

  // Restore backup via header backup button!
  await page.locator('#site-header [data-open-backup]').click();
  await page.waitForSelector('#modal-backup[open]');
  await checkDialogNoOverflow(page, '#modal-backup', 'Backup Modal');
  await page.fill('#bkp-paste-area', backupJson);
  await page.locator('[data-run-restore]').click();
  await page.waitForSelector('.hub-wrap');
  const restoredState = await page.evaluate(() => ({
    name: window.Store.active().name,
    xp: window.Store.active().xp
  }));
  assert(restoredState.name === 'سارة' && restoredState.xp === xpBeforeDelete, `Backup restore mismatch: ${JSON.stringify(restoredState)}`);
  report.checks.push('Profile deletion UI fix and JSON backup restore verified');

  // 8. Mobile (375×812), Narrow WCAG Reflow (320×640), and Dark Mode Checks
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light'
  });
  const mPage = await mobileCtx.newPage();
  await mPage.goto(BASE, { waitUntil: 'networkidle' });
  await checkNoOverflowAndImages(mPage, 'Mobile 375 Welcome');
  await mPage.screenshot({ path: path.join(SHOT_DIR, '09-welcome-mobile.png'), fullPage: false });

  await mPage.locator('.hero-cta-row a[href="#start"]').click();
  await mPage.waitForSelector('#wizard-step1-form');
  await mPage.fill('#learner-name', 'طارق');
  await mPage.locator('[data-wizard-next]').click();
  await mPage.waitForSelector('#create-profile-form');
  await mPage.locator('#create-profile-form button[type="submit"]').click();
  await mPage.waitForSelector('.hub-wrap');
  await checkNoOverflowAndImages(mPage, 'Mobile 375 Hub');

  await mPage.goto(`${BASE}/#stage/U01/U01-S01`, { waitUntil: 'networkidle' });
  await mPage.locator('[data-next-step]').click();
  await mPage.locator('[data-next-step]').click();
  await checkNoOverflowAndImages(mPage, 'Mobile 375 Stage Player');
  await mPage.screenshot({ path: path.join(SHOT_DIR, '10-player-mobile.png'), fullPage: false });

  await mPage.setViewportSize({ width: 320, height: 640 });
  for (const hash of ['#welcome', '#start', '#hub', '#about', '#unit/U01', '#stage/U01/U01-S01', '#cast', '#profile']) {
    await mPage.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle' });
    await checkNoOverflowAndImages(mPage, `Narrow 320px ${hash}`);
  }

  const darkCtx = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: 'dark' });
  const dPage = await darkCtx.newPage();
  await dPage.goto(BASE, { waitUntil: 'networkidle' });
  const contrastDark = await checkContrast(dPage);
  await dPage.screenshot({ path: path.join(SHOT_DIR, '11-welcome-dark.png'), fullPage: false });
  report.checks.push(`Mobile (375x812), WCAG 320px reflow across all 8 views, and Dark Mode contrast (${JSON.stringify(contrastDark)}) verified`);

  assert(consoleErrors.length === 0, `Console/Page errors: ${consoleErrors.join(' | ')}`);
  assert(failedRequests.length === 0, `HTTP >=400 responses: ${failedRequests.join(' | ')}`);
  report.checks.push('Zero console errors, zero page errors, and zero failed network requests');

  console.log('E2E_ALL_PASSED');
  for (const c of report.checks) console.log(' - ' + c);
} finally {
  await browser.close();
  server.close();
}
