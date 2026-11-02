# Control демо-прогону на двійнику leave-portal (02.11.2026)

Це control, з яким фабрика справді відпрацювала на демо-двійнику
[2026-quitcode-09-leave-portal-factory](https://github.com/koldovsky/2026-quitcode-09-leave-portal-factory) — як запис,
а не як шаблон. Шаблон для свого двійника беріть з `examples/next-supabase/control` (там є `delivery` і коментарі
українською); цю теку — щоб побачити, як виглядає заповнена задача і з чим фабрика пройшла всі ворота.

| Файл | Що в ньому |
|---|---|
| `tasks/bulk-db.json` | задача з вимоги PM «масове рішення менеджера», AC-BULK-01…03: імпортер дав критерії, pass-to-pass і `TBD`; людина заповнила `nonFunctionals` і дописала в `intent` контракт, який фіксують червоні тести |
| `holdouts/bulk-db.json.enc` | 3 приховані сценарії, **запечатані** (AES-256-GCM). Ключа тут немає й не буде: сценарії лишаються «контрольною з невідомими задачами» |
| `factory.json`, `policy.json`, `rules.json` | Sonnet будівельником і рев'юером, `runUsd 8`, `dailyUsd 20`, усі класи змін `auto` |
| `evaluators/vitest-holdout.mjs`, `knowledge/conventions.md` | оцінювач holdouts і домовленості для будівельника (англійською, як у прогоні) |

## Що сталося

Прогін `run-20261102105148-3f6cd9`: `released` з першої спроби, 160 с, $0.35 (будівельник $0.26, рев'юер $0.09). Ворота
boundary, integrity (287 файлів), diff (7 файлів, 115 рядків), maintainability, visible-tests (102), repeat, holdouts 3/3,
review — PASS; mutation — n/a. Proof digest `3c6cb2067f4c…`. PR фабрики —
[#3](https://github.com/koldovsky/2026-quitcode-09-leave-portal-factory/pull/3), злитий автоматично після обов'язкових перевірок.

До цього `approve intent` прийняв задачу з `TBD`, а `factory run` відмовив на допуску: 5 × `non-functional "…" is still
undecided`, $0.

## Чим цей прогін відрізнявся від редакції

- Прогін зроблено **версією спайку** (upstream `0e3622b` + патч для Windows), у якій ще не було `deliver`, `uat`, `agent.executable`
  і нових перевірок `doctor`. Тому в `factory.json` немає розділу `delivery`: щоб запустити з редакцією, допишіть його
  (`examples/next-supabase/control/factory.json`).
- Поставку зроблено вручну: `git push`, `gh pr create --body-file <store>/runs/<run>/proof-pack.md`, автозлиття ввімкнула людина.
- UAT після злиття — e2e у CI двійника (11/11, усі чотири AC-BULK); `factory uat` тут не запускався.
- Шлях до вимоги в `intent` замінено на `<twin>/requirements/…` (у прогоні був локальний шлях).

Чесні обмеження цього прогону (fallow у PR червоний, будівельник сам позначив рядки матриці) — `docs/uk/limits.md`.
