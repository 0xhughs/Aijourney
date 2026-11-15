/* Main application controller, router, views & native dialogs — رِحلَة */
(function () {
  'use strict';

  const esc = Interactions.esc;
  let unsubAudio = null;
  let lastBrowseHash = '#welcome';
  let wizardState = { step: 1, name: '', companion: 'fanak', targetUnit: null };

  /* ---------- Learner-friendly curriculum overview (zero internal filenames/codes) ---------- */
  const CURRICULUM_PILLARS = [
    {
      title: 'مساران متدرجان من الأساسيات حتى بناء الوكلاء',
      body: 'تتكون الرحلة من 8 وحدات أساسية مفتوحة للاختيار المباشر (نحو 615 دقيقة تدريبية)، تليها وحدتان متقدمتان لتنسيق الوكلاء الفرعيين وبناء المنتجات بالذكاء الاصطناعي (نحو 218 دقيقة) تُفتحان تلقائياً فور إتمام الوحدات الأساسية الثماني.'
    },
    {
      title: 'تصحيح فوري للمهام الموضوعية وتحقق ذاتي أمين للكتابة',
      body: 'تُقيَّم أسئلة الاختيار والتصنيف والمطابقة وترتيب الخطوات وفحص المسودات وبناء البطاقات آلياً بتغذية راجعة فورية. أما تمارين الصياغة الكتابية فتحفظ مسودتك محلياً وتعرض لك نموذج الإجابة الاسترشادي وقائمة معايير واضحة لتراجع محاولتك بصدق دون ادعاء تصحيح آلي للنص الحر.'
    },
    {
      title: 'صوت عربي طبيعي محلي وإجابة اختيارية بالمايكروفون',
      body: 'تعمل جميع المقدمات الصوتية ومواقف الاستماع (196 مقطعاً) بصوت عربي طبيعي محلياً دون حاجة لاتصال بالشبكة، مع نص مكتوب كامل لكل مقطع. وتتوفر ميزة الإجابة الصوتية عبر التعرف الصوتي في المتصفحات الداعمة مع إتاحة الاختيار باللمس ولوحة المفاتيح دائماً.'
    },
    {
      title: 'قواعد إكمال مستقلة وبوابات أمان غير قابلة للتعويض',
      body: 'تُمنح شهادة كل وحدة بعد اجتياز مكونات التقييم الختامي كلٍّ على حدة وبلا تعويض بين الاختبار المعرفي ومهمة الأداء، مع اشتراط استيفاء بوابات الخصوصية والسلامة والتحقق من المصادر، والانتقال تلقائياً إلى نموذج بديل جديد عند إعادة المحاولة.'
    }
  ];

  function formatUnitLabel(unitId) {
    const u = Course.unit(unitId);
    if (u) return `الوحدة ${u.number}`;
    const m = /^U0*(\d+)$/i.exec(String(unitId || '').trim());
    return m ? `الوحدة ${Number(m[1])}` : String(unitId || '');
  }

  function formatLessonRef(ref, fallbackNum) {
    const raw = String(ref || '').trim();
    if (!raw) return `الدرس ${fallbackNum}`;
    const m = /^U\d+-L0*(\d+)$/i.exec(raw);
    if (m) return `الدرس ${Number(m[1])}`;
    const m2 = /^L0*(\d+)$/i.exec(raw);
    if (m2) return `الدرس ${Number(m2[1])}`;
    return raw.replace(/U0*(\d+)-L0*(\d+)/gi, 'الدرس $2');
  }

  /* ---------- Router ---------- */
  function parseRoute() {
    const raw = (location.hash || '#').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return { view: Store.active() ? 'hub' : 'welcome' };
    if (parts[0] === 'welcome') return { view: 'welcome' };
    if (parts[0] === 'start') return { view: 'start', targetUnit: parts[1] || null };
    if (parts[0] === 'hub') return { view: 'hub' };
    if (parts[0] === 'cast') return { view: 'cast' };
    if (parts[0] === 'about') return { view: 'about', unitId: parts[1] || null };
    if (parts[0] === 'profile') return { view: 'profile' };
    if (parts[0] === 'unit' && parts[1]) return { view: 'unit', unitId: parts[1] };
    if (parts[0] === 'stage' && parts[1] && parts[2]) return { view: 'stage', unitId: parts[1], stageId: parts[2] };
    if (parts[0] === 'assess' && parts[1] && parts[2]) return { view: 'assess-run', unitId: parts[1], compId: parts[2] };
    if (parts[0] === 'assess' && parts[1]) return { view: 'assess', unitId: parts[1] };
    return { view: Store.active() ? 'hub' : 'welcome' };
  }

  function go(hash) {
    AudioEngine.stop();
    if (location.hash === hash) renderRoute();
    else location.hash = hash;
  }

  function setPageTitle(sub) {
    document.title = sub ? `${sub} | رِحلَة — الذكاء الاصطناعي بالعربية` : 'رِحلَة — ابدأ رحلتك في الذكاء الاصطناعي';
  }

  function applyProfilePrefs() {
    const p = Store.active();
    const root = document.documentElement;
    const size = (p && p.settings && p.settings.textSize) || 'm';
    root.dataset.textSize = size;
    if (p && p.settings && p.settings.reduceMotion) root.dataset.reduceMotion = 'true';
    else delete root.dataset.reduceMotion;
  }

  /* ---------- Top Shell Header & Minimal Footer ---------- */
  function isFocusView(view) {
    return view === 'start' || view === 'about' || view === 'stage' || view === 'assess-run';
  }

  function renderHeader(route) {
    const header = document.getElementById('site-header');
    if (isFocusView(route.view)) {
      header.hidden = true;
      header.innerHTML = '';
      return;
    }
    header.hidden = false;

    const p = Store.active();
    const certsCount = p ? Course.units().filter(u => Course.isCertified(u.id, p)).length : 0;
    const soundOn = !p || p.settings.sound !== false;

    header.innerHTML = `
      <div class="shell header-inner">
        <a href="#welcome" class="brand-link" aria-label="رِحلَة — الصفحة الرئيسية">
          <img src="assets/characters/fanak.webp" alt="" class="brand-fox" width="42" height="42">
          <div class="brand-txt">
            <span class="brand-name">رِحلَة</span>
            <span class="brand-sub">الذكاء الاصطناعي بالعربية</span>
          </div>
        </a>

        <nav class="top-nav" aria-label="التنقل الرئيسي">
          <a href="#welcome" class="nav-pill${route.view === 'welcome' ? ' is-current' : ''}" ${route.view === 'welcome' ? 'aria-current="page"' : ''}>
            <span>الرئيسية</span>
          </a>
          <a href="#hub" class="nav-pill${route.view === 'hub' || route.view === 'unit' || route.view === 'assess' ? ' is-current' : ''}" ${route.view === 'hub' ? 'aria-current="page"' : ''}>
            ${Icon('map', { size: 17 })} <span>الوحدات</span>
          </a>
          <a href="#cast" class="nav-pill${route.view === 'cast' ? ' is-current' : ''}" ${route.view === 'cast' ? 'aria-current="page"' : ''}>
            ${Icon('users', { size: 17 })} <span>رفاق الرحلة</span>
          </a>
          <a href="#about" class="nav-pill${route.view === 'about' ? ' is-current' : ''}" ${route.view === 'about' ? 'aria-current="page"' : ''}>
            ${Icon('book', { size: 17 })} <span>عن المنهج</span>
          </a>
          ${p ? `
            <a href="#profile" class="nav-pill${route.view === 'profile' ? ' is-current' : ''}" ${route.view === 'profile' ? 'aria-current="page"' : ''}>
              ${Icon('medal', { size: 17 })} <span>ملفي (${certsCount})</span>
            </a>
          ` : ''}
        </nav>

        <div class="hud-stats">
          ${p ? `
            <div class="stat-chip" aria-label="أيام التعلّم المتتالية: ${p.streak.count}">
              <img src="assets/icons/lantern.webp" alt="" width="22" height="22">
              <span>${p.streak.count}</span>
            </div>
            <div class="stat-chip stat-xp" aria-label="نقاط الخبرة: ${p.xp}">
              <img src="assets/icons/star.webp" alt="" width="22" height="22">
              <span>${p.xp} XP</span>
            </div>
            <button type="button" class="icon-btn" data-toggle-sound aria-pressed="${soundOn ? 'true' : 'false'}" aria-label="${soundOn ? 'كتم المؤثرات الصوتية' : 'تشغيل المؤثرات الصوتية'}">
              ${Icon(soundOn ? 'volume' : 'mute', { size: 19 })}
            </button>
            <a href="#profile" class="profile-chip" aria-label="الملف المحلي: ${esc(p.name)}">
              <img src="${esc(Cast.img(p.companion))}" alt="" width="28" height="28">
              <span class="profile-chip-name">${esc(p.name)}</span>
            </a>
          ` : `
            <button type="button" class="btn btn-ghost btn-sm" data-open-backup>${Icon('upload', { size: 16 })} <span>استعادة نسخة</span></button>
            <a href="#start" class="btn btn-primary btn-sm"><span>ابدأ الرحلة</span></a>
          `}
        </div>
      </div>`;
    bindHeaderEvents(header);
  }

  function bindHeaderEvents(header) {
    const snd = header.querySelector('[data-toggle-sound]');
    if (snd) {
      snd.addEventListener('click', () => {
        const p = Store.active();
        if (!p) return;
        Store.updateSettings({ sound: p.settings.sound === false });
        renderHeader(parseRoute());
      });
    }
    const bkp = header.querySelector('[data-open-backup]');
    if (bkp) bkp.addEventListener('click', () => openBackupDialog());
  }

  function renderFooter(route) {
    const footer = document.getElementById('site-footer');
    if (!footer) return;
    if (route.view === 'welcome' || isFocusView(route.view)) {
      footer.hidden = true;
      footer.innerHTML = '';
      return;
    }
    footer.hidden = false;
    footer.innerHTML = `
      <div class="shell footer-minimal">
        <span class="footer-quiet-text">رِحلَة · يُحفظ تقدّمك وشهاداتك محلياً على هذا الجهاز</span>
        <div class="footer-quiet-links">
          <button type="button" class="footer-link-btn" data-footer-backup>${Icon('download', { size: 15 })} <span>نسخة احتياطية</span></button>
          <span aria-hidden="true">·</span>
          <a href="#about" class="footer-link-btn">عن المنهج</a>
        </div>
      </div>`;
    const fbkp = footer.querySelector('[data-footer-backup]');
    if (fbkp) fbkp.addEventListener('click', () => openBackupDialog());
  }

  /* ---------- Main Route Renderer ---------- */
  function renderRoute() {
    applyProfilePrefs();
    if (unsubAudio) { unsubAudio(); unsubAudio = null; }
    const route = parseRoute();
    const p = Store.active();

    // Gate views that strictly require an active profile
    if (!p && (route.view === 'unit' || route.view === 'stage' || route.view === 'assess' || route.view === 'assess-run')) {
      wizardState.step = 1;
      wizardState.targetUnit = route.unitId || null;
      go(route.unitId ? `#start/${encodeURIComponent(route.unitId)}` : '#start');
      return;
    }
    if (!p && route.view === 'profile') {
      go('#welcome');
      return;
    }

    if (!isFocusView(route.view)) {
      lastBrowseHash = location.hash || (p ? '#hub' : '#welcome');
    }

    document.body.dataset.view = route.view;
    renderHeader(route);
    renderFooter(route);
    const main = document.getElementById('app-main');

    if (route.view === 'welcome') renderWelcome(main, p);
    else if (route.view === 'start') renderStartWizard(main, route.targetUnit);
    else if (route.view === 'hub') renderHub(main, p);
    else if (route.view === 'cast') renderCastPage(main);
    else if (route.view === 'about') renderAboutPage(main, route.unitId);
    else if (route.view === 'profile') renderProfile(main, p);
    else if (route.view === 'unit') renderUnitJourney(main, route.unitId, p);
    else if (route.view === 'stage') renderStagePlayer(main, route.unitId, route.stageId, p);
    else if (route.view === 'assess') renderAssessmentHub(main, route.unitId, p);
    else if (route.view === 'assess-run') renderAssessmentRunner(main, route.unitId, route.compId, p);

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const h1 = main.querySelector('h1[tabindex="-1"]');
    if (h1) h1.focus({ preventScroll: true });
  }

  /* ==========================================================================
   * 1. MINIMALIST ONE-SCREEN HOME PAGE (#welcome)
   * ========================================================================== */
  function renderWelcome(main, p) {
    setPageTitle('ابدأ رحلتك في الذكاء الاصطناعي');
    const existing = Store.listProfiles();

    main.innerHTML = `
      <section class="hero-band hero-band-home">
        <div class="shell hero-grid">
          <div class="hero-copy">
            <span class="eyebrow-pill">تعلّم مجاني بالعربية · حفظ محلي بلا حساب</span>
            <h1 id="main-heading" tabindex="-1" class="hero-title">ابدأ رحلتك في الذكاء الاصطناعي</h1>
            <p class="hero-lead">
              تعلّم خطوةً بخطوة كيف تحوّل الذكاء الاصطناعي إلى شريك عمل ذكي تتقن توجيهه والتحقق من مخرجاته بثقة.
            </p>
            <div class="hero-cta-row">
              ${p ? `
                <a href="#hub" class="btn btn-primary btn-lg">${Icon('forward', { size: 20 })} <span>تابع رحلتك يا ${esc(p.name)}</span></a>
              ` : `
                <a href="#start" class="btn btn-primary btn-lg">${Icon('sparkle', { size: 20 })} <span>ابدأ رحلتك في الذكاء الاصطناعي</span></a>
              `}
              <a href="#hub" class="btn btn-secondary btn-lg"><span>استكشف الوحدات العشر</span></a>
            </div>
            ${p || existing.length ? `
              <p class="hero-switch-row">
                <a href="#start" class="subtle-inline-link">${p ? 'إنشاء ملف متعلّم جديد أو التبديل بين الملفات' : `لديك ${existing.length} ملف محفوظ على هذا الجهاز — اضغط للدخول`}</a>
              </p>
            ` : ''}
            <div class="hero-facts" aria-label="ملخص الرحلة">
              <div class="fact-item">
                <strong>8 وحدات أساسية</strong>
                <span>متاحة للاختيار المباشر</span>
              </div>
              <div class="fact-item">
                <strong>وحدتان متقدمتان</strong>
                <span>تُفتحان بعد إتمام الأساسيات</span>
              </div>
              <div class="fact-item">
                <strong>141 محطة تعليمية</strong>
                <span>تطبيق عملي وشهادات إتمام</span>
              </div>
            </div>
          </div>

          <div class="hero-stage-art">
            <div class="friends-ensemble" role="img" aria-label="أصدقاء رحلة الستة مجتمعون: فَنَك، هيوز، ريم، حَسّوب، سَنَد، وهُدهُد">
              <div class="ensemble-glow" aria-hidden="true"></div>
              <img src="assets/characters/hughes.webp" alt="" class="friend-fig fig-hughes" width="184" height="184">
              <img src="assets/characters/reem.webp" alt="" class="friend-fig fig-reem" width="180" height="180">
              <img src="assets/characters/hudhud.webp" alt="" class="friend-fig fig-hudhud" width="136" height="136">
              <img src="assets/characters/hasoub.webp" alt="" class="friend-fig fig-hasoub" width="166" height="166">
              <img src="assets/characters/sanad.webp" alt="" class="friend-fig fig-sanad" width="166" height="166">
              <img src="assets/characters/fanak.webp" alt="" class="friend-fig fig-fanak" width="224" height="224">
            </div>
          </div>
        </div>
      </section>`;
  }

  /* ==========================================================================
   * 2. TWO-STEP ONBOARDING WIZARD (#start & #start/UXX)
   * ========================================================================== */
  function renderStartWizard(main, routeTargetUnit) {
    setPageTitle('إعداد ملفك المحلي');
    if (routeTargetUnit) wizardState.targetUnit = routeTargetUnit;
    const existing = Store.listProfiles();
    const targetUnitObj = wizardState.targetUnit ? Course.unit(wizardState.targetUnit) : null;
    const exitHash = lastBrowseHash && !lastBrowseHash.startsWith('#start') ? lastBrowseHash : '#welcome';

    function draw() {
      const step = wizardState.step;
      main.innerHTML = `
        <div class="focus-shell wizard-shell">
          <div class="focus-topbar">
            <a href="${esc(exitHash)}" class="icon-btn" data-close-wizard aria-label="إغلاق والعودة">
              ${Icon('close', { size: 20 })}
            </a>
            <div class="wizard-steps-indicator" aria-label="الخطوة ${step} من 2">
              <span class="wiz-dot ${step >= 1 ? 'is-active' : ''}"></span>
              <span class="wiz-dot ${step >= 2 ? 'is-active' : ''}"></span>
              <span class="wiz-step-txt">الخطوة ${step} من 2</span>
            </div>
            <span class="brand-mini">رِحلَة</span>
          </div>

          ${step === 1 ? `
            <section class="card wizard-card">
              <img src="assets/characters/fanak.webp" alt="" width="88" height="88" class="wizard-mascot">
              ${targetUnitObj ? `<span class="type-pill">البدء من الوحدة ${targetUnitObj.number}: ${esc(targetUnitObj.title)}</span>` : ''}
              <h1 id="main-heading" tabindex="-1" class="wizard-title">ما الاسم الذي تحب أن يظهر في رحلتك؟</h1>
              <p class="muted wizard-sub">اسم أول أو لقب يكفي؛ سيظهر على شهادات إتمام الوحدات الخاصة بك.</p>

              <form id="wizard-step1-form" class="wizard-form">
                <label for="learner-name" class="visually-hidden">اسم المتعلّم</label>
                <input type="text" id="learner-name" name="name" maxlength="40" autocomplete="nickname"
                  value="${esc(wizardState.name)}" placeholder="مثال: سارة، طارق، نورة..." required>
                <button type="submit" class="btn btn-primary btn-lg btn-block" data-wizard-next>
                  <span>التالي: اختر رفيقك</span> ${Icon('forward', { size: 20 })}
                </button>
              </form>

              ${existing.length ? `
                <div class="wizard-existing-block">
                  <div class="wizard-divider"><span>أو ادخل بملف محفوظ على هذا الجهاز</span></div>
                  <div class="existing-profiles" role="group" aria-label="الملفات المحفوظة">
                    ${existing.map(pr => `
                      <button type="button" class="existing-prof-btn" data-pick-prof="${esc(pr.id)}">
                        <img src="${esc(Cast.img(pr.companion))}" alt="" width="38" height="38">
                        <div>
                          <strong>${esc(pr.name)}</strong>
                          <span>${pr.xp} XP · ${Course.units().filter(u => Course.isCertified(u.id, pr)).length} شهادات</span>
                        </div>
                        <span class="enter-arrow">${Icon('forward', { size: 18 })}</span>
                      </button>`).join('')}
                  </div>
                </div>
              ` : ''}

              <div class="wizard-foot-note">
                <button type="button" class="footer-link-btn" data-restore-welcome>
                  ${Icon('upload', { size: 15 })} <span>لديّ ملف نسخة احتياطية محفوظة</span>
                </button>
              </div>
            </section>
          ` : `
            <section class="card wizard-card wizard-card-wide">
              <span class="eyebrow-pill">أهلاً يا ${esc(wizardState.name)}</span>
              <h1 id="main-heading" tabindex="-1" class="wizard-title">اختر رفيقك المفضّل في الرحلة</h1>
              <p class="muted wizard-sub">سيرافقك في الترحيب والتشجيع طوال المحطات، ويمكنك تبديله في أي وقت من ملفك.</p>

              <form id="create-profile-form" class="wizard-form">
                <fieldset class="companion-fieldset wizard-companion-fieldset">
                  <legend class="visually-hidden">اختر رفيق الرحلة</legend>
                  <div class="companion-grid wizard-companion-grid">
                    ${Cast.order.map(cid => {
                      const ch = Cast.get(cid);
                      const checked = wizardState.companion === cid;
                      return `
                        <label class="companion-option wizard-comp-card" for="comp-${esc(cid)}">
                          <input type="radio" name="companion" id="comp-${esc(cid)}" value="${esc(cid)}" ${checked ? 'checked' : ''}>
                          <img src="${esc(Cast.img(cid))}" alt="" width="64" height="64">
                          <span class="comp-name">${esc(ch.name)}</span>
                          <span class="comp-role">${esc(ch.role)}</span>
                        </label>`;
                    }).join('')}
                  </div>
                </fieldset>

                <div class="wizard-actions-row">
                  <button type="button" class="btn btn-ghost" data-wizard-back>
                    ${Icon('back', { size: 18 })} <span>السابق</span>
                  </button>
                  <button type="submit" class="btn btn-primary btn-lg">
                    ${Icon('sparkle', { size: 20 })} <span>ابدأ الرحلة الآن</span>
                  </button>
                </div>
              </form>
            </section>
          `}
        </div>`;

      const step1Form = main.querySelector('#wizard-step1-form');
      if (step1Form) {
        const nameInp = step1Form.querySelector('#learner-name');
        setTimeout(() => nameInp && nameInp.focus(), 40);
        step1Form.addEventListener('submit', (e) => {
          e.preventDefault();
          const val = nameInp.value.trim();
          if (!val) return;
          wizardState.name = val;
          wizardState.step = 2;
          AudioEngine.sfx('tap');
          draw();
        });
      }

      main.querySelectorAll('[data-pick-prof]').forEach(btn => {
        btn.addEventListener('click', () => {
          Store.switchProfile(btn.dataset.pickProf);
          const dest = wizardState.targetUnit ? `#unit/${wizardState.targetUnit}` : '#hub';
          wizardState.targetUnit = null;
          go(dest);
        });
      });

      const restoreBtn = main.querySelector('[data-restore-welcome]');
      if (restoreBtn) restoreBtn.addEventListener('click', () => openBackupDialog());

      const backBtn = main.querySelector('[data-wizard-back]');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          const picked = main.querySelector('input[name="companion"]:checked');
          if (picked) wizardState.companion = picked.value;
          wizardState.step = 1;
          draw();
        });
      }

      const createForm = main.querySelector('#create-profile-form');
      if (createForm) {
        createForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const picked = createForm.querySelector('input[name="companion"]:checked');
          const comp = (picked && picked.value) || wizardState.companion || 'fanak';
          const name = wizardState.name.trim();
          if (!name) { wizardState.step = 1; draw(); return; }
          Store.createProfile(name, comp);
          Store.requestPersistence();
          AudioEngine.sfx('correct');
          const dest = wizardState.targetUnit ? `#unit/${wizardState.targetUnit}` : '#hub';
          wizardState = { step: 1, name: '', companion: 'fanak', targetUnit: null };
          go(dest);
        });
      }
    }

    draw();
  }

  /* ==========================================================================
   * 3. FULL-PAGE CURRICULUM OVERVIEW (#about & #about/UXX)
   * ========================================================================== */
  function renderAboutPage(main, focusUnitId) {
    const specificUnit = focusUnitId ? Course.unit(focusUnitId) : null;
    setPageTitle(specificUnit ? `عن الوحدة ${specificUnit.number}` : 'عن المنهج وطريقة التعلّم');
    const exitHash = lastBrowseHash && !lastBrowseHash.startsWith('#about')
      ? lastBrowseHash
      : (specificUnit ? `#unit/${specificUnit.id}` : (Store.active() ? '#hub' : '#welcome'));

    const unitsList = specificUnit ? [specificUnit] : Course.units();

    main.innerHTML = `
      <div class="focus-shell about-page-shell">
        <div class="focus-topbar about-topbar">
          <a href="${esc(exitHash)}" class="icon-btn" data-close-about aria-label="إغلاق والعودة">
            ${Icon('close', { size: 20 })}
          </a>
          <span class="focus-topbar-title">${specificUnit ? `ملاحظات الوحدة ${specificUnit.number}` : 'عن المنهج وطريقة التعلّم'}</span>
          <a href="${esc(exitHash)}" class="btn btn-ghost btn-sm">عودة</a>
        </div>

        <section class="about-hero">
          <span class="eyebrow-pill">شفافية المنهج والتقويم</span>
          <h1 id="main-heading" tabindex="-1">
            ${specificUnit ? `الوحدة ${specificUnit.number}: ${esc(specificUnit.title)}` : 'كيف تعمل رحلة التعلّم والتقييم في «رِحلَة»؟'}
          </h1>
          <p class="muted">
            صُممت هذه التجربة التفاعلية لتقديم المنهج التدريبي العربي الكامل بأمانة ووضوح، مع حفظ تقدّمك محلياً على جهازك دون تعقيد.
          </p>
        </section>

        ${!specificUnit ? `
          <section class="pillars-grid" aria-label="ركائز المنهج">
            ${CURRICULUM_PILLARS.map(item => `
              <article class="card pillar-card">
                <h2>${esc(item.title)}</h2>
                <p class="muted">${esc(item.body)}</p>
              </article>
            `).join('')}
          </section>
        ` : ''}

        <section class="about-units-section">
          <div class="section-head-inline">
            <h2>${specificUnit ? 'إرشادات وملاحظات هذه الوحدة' : 'ملاحظات الوحدات العشر'}</h2>
            ${specificUnit ? `<a href="#about" class="btn btn-secondary btn-sm">عرض جميع الوحدات العشر</a>` : ''}
          </div>
          <div class="about-units-stack">
            ${unitsList.map(u => `
              <details class="card about-unit-card" ${specificUnit || u.number === 1 ? 'open' : ''}>
                <summary class="about-unit-summary">
                  <span><strong>الوحدة ${u.number}:</strong> ${esc(u.title)}</span>
                  <span class="type-pill">${u.minutes} دقيقة</span>
                </summary>
                <div class="about-unit-body">
                  <p class="muted">${esc(u.summary)}</p>
                  <ul class="gaps-list" role="list">
                    ${(u.gaps || []).map(g => `<li>${esc(g)}</li>`).join('')}
                  </ul>
                </div>
              </details>
            `).join('')}
          </div>
        </section>
      </div>`;
  }

  /* ==========================================================================
   * 4. UNIT HUB VIEW (#hub — supports both active profile and guest exploration)
   * ========================================================================== */
  function renderUnitCard(u, p) {
    const unlocked = p ? Course.unitUnlocked(u, p) : (u.track === 'core');
    const prog = p
      ? Course.unitProgress(u, p)
      : { lessonsDone: 0, lessons: Course.lessonStages(u).length, compsDone: 0, comps: u.assessment.components.length, ratio: 0, certified: false, started: false };
    const pct = Math.round(prog.ratio * 100);
    const iconSrc = `assets/icons/u${String(u.number).padStart(2, '0')}.webp`;
    const missing = p ? Course.missingPrereqs(u, p) : (u.track === 'advanced' ? Course.coreUnits().map(c => c.id) : []);

    let statusBadge = '';
    if (!unlocked) {
      statusBadge = `<span class="u-badge u-locked">${Icon('lock', { size: 14 })} مغلقة (بقي ${missing.length} من 8 أساسية)</span>`;
    } else if (prog.certified) {
      statusBadge = `<span class="u-badge u-cert">${Icon('medal', { size: 15 })} مكتملة بشهادة</span>`;
    } else if (prog.lessonsDone > 0 || prog.compsDone > 0) {
      statusBadge = `<span class="u-badge u-prog">قيد التعلّم · ${pct}%</span>`;
    } else {
      statusBadge = `<span class="u-badge u-open">متاحة للبدء</span>`;
    }

    const recNote = (u.recommendedAfter && u.recommendedAfter.length)
      ? `<p class="u-rec-note">تطبيق تكاملي يستفيد من ${esc(u.recommendedAfter.map(formatUnitLabel).join(' و'))} (متاح مباشرة)</p>`
      : '';

    const ctaHref = p ? `#unit/${esc(u.id)}` : `#start/${esc(u.id)}`;
    const ctaLabel = !p
      ? 'ابدأ من هذه الوحدة'
      : (prog.certified ? 'مراجعة الوحدة والشهادة' : (prog.started ? 'متابعة المحطات' : 'ابدأ الوحدة'));

    return `
      <article class="unit-card${unlocked ? '' : ' is-locked'}${prog.certified ? ' is-certified' : ''}">
        <div class="u-card-top">
          <div class="u-icon-wrap">
            <img src="${esc(iconSrc)}" alt="" width="64" height="64">
            ${!unlocked ? `<img src="assets/icons/lock.webp" alt="" class="u-lock-overlay" width="28" height="28">` : ''}
          </div>
          <div class="u-meta-col">
            <div class="u-num-row">
              <span class="u-num">الوحدة ${u.number}</span>
              <span class="u-mins">${u.minutes} دقيقة</span>
            </div>
            ${statusBadge}
          </div>
        </div>
        <div class="u-card-body">
          <h3 class="u-title">${esc(u.title)}</h3>
          <p class="u-tagline">${esc(u.tagline)}</p>
          ${recNote}
        </div>
        <div class="u-card-foot">
          <div class="u-progress-row">
            <span>${prog.lessonsDone}/${prog.lessons} محطة · ${prog.compsDone}/${prog.comps} تقييم</span>
            <span>${pct}%</span>
          </div>
          <progress class="u-prog" max="100" value="${pct}" aria-label="تقدّم الوحدة ${u.number}: ${pct}%"></progress>
          ${unlocked ? `
            <a href="${ctaHref}" class="btn ${prog.certified ? 'btn-secondary' : 'btn-primary'} btn-block">
              <span>${ctaLabel}</span>
              ${Icon('forward', { size: 18 })}
            </a>
          ` : `
            <button type="button" class="btn btn-locked-explain btn-block" data-locked-info="${esc(u.id)}">
              ${Icon('lock', { size: 16 })} <span>أكمل الوحدات 1–8 لفتح المسار المتقدم</span>
            </button>
          `}
        </div>
      </article>`;
  }

  function renderHub(main, p) {
    setPageTitle('خريطة الوحدات العشر');
    const core = Course.coreUnits();
    const adv = Course.advancedUnits();
    const coreCerts = p ? core.filter(u => Course.isCertified(u.id, p)).length : 0;
    const advUnlocked = coreCerts === core.length;
    const comp = p ? Cast.get(p.companion) : Cast.get('fanak');

    const activeUnit = p
      ? (Course.units().find(u => Course.unitUnlocked(u, p) && !Course.isCertified(u.id, p) && Course.unitProgress(u, p).started)
        || core.find(u => !Course.isCertified(u.id, p))
        || Course.units()[0])
      : null;

    main.innerHTML = `
      <div class="shell hub-wrap">
        ${p ? `
          <section class="welcome-strip card">
            <div class="strip-main">
              <img src="${esc(Cast.img(comp.id))}" alt="${esc(comp.name)}" class="strip-avatar" width="80" height="80">
              <div class="strip-copy">
                <h1 id="main-heading" tabindex="-1">أهلاً يا ${esc(p.name)} — جاهز للمحطة القادمة؟</h1>
                <p>${esc(Cast.pick(comp.correct, p.xp))} اختر أي وحدة أساسية أو تابع من حيث توقفت.</p>
              </div>
            </div>
            <div class="strip-actions">
              ${activeUnit ? `<a href="#unit/${esc(activeUnit.id)}" class="btn btn-primary">${Icon('forward', { size: 18 })} <span>تابع: الوحدة ${activeUnit.number}</span></a>` : ''}
            </div>
          </section>
        ` : `
          <section class="welcome-strip card">
            <div class="strip-main">
              <img src="assets/characters/fanak.webp" alt="فَنَك" class="strip-avatar" width="76" height="76">
              <div class="strip-copy">
                <h1 id="main-heading" tabindex="-1">خريطة الوحدات العشر في الرحلة</h1>
                <p class="muted">تصفّح المسارين الأساسي والمتقدم بحرية، واختر أي وحدة أساسية لبدء رحلتك في خطوتين سريعتين.</p>
              </div>
            </div>
            <div class="strip-actions">
              <a href="#start" class="btn btn-primary">${Icon('sparkle', { size: 18 })} <span>ابدأ رحلتك الآن</span></a>
            </div>
          </section>
        `}

        <section class="hub-section">
          <div class="section-head-inline">
            <div>
              <h2>المسار الأساسي (الوحدات 1–8 · متاحة للاختيار)</h2>
              <p class="muted">مجموع المادة التقديري 615 دقيقة${p ? ` · أنجزت <strong>${coreCerts} من 8</strong> شهادات أساسية.` : '.'}</p>
            </div>
          </div>
          <div class="unit-grid">
            ${core.map(u => renderUnitCard(u, p)).join('')}
          </div>
        </section>

        <section class="hub-section adv-section">
          <div class="adv-banner ${advUnlocked ? 'is-unlocked' : 'is-locked'}">
            <img src="${advUnlocked ? 'assets/icons/certificate.webp' : 'assets/icons/lock.webp'}" alt="" width="56" height="56">
            <div class="adv-banner-copy">
              <h2>المسار المتقدم (الوحدتان 9 و10)</h2>
              <p>
                ${advUnlocked
                  ? 'أحسنت! أتممت جميع الوحدات الأساسية الثماني وفُتح لك المسار المتقدم لتنسيق الوكلاء الفرعيين وبناء المنتجات.'
                  : `يُفتح هذا المسار تلقائياً فور إتمام الوحدات الأساسية الثماني واستلام شهاداتها (${coreCerts} / 8 مكتملة حالياً).`}
              </p>
            </div>
            <div class="adv-meter">
              <span>${coreCerts} / 8</span>
              <progress max="8" value="${coreCerts}" aria-label="متطلبات المسار المتقدم: ${coreCerts} من 8 وحدات أساسية"></progress>
            </div>
          </div>
          <div class="unit-grid unit-grid-adv">
            ${adv.map(u => renderUnitCard(u, p)).join('')}
          </div>
        </section>
      </div>`;

    main.querySelectorAll('[data-locked-info]').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = Course.unit(btn.dataset.lockedInfo);
        const miss = p ? Course.missingPrereqs(u, p) : Course.coreUnits().map(c => c.id);
        const labels = miss.map(formatUnitLabel);
        Interactions.announce(`الوحدة ${u.number} مقفلة حتى إتمام الوحدات الأساسية المتبقية: ${labels.join('، ')}.`);
        openLockedPrereqDialog(u, labels);
      });
    });
  }

  /* ==========================================================================
   * 5. UNIT JOURNEY STATION TRAIL (#unit/UXX)
   * ========================================================================== */
  function renderUnitJourney(main, unitId, p) {
    const u = Course.unit(unitId);
    if (!u) { go('#hub'); return; }
    if (!Course.unitUnlocked(u, p)) {
      openLockedPrereqDialog(u, Course.missingPrereqs(u, p).map(formatUnitLabel));
      go('#hub');
      return;
    }

    setPageTitle(`الوحدة ${u.number}: ${u.title}`);
    const prog = Course.unitProgress(u, p);
    const nextSt = Course.nextStage(u, p);
    const assessOpen = Course.assessmentUnlocked(u, p);
    const assessDone = Course.assessmentPassed(u, p);
    const uState = Store.unitState(u.id, p);

    main.innerHTML = `
      <div class="shell unit-journey-wrap">
        <nav class="breadcrumb" aria-label="مسار الصفحة">
          <a href="#hub">${Icon('back', { size: 16 })} <span>خريطة الوحدات</span></a>
          <span aria-hidden="true">/</span>
          <span>الوحدة ${u.number}</span>
        </nav>

        <section class="unit-hero card">
          <div class="unit-hero-main">
            <img src="assets/icons/u${String(u.number).padStart(2, '0')}.webp" alt="" class="unit-hero-icon" width="80" height="80">
            <div class="unit-hero-copy">
              <div class="unit-chips">
                <span class="type-pill">${u.track === 'advanced' ? 'مسار متقدم' : 'مسار أساسي'}</span>
                <span class="type-pill">${u.minutes} دقيقة</span>
                <span class="type-pill">${prog.lessons} محطة + تحدٍّ إضافي</span>
              </div>
              <h1 id="main-heading" tabindex="-1">الوحدة ${u.number}: ${esc(u.title)}</h1>
              <p class="unit-summary">${esc(u.summary)}</p>
            </div>
          </div>
          <div class="unit-hero-cta">
            ${nextSt ? `
              <a href="#stage/${esc(u.id)}/${esc(nextSt.id)}" class="btn btn-primary btn-lg">
                ${Icon('forward', { size: 20 })} <span>${prog.lessonsDone === 0 ? 'ابدأ المحطة الأولى' : `تابع: ${esc(nextSt.title)}`}</span>
              </a>
            ` : (assessDone && uState.certificate ? `
              <button type="button" class="btn btn-primary btn-lg" data-view-unit-cert>
                ${Icon('medal', { size: 20 })} <span>اعرض شهادة الوحدة</span>
              </button>
            ` : `
              <a href="#assess/${esc(u.id)}" class="btn btn-primary btn-lg">
                ${Icon('flag', { size: 20 })} <span>انتقل إلى تقييم نهاية الوحدة</span>
              </a>
            `)}
            <a href="#about/${esc(u.id)}" class="btn btn-ghost btn-sm">${Icon('info', { size: 16 })} <span>إرشادات الوحدة</span></a>
          </div>

          <details class="unit-details">
            <summary>ماذا ستتعلم في هذه الوحدة؟</summary>
            <div class="unit-details-grid">
              <div>
                <h3>نواتج التعلّم</h3>
                <ul class="goals-list" role="list">
                  ${u.goals.map(g => `<li>${Icon('check', { size: 16 })}<span>${esc(g)}</span></li>`).join('')}
                </ul>
              </div>
              <div>
                <h3>قبل البدء</h3>
                <p class="small-prose">${esc(u.beforeYouStart)}</p>
                <p class="small-prose muted">${esc(u.learningLimits)}</p>
              </div>
            </div>
          </details>
        </section>

        <section class="trail-section" aria-label="محطات الوحدة المتسلسلة">
          <h2 class="visually-hidden">محطات الرحلة</h2>
          <ol class="station-trail" role="list">
            ${u.stages.map((st, idx) => renderStationNode(u, st, idx, p)).join('')}
            ${renderAssessmentNode(u, assessOpen, assessDone, uState)}
          </ol>
        </section>
      </div>`;

    const certBtn = main.querySelector('[data-view-unit-cert]');
    if (certBtn) certBtn.addEventListener('click', () => openCertificateDialog(u, uState.certificate, p.name));
  }

  function renderStationNode(u, st, idx, p) {
    const status = Course.stageStatus(u, st, p);
    const isBonus = st.kind === 'bonus';
    const offsets = ['offset-mid', 'offset-start', 'offset-mid', 'offset-end'];
    const offsetCls = offsets[idx % offsets.length];
    const ch = Cast.get(st.mascot);
    const stInfo = Store.unitState(u.id, p).stages[st.id];

    let stateLabel = '', actionHtml = '';
    if (status === 'done') {
      stateLabel = `<span class="st-badge st-done">${Icon('check', { size: 14 })} مكتملة${stInfo && stInfo.accuracy ? ` · ${stInfo.accuracy}%` : ''}</span>`;
      actionHtml = `<a href="#stage/${esc(u.id)}/${esc(st.id)}" class="btn btn-secondary btn-sm">${Icon('retry', { size: 15 })} <span>مراجعة (+5 XP)</span></a>`;
    } else if (status === 'current') {
      stateLabel = `<span class="st-badge st-current">${Icon('sparkle', { size: 14 })} المحطة الحالية</span>`;
      actionHtml = `<a href="#stage/${esc(u.id)}/${esc(st.id)}" class="btn btn-primary">${Icon('forward', { size: 18 })} <span>ابدأ المحطة</span></a>`;
    } else if (status === 'open' && isBonus) {
      stateLabel = `<span class="st-badge st-bonus"><img src="assets/icons/gem.webp" alt="" width="16" height="16"> اختيارية · +40 XP</span>`;
      actionHtml = `<a href="#stage/${esc(u.id)}/${esc(st.id)}" class="btn btn-accent">${Icon('gem', { size: 17 })} <span>خُض التحدي الإضافي</span></a>`;
    } else {
      stateLabel = `<span class="st-badge st-locked">${Icon('lock', { size: 14 })} تفتح بعد إكمال ما قبلها</span>`;
      actionHtml = `<span class="locked-pill" aria-disabled="true">${Icon('lock', { size: 16 })} مغلقة</span>`;
    }

    return `
      <li class="station-row ${offsetCls} is-${status}${isBonus ? ' is-bonus' : ''}">
        <div class="station-connector" aria-hidden="true"></div>
        <div class="station-card">
          <div class="station-medallion">
            ${isBonus
              ? `<img src="assets/icons/gem.webp" alt="" width="44" height="44">`
              : `<span class="station-num">${idx + 1}</span>`}
          </div>
          <div class="station-info">
            <div class="station-top-meta">
              <span class="station-ref">${isBonus ? 'تحدٍّ إضافي مكافئ' : esc(formatLessonRef(st.lessonRef, idx + 1))}</span>
              ${stateLabel}
            </div>
            <h3 class="station-title">${esc(st.title)}</h3>
            <div class="station-sub">
              <img src="${esc(Cast.img(ch.id))}" alt="" width="26" height="26">
              <span>بصحبة ${esc(ch.name)} · ${st.steps.length} خطوات تفاعلية</span>
            </div>
          </div>
          <div class="station-cta">${actionHtml}</div>
        </div>
      </li>`;
  }

  function renderAssessmentNode(u, assessOpen, assessDone, uState) {
    const comps = u.assessment.components.length;
    const passedCount = u.assessment.components.filter(c => {
      const s = uState.assessment.components[c.id];
      return s && s.passed;
    }).length;
    return `
      <li class="station-row offset-mid is-assessment ${assessDone ? 'is-done' : (assessOpen ? 'is-current' : 'is-locked')}">
        <div class="station-connector" aria-hidden="true"></div>
        <div class="station-card assessment-station-card">
          <div class="station-medallion medallion-cert">
            <img src="assets/icons/certificate.webp" alt="" width="52" height="52">
          </div>
          <div class="station-info">
            <div class="station-top-meta">
              <span class="station-ref">المحطة الختامية والشهادة</span>
              <span class="st-badge ${assessDone ? 'st-done' : (assessOpen ? 'st-current' : 'st-locked')}">
                ${assessDone ? 'مكتمل — الشهادة جاهزة' : `${passedCount} / ${comps} مكونات مجتازة`}
              </span>
            </div>
            <h3 class="station-title">${esc(u.assessment.title || 'اختبار نهاية الوحدة')}</h3>
            <p class="station-rule-preview">${esc(u.assessment.intro || 'اجتز مكونات التقييم المستقلة وبوابات الأمان لاستلام شهادة الوحدة.')}</p>
          </div>
          <div class="station-cta">
            ${assessOpen
              ? `<a href="#assess/${esc(u.id)}" class="btn btn-primary">${Icon('medal', { size: 18 })} <span>${assessDone ? 'مراجعة التقييم والشهادة' : 'ادخل التقييم الختامي'}</span></a>`
              : `<span class="locked-pill">${Icon('lock', { size: 16 })} أكمل محطات الدروس أولاً</span>`}
          </div>
        </div>
      </li>`;
  }

  /* ==========================================================================
   * 6. CONVERSATIONAL STAGE PLAYER (#stage/UXX/STAGE_ID)
   * ========================================================================== */
  function renderStagePlayer(main, unitId, stageId, p) {
    const u = Course.unit(unitId);
    const stage = u && u.stages.find(s => s.id === stageId);
    if (!u || !stage) { go('#hub'); return; }
    const stStatus = Course.stageStatus(u, stage, p);
    if (stStatus === 'locked') { go(`#unit/${u.id}`); return; }

    setPageTitle(`${stage.title} — الوحدة ${u.number}`);
    let stepIdx = 0;
    let stepXpEarned = 0;
    const interactiveCount = stage.steps.filter(Interactions.isInteractive).length;
    let firstTryCorrect = 0;
    const triedSteps = new Set();
    let mounted = null;
    let feedbackState = null;

    function renderShell() {
      const total = stage.steps.length;
      const introKey = `intro-${stage.id}`;
      const soundOn = p.settings.sound !== false;
      main.innerHTML = `
        <div class="shell player-wrap">
          <div class="player-topbar">
            <a href="#unit/${esc(u.id)}" class="icon-btn" aria-label="الخروج إلى مسار الوحدة ${u.number}">
              ${Icon('close', { size: 20 })}
            </a>
            <div class="player-progress-col">
              <div class="player-stage-label">
                <span class="player-stage-name">${esc(stage.title)}</span>
                <span id="step-counter">الخطوة 1 من ${total}</span>
              </div>
              <progress id="stage-progress" class="stage-prog" max="${total}" value="1" aria-label="تقدّم المحطة"></progress>
            </div>
            <div class="player-hud">
              <button type="button" class="icon-btn" data-player-sound aria-pressed="${soundOn ? 'true' : 'false'}" aria-label="${soundOn ? 'كتم المؤثرات الصوتية' : 'تشغيل المؤثرات الصوتية'}">
                ${Icon(soundOn ? 'volume' : 'mute', { size: 18 })}
              </button>
              <div class="stat-chip stat-xp" aria-live="off">
                <img src="assets/icons/star.webp" alt="" width="20" height="20">
                <span id="player-xp-live">+0 XP</span>
              </div>
            </div>
          </div>

          <h1 id="main-heading" tabindex="-1" class="visually-hidden">${esc(stage.title)}</h1>

          <div id="step-mount" class="step-mount"></div>
          <div id="feedback-slot" class="feedback-slot" aria-live="polite"></div>

          <div class="player-action-bar" id="player-actions"></div>
        </div>`;

      const sndBtn = main.querySelector('[data-player-sound]');
      if (sndBtn) {
        sndBtn.addEventListener('click', () => {
          const cur = Store.active();
          if (!cur) return;
          const next = cur.settings.sound === false;
          Store.updateSettings({ sound: next });
          sndBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
          sndBtn.setAttribute('aria-label', next ? 'كتم المؤثرات الصوتية' : 'تشغيل المؤثرات الصوتية');
          sndBtn.innerHTML = Icon(next ? 'volume' : 'mute', { size: 18 });
        });
      }

      unsubAudio = AudioEngine.onChange(() => {
        main.querySelectorAll('[data-listen-box]').forEach(box => {
          const key = box.dataset.listenBox;
          const st = AudioEngine.status();
          const playing = st.playing && st.key === key;
          box.classList.toggle('is-playing', playing);
          const btn = box.querySelector('[data-speak-key]');
          if (btn) btn.innerHTML = playing ? `${Icon('stop', { size: 15 })} <span>إيقاف</span>` : `${Icon('play', { size: 15 })} <span>استمع</span>`;
        });
      });

      if (p.settings.autoAudio && stage.audioIntro) {
        AudioEngine.speak(stage.audioIntro, introKey);
      }
      renderCurrentStep();
    }

    function renderCurrentStep() {
      const step = stage.steps[stepIdx];
      const total = stage.steps.length;
      feedbackState = null;
      const counter = document.getElementById('step-counter');
      const prog = document.getElementById('stage-progress');
      if (counter) counter.textContent = `الخطوة ${stepIdx + 1} من ${total}`;
      if (prog) prog.value = stepIdx + 1;

      const mountEl = document.getElementById('step-mount');
      const fbSlot = document.getElementById('feedback-slot');
      fbSlot.innerHTML = '';

      mounted = Interactions.mountStep(mountEl, step, {
        uid: `${stage.id}-step-${stepIdx}`,
        unitId: u.id,
        defaultSpeaker: stage.mascot,
        introAudio: (stage.audioIntro && stepIdx === 0)
          ? { text: stage.audioIntro, key: `intro-${stage.id}` }
          : null,
        onStateChange: () => renderActions()
      });
      renderActions();
    }

    function renderActions() {
      const bar = document.getElementById('player-actions');
      if (!bar) return;
      const step = stage.steps[stepIdx];
      const isLast = stepIdx === stage.steps.length - 1;

      if (!Interactions.isInteractive(step)) {
        bar.innerHTML = `
          <div class="action-inner">
            ${stepIdx > 0 ? `<button type="button" class="btn btn-ghost" data-prev-step>${Icon('back', { size: 18 })} <span>السابق</span></button>` : '<span></span>'}
            <button type="button" class="btn btn-primary btn-lg" data-next-step>
              <span>${isLast ? 'إنهاء المحطة' : 'متابعة'}</span> ${Icon('forward', { size: 18 })}
            </button>
          </div>`;
        const prev = bar.querySelector('[data-prev-step]');
        if (prev) prev.addEventListener('click', () => { stepIdx--; renderCurrentStep(); });
        bar.querySelector('[data-next-step]').addEventListener('click', () => advanceOrFinish());
        return;
      }

      if (!feedbackState) {
        const ready = mounted.isReady();
        bar.innerHTML = `
          <div class="action-inner">
            ${stepIdx > 0 ? `<button type="button" class="btn btn-ghost" data-prev-step>${Icon('back', { size: 18 })} <span>السابق</span></button>` : '<span></span>'}
            <button type="button" class="btn btn-primary btn-lg" data-check-step ${ready ? '' : 'disabled'}>
              ${Icon('check', { size: 18 })} <span>تحقّق من الإجابة</span>
            </button>
          </div>`;
        const prev = bar.querySelector('[data-prev-step]');
        if (prev) prev.addEventListener('click', () => { stepIdx--; renderCurrentStep(); });
        const chk = bar.querySelector('[data-check-step]');
        if (chk) chk.addEventListener('click', () => runCheck());
        return;
      }

      if (feedbackState.ok) {
        bar.innerHTML = `
          <div class="action-inner">
            <span></span>
            <button type="button" class="btn btn-success btn-lg" data-next-step>
              <span>${isLast ? 'إنهاء المحطة واستلام النقاط' : 'الخطوة التالية'}</span> ${Icon('forward', { size: 18 })}
            </button>
          </div>`;
        bar.querySelector('[data-next-step]').addEventListener('click', () => advanceOrFinish());
      } else {
        bar.innerHTML = `
          <div class="action-inner">
            <span class="retry-prompt-hint">عدّل إجابتك في الأعلى ثم تحقّق مرة أخرى</span>
            <div class="retry-btns">
              <button type="button" class="btn btn-secondary" data-clear-retry>${Icon('retry', { size: 18 })} <span>إعادة المحاولة</span></button>
              <button type="button" class="btn btn-primary" data-check-step>${Icon('check', { size: 18 })} <span>تحقّق مجدداً</span></button>
            </div>
          </div>`;
        bar.querySelector('[data-clear-retry]').addEventListener('click', () => {
          feedbackState = null;
          document.getElementById('feedback-slot').innerHTML = '';
          mounted.resetForRetry();
          renderActions();
        });
        bar.querySelector('[data-check-step]').addEventListener('click', () => runCheck());
      }
    }

    function runCheck() {
      const step = stage.steps[stepIdx];
      if (!mounted.isReady()) return;
      const res = mounted.evaluate();
      const firstAttempt = !triedSteps.has(stepIdx);
      triedSteps.add(stepIdx);

      let gained = 0;
      if (res.ok) {
        if (firstAttempt) {
          firstTryCorrect++;
          gained = step.type === 'write' ? Store.XP.write : Store.XP.stepFirstTry;
        } else {
          gained = Store.XP.stepRetry;
        }
        stepXpEarned += gained;
        const xpEl = document.getElementById('player-xp-live');
        if (xpEl) xpEl.textContent = `+${stepXpEarned} XP`;
        AudioEngine.sfx('correct');
      } else {
        AudioEngine.sfx('wrong');
      }

      feedbackState = { ok: res.ok, res, xpGained: gained };
      renderFeedbackBanner(step, res, gained);
      renderActions();
    }

    function renderFeedbackBanner(step, res, gained) {
      const slot = document.getElementById('feedback-slot');
      const spk = Cast.get(step.speaker || stage.mascot);
      const imgSrc = res.ok ? Cast.img('fanak', 'celebrate') : Cast.img('fanak', 'think');
      const headline = res.ok ? Cast.pick(spk.correct) : Cast.pick(spk.wrong);
      const notesList = res.notes && res.notes.length ? res.notes : (res.explanation ? [res.explanation] : []);

      slot.innerHTML = `
        <div class="feedback-banner ${res.ok ? 'fb-ok celebrate-burst' : 'fb-retry'}">
          <img src="${esc(imgSrc)}" alt="" width="72" height="72" class="fb-mascot">
          <div class="fb-body">
            <div class="fb-title-row">
              <strong>${res.ok ? Icon('check', { size: 20 }) : Icon('info', { size: 20 })} ${esc(headline)}</strong>
              ${gained ? `<span class="xp-burst">+${gained} XP</span>` : ''}
            </div>
            ${res.gateFailed ? `<p class="gate-alert">${Icon('shield', { size: 16 })} انتبه: يوجد شرط أمان أو تحقق أساسي لم يُستوفَ بعد.</p>` : ''}
            ${notesList.map(n => `<p class="fb-note">${esc(n)}</p>`).join('')}
            ${res.ok && res.explanation && !notesList.includes(res.explanation) ? `<p class="fb-note">${esc(res.explanation)}</p>` : ''}
          </div>
        </div>`;
    }

    function advanceOrFinish() {
      AudioEngine.stop();
      if (stepIdx < stage.steps.length - 1) {
        stepIdx++;
        renderCurrentStep();
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        return;
      }
      const acc = interactiveCount ? Math.round((firstTryCorrect / interactiveCount) * 100) : 100;
      const reward = Store.completeStage(u.id, stage, { stepXp: stepXpEarned, accuracy: acc });
      AudioEngine.sfx('stage');
      renderStageComplete(reward, acc);
    }

    function renderStageComplete(reward, acc) {
      const idxInUnit = u.stages.indexOf(stage);
      const nextStageInList = u.stages.slice(idxInUnit + 1).find(s => Course.stageStatus(u, s, Store.active()) !== 'locked');
      const assessOpen = Course.assessmentUnlocked(u, Store.active());

      main.innerHTML = `
        <div class="shell stage-complete-wrap">
          <section class="card celebration-card celebrate-burst">
            <img src="assets/characters/fanak_celebrate.webp" alt="فَنَك يحتفل بإتمام المحطة" width="156" height="156" class="celebrate-fox">
            <span class="eyebrow-pill">${stage.kind === 'bonus' ? 'أتممت التحدي الإضافي!' : 'محطة مكتملة!'}</span>
            <h1 id="main-heading" tabindex="-1">أحسنت في «${esc(stage.title)}»!</h1>
            <p class="muted">تقدّمٌ ثابت في الوحدة ${u.number}: ${esc(u.title)}.</p>

            <div class="reward-grid">
              <div class="reward-box">
                <img src="assets/icons/star.webp" alt="" width="38" height="38">
                <strong>+${reward.xp} XP</strong>
                <span>${reward.replay ? 'نقاط مراجعة المحطة' : `(${reward.stepXp} خطوات + ${reward.bonusXp} إتمام)`}</span>
              </div>
              <div class="reward-box">
                <img src="assets/icons/lantern.webp" alt="" width="38" height="38">
                <strong>${Store.active().streak.count} يوم</strong>
                <span>سلسلة التعلّم اليومية</span>
              </div>
              <div class="reward-box">
                <img src="assets/icons/gem.webp" alt="" width="38" height="38">
                <strong>${acc}%</strong>
                <span>دقة المحاولة الأولى</span>
              </div>
            </div>

            <div class="celebrate-actions">
              ${nextStageInList ? `
                <a href="#stage/${esc(u.id)}/${esc(nextStageInList.id)}" class="btn btn-primary btn-lg">
                  <span>${nextStageInList.kind === 'bonus' ? `جرّب التحدي الإضافي: ${esc(nextStageInList.title)}` : `المحطة التالية: ${esc(nextStageInList.title)}`}</span>
                  ${Icon('forward', { size: 20 })}
                </a>
              ` : ''}
              ${assessOpen ? `
                <a href="#assess/${esc(u.id)}" class="btn ${nextStageInList ? 'btn-secondary' : 'btn-primary'} btn-lg">
                  ${Icon('medal', { size: 20 })} <span>انتقل إلى تقييم نهاية الوحدة</span>
                </a>
              ` : ''}
              <a href="#unit/${esc(u.id)}" class="btn btn-ghost">العودة إلى مسار المحطات</a>
            </div>
          </section>
        </div>`;
      const h1 = main.querySelector('h1[tabindex="-1"]');
      if (h1) h1.focus({ preventScroll: true });
    }

    renderShell();
  }

  /* ==========================================================================
   * 7. END-OF-UNIT ASSESSMENT HUB & COMPONENT RUNNER (#assess/UXX)
   * ========================================================================== */
  function renderAssessmentHub(main, unitId, p) {
    const u = Course.unit(unitId);
    if (!u || !Course.unitUnlocked(u, p)) { go('#hub'); return; }
    if (!Course.assessmentUnlocked(u, p)) { go(`#unit/${u.id}`); return; }

    setPageTitle(`تقييم الوحدة ${u.number}`);
    const uState = Store.unitState(u.id, p);
    const allPassed = Course.assessmentPassed(u, p);
    if (allPassed && !uState.certificate) {
      Store.issueCertificate(u.id);
      AudioEngine.sfx('cert');
      renderHeader(parseRoute());
    }
    const cert = Store.unitState(u.id, p).certificate;

    main.innerHTML = `
      <div class="shell assess-hub-wrap">
        <nav class="breadcrumb" aria-label="مسار الصفحة">
          <a href="#unit/${esc(u.id)}">${Icon('back', { size: 16 })} <span>العودة إلى محطات الوحدة ${u.number}</span></a>
        </nav>

        <section class="card assess-hero">
          <div class="assess-hero-top">
            <img src="assets/icons/certificate.webp" alt="" width="76" height="76">
            <div>
              <span class="type-pill">التقويم الختامي المستقل · الوحدة ${u.number}</span>
              <h1 id="main-heading" tabindex="-1">${esc(u.assessment.title || `تقييم الوحدة ${u.number}`)}</h1>
              <p class="muted">${esc(u.assessment.intro || '')}</p>
            </div>
          </div>

          <div class="rule-callout" role="note">
            ${Icon('shield', { size: 22 })}
            <div>
              <strong>قاعدة الإكمال المعتمدة (لا تعويض بين المهارات أو البوابات):</strong>
              <p>${esc(u.assessment.completionRule)}</p>
            </div>
          </div>

          ${cert ? `
            <div class="cert-earned-banner celebrate-burst">
              <img src="assets/characters/fanak_celebrate.webp" alt="" width="88" height="88">
              <div class="cert-earned-copy">
                <h2>تهانينا يا ${esc(p.name)}! استوفيت جميع المكونات والبوابات وحصلت على شهادة الوحدة ${u.number}</h2>
                <p>رمز الشهادة المحلي: <strong>${esc(cert.serial)}</strong> · حُفظت في ملفك الشخصي.</p>
              </div>
              <div class="cert-earned-btns">
                <button type="button" class="btn btn-primary" data-open-cert>${Icon('medal', { size: 18 })} <span>عرض وتحميل الشهادة</span></button>
                <a href="#hub" class="btn btn-secondary">خريطة الوحدات</a>
              </div>
            </div>
          ` : ''}
        </section>

        <section class="components-list" aria-label="مكونات التقييم المستقلة">
          ${u.assessment.components.map((comp, idx) => {
            const cs = uState.assessment.components[comp.id] || { passed: false, attempts: [] };
            const last = cs.attempts[cs.attempts.length - 1];
            const usesAltNext = !cs.passed && cs.attempts.length >= 1 && Array.isArray(comp.altItems) && comp.altItems.length > 0;

            return `
              <article class="card comp-card ${cs.passed ? 'is-passed' : (cs.attempts.length ? 'is-retry-needed' : '')}">
                <div class="comp-card-main">
                  <div class="comp-index">${idx + 1}</div>
                  <div class="comp-info">
                    <div class="comp-badges">
                      <span class="type-pill">${comp.kind === 'quiz' ? 'اختبار معرفي آلي' : 'مهمة أداء ومعايير'}</span>
                      <span class="threshold-pill">الحد الأدنى المطلوب: ${comp.threshold.min} من ${comp.threshold.of}</span>
                      ${cs.passed
                        ? `<span class="state-tag tag-ok">${Icon('check', { size: 15 })} مجتاز</span>`
                        : (cs.attempts.length ? `<span class="state-tag tag-bad">${Icon('retry', { size: 14 })} يتطلب إعادة القياس</span>` : `<span class="state-tag">لم يبدأ بعد</span>`)}
                    </div>
                    <h2 class="comp-title">${esc(comp.title)}</h2>
                    ${comp.gatesNote ? `<p class="comp-gate-note">${Icon('shield', { size: 15 })} <span>${esc(comp.gatesNote)}</span></p>` : ''}
                    ${last ? `
                      <p class="comp-last-attempt">
                        آخر محاولة (#${cs.attempts.length}${last.usedAlt ? ' — النموذج البديل' : ''}):
                        <strong>${last.earned} / ${last.total}</strong>
                        ${last.gateFailed ? ' · (تعثر شرط أساسي غير قابل للتعويض)' : ''}
                      </p>` : ''}
                    ${usesAltNext ? `<p class="alt-notice">${Icon('sparkle', { size: 15 })} ستُجرى المحاولة القادمة تلقائياً على <strong>النموذج البديل الجديد</strong>.</p>` : ''}
                  </div>
                  <div class="comp-cta">
                    <a href="#assess/${esc(u.id)}/${esc(comp.id)}" class="btn ${cs.passed ? 'btn-secondary' : 'btn-primary'}">
                      <span>${cs.passed ? 'مراجعة المكوّن' : (cs.attempts.length ? (usesAltNext ? 'ابدأ النموذج البديل' : 'أعد المحاولة') : 'ابدأ المكوّن')}</span>
                      ${Icon('forward', { size: 18 })}
                    </a>
                  </div>
                </div>
              </article>`;
          }).join('')}
        </section>
      </div>`;

    const openCertBtn = main.querySelector('[data-open-cert]');
    if (openCertBtn && cert) openCertBtn.addEventListener('click', () => openCertificateDialog(u, cert, p.name));
  }

  function renderAssessmentRunner(main, unitId, compId, p) {
    const u = Course.unit(unitId);
    const comp = u && u.assessment.components.find(c => c.id === compId);
    if (!u || !comp || !Course.assessmentUnlocked(u, p)) { go(u ? `#unit/${u.id}` : '#hub'); return; }

    const uState = Store.unitState(u.id, p);
    const cs = uState.assessment.components[comp.id] || { passed: false, attempts: [] };
    const useAlt = !cs.passed && cs.attempts.length >= 1 && Array.isArray(comp.altItems) && comp.altItems.length > 0;
    const activeItems = useAlt ? comp.altItems : comp.items;
    const attemptNum = cs.attempts.length + 1;

    setPageTitle(`${comp.title} — تقييم الوحدة ${u.number}`);

    const controllers = [];
    main.innerHTML = `
      <div class="shell assess-run-wrap">
        <div class="focus-topbar assess-topbar">
          <a href="#assess/${esc(u.id)}" class="icon-btn" aria-label="العودة إلى لوحة تقييم الوحدة ${u.number}">
            ${Icon('close', { size: 20 })}
          </a>
          <span class="focus-topbar-title">تقييم الوحدة ${u.number}</span>
          <span class="threshold-pill">العتبة: ${comp.threshold.min} / ${comp.threshold.of}</span>
        </div>

        <section class="card assess-run-head">
          <div class="comp-badges">
            <span class="type-pill">${useAlt ? 'النموذج البديل الجديد' : 'النموذج الأساسي'} · المحاولة #${attemptNum}</span>
          </div>
          <h1 id="main-heading" tabindex="-1">${esc(comp.title)}</h1>
          ${comp.gatesNote ? `<p class="comp-gate-note">${Icon('shield', { size: 16 })} <span>${esc(comp.gatesNote)}</span></p>` : ''}
          ${useAlt && comp.retryNote ? `<div class="tip-box">${Icon('info', { size: 18 })}<p>${esc(comp.retryNote)}</p></div>` : ''}
        </section>

        <div id="assess-items-list" class="assess-items-list"></div>

        <div id="assess-summary-slot" aria-live="polite"></div>

        <div class="assess-submit-bar" id="assess-submit-bar">
          <span id="assess-ready-hint" class="muted">أكمل جميع البنود أعلاه لتسليم المكوّن وتقييمه.</span>
          <button type="button" class="btn btn-primary btn-lg" id="submit-comp-btn" disabled>
            ${Icon('check', { size: 20 })} <span>تسليم المكوّن وحساب النتيجة</span>
          </button>
        </div>
      </div>`;

    const listEl = document.getElementById('assess-items-list');
    activeItems.forEach((item, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'assess-item-wrap';
      listEl.appendChild(wrap);
      const ctrl = Interactions.mountStep(wrap, item, {
        uid: `assess-${u.id}-${comp.id}-${useAlt ? 'alt' : 'pri'}-a${attemptNum}-${idx}`,
        unitId: u.id,
        onStateChange: updateSubmitState
      });
      controllers.push({ item, ctrl, wrap });
    });

    function updateSubmitState() {
      const allReady = controllers.every(c => !Interactions.isInteractive(c.item) || c.ctrl.isReady());
      const btn = document.getElementById('submit-comp-btn');
      const hint = document.getElementById('assess-ready-hint');
      if (btn) btn.disabled = !allReady;
      if (hint) hint.textContent = allReady ? 'جميع البنود مكتملة وجاهزة للتقييم.' : 'أكمل جميع البنود أعلاه لتفعيل زر التسليم.';
    }
    updateSubmitState();

    document.getElementById('submit-comp-btn').addEventListener('click', () => {
      let earned = 0, total = 0, gateFailed = false;

      controllers.forEach(({ item, ctrl, wrap }) => {
        if (!Interactions.isInteractive(item)) return;
        const res = ctrl.evaluate();
        earned += res.earned;
        total += res.total;
        if (res.gateFailed) gateFailed = true;

        let fbEl = wrap.querySelector('.item-eval-feedback');
        if (!fbEl) {
          fbEl = document.createElement('div');
          fbEl.className = 'item-eval-feedback';
          wrap.appendChild(fbEl);
        }
        fbEl.innerHTML = `
          <div class="inline-eval ${res.ok ? 'is-ok' : 'is-miss'}">
            <strong>${res.ok ? Icon('check', { size: 16 }) : Icon('cross', { size: 16 })} البند: ${res.earned} / ${res.total}${res.gateFailed ? ' · (شرط أساسي غير مستوفى)' : ''}</strong>
            ${(res.notes || []).map(n => `<p>${esc(n)}</p>`).join('')}
          </div>`;
      });

      const passed = (earned >= comp.threshold.min) && !gateFailed;
      const xpGained = Store.recordComponent(u.id, comp.id, { earned, total, gateFailed, passed, usedAlt: useAlt });
      const unitNowPassed = Course.assessmentPassed(u, Store.active());
      let newCert = null;
      if (unitNowPassed) newCert = Store.issueCertificate(u.id);

      AudioEngine.sfx(passed ? (newCert ? 'cert' : 'stage') : 'wrong');

      const sumSlot = document.getElementById('assess-summary-slot');
      sumSlot.innerHTML = `
        <section class="card assess-result-card ${passed ? 'res-pass celebrate-burst' : 'res-fail'}">
          <img src="${esc(Cast.img('fanak', passed ? 'celebrate' : 'think'))}" alt="" width="108" height="108">
          <div class="assess-result-body">
            <h2>${passed ? 'اجتزت هذا المكوّن بنجاح!' : 'لم يجتز المكوّن عتبة النجاح أو البوابات بعد'}</h2>
            <p class="score-line">
              النتيجة المسجلة: <strong>${earned} من ${total}</strong> (المطلوب: ${comp.threshold.min} من ${comp.threshold.of} على الأقل)
              ${xpGained ? ` · <span class="xp-burst">+${xpGained} XP</span>` : ''}
            </p>
            ${gateFailed ? `<p class="gate-alert">${Icon('shield', { size: 18 })} تعثّر شرط أساسي غير قابل للتعويض؛ يلزم استيفاء شروط السلامة والتحقق الأساسية.</p>` : ''}
            ${!passed && comp.retryNote ? `<p class="retry-rule-box">${esc(comp.retryNote)}</p>` : ''}
            <div class="assess-result-actions">
              ${newCert ? `
                <button type="button" class="btn btn-primary btn-lg" data-claim-cert>${Icon('medal', { size: 20 })} <span>اكتملت الوحدة! استلم شهادتك</span></button>
              ` : ''}
              <a href="#assess/${esc(u.id)}" class="btn ${passed && !newCert ? 'btn-primary' : 'btn-secondary'} btn-lg">
                <span>العودة إلى لوحة التقييم</span> ${Icon('forward', { size: 18 })}
              </a>
              ${!passed ? `
                <button type="button" class="btn btn-primary btn-lg" data-retry-comp>
                  ${Icon('retry', { size: 18 })} <span>${comp.altItems && !useAlt ? 'إعادة القياس على النموذج البديل' : 'إعادة محاولة المكوّن'}</span>
                </button>
              ` : ''}
            </div>
          </div>
        </section>`;

      document.getElementById('assess-submit-bar').hidden = true;
      sumSlot.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const retryBtn = sumSlot.querySelector('[data-retry-comp]');
      if (retryBtn) retryBtn.addEventListener('click', () => renderAssessmentRunner(main, unitId, compId, Store.active()));
      const certBtn = sumSlot.querySelector('[data-claim-cert]');
      if (certBtn && newCert) certBtn.addEventListener('click', () => openCertificateDialog(u, newCert, Store.active().name));
    });
  }

  /* ==========================================================================
   * 8. CAST PAGE (#cast) & PROFILE / CERTIFICATES PAGE (#profile)
   * ========================================================================== */
  function renderCastPage(main) {
    setPageTitle('رفاق الرحلة');
    main.innerHTML = `
      <div class="shell cast-page-wrap">
        <section class="section-head">
          <h1 id="main-heading" tabindex="-1">رفاق الرحلة الستة وأدوارهم التعليمية</h1>
          <p class="muted">صُمّمت شخصيات «رِحلَة» لتجسيد المهارات المحورية في المنهج: الشرح الواضح، تمثيل مسودات النموذج، فحص الأدلة، حماية الخصوصية، وتنظيم سير العمل والوكلاء.</p>
        </section>
        <div class="cast-cards-grid">
          ${Cast.order.map(cid => {
            const c = Cast.get(cid);
            return `
              <article class="card cast-full-card">
                <div class="cast-art-stage">
                  <img src="${esc(Cast.img(cid))}" alt="${esc(c.name)} — ${esc(c.kind)}" width="168" height="168">
                </div>
                <span class="type-pill">${esc(c.kind)}</span>
                <h2>${esc(c.name)}</h2>
                <p class="cast-role-line">${esc(c.role)}</p>
                <p class="muted">${esc(c.bio)}</p>
              </article>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderProfile(main, p) {
    setPageTitle('ملفي الشخصي والشهادات');
    const units = Course.units();
    const certs = units.filter(u => Course.isCertified(u.id, p)).map(u => ({ unit: u, cert: p.units[u.id].certificate }));
    const allProfiles = Store.listProfiles();

    main.innerHTML = `
      <div class="shell profile-page-wrap">
        <section class="card profile-hero-card">
          <div class="prof-hero-right">
            <img src="${esc(Cast.img(p.companion))}" alt="" width="100" height="100" class="prof-avatar-lg">
            <div>
              <span class="type-pill">ملف متعلّم محلي</span>
              <h1 id="main-heading" tabindex="-1">${esc(p.name)}</h1>
              <p class="muted">رفيقك الحالي: ${esc(Cast.get(p.companion).name)} · أُنشئ في ${esc(Cert.formatArDate(p.createdAt))}</p>
            </div>
          </div>
          <div class="prof-stats-row">
            <div class="prof-stat"><img src="assets/icons/star.webp" alt="" width="30" height="30"><strong>${p.xp}</strong><span>نقاط الخبرة (XP)</span></div>
            <div class="prof-stat"><img src="assets/icons/lantern.webp" alt="" width="30" height="30"><strong>${p.streak.count}</strong><span>أيام التعلّم المتتالية</span></div>
            <div class="prof-stat"><img src="assets/icons/certificate.webp" alt="" width="30" height="30"><strong>${certs.length} / 10</strong><span>شهادات الوحدات</span></div>
          </div>
        </section>

        <section class="profile-section">
          <div class="section-head-inline">
            <h2>شهادات الإتمام المحصّلة (${certs.length})</h2>
          </div>
          ${certs.length ? `
            <div class="certs-grid">
              ${certs.map(({ unit, cert }) => `
                <article class="card cert-item-card">
                  <img src="assets/icons/certificate.webp" alt="" width="64" height="64">
                  <div class="cert-item-body">
                    <span class="type-pill">الوحدة ${unit.number} · ${esc(cert.serial)}</span>
                    <h3>${esc(unit.title)}</h3>
                    <p class="muted">أُصدرت بتاريخ ${esc(Cert.formatArDate(cert.issuedAt))}</p>
                  </div>
                  <div class="cert-item-actions">
                    <button type="button" class="btn btn-primary btn-sm" data-show-cert="${esc(unit.id)}">${Icon('eye', { size: 16 })} <span>عرض وطباعة</span></button>
                    <button type="button" class="btn btn-secondary btn-sm" data-dl-cert="${esc(unit.id)}">${Icon('download', { size: 16 })} <span>PNG</span></button>
                  </div>
                </article>`).join('')}
            </div>
          ` : `
            <div class="card empty-certs">
              <img src="assets/icons/certificate.webp" alt="" width="68" height="68">
              <div>
                <h3>لم تستلم شهادة بعد</h3>
                <p class="muted">أكمل جميع محطات أي وحدة ثم اجتز مكونات تقييمها الختامي المستقلة لتظهر شهادتك هنا جاهزة للطباعة والتحميل.</p>
                <a href="#hub" class="btn btn-primary btn-sm">انتقل إلى خريطة الوحدات</a>
              </div>
            </div>
          `}
        </section>

        <div class="profile-two-col">
          <section class="card settings-card">
            <h2>تخصيص الملف والإعدادات</h2>
            <form id="rename-form" class="inline-rename-form">
              <label for="prof-rename-input">تعديل الاسم الظاهر في الشهادات</label>
              <div class="rename-row">
                <input type="text" id="prof-rename-input" maxlength="40" value="${esc(p.name)}" required>
                <button type="submit" class="btn btn-secondary">حفظ الاسم</button>
              </div>
            </form>

            <fieldset class="companion-fieldset compact-companions">
              <legend>رفيق الرحلة</legend>
              <div class="companion-grid">
                ${Cast.order.map(cid => {
                  const ch = Cast.get(cid);
                  return `
                    <label class="companion-option" for="pcomp-${esc(cid)}">
                      <input type="radio" name="pcomp" id="pcomp-${esc(cid)}" value="${esc(cid)}" ${p.companion === cid ? 'checked' : ''}>
                      <img src="${esc(Cast.img(cid))}" alt="" width="40" height="40">
                      <span class="comp-name">${esc(ch.name)}</span>
                    </label>`;
                }).join('')}
              </div>
            </fieldset>

            <div class="toggles-list">
              <label class="toggle-row" for="chk-sound">
                <span>المؤثرات الصوتية التشجيعية</span>
                <input type="checkbox" id="chk-sound" ${p.settings.sound !== false ? 'checked' : ''}>
              </label>
              <label class="toggle-row" for="chk-autoaudio">
                <span>تشغيل المقدمة الصوتية تلقائياً عند فتح المحطة</span>
                <input type="checkbox" id="chk-autoaudio" ${p.settings.autoAudio ? 'checked' : ''}>
              </label>
              <label class="toggle-row" for="chk-motion">
                <span>تقليل الحركة والاحتفالات البصرية</span>
                <input type="checkbox" id="chk-motion" ${p.settings.reduceMotion ? 'checked' : ''}>
              </label>
              <div class="toggle-row">
                <label for="sel-textsize">حجم الخط</label>
                <select id="sel-textsize">
                  <option value="m" ${p.settings.textSize === 'm' ? 'selected' : ''}>عادي (افتراضي)</option>
                  <option value="l" ${p.settings.textSize === 'l' ? 'selected' : ''}>كبير</option>
                  <option value="xl" ${p.settings.textSize === 'xl' ? 'selected' : ''}>كبير جداً</option>
                </select>
              </div>
            </div>
          </section>

          <section class="card backup-card">
            <h2>الحفظ المحلي والنسخ الاحتياطي</h2>
            <p class="muted small-prose">تُحفظ بياناتك في متصفح هذا الجهاز فقط بلا حساب سحابي. احتفظ بنسخة احتياطية إذا أردت نقل تقدّمك إلى جهاز آخر.</p>
            <div class="backup-btn-stack">
              <button type="button" class="btn btn-primary" data-prof-export>${Icon('download', { size: 18 })} <span>تنزيل نسخة احتياطية (JSON)</span></button>
              <button type="button" class="btn btn-secondary" data-prof-backup-modal>${Icon('upload', { size: 18 })} <span>استعادة نسخة أو نسخ الرمز النصي</span></button>
            </div>

            <hr class="sep">
            <h3>الملفات المحلية على هذا المتصفح (${allProfiles.length})</h3>
            <div class="existing-profiles">
              ${allProfiles.map(pr => `
                <div class="prof-manage-row ${pr.id === p.id ? 'is-active' : ''}">
                  <button type="button" class="prof-switch-btn" data-switch-prof="${esc(pr.id)}">
                    <img src="${esc(Cast.img(pr.companion))}" alt="" width="34" height="34">
                    <span><strong>${esc(pr.name)}</strong> (${pr.xp} XP)</span>
                    ${pr.id === p.id ? `<span class="state-tag tag-ok">الحالي</span>` : `<span class="muted">تبديل</span>`}
                  </button>
                  <button type="button" class="icon-btn danger-icon" data-del-prof="${esc(pr.id)}" aria-label="حذف الملف المحلي: ${esc(pr.name)}">
                    ${Icon('trash', { size: 18 })}
                  </button>
                </div>`).join('')}
            </div>
            <a href="#start" class="btn btn-ghost btn-sm" data-new-prof>+ إنشاء ملف متعلّم جديد</a>
          </section>
        </div>
      </div>`;

    main.querySelector('#rename-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const val = document.getElementById('prof-rename-input').value.trim();
      if (val) { Store.rename(val); Interactions.announce('حُفظ الاسم الجديد.'); renderRoute(); }
    });
    main.querySelectorAll('input[name="pcomp"]').forEach(r => {
      r.addEventListener('change', () => { Store.setCompanion(r.value); renderRoute(); });
    });
    main.querySelector('#chk-sound').addEventListener('change', (e) => { Store.updateSettings({ sound: e.target.checked }); renderHeader(parseRoute()); });
    main.querySelector('#chk-autoaudio').addEventListener('change', (e) => Store.updateSettings({ autoAudio: e.target.checked }));
    main.querySelector('#chk-motion').addEventListener('change', (e) => { Store.updateSettings({ reduceMotion: e.target.checked }); applyProfilePrefs(); });
    main.querySelector('#sel-textsize').addEventListener('change', (e) => { Store.updateSettings({ textSize: e.target.value }); applyProfilePrefs(); });

    main.querySelector('[data-prof-export]').addEventListener('click', () => triggerBackupDownload('all'));
    main.querySelector('[data-prof-backup-modal]').addEventListener('click', () => openBackupDialog());

    main.querySelectorAll('[data-show-cert]').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = Course.unit(btn.dataset.showCert);
        openCertificateDialog(u, p.units[u.id].certificate, p.name);
      });
    });
    main.querySelectorAll('[data-dl-cert]').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = Course.unit(btn.dataset.dlCert);
        Cert.downloadCertificatePNG(u, p.units[u.id].certificate, p.name);
      });
    });
    main.querySelectorAll('[data-switch-prof]').forEach(btn => {
      btn.addEventListener('click', () => { Store.switchProfile(btn.dataset.switchProf); renderRoute(); });
    });
    main.querySelectorAll('[data-del-prof]').forEach(btn => {
      btn.addEventListener('click', () => confirmDeleteProfile(btn.dataset.delProf));
    });
  }

  /* ==========================================================================
   * 9. NATIVE <dialog> MODALS (Light-dismiss + Safari fallback + scroll contain)
   * ========================================================================== */
  function setupDialogLightDismissFallback(dlg) {
    if (dlg.dataset.boundFallback) return;
    dlg.dataset.boundFallback = '1';
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const outside = (e) => {
        if (e.target !== dlg) return false;
        const r = dlg.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      dlg.addEventListener('pointerdown', (e) => {
        if (dlg.getAttribute('closedby') !== 'any') { pressedOutside = false; return; }
        pressedOutside = outside(e);
      });
      dlg.addEventListener('pointerup', (e) => {
        if (pressedOutside && dlg.getAttribute('closedby') === 'any' && outside(e)) dlg.close();
        pressedOutside = false;
      });
    }
  }

  function triggerBackupDownload(scope) {
    const json = Store.exportBackup(scope || 'all');
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rihla-backup-${Store.today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openBackupDialog() {
    const dlg = document.getElementById('modal-backup');
    setupDialogLightDismissFallback(dlg);
    const hasProf = Store.listProfiles().length > 0;
    const exported = hasProf ? Store.exportBackup('all') : '';

    dlg.innerHTML = `
      <div class="dialog-sheet">
        <div class="dialog-head">
          <h2 id="modal-backup-title">النسخ الاحتياطي والاستعادة</h2>
          <form method="dialog"><button type="submit" class="icon-btn" aria-label="إغلاق النافذة">${Icon('close', { size: 20 })}</button></form>
        </div>
        <div class="dialog-body">
          ${hasProf ? `
            <div class="bkp-block">
              <h3>1. حفظ نسخة احتياطية من تقدّمك الحالي</h3>
              <p class="muted">نزّل ملف النسخة الاحتياطية على جهازك أو انسخ النص لحفظه في مكان آمن.</p>
              <div class="bkp-actions-row">
                <button type="button" class="btn btn-primary" data-dl-bkp>${Icon('download', { size: 18 })} <span>تنزيل ملف النسخة (.json)</span></button>
                <button type="button" class="btn btn-secondary" data-copy-bkp>${Icon('copy', { size: 18 })} <span>نسخ نص النسخة</span></button>
              </div>
            </div>
            <hr class="sep">
          ` : ''}
          <div class="bkp-block">
            <h3>${hasProf ? '2. استعادة نسخة احتياطية' : 'استعادة تقدّم سابق من ملف نسخة احتياطية'}</h3>
            <div class="form-row">
              <label for="bkp-file-input">اختر ملف النسخة الاحتياطية (.json)</label>
              <input type="file" id="bkp-file-input" accept=".json,application/json">
            </div>
            <div class="form-row">
              <label for="bkp-paste-area">أو الصق محتوى النسخة الاحتياطية هنا</label>
              <textarea id="bkp-paste-area" class="write-area" rows="4" placeholder="الصق محتوى النسخة الاحتياطية هنا..."></textarea>
            </div>
            <fieldset class="mode-fieldset">
              <legend>عند تطابق المعرّف مع ملف موجود</legend>
              <label for="mode-replace"><input type="radio" name="imp-mode" id="mode-replace" value="replace" checked> استبدال وتحديث الملف الموجود</label>
              <label for="mode-copy"><input type="radio" name="imp-mode" id="mode-copy" value="copy"> استيراد كملف منفصل (نسخة)</label>
            </fieldset>
            <p id="bkp-feedback" class="bkp-msg" role="status" aria-live="polite"></p>
            <div class="dialog-foot">
              <button type="button" class="btn btn-primary" data-run-restore>${Icon('upload', { size: 18 })} <span>استعادة البيانات الآن</span></button>
              <form method="dialog"><button type="submit" class="btn btn-ghost">إغلاق</button></form>
            </div>
          </div>
        </div>
      </div>`;

    const dl = dlg.querySelector('[data-dl-bkp]');
    if (dl) dl.addEventListener('click', () => triggerBackupDownload('all'));
    const cp = dlg.querySelector('[data-copy-bkp]');
    if (cp) {
      cp.addEventListener('click', async () => {
        const fb = dlg.querySelector('#bkp-feedback');
        try {
          await navigator.clipboard.writeText(exported);
          fb.textContent = 'نُسخ نص النسخة الاحتياطية إلى الحافظة بنجاح.';
        } catch (_) {
          dlg.querySelector('#bkp-paste-area').value = exported;
          fb.textContent = 'وُضع نص النسخة في المربع أدناه لتتمكن من نسخه يدوياً.';
        }
      });
    }

    const fileInput = dlg.querySelector('#bkp-file-input');
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const txt = await f.text();
      dlg.querySelector('#bkp-paste-area').value = txt;
    });

    dlg.querySelector('[data-run-restore]').addEventListener('click', () => {
      const fb = dlg.querySelector('#bkp-feedback');
      const txt = dlg.querySelector('#bkp-paste-area').value.trim();
      const mode = dlg.querySelector('input[name="imp-mode"]:checked').value;
      if (!txt) { fb.textContent = 'اختر ملف النسخة الاحتياطية أو الصق محتواها أولاً.'; return; }
      try {
        const list = Store.parseBackup(txt);
        Store.importProfiles(list, mode);
        AudioEngine.sfx('correct');
        dlg.close();
        go('#hub');
        renderRoute();
      } catch (err) {
        fb.textContent = err.message || 'تعذّرت قراءة ملف النسخة الاحتياطية.';
      }
    });

    dlg.showModal();
  }

  function openCertificateDialog(unit, cert, learnerName) {
    const dlg = document.getElementById('modal-cert');
    setupDialogLightDismissFallback(dlg);
    dlg.innerHTML = `
      <div class="dialog-sheet dialog-sheet-wide">
        <div class="dialog-head no-print">
          <h2 id="modal-cert-title">شهادة إتمام الوحدة ${unit.number}</h2>
          <form method="dialog"><button type="submit" class="icon-btn" aria-label="إغلاق النافذة">${Icon('close', { size: 20 })}</button></form>
        </div>
        <div class="dialog-body">
          <div class="certificate-sheet" id="printable-certificate">
            <div class="cert-border-outer">
              <div class="cert-border-inner">
                <div class="cert-top-row">
                  <span class="cert-brand-pill">رِحلَة — تعلّم الذكاء الاصطناعي بالعربية</span>
                </div>
                <h3 class="cert-main-heading">شهادة إتمام وحدة تدريبية</h3>
                <p class="cert-sub">تشهد منصة «رِحلَة» المحلية بأن المتعلّم(ة):</p>
                <div class="cert-learner-name">${esc(learnerName || cert.name)}</div>
                <p class="cert-sub">قد أتمّ محطات التعلّم واجتاز جميع مكونات وبوابات التقييم المستقلة في:</p>
                <div class="cert-unit-name">الوحدة ${unit.number}: ${esc(unit.title)}</div>
                <p class="cert-meta-line">${unit.track === 'advanced' ? 'المسار المتقدم' : 'المسار الأساسي'} · الزمن التقديري للمادة: ${unit.minutes} دقيقة</p>
                <div class="cert-emblems">
                  <img src="assets/icons/certificate.webp" alt="" width="86" height="86">
                  <img src="assets/characters/fanak_celebrate.webp" alt="" width="86" height="86">
                </div>
                <p class="cert-disclaimer">
                  تثبت هذه الشهادة إتمام التمارين وبوابات المراجعة التعليمية المحلّية على الحالات الافتراضية المعطاة، ولا تمثّل اعتماداً مهنياً رسمياً أو ضماناً لصحة مخرجات أي أداة حية.
                </p>
                <div class="cert-foot-meta">
                  <span>تاريخ الإصدار: <strong>${esc(Cert.formatArDate(cert.issuedAt))}</strong></span>
                  <span>رمز التوثيق المحلي: <strong>${esc(cert.serial)}</strong></span>
                </div>
              </div>
            </div>
          </div>
          <div class="dialog-foot no-print">
            <button type="button" class="btn btn-primary" data-dl-png>${Icon('download', { size: 18 })} <span>تنزيل كصورة عالية الدقة (PNG)</span></button>
            <button type="button" class="btn btn-secondary" data-print-cert>${Icon('print', { size: 18 })} <span>طباعة / حفظ PDF</span></button>
            <form method="dialog"><button type="submit" class="btn btn-ghost">إغلاق</button></form>
          </div>
        </div>
      </div>`;

    dlg.querySelector('[data-dl-png]').addEventListener('click', () => Cert.downloadCertificatePNG(unit, cert, learnerName));
    dlg.querySelector('[data-print-cert]').addEventListener('click', () => window.print());
    dlg.showModal();
  }

  function openLockedPrereqDialog(unit, missingLabels) {
    const dlg = document.getElementById('modal-confirm');
    setupDialogLightDismissFallback(dlg);
    dlg.returnValue = '';
    dlg.setAttribute('closedby', 'any');
    dlg.innerHTML = `
      <div class="dialog-sheet">
        <div class="dialog-head">
          <h2 id="modal-confirm-title">الوحدة ${unit.number} ضمن المسار المتقدم</h2>
          <form method="dialog"><button type="submit" class="icon-btn" aria-label="إغلاق">${Icon('close', { size: 20 })}</button></form>
        </div>
        <div class="dialog-body">
          <div class="locked-modal-row">
            <img src="assets/icons/lock.webp" alt="" width="64" height="64">
            <p>تُفتح <strong>الوحدة ${unit.number} (${esc(unit.title)})</strong> بعد إتمام الوحدات الأساسية الثماني واستلام شهاداتها. الوحدات المتبقية: <strong>${esc(missingLabels.join('، '))}</strong>.</p>
          </div>
          <div class="dialog-foot">
            <form method="dialog"><button type="submit" class="btn btn-primary" autofocus>حسناً، سأكمل الأساسيات</button></form>
          </div>
        </div>
      </div>`;
    dlg.showModal();
  }

  function confirmDeleteProfile(profId) {
    const target = Store.listProfiles().find(x => x.id === profId);
    if (!target) return;
    const dlg = document.getElementById('modal-confirm');
    setupDialogLightDismissFallback(dlg);
    dlg.returnValue = '';
    dlg.setAttribute('closedby', 'closerequest');
    dlg.innerHTML = `
      <div class="dialog-sheet">
        <div class="dialog-head">
          <h2 id="modal-confirm-title">حذف الملف المحلي «${esc(target.name)}»؟</h2>
          <form method="dialog"><button type="submit" value="cancel" class="icon-btn" aria-label="إلغاء">${Icon('close', { size: 20 })}</button></form>
        </div>
        <div class="dialog-body">
          <p>سيُحذف تقدّم هذا الملف ونقاطه وشهاداته من هذا المتصفح نهائياً ما لم تكن قد نزّلت نسخة احتياطية منه.</p>
          <div class="dialog-foot">
            <form method="dialog" class="confirm-form-btns">
              <button type="submit" value="cancel" class="btn btn-secondary" autofocus>إلغاء والاحتفاظ بالملف</button>
              <button type="submit" value="delete" class="btn btn-danger" data-confirm-delete-btn>نعم، احذف الملف</button>
            </form>
          </div>
        </div>
      </div>`;
    dlg.addEventListener('close', function onClose() {
      dlg.removeEventListener('close', onClose);
      const action = dlg.returnValue;
      dlg.returnValue = '';
      if (action === 'delete') {
        Store.deleteProfile(profId);
        Interactions.announce('حُذف الملف المحلي.');
        if (!Store.active()) go('#welcome');
        else renderRoute();
      }
    });
    dlg.showModal();
  }

  /* ---------- Init ---------- */
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('DOMContentLoaded', () => {
    renderRoute();
  });
})();
