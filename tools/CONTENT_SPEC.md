# Content conversion spec — رحلة الذكاء الاصطناعي

Convert ONE course unit (learner file `units/UXX.md` + key `answer_keys/UXX_ANSWERS.md` from the curriculum package) into
`content/UXX.json`, following this schema exactly.
Validate with: `node tools/validate-content.mjs UXX`

## Non-negotiable fidelity rules
1. **Read the full unit file AND the full answer key first.** The current `units/` + `answer_keys/` files are
   authoritative. Ignore `previous_versions/` (archive) unless something is genuinely missing.
2. **Preserve meaning and correct answers.** Every correct answer, threshold, gate (non-compensable condition) and
   rubric criterion must come from the unit/key. Never change which option is correct.
3. **Do not invent facts, cases, names, numbers or rules.** You may *re-phrase concisely* (short, clear MSA) and
   *re-format* content into interactions. Fictional case data must be copied exactly (days, times, names, numbers).
4. **Distractors** (wrong options) must come from the material: existing MCQ options, the error patterns the key's
   feedback describes ("إذا صنّف المتعلم…", "تفسير الخطأ", rejected options, «لا» lists), or the explicit wrong
   alternatives in the lesson. Each wrong option's `feedback` should explain why, grounded in the key.
5. **Cover everything important**: for each lesson cover الفكرة / المفاهيم / المثال المحلول / النشاط / التحقق / التغذية
   الراجعة. Break substantial content into as many short stages as needed. Nothing important may be dropped.
6. **Separate practice from assessment.** The unit's final quiz questions (التقويم الختامي / سؤال ختامي مسجّل) and
   its alternate form (نموذج بديل) must NOT appear in practice stages; they go in `assessment`. Graded performance
   activities can be *practised* in stages only via the lesson's worked example / its own inputs if the unit itself
   does so; the graded instance belongs in `assessment`.
7. **Open-ended writing** that the key grades by rubric → a `write` step (learner writes, then compares with the key's
   model answer and self-checks the key's rubric criteria, gates marked). Where the key gives definitive answers for
   parts of that task (classifications, supported/unsupported claims, which field is missing…), ALSO add auto-graded
   steps (`sort`, `spot`, `build`, `mcq`…) for those parts. Never pretend an open answer was machine-graded.
8. **Real gaps**: if something can't be represented faithfully (e.g., a task needs human grading, a reference
   to missing media, ambiguity between unit and key), record it in `gaps` (Arabic or English, factual). Record
   your structural decisions in `conversionNotes`. Do not fill gaps with invented content.
9. Concise Arabic. `learn` bodies ≤ ~55 words per paragraph, ≤ 3 paragraphs. Prompts short. No emojis anywhere.
   Use Arabic punctuation and «» quotes as in source. Western digits are fine where the source uses them.
10. Accessibility: never rely on color alone; explanations must be in words.

## Characters (use the id in `speaker` / `mascot`)
| id | Name | Instructional role |
|---|---|---|
| `fanak` | فَنَك — white fennec fox, the journey guide | stage intros, encouragement, celebrations, bonus challenges |
| `hughes` | هيوز — human mentor | explains concepts and worked examples (learn/example) |
| `hasoub` | حسّوب — friendly retro computer robot | *plays the AI model*: produces drafts/answers (sometimes fluent but wrong) that learners must inspect |
| `sanad` | سَنَد — sharp-eyed falcon, the evidence checker | verification, sources, claims vs evidence, calculations, "let's check" feedback |
| `reem` | ريم — human, responsible-use guardian | privacy, permissions, disclosure, human approval, safety gates |
| `hudhud` | هُدهُد — hoopoe scout/messenger | workflows, delegation, agents & sub-agents, reports, products, maintenance |

Pick the speaker that fits the moment; vary them, don't use one for everything.

## File shape
```jsonc
{
  "id": "U01",                 // UXX
  "number": 1,
  "title": "أسس الذكاء الاصطناعي",            // from the unit title
  "tagline": "…",              // ≤ 12 words, inviting, faithful to the unit goal
  "track": "core",             // "core" for U01–U08, "advanced" for U09–U10
  "minutes": 75,               // the unit's declared total
  "summary": "…",              // 1–2 sentences: الهدف العام
  "goals": ["…"],              // ما ستتعلمه / نواتج التعلم, concise, all of them
  "beforeYouStart": "…",       // short: prerequisites / no account needed / fictional data note
  "recommendedAfter": [],      // e.g. ["U02","U03","U04"] if the unit says it assumes them (advisory only)
  "learningLimits": "…",       // حدود التعلم / ما الذي تثبته الوحدة — concise
  "stages": [ /* Stage */ ],
  "assessment": { /* Assessment */ },
  "gaps": ["…"],
  "conversionNotes": ["…"]
}
```

### Stage
```jsonc
{
  "id": "U01-S01",             // sequential S01, S02… (bonus stages too, e.g. U01-B1 for bonus)
  "kind": "lesson",            // "lesson" | "bonus"
  "title": "…",                // engaging short name (2–5 words), e.g. «تحت المظلة الكبيرة»
  "lessonRef": "U01-L01",      // source lesson id(s); bonus may use "transfer"/"retry" sections
  "mascot": "fanak",           // stage host
  "audioIntro": "…",           // 1–2 spoken sentences (≤ 30 words) introducing the stage, plain text, no symbols
  "steps": [ /* Step, 4–8 per stage */ ]
}
```
- Typical unit: 10–18 lesson stages. Each lesson → 2–4 stages. Every stage must contain at least one
  interactive (non-`learn`) step and should mix types.
- **Bonus stages**: insert one optional `kind:"bonus"` stage after roughly every 5 lesson stages (so a unit with
  12 lesson stages has 2 bonus stages). Build them from the unit's optional material: «حالة نقل اختيارية»,
  «إعادة المحاولة الاختيارية», «استدراك», transfer cases in the key, extra worked cases. Do NOT use the
  assessment's quiz or alternate quiz form. If the unit has no spare material left, build a mixed review of
  earlier taught content in different interaction formats (no new facts) and note it in `conversionNotes`.
  Bonus stages are optional and award extra XP.

### Steps (all may include `"speaker": "<character id>"`)
`learn` — short teaching moment
```json
{"type":"learn","title":"…","body":["paragraph", "paragraph"],"points":["optional bullet"],"tip":"optional"}
```
`example` — worked example / case
```json
{"type":"example","title":"…","scenario":"the case text","explanation":"why / what to notice"}
```
`mcq` — single (or multiple, with `"multi":true`) choice. Use for questions, scenarios, judgements.
```json
{"type":"mcq","prompt":"…","context":"optional case/material shown above",
 "listen": false,
 "options":[{"text":"…","correct":true,"feedback":"…"},{"text":"…","correct":false,"feedback":"…"}],
 "explanation":"shown after correct answer"}
```
`listen: true` = the `context` is presented audio-first (learner presses play; text toggle available). Use it on
~1 step per 2–3 stages where a short spoken case works well (≤ 40 words context).

`sort` — drag/tap items into buckets (classification)
```json
{"type":"sort","prompt":"…","buckets":[{"id":"gen","label":"توليد"}],
 "items":[{"text":"…","bucket":"gen","feedback":"why","gate":false}],"explanation":"…"}
```
`match` — pair left with right (2–6 pairs)
```json
{"type":"match","prompt":"…","pairs":[{"left":"…","right":"…"}],"explanation":"…"}
```
`order` — put items in the correct sequence (give items in the CORRECT order; the app shuffles)
```json
{"type":"order","prompt":"…","items":["first","second","third"],"explanation":"…"}
```
`fill` — complete the sentence; `{0}`, `{1}` placeholders; each blank has answer + options (answer included)
```json
{"type":"fill","prompt":"…","text":"ينتج النموذج اللغوي النص بالاستناد إلى {0} والسياق.",
 "blanks":[{"answer":"أنماط تعلّمها","options":["أنماط تعلّمها","فهم بشري","بحث حي دائماً"]}],
 "explanation":"…"}
```
`spot` — inspect a draft against a source; label each marked segment
```json
{"type":"spot","prompt":"…","source":"المادة الأصلية …","tags":[{"id":"ok","label":"مدعوم"},{"id":"bad","label":"مناقض"},{"id":"none","label":"غير مذكور"}],
 "segments":[{"text":"يلتقي النادي "},{"text":"يوم الأربعاء","tag":"bad","feedback":"…"},{"text":" "},{"text":"الساعة الخامسة","tag":"none","feedback":"…"}],
 "explanation":"…"}
```
Segments without `tag` are plain text; tagged segments are interactive. Concatenated segments = the full draft.

`build` — assemble a card/plan by choosing the right option for each field
```json
{"type":"build","prompt":"…","fields":[{"label":"المهمة","options":[{"text":"…","correct":true,"feedback":"…"},{"text":"…","correct":false,"feedback":"…"}],"gate":false}],
 "explanation":"…"}
```
`write` — open response + model answer + rubric self-check
```json
{"type":"write","prompt":"…","context":"optional","placeholder":"…","minChars":20,
 "modelAnswer":"from the key","rubric":[{"text":"criterion from key","gate":true}],"explanation":"optional"}
```

### Points & gates (used in assessment; harmless in stages)
Default points: mcq 1, sort = #items, match = #pairs, order 1, fill = #blanks, spot = #tagged segments,
build = #fields, write = #rubric criteria. Override with `"points": n` on mcq/order only.
`"gate": true` on a step = must be fully correct for its component to pass. `gate` on a sort item / build field /
rubric criterion = that element must be correct/checked. Use gates exactly where the unit/key says a condition is
mandatory or non-compensable («بوابة», «شرط أساسي», «يلزم», «وجوب», «لا يعوض»).

### Assessment
```jsonc
{
  "title": "اختبار نهاية الوحدة",
  "intro": "…",                         // what's assessed, short
  "completionRule": "…",                // faithful summary of the unit's completion rule (no compensation etc.)
  "components": [
    {
      "id": "quiz",
      "title": "الاختبار القصير",
      "kind": "quiz",                    // "quiz" (auto-graded) | "task" (mixed: auto-graded parts + write self-check)
      "threshold": {"min": 4, "of": 5},  // EXACT threshold from unit/key; "of" must equal the sum of item points
      "gatesNote": "…",                  // optional text of mandatory conditions
      "items": [ /* Steps (no learn/example except as context) */ ],
      "altItems": [ /* alternative form for retry, if the unit provides one; same "of" */ ],
      "retryNote": "…",                  // faithful: what happens on failure (alt form / transfer task / same form)
      "sourceRef": "التقويم الختامي"
    }
  ]
}
```
- Map EVERY graded component the unit/key/INDEX defines (quiz, activities with thresholds, cards, single
  graded MCQ, integrated performance…) to a component with its exact threshold. If the unit's thresholds are
  qualitative («لا مجموع نقاط»), use the gates and a threshold equal to all required elements, and explain in
  `completionRule`/`conversionNotes`.
- Thresholds must be achievable with the points you defined; if converting a rubric to points, keep the same
  number of criteria as the key so `of` matches the key's number (e.g. 6 criteria → of 6, min 5).
- For retry: use the unit's transfer/retry inputs for `altItems` when the unit says the retry uses new inputs;
  otherwise omit `altItems` (the app will re-run the same form, as the materials prescribe).
- `learn`/`example` may appear inside items only to present the case material before graded steps (0 points).

Keep the JSON valid UTF-8, 2-space indented. Run the validator until it passes, then reply with a short report:
stage count, bonus count, assessment components + thresholds, gaps, and any doubts about fidelity.
