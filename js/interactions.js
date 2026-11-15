/* Interactive step renderers & deterministic evaluator for all 10 step types:
 * learn, example, mcq (single & multi + listen + voice), sort (drag & tap),
 * match, order (pointer drag + keyboard grab-move-drop + up/down buttons),
 * fill (word bank + voice), spot (source vs draft inspection), build, write (word count + model answer + gated rubric).
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stepPoints(s) {
    switch (s.type) {
      case 'mcq': return s.points != null ? s.points : 1;
      case 'order': return s.points != null ? s.points : 1;
      case 'sort': return s.items.length;
      case 'match': return s.pairs.length;
      case 'fill': return s.blanks.length;
      case 'spot': return s.segments.filter(g => g.tag).length;
      case 'build': return s.fields.length;
      case 'write': return s.rubric.length;
      default: return 0;
    }
  }

  function isInteractive(s) {
    return s.type !== 'learn' && s.type !== 'example';
  }

  function countWords(str) {
    const t = String(str || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function seededShuffle(arr, seedStr) {
    const out = arr.slice();
    let h = 2166136261 >>> 0;
    const s = String(seedStr || 'rihla');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    for (let i = out.length - 1; i > 0; i--) {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      const j = (h >>> 0) % (i + 1);
      const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    // Avoid returning exact original order on 'order' steps when length >= 2
    if (out.length >= 2 && out.every((v, idx) => v === arr[idx])) {
      const t = out[0]; out[0] = out[1]; out[1] = t;
    }
    return out;
  }

  function announce(msg) {
    const el = document.getElementById('live-polite');
    if (!el) return;
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 60);
  }

  function sceneDialogue(step, opts, typeLabel, promptHtml) {
    const ch = Cast.get(step.speaker || (opts && opts.defaultSpeaker) || 'hughes');
    const gatePill = step.gate ? `<span class="gate-pill">${Icon('shield', { size: 15 })} شرط أساسي لا يعوّض</span>` : '';
    const intro = opts && opts.introAudio;
    const introBoxAttr = intro ? ` data-listen-box="${esc(intro.key)}"` : '';
    const introBtn = intro ? `
      <button type="button" class="btn btn-secondary btn-sm scene-audio-btn" data-speak-text="${esc(intro.text)}" data-speak-key="${esc(intro.key)}">
        ${Icon('play', { size: 15 })} <span>استمع</span>
      </button>` : '';
    return `
      <div class="scene-dialogue"${introBoxAttr}>
        <div class="scene-avatar-col">
          <img class="scene-avatar" src="${esc(Cast.img(ch.id))}" alt="${esc(ch.name)} — ${esc(ch.role)}" width="84" height="84" loading="eager">
        </div>
        <div class="scene-bubble">
          <div class="scene-bubble-meta">
            <div class="speaker-meta">
              <span class="speaker-name">${esc(ch.name)}</span>
              <span class="speaker-role">${esc(ch.role)}</span>
            </div>
            <div class="head-pills">
              ${typeLabel ? `<span class="type-pill">${esc(typeLabel)}</span>` : ''}
              ${gatePill}
              ${introBtn}
            </div>
          </div>
          ${promptHtml || ''}
        </div>
      </div>`;
  }

  function listenBlock(text, uid) {
    const clipKey = 'listen-' + uid;
    return `
      <div class="listen-card" data-listen-box="${esc(clipKey)}">
        <div class="listen-top">
          <img class="listen-icon" src="assets/icons/headphones.webp" alt="" width="48" height="48">
          <div class="listen-copy">
            <strong>موقف صوتي للاستماع</strong>
            <span>استمع إلى المقطع القصير ثم اختر الإجابة المناسبة</span>
          </div>
          <button type="button" class="btn btn-secondary btn-listen-play" data-speak-text="${esc(text)}" data-speak-key="${esc(clipKey)}">
            ${Icon('play', { size: 18 })} <span>استمع</span>
          </button>
        </div>
        <div class="wave-bars" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <details class="transcript-details">
          <summary>${Icon('eye', { size: 16 })} عرض النص المكتوب للمقطع الصوتي</summary>
          <p class="transcript-body">${esc(text)}</p>
        </details>
      </div>`;
  }

  function voiceAnswerBar(uid) {
    const sup = AudioEngine.speechSupport();
    return `
      <div class="voice-bar" data-voice-wrap="${esc(uid)}">
        <button type="button" class="btn btn-ghost btn-mic" data-voice-btn="${esc(uid)}" ${sup.supported ? '' : 'aria-describedby="voice-note-' + esc(uid) + '"'}>
          ${Icon('mic', { size: 18 })} <span>أجب بصوتك</span>
        </button>
        <span class="voice-status" id="voice-note-${esc(uid)}">${esc(sup.note)}</span>
      </div>`;
  }

  /* ---------- Render a single step into container ---------- */
  function mountStep(container, step, opts) {
    opts = opts || {};
    const uid = opts.uid || ('st-' + Math.random().toString(36).slice(2, 8));
    const state = opts.initialState || createInitialState(step, uid, opts.unitId);
    const onStateChange = opts.onStateChange || (() => {});

    function createInitialState(s, key, unitId) {
      switch (s.type) {
        case 'mcq': return { selected: s.multi ? [] : null, checked: false };
        case 'sort': return { placements: {}, activeItem: null, order: seededShuffle(s.items.map((_, i) => i), key) };
        case 'match': return { pairs: {}, activeLeft: null, rightOrder: seededShuffle(s.pairs.map((_, i) => i), key + '-r') };
        case 'order': return { current: seededShuffle(s.items.map((_, i) => i), key + '-o') };
        case 'fill': return { values: s.blanks.map(() => null), activeBlank: 0 };
        case 'spot': return { tags: {}, openSeg: null };
        case 'build': return { choices: s.fields.map(() => null) };
        case 'write': {
          const saved = (unitId && Store.getWrite(unitId, key)) || '';
          return { text: saved, revealed: false, checks: s.rubric.map(() => false) };
        }
        default: return {};
      }
    }

    function render() {
      if (step.type === 'learn') {
        const titleHtml = step.title ? `<h3 class="step-title">${esc(step.title)}</h3>` : '';
        container.innerHTML = `
          <article class="step-scene step-learn">
            ${sceneDialogue(step, opts, 'فكرة أساسية', titleHtml)}
            <div class="scene-workspace">
              <div class="learn-sheet">
                <div class="prose">
                  ${(step.body || []).map(p => `<p>${esc(p)}</p>`).join('')}
                </div>
                ${Array.isArray(step.points) && step.points.length ? `
                  <ul class="key-points" role="list">
                    ${step.points.map(pt => `<li>${Icon('sparkle', { size: 18, cls: 'pt-ic' })}<span>${esc(pt)}</span></li>`).join('')}
                  </ul>` : ''}
                ${step.tip ? `<div class="tip-box">${Icon('info', { size: 20 })}<p>${esc(step.tip)}</p></div>` : ''}
              </div>
            </div>
          </article>`;
        bindSpeakButtons(container);
        return;
      }

      if (step.type === 'example') {
        const titleHtml = step.title ? `<h3 class="step-title">${esc(step.title)}</h3>` : '';
        container.innerHTML = `
          <article class="step-scene step-example">
            ${sceneDialogue(step, opts, 'مثال محلول', titleHtml)}
            <div class="scene-workspace">
              <div class="scenario-box">
                <div class="scenario-label">الحالة</div>
                <p>${esc(step.scenario)}</p>
              </div>
              <div class="takeaway-box">
                <div class="takeaway-label">${Icon('check', { size: 18 })} ما الذي نلاحظه؟</div>
                <p>${esc(step.explanation)}</p>
              </div>
            </div>
          </article>`;
        bindSpeakButtons(container);
        return;
      }

      if (step.type === 'mcq') {
        const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
        const promptHtml = `<h3 class="step-prompt" id="prompt-${esc(uid)}">${esc(step.prompt)}</h3>`;
        container.innerHTML = `
          <article class="step-scene step-mcq">
            ${sceneDialogue(step, opts, step.multi ? 'اختر كل ما ينطبق' : 'اختيار من متعدد', promptHtml)}
            <div class="scene-workspace">
              ${step.context ? (step.listen ? listenBlock(step.context, uid) : `<div class="context-box"><p>${esc(step.context)}</p></div>`) : ''}
              <div class="mcq-options" role="${step.multi ? 'group' : 'radiogroup'}" aria-labelledby="prompt-${esc(uid)}">
                ${step.options.map((o, i) => {
                  const sel = step.multi ? state.selected.includes(i) : state.selected === i;
                  let resCls = '', mark = '';
                  if (state.evalResult) {
                    if (sel && o.correct) { resCls = ' is-correct'; mark = `<span class="state-tag tag-ok">${Icon('check', { size: 16 })} صحيح</span>`; }
                    else if (sel && !o.correct) { resCls = ' is-wrong'; mark = `<span class="state-tag tag-bad">${Icon('cross', { size: 16 })} غير صحيح</span>`; }
                  }
                  return `
                    <button type="button" class="opt-btn${sel ? ' is-selected' : ''}${resCls}"
                      role="${step.multi ? 'checkbox' : 'radio'}" aria-checked="${sel ? 'true' : 'false'}"
                      data-opt="${i}">
                      <span class="opt-key">${esc(letters[i] || String(i + 1))}</span>
                      <span class="opt-text">${esc(o.text)}</span>
                      ${mark}
                    </button>`;
                }).join('')}
              </div>
              ${!step.multi ? voiceAnswerBar(uid) : ''}
            </div>
          </article>`;
        bindSpeakButtons(container);
        container.querySelectorAll('[data-opt]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.opt);
            AudioEngine.sfx('tap');
            state.evalResult = null;
            if (step.multi) {
              const pos = state.selected.indexOf(idx);
              if (pos >= 0) state.selected.splice(pos, 1); else state.selected.push(idx);
            } else {
              state.selected = idx;
            }
            render();
            onStateChange(state);
          });
        });
        bindVoiceMCQ(container, uid, step.options, (matchedIdx, heard) => {
          state.evalResult = null;
          state.selected = matchedIdx;
          render();
          const st = container.querySelector(`#voice-note-${CSS.escape(uid)}`);
          if (st) st.textContent = `سُمِع: «${heard}» — حُدّد الخيار (${letters[matchedIdx] || (matchedIdx + 1)}). اضغط «تحقّق» للتأكيد.`;
          onStateChange(state);
        });
        return;
      }

      if (step.type === 'sort') {
        const unplaced = state.order.filter(i => state.placements[i] == null);
        const promptHtml = `<h3 class="step-prompt">${esc(step.prompt)}</h3>`;
        container.innerHTML = `
          <article class="step-scene step-sort">
            ${sceneDialogue(step, opts, 'فرز وتصنيف', promptHtml)}
            <div class="scene-workspace">
              <p class="helper-hint">اسحب كل بطاقة إلى الفئة المناسبة، أو انقر البطاقة ثم انقر الفئة (أو اختر الفئة مباشرة من أزرار البطاقة).</p>
              <div class="sort-pool" aria-label="البطاقات غير المصنفة">
                ${unplaced.length ? unplaced.map(i => {
                  const it = step.items[i];
                  const active = state.activeItem === i;
                  return `
                    <div class="sort-chip${active ? ' is-active' : ''}" draggable="true" data-sort-item="${i}">
                      <button type="button" class="sort-chip-main" data-pick-item="${i}" aria-pressed="${active ? 'true' : 'false'}">
                        <span>${esc(it.text)}</span>
                        ${it.gate ? `<span class="mini-gate">بوابة</span>` : ''}
                      </button>
                      <div class="sort-quick-btns" role="group" aria-label="تصنيف سريع">
                        ${step.buckets.map(b => `<button type="button" class="quick-bucket-btn" data-assign-item="${i}" data-assign-bucket="${esc(b.id)}">${esc(b.label)}</button>`).join('')}
                      </div>
                    </div>`;
                }).join('') : `<p class="pool-done">${Icon('check', { size: 18 })} وُزّعت جميع البطاقات. يمكنك تعديل أي بطاقة بالنقر عليها داخل الفئة.</p>`}
              </div>
              <div class="sort-buckets">
                ${step.buckets.map(b => {
                  const assigned = state.order.filter(i => state.placements[i] === b.id);
                  return `
                    <div class="bucket-box${state.activeItem != null ? ' is-droppable' : ''}" data-bucket-id="${esc(b.id)}">
                      <button type="button" class="bucket-head" data-drop-bucket="${esc(b.id)}">
                        <span class="bucket-title">${esc(b.label)}</span>
                        <span class="bucket-count">${assigned.length}</span>
                      </button>
                      <div class="bucket-items">
                        ${assigned.map(i => {
                          const it = step.items[i];
                          let cls = '', badge = '';
                          if (state.evalResult) {
                            const ok = it.bucket === b.id;
                            cls = ok ? ' is-correct' : ' is-wrong';
                            badge = ok ? `<span class="state-tag tag-ok">${Icon('check', { size: 14 })} صحيح</span>` : `<span class="state-tag tag-bad">${Icon('cross', { size: 14 })} راجع</span>`;
                          }
                          return `
                            <button type="button" class="placed-chip${cls}" data-unplace="${i}" aria-label="إلغاء تصنيف: ${esc(it.text)}">
                              <span>${esc(it.text)}</span>
                              ${badge || `<span class="remove-x" aria-hidden="true">×</span>`}
                            </button>`;
                        }).join('')}
                      </div>
                    </div>`;
                }).join('')}
              </div>
            </div>
          </article>`;
        bindSpeakButtons(container);

        container.querySelectorAll('[data-pick-item]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.pickItem);
            state.activeItem = state.activeItem === idx ? null : idx;
            AudioEngine.sfx('tap');
            render();
          });
        });
        container.querySelectorAll('[data-assign-item]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.assignItem);
            state.placements[idx] = btn.dataset.assignBucket;
            state.activeItem = null;
            state.evalResult = null;
            AudioEngine.sfx('tap');
            render();
            onStateChange(state);
          });
        });
        container.querySelectorAll('[data-drop-bucket]').forEach(btn => {
          btn.addEventListener('click', () => {
            if (state.activeItem == null) return;
            state.placements[state.activeItem] = btn.dataset.dropBucket;
            state.activeItem = null;
            state.evalResult = null;
            AudioEngine.sfx('tap');
            render();
            onStateChange(state);
          });
        });
        container.querySelectorAll('[data-unplace]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.unplace);
            delete state.placements[idx];
            state.activeItem = idx;
            state.evalResult = null;
            AudioEngine.sfx('tap');
            render();
            onStateChange(state);
          });
        });
        // HTML5 drag-and-drop enhancement for mouse/desktop
        container.querySelectorAll('[data-sort-item]').forEach(el => {
          el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', el.dataset.sortItem);
            e.dataTransfer.effectAllowed = 'move';
          });
        });
        container.querySelectorAll('[data-bucket-id]').forEach(box => {
          box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('is-over'); });
          box.addEventListener('dragleave', () => box.classList.remove('is-over'));
          box.addEventListener('drop', (e) => {
            e.preventDefault();
            box.classList.remove('is-over');
            const idx = Number(e.dataTransfer.getData('text/plain'));
            if (!Number.isNaN(idx)) {
              state.placements[idx] = box.dataset.bucketId;
              state.activeItem = null;
              state.evalResult = null;
              AudioEngine.sfx('tap');
              render();
              onStateChange(state);
            }
          });
        });
        return;
      }

      if (step.type === 'match') {
        const pairedRightToLeft = {};
        Object.keys(state.pairs).forEach(l => { pairedRightToLeft[state.pairs[l]] = Number(l); });
        const promptHtml = `<h3 class="step-prompt">${esc(step.prompt)}</h3>`;
        container.innerHTML = `
          <article class="step-scene step-match">
            ${sceneDialogue(step, opts, 'مطابقة الأزواج', promptHtml)}
            <div class="scene-workspace">
              <p class="helper-hint">انقر عنصراً من العمود الأيمن ثم انقر ما يناسبه في العمود الأيسر.</p>
              <div class="match-grid">
                <div class="match-col">
                  <div class="col-head">العنصر</div>
                  ${step.pairs.map((p, li) => {
                    const active = state.activeLeft === li;
                    const rIdx = state.pairs[li];
                    const hasPair = rIdx != null;
                    let cls = '';
                    if (state.evalResult && hasPair) cls = (rIdx === li) ? ' is-correct' : ' is-wrong';
                    return `
                      <button type="button" class="match-btn${active ? ' is-active' : ''}${hasPair ? ' is-paired' : ''}${cls}" data-left="${li}" aria-pressed="${active ? 'true' : 'false'}">
                        <span class="pair-num">${li + 1}</span>
                        <span class="match-txt">${esc(p.left)}</span>
                        ${hasPair ? `<span class="paired-pill">مرتبط بـ (${state.rightOrder.indexOf(rIdx) + 1})</span>` : ''}
                      </button>`;
                  }).join('')}
                </div>
                <div class="match-col">
                  <div class="col-head">المقابل</div>
                  ${state.rightOrder.map((ri, pos) => {
                    const linkedLeft = pairedRightToLeft[ri];
                    const hasPair = linkedLeft != null;
                    let cls = '';
                    if (state.evalResult && hasPair) cls = (linkedLeft === ri) ? ' is-correct' : ' is-wrong';
                    return `
                      <button type="button" class="match-btn${hasPair ? ' is-paired' : ''}${cls}" data-right="${ri}">
                        <span class="pair-num pair-num-alt">${pos + 1}</span>
                        <span class="match-txt">${esc(step.pairs[ri].right)}</span>
                        ${hasPair ? `<span class="paired-pill">مع (${linkedLeft + 1})</span>` : ''}
                      </button>`;
                  }).join('')}
                </div>
              </div>
            </div>
          </article>`;
        bindSpeakButtons(container);

        container.querySelectorAll('[data-left]').forEach(btn => {
          btn.addEventListener('click', () => {
            const li = Number(btn.dataset.left);
            if (state.pairs[li] != null && state.activeLeft == null) {
              delete state.pairs[li];
              state.activeLeft = li;
            } else {
              state.activeLeft = state.activeLeft === li ? null : li;
            }
            state.evalResult = null;
            AudioEngine.sfx('tap');
            render();
            onStateChange(state);
          });
        });
        container.querySelectorAll('[data-right]').forEach(btn => {
          btn.addEventListener('click', () => {
            const ri = Number(btn.dataset.right);
            if (state.activeLeft == null) {
              const existingL = pairedRightToLeft[ri];
              if (existingL != null) {
                delete state.pairs[existingL];
                state.evalResult = null;
                AudioEngine.sfx('tap');
                render();
                onStateChange(state);
              }
              return;
            }
            Object.keys(state.pairs).forEach(l => { if (state.pairs[l] === ri) delete state.pairs[l]; });
            state.pairs[state.activeLeft] = ri;
            state.activeLeft = null;
            state.evalResult = null;
            AudioEngine.sfx('tap');
            render();
            onStateChange(state);
          });
        });
        return;
      }

      if (step.type === 'order') {
        const promptHtml = `<h3 class="step-prompt">${esc(step.prompt)}</h3>`;
        container.innerHTML = `
          <article class="step-scene step-order">
            ${sceneDialogue(step, opts, 'ترتيب الخطوات', promptHtml)}
            <div class="scene-workspace">
              <p class="helper-hint">رتّب العناصر من الأول إلى الأخير بالسحب من المقبض أو بأزرار التحريك للأعلى والأسفل.</p>
              <ol class="order-list" data-order-list>
                ${state.current.map((origIdx, pos) => {
                  let cls = '', mark = '';
                  if (state.evalResult) {
                    const ok = origIdx === pos;
                    cls = ok ? ' is-correct' : ' is-wrong';
                    mark = ok ? `<span class="state-tag tag-ok">${Icon('check', { size: 14 })}</span>` : `<span class="state-tag tag-bad">${Icon('cross', { size: 14 })}</span>`;
                  }
                  return `
                    <li class="order-item${cls}" data-orig-idx="${origIdx}">
                      <button type="button" class="drag-handle" aria-pressed="false" aria-label="تحريك العنصر: ${esc(step.items[origIdx])}">
                        ${Icon('grip', { size: 18 })}
                      </button>
                      <span class="order-pos">${pos + 1}</span>
                      <div class="order-body">
                        <span class="order-text">${esc(step.items[origIdx])}</span>
                        <span class="grab-hint" aria-hidden="true">مسافة للالتقاط · الأسهم للتحريك</span>
                      </div>
                      ${mark}
                      <div class="order-arrows">
                        <button type="button" class="icon-btn-sm" data-move="-1" aria-label="تحريك لأعلى: ${esc(step.items[origIdx])}" ${pos === 0 ? 'disabled' : ''}>${Icon('up', { size: 18 })}</button>
                        <button type="button" class="icon-btn-sm" data-move="1" aria-label="تحريك لأسفل: ${esc(step.items[origIdx])}" ${pos === state.current.length - 1 ? 'disabled' : ''}>${Icon('down', { size: 18 })}</button>
                      </div>
                    </li>`;
                }).join('')}
              </ol>
            </div>
          </article>`;
        bindSpeakButtons(container);
        setupOrderInteractions(container, step, state, onStateChange, render);
        return;
      }

      if (step.type === 'fill') {
        const activeB = state.activeBlank != null ? state.activeBlank : 0;
        let sentenceHtml = esc(step.text);
        step.blanks.forEach((b, bi) => {
          const val = state.values[bi];
          let cls = activeB === bi ? ' is-active' : '';
          if (state.evalResult) cls += (val === b.answer ? ' is-correct' : ' is-wrong');
          const slotBtn = `<button type="button" class="blank-slot${val ? ' is-filled' : ''}${cls}" data-blank="${bi}" aria-label="الفراغ ${bi + 1}: ${val ? esc(val) : 'فارغ'}">${val ? esc(val) : `(${bi + 1}) اختر...`}</button>`;
          sentenceHtml = sentenceHtml.replace(`{${bi}}`, slotBtn);
        });
        const curBlank = step.blanks[activeB] || step.blanks[0];
        const promptHtml = `<h3 class="step-prompt">${esc(step.prompt)}</h3>`;
        container.innerHTML = `
          <article class="step-scene step-fill">
            ${sceneDialogue(step, opts, 'إكمال الفراغ', promptHtml)}
            <div class="scene-workspace">
              <div class="fill-sentence">${sentenceHtml}</div>
              <div class="word-bank" role="group" aria-label="خيارات الفراغ رقم ${activeB + 1}">
                <div class="bank-label">خيارات الفراغ (${activeB + 1}):</div>
                <div class="bank-chips">
                  ${curBlank.options.map(opt => {
                    const chosen = state.values[activeB] === opt;
                    return `<button type="button" class="bank-chip${chosen ? ' is-selected' : ''}" data-fill-opt="${esc(opt)}" aria-pressed="${chosen ? 'true' : 'false'}">${esc(opt)}</button>`;
                  }).join('')}
                </div>
              </div>
              ${voiceAnswerBar(uid)}
            </div>
          </article>`;
        bindSpeakButtons(container);

        container.querySelectorAll('[data-blank]').forEach(btn => {
          btn.addEventListener('click', () => {
            state.activeBlank = Number(btn.dataset.blank);
            AudioEngine.sfx('tap');
            render();
          });
        });
        container.querySelectorAll('[data-fill-opt]').forEach(btn => {
          btn.addEventListener('click', () => {
            state.values[activeB] = btn.dataset.fillOpt;
            state.evalResult = null;
            const nextEmpty = state.values.findIndex((v, idx) => idx > activeB && !v);
            if (nextEmpty >= 0) state.activeBlank = nextEmpty;
            AudioEngine.sfx('tap');
            render();
            onStateChange(state);
          });
        });
        bindVoiceMCQ(container, uid, curBlank.options, (matchedIdx, heard) => {
          state.values[activeB] = curBlank.options[matchedIdx];
          state.evalResult = null;
          render();
          const st = container.querySelector(`#voice-note-${CSS.escape(uid)}`);
          if (st) st.textContent = `سُمِع: «${heard}» — وُضع «${curBlank.options[matchedIdx]}» في الفراغ (${activeB + 1}).`;
          onStateChange(state);
        });
        return;
      }

      if (step.type === 'spot') {
        const tagMap = {};
        step.tags.forEach(t => { tagMap[t.id] = t.label; });
        const openIdx = state.openSeg;
        const promptHtml = `<h3 class="step-prompt">${esc(step.prompt)}</h3>`;
        container.innerHTML = `
          <article class="step-scene step-spot">
            ${sceneDialogue(step, opts, 'فحص المسودة بالمصدر', promptHtml)}
            <div class="scene-workspace">
              <div class="spot-source">
                <div class="spot-box-label">${Icon('book', { size: 17 })} المصدر المعتمد</div>
                <p>${esc(step.source)}</p>
              </div>
              <div class="spot-draft">
                <div class="spot-box-label">${Icon('sparkle', { size: 17 })} المسودة المعروضة للفحص (انقر كل عبارة مميزة لتصنيفها)</div>
                <div class="spot-text">
                  ${step.segments.map((seg, si) => {
                    if (!seg.tag) return `<span>${esc(seg.text)}</span>`;
                    const chosen = state.tags[si];
                    let cls = openIdx === si ? ' is-open' : '';
                    if (state.evalResult) cls += (chosen === seg.tag ? ' is-correct' : ' is-wrong');
                    return `<button type="button" class="spot-seg${chosen ? ' is-tagged' : ''}${cls}" data-seg="${si}">
                      <span class="seg-phrase">${esc(seg.text)}</span>
                      <span class="seg-badge">${chosen ? esc(tagMap[chosen] || chosen) : 'صنّف العبارة'}</span>
                    </button>`;
                  }).join('')}
                </div>
                ${openIdx != null && step.segments[openIdx] && step.segments[openIdx].tag ? `
                  <div class="spot-picker" role="group" aria-label="اختر الحكم على العبارة: ${esc(step.segments[openIdx].text)}">
                    <span class="picker-title">حكم العبارة «${esc(step.segments[openIdx].text)}»:</span>
                    <div class="picker-btns">
                      ${step.tags.map(t => `
                        <button type="button" class="tag-choice${state.tags[openIdx] === t.id ? ' is-selected' : ''}" data-pick-tag="${esc(t.id)}">
                          ${esc(t.label)}
                        </button>`).join('')}
                    </div>
                  </div>` : `<p class="helper-hint">انقر أي عبارة مسطّرة لاختيار حكمها مقارنةً بالمصدر.</p>`}
              </div>
            </div>
          </article>`;
        bindSpeakButtons(container);

        container.querySelectorAll('[data-seg]').forEach(btn => {
          btn.addEventListener('click', () => {
            const si = Number(btn.dataset.seg);
            state.openSeg = state.openSeg === si ? null : si;
            AudioEngine.sfx('tap');
            render();
          });
        });
        container.querySelectorAll('[data-pick-tag]').forEach(btn => {
          btn.addEventListener('click', () => {
            if (state.openSeg == null) return;
            state.tags[state.openSeg] = btn.dataset.pickTag;
            const next = step.segments.findIndex((g, idx) => g.tag && idx > state.openSeg && !state.tags[idx]);
            state.openSeg = next >= 0 ? next : null;
            state.evalResult = null;
            AudioEngine.sfx('tap');
            render();
            onStateChange(state);
          });
        });
        return;
      }

      if (step.type === 'build') {
        const promptHtml = `<h3 class="step-prompt">${esc(step.prompt)}</h3>`;
        container.innerHTML = `
          <article class="step-scene step-build">
            ${sceneDialogue(step, opts, 'بناء بطاقة عمل', promptHtml)}
            <div class="scene-workspace">
              <div class="build-fields">
                ${step.fields.map((f, fi) => {
                  const chosen = state.choices[fi];
                  let fieldCls = '';
                  if (state.evalResult && chosen != null) {
                    fieldCls = f.options[chosen] && f.options[chosen].correct ? ' is-correct' : ' is-wrong';
                  }
                  return `
                    <fieldset class="build-field${fieldCls}">
                      <legend class="build-legend">
                        <span>${fi + 1}. ${esc(f.label)}</span>
                        ${f.gate ? `<span class="mini-gate">${Icon('shield', { size: 13 })} بوابة أساسية</span>` : ''}
                      </legend>
                      <div class="build-opts">
                        ${f.options.map((o, oi) => {
                          const sel = chosen === oi;
                          return `
                            <button type="button" class="build-opt${sel ? ' is-selected' : ''}" data-field="${fi}" data-fopt="${oi}" aria-pressed="${sel ? 'true' : 'false'}">
                              <span class="radio-dot" aria-hidden="true"></span>
                              <span>${esc(o.text)}</span>
                            </button>`;
                        }).join('')}
                      </div>
                    </fieldset>`;
                }).join('')}
              </div>
            </div>
          </article>`;
        bindSpeakButtons(container);

        container.querySelectorAll('[data-field]').forEach(btn => {
          btn.addEventListener('click', () => {
            const fi = Number(btn.dataset.field);
            const oi = Number(btn.dataset.fopt);
            state.choices[fi] = oi;
            state.evalResult = null;
            AudioEngine.sfx('tap');
            render();
            onStateChange(state);
          });
        });
        return;
      }

      if (step.type === 'write') {
        const minChars = step.minChars || 20;
        const chars = state.text.trim().length;
        const words = countWords(state.text);
        const canReveal = chars >= minChars;
        const promptHtml = `<label class="step-prompt write-label" for="ta-${esc(uid)}">${esc(step.prompt)}</label>`;
        container.innerHTML = `
          <article class="step-scene step-write">
            ${sceneDialogue(step, opts, 'صياغة وتحقق ذاتي', promptHtml)}
            <div class="scene-workspace">
              ${step.context ? `<div class="context-box"><p>${esc(step.context)}</p></div>` : ''}
              <div class="write-sheet">
                <p class="helper-hint" id="hint-${esc(uid)}">اكتب محاولتك أولاً بكلماتك (لا تُدخِل بيانات أشخاص حقيقية)، ثم قارنها بنموذج الإجابة الاسترشادي وتحقّق من المعايير.</p>
                <textarea id="ta-${esc(uid)}" class="write-area" rows="5" aria-describedby="hint-${esc(uid)}" placeholder="${esc(step.placeholder || 'اكتب إجابتك هنا...')}"></textarea>
                <div class="write-meta">
                  <span>عدد الكلمات: <strong data-wcount>${words}</strong> · الأحرف: <strong data-ccount>${chars}</strong></span>
                  ${!state.revealed ? `
                    <button type="button" class="btn btn-secondary" data-reveal-rubric ${canReveal ? '' : 'disabled'}>
                      ${Icon('eye', { size: 18 })} <span>قارن بنموذج الإجابة والمعايير (${minChars} حرفاً على الأقل)</span>
                    </button>` : `<span class="saved-pill">${Icon('check', { size: 15 })} حُفظت مسودتك محلياً</span>`}
                </div>
                ${state.revealed ? `
                  <div class="model-compare">
                    <div class="model-box">
                      <div class="model-head">${Icon('book', { size: 18 })} نموذج الإجابة الاسترشادي</div>
                      <p class="model-text">${esc(step.modelAnswer)}</p>
                    </div>
                    <fieldset class="rubric-box">
                      <legend>التحقق الذاتي بمعايير التقييم (ضع علامة على كل معيار استوفته إجابتك بصدق)</legend>
                      <div class="rubric-items">
                        ${step.rubric.map((r, ri) => `
                          <label class="rubric-row" for="rub-${esc(uid)}-${ri}">
                            <input type="checkbox" id="rub-${esc(uid)}-${ri}" data-rubric="${ri}" ${state.checks[ri] ? 'checked' : ''}>
                            <span class="rubric-txt">${esc(r.text)}</span>
                            ${r.gate ? `<span class="mini-gate">${Icon('shield', { size: 13 })} شرط أساسي</span>` : ''}
                          </label>`).join('')}
                      </div>
                    </fieldset>
                  </div>` : ''}
              </div>
            </div>
          </article>`;
        bindSpeakButtons(container);

        const ta = container.querySelector(`#ta-${CSS.escape(uid)}`);
        ta.value = state.text;
        ta.addEventListener('input', () => {
          state.text = ta.value;
          const c = state.text.trim().length;
          const w = countWords(state.text);
          const wcEl = container.querySelector('[data-wcount]');
          const ccEl = container.querySelector('[data-ccount]');
          if (wcEl) wcEl.textContent = String(w);
          if (ccEl) ccEl.textContent = String(c);
          const revBtn = container.querySelector('[data-reveal-rubric]');
          if (revBtn) revBtn.disabled = c < minChars;
          if (opts.unitId) Store.saveWrite(opts.unitId, uid, state.text);
          onStateChange(state);
        });
        const revBtn = container.querySelector('[data-reveal-rubric]');
        if (revBtn) {
          revBtn.addEventListener('click', () => {
            if (state.text.trim().length < minChars) return;
            state.revealed = true;
            AudioEngine.sfx('tap');
            render();
            onStateChange(state);
          });
        }
        container.querySelectorAll('[data-rubric]').forEach(chk => {
          chk.addEventListener('change', () => {
            const ri = Number(chk.dataset.rubric);
            state.checks[ri] = chk.checked;
            state.evalResult = null;
            onStateChange(state);
          });
        });
      }
    }

    render();
    return {
      getState: () => state,
      isReady: () => isStepReady(step, state),
      evaluate: () => {
        const res = evaluateStep(step, state);
        state.evalResult = res;
        render();
        return res;
      },
      resetForRetry: () => {
        if (step.type === 'mcq') {
          state.selected = step.multi ? state.selected.filter(i => step.options[i] && step.options[i].correct) : null;
        } else if (step.type === 'sort') {
          Object.keys(state.placements).forEach(k => {
            const idx = Number(k);
            if (!step.items[idx] || state.placements[idx] !== step.items[idx].bucket) delete state.placements[idx];
          });
          state.activeItem = null;
        } else if (step.type === 'match') {
          Object.keys(state.pairs).forEach(k => {
            const li = Number(k);
            if (state.pairs[li] !== li) delete state.pairs[li];
          });
          state.activeLeft = null;
        } else if (step.type === 'fill') {
          step.blanks.forEach((b, bi) => {
            if (state.values[bi] !== b.answer) state.values[bi] = null;
          });
          const firstEmpty = state.values.findIndex(v => v == null);
          state.activeBlank = firstEmpty >= 0 ? firstEmpty : 0;
        } else if (step.type === 'spot') {
          step.segments.forEach((g, si) => {
            if (g.tag && state.tags[si] !== g.tag) delete state.tags[si];
          });
          const firstOpen = step.segments.findIndex((g, si) => g.tag && !state.tags[si]);
          state.openSeg = firstOpen >= 0 ? firstOpen : null;
        } else if (step.type === 'build') {
          step.fields.forEach((f, fi) => {
            const c = state.choices[fi];
            if (c == null || !(f.options[c] && f.options[c].correct)) state.choices[fi] = null;
          });
        }
        state.evalResult = null;
        render();
        onStateChange(state);
      }
    };
  }

  /* ---------- Accessible Drag & Keyboard Reordering for `order` ---------- */
  function moveDomNode(list, item, refNode) {
    if ('moveBefore' in Element.prototype) {
      list.moveBefore(item, refNode);
    } else if (refNode) {
      refNode.before(item);
    } else {
      list.append(item);
    }
  }

  function syncOrderStateFromDom(list, state, step, onStateChange) {
    const items = [...list.querySelectorAll('.order-item')];
    state.current = items.map(li => Number(li.dataset.origIdx));
    items.forEach((li, idx) => {
      const posEl = li.querySelector('.order-pos');
      if (posEl) posEl.textContent = String(idx + 1);
      const up = li.querySelector('[data-move="-1"]');
      const dn = li.querySelector('[data-move="1"]');
      if (up) up.disabled = idx === 0;
      if (dn) dn.disabled = idx === items.length - 1;
    });
    state.evalResult = null;
    onStateChange(state);
  }

  function setupOrderInteractions(container, step, state, onStateChange, fullRender) {
    const list = container.querySelector('[data-order-list]');
    if (!list) return;

    // 1. Up / Down explicit movement buttons
    list.querySelectorAll('[data-move]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = Number(btn.dataset.move);
        const li = btn.closest('.order-item');
        const idx = [...list.children].indexOf(li);
        const target = idx + dir;
        if (target < 0 || target >= list.children.length) return;
        const tmp = state.current[idx];
        state.current[idx] = state.current[target];
        state.current[target] = tmp;
        state.evalResult = null;
        AudioEngine.sfx('tap');
        fullRender();
        onStateChange(state);
        const movedLi = container.querySelectorAll('.order-item')[target];
        if (movedLi) {
          const nextBtn = movedLi.querySelector(`[data-move="${dir}"]`);
          const fallbackBtn = movedLi.querySelector(`[data-move="${-dir}"]`);
          const toFocus = (nextBtn && !nextBtn.disabled) ? nextBtn : fallbackBtn;
          if (toFocus) toFocus.focus({ preventScroll: true });
        }
        announce(`نُقل العنصر إلى الموضع ${target + 1} من ${state.current.length}.`);
      });
    });

    // 2. Grab-move-drop keyboard mode + Pointer drag on .drag-handle
    let activePointerId = null;
    list.addEventListener('focusin', (e) => {
      const li = e.target.closest && e.target.closest('.order-item');
      if (li && e.target.matches(':focus-visible')) {
        li.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
    list.querySelectorAll('.drag-handle').forEach(handle => {
      let kbGrabbed = false;
      let movingDom = false;
      let startOrder = null;

      handle.addEventListener('blur', () => {
        if (!kbGrabbed || movingDom) return;
        kbGrabbed = false;
        handle.setAttribute('aria-pressed', 'false');
        const li = handle.closest('.order-item');
        if (li) li.classList.remove('is-grabbed');
      });

      handle.addEventListener('keydown', (e) => {
        const li = handle.closest('.order-item');
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          kbGrabbed = !kbGrabbed;
          handle.setAttribute('aria-pressed', kbGrabbed ? 'true' : 'false');
          li.classList.toggle('is-grabbed', kbGrabbed);
          const hint = li.querySelector('.grab-hint');
          if (hint) hint.textContent = kbGrabbed ? 'الأسهم للتحريك · مسافة للإفلات · Esc للإلغاء' : 'مسافة للالتقاط · الأسهم للتحريك';
          if (kbGrabbed) {
            startOrder = state.current.slice();
            announce('تم التقاط العنصر. استخدم سهم أعلى وأسفل للتحريك، ومسافة للإفلات، أو Escape للإلغاء.');
          } else {
            const pos = [...list.children].indexOf(li) + 1;
            announce(`أُفلت العنصر في الموضع ${pos}.`);
          }
          return;
        }
        if (!kbGrabbed) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          kbGrabbed = false;
          handle.setAttribute('aria-pressed', 'false');
          li.classList.remove('is-grabbed');
          if (startOrder) { state.current = startOrder; fullRender(); onStateChange(state); }
          announce('أُلغي نقل العنصر.');
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const kids = [...list.children];
          const curIdx = kids.indexOf(li);
          const nextIdx = e.key === 'ArrowUp' ? curIdx - 1 : curIdx + 1;
          if (nextIdx < 0 || nextIdx >= kids.length) return;
          const ref = e.key === 'ArrowUp' ? kids[nextIdx] : kids[nextIdx].nextElementSibling;
          movingDom = true;
          moveDomNode(list, li, ref);
          li.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          handle.focus({ preventScroll: true });
          movingDom = false;
          syncOrderStateFromDom(list, state, step, onStateChange);
          setTimeout(() => announce(`الموضع ${nextIdx + 1} من ${kids.length}.`), 350);
        }
      });

      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || activePointerId != null) return;
        e.preventDefault();
        activePointerId = e.pointerId;
        const li = handle.closest('.order-item');
        const startY = e.clientY;
        let dropRef = li.nextElementSibling;
        handle.setPointerCapture(e.pointerId);
        li.classList.add('is-dragging');
        document.documentElement.classList.add('is-reordering');

        function computeRef(clientY) {
          const listRect = list.getBoundingClientRect();
          const relY = Math.max(0, Math.min(listRect.height, clientY - listRect.top));
          const siblings = [...list.querySelectorAll('.order-item')];
          for (const sib of siblings) {
            const mid = sib.offsetTop + sib.offsetHeight / 2;
            if (relY < mid) return sib;
          }
          return null;
        }

        function onMove(ev) {
          if (ev.pointerId !== activePointerId) return;
          const dy = ev.clientY - startY;
          li.style.translate = `0px ${dy}px`;
          dropRef = computeRef(ev.clientY);
          const isNoOp = dropRef === li || dropRef === li.nextElementSibling;
          if (isNoOp) {
            delete list.dataset.drop;
          } else {
            list.dataset.drop = 'true';
            const r = dropRef ? dropRef.getBoundingClientRect() : list.lastElementChild.getBoundingClientRect();
            const lineY = dropRef ? r.top - 4 : r.bottom + 4;
            list.style.setProperty('--drop-y', `${lineY}px`);
            list.style.setProperty('--drop-x', `${r.left}px`);
            list.style.setProperty('--drop-w', `${r.width}px`);
          }
        }

        function cleanup(commit) {
          li.style.translate = '';
          li.classList.remove('is-dragging');
          delete list.dataset.drop;
          document.documentElement.classList.remove('is-reordering');
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
          handle.removeEventListener('pointercancel', onCancel);
          window.removeEventListener('keydown', onEsc);
          activePointerId = null;
          if (commit && dropRef !== li && dropRef !== li.nextElementSibling) {
            moveDomNode(list, li, dropRef);
            syncOrderStateFromDom(list, state, step, onStateChange);
            AudioEngine.sfx('tap');
            const pos = [...list.children].indexOf(li) + 1;
            announce(`نُقل العنصر إلى الموضع ${pos}.`);
          }
        }

        function onUp(ev) { if (ev.pointerId === activePointerId) cleanup(true); }
        function onCancel(ev) { if (ev.pointerId === activePointerId) cleanup(false); }
        function onEsc(ev) { if (ev.key === 'Escape') { ev.preventDefault(); cleanup(false); announce('أُلغي السحب.'); } }

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onEsc);
      });
    });
  }

  function bindSpeakButtons(root) {
    root.querySelectorAll('[data-speak-text]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.speakText;
        const key = btn.dataset.speakKey;
        const box = btn.closest('[data-listen-box]');
        const res = await AudioEngine.speak(text, key);
        if (!res.ok && res.reason) announce(res.reason);
        updateListenUI(box, key);
      });
    });
  }

  function updateListenUI(box, key) {
    if (!box) return;
    const st = AudioEngine.status();
    const active = st.playing && st.key === key;
    box.classList.toggle('is-playing', active);
    const btn = box.querySelector('[data-speak-key]');
    if (btn) {
      btn.innerHTML = active
        ? `${Icon('stop', { size: 18 })} <span>إيقاف</span>`
        : `${Icon('play', { size: 18 })} <span>استمع</span>`;
    }
  }

  function bindVoiceMCQ(container, uid, options, onMatched) {
    const btn = container.querySelector(`[data-voice-btn="${CSS.escape(uid)}"]`);
    const statusEl = container.querySelector(`#voice-note-${CSS.escape(uid)}`);
    if (!btn || !statusEl) return;
    btn.addEventListener('click', () => {
      AudioEngine.listenOnce({
        onStart: () => {
          btn.classList.add('is-listening');
          statusEl.textContent = 'جارٍ الاستماع بالعربية... انطق الإجابة أو رقم الخيار.';
        },
        onResult: (transcript) => {
          btn.classList.remove('is-listening');
          const idx = AudioEngine.matchSpokenToOption(transcript, options);
          if (idx >= 0) {
            onMatched(idx, transcript);
          } else {
            statusEl.textContent = `سُمِع: «${transcript}» — لم تتطابق تلقائياً مع أحد الخيارات، اختر الإجابة باللمس أو حاول مجدداً.`;
          }
        },
        onError: (msg) => {
          btn.classList.remove('is-listening');
          statusEl.textContent = msg;
        },
        onEnd: () => {
          btn.classList.remove('is-listening');
        }
      });
    });
  }

  /* ---------- Readiness check ---------- */
  function isStepReady(step, state) {
    switch (step.type) {
      case 'learn':
      case 'example':
        return true;
      case 'mcq':
        return step.multi ? state.selected.length > 0 : state.selected != null;
      case 'sort':
        return step.items.every((_, i) => state.placements[i] != null);
      case 'match':
        return step.pairs.every((_, i) => state.pairs[i] != null);
      case 'order':
        return true;
      case 'fill':
        return state.values.every(v => v != null);
      case 'spot':
        return step.segments.every((g, i) => !g.tag || state.tags[i] != null);
      case 'build':
        return state.choices.every(c => c != null);
      case 'write':
        return state.revealed && state.text.trim().length >= (step.minChars || 20);
      default:
        return true;
    }
  }

  /* ---------- Deterministic grading & constructive feedback ---------- */
  function evaluateStep(step, state) {
    const total = stepPoints(step);
    let earned = 0;
    let gateFailed = false;
    const notes = [];

    switch (step.type) {
      case 'mcq': {
        if (step.multi) {
          const right = step.options.map((o, i) => o.correct ? i : -1).filter(i => i >= 0);
          const sel = state.selected.slice().sort();
          const ok = right.length === sel.length && right.every((v, i) => v === sel[i]);
          earned = ok ? total : 0;
          step.options.forEach((o, i) => {
            if (state.selected.includes(i) && !o.correct && o.feedback) notes.push(o.feedback);
          });
        } else {
          const picked = step.options[state.selected];
          const ok = !!(picked && picked.correct);
          earned = ok ? total : 0;
          if (picked && picked.feedback) notes.push(picked.feedback);
        }
        break;
      }
      case 'sort': {
        step.items.forEach((it, i) => {
          const ok = state.placements[i] === it.bucket;
          if (ok) earned += 1;
          else {
            if (it.gate) gateFailed = true;
            if (it.feedback) notes.push(`«${it.text}»: ${it.feedback}`);
          }
        });
        break;
      }
      case 'match': {
        step.pairs.forEach((p, li) => {
          if (state.pairs[li] === li) earned += 1;
          else notes.push(`«${p.left}» يقابله: «${p.right}».`);
        });
        break;
      }
      case 'order': {
        const ok = state.current.every((origIdx, pos) => origIdx === pos);
        earned = ok ? total : 0;
        if (!ok) notes.push('بعض الخطوات ليست في موضعها الصحيح بعد؛ راجع التسلسل المنطقي للعملية.');
        break;
      }
      case 'fill': {
        step.blanks.forEach((b, bi) => {
          if (state.values[bi] === b.answer) earned += 1;
          else notes.push(`الفراغ (${bi + 1}): راجع السياق لاختيار التكملة الأدق.`);
        });
        break;
      }
      case 'spot': {
        step.segments.forEach((g, si) => {
          if (!g.tag) return;
          if (state.tags[si] === g.tag) earned += 1;
          else if (g.feedback) notes.push(`«${g.text}»: ${g.feedback}`);
        });
        break;
      }
      case 'build': {
        step.fields.forEach((f, fi) => {
          const c = state.choices[fi];
          const opt = c != null ? f.options[c] : null;
          if (opt && opt.correct) earned += 1;
          else {
            if (f.gate) gateFailed = true;
            if (opt && opt.feedback) notes.push(`${f.label}: ${opt.feedback}`);
          }
        });
        break;
      }
      case 'write': {
        step.rubric.forEach((r, ri) => {
          if (state.checks[ri]) earned += 1;
          else {
            if (r.gate) gateFailed = true;
            notes.push(`معيار غير مستوفى: ${r.text}`);
          }
        });
        break;
      }
      default:
        break;
    }

    if (step.gate && earned < total) gateFailed = true;
    const ok = (earned === total) && !gateFailed;
    if (ok && step.explanation && !notes.length) notes.push(step.explanation);
    else if (!ok && step.explanation && !notes.length) notes.push(step.explanation);

    return { ok, earned, total, gateFailed, notes, explanation: step.explanation || '' };
  }

  window.Interactions = { esc, stepPoints, isInteractive, countWords, mountStep, evaluateStep, isStepReady, announce, bindSpeakButtons };
})();
