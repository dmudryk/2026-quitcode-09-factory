# Фабрика на ваших вимогах: швидкий старт

Це курсова редакція [principled-factory](https://github.com/koldovsky/principled-factory) для стеку Next.js + TypeScript +
Supabase + Vitest. Завдання з фабрикою — **бонусне**: якщо лімітів моделі не вистачить, частковий прогін із чесним звітом теж
зараховується.

## Що це

**Фабрика ПЗ** — конвеєр, який перетворює *затверджений намір* (задачу з критеріями приймання) на *доведену й зворотну зміну*.
Аналогія: не «майстер-одинак», який сам робить і сам себе перевіряє, а цех із відділом технічного контролю.

- **Будівельник** (headless Claude Code) пише код в одноразовій копії репозиторію (`git worktree`), а не у вашій робочій теці.
- **Ворота** перевіряють результат у фіксованому порядку, від дешевих до дорогих: цілісність тестів, розмір diff,
  супроводжуваність, видимі тести, повтор, мутації, приховані сценарії (holdouts), рев'ю іншою моделлю.
  Вердикт кожних воріт — `PASS`, `NOT-EARNED` («доказу немає») або `FAIL`. Усе, крім `PASS`, зупиняє зміну.
- **Рівень автономії** вирішує, чи потрібна людина перед випуском. У двійнику курсу — ні (див. «Межі» нижче).
- **Proof pack** — звіт «вимога → доказ», ворота, що НЕ перевірено, вартість. Він стає описом PR.

Три місця — три власники:

| Місце | Що там | Хто пише |
|---|---|---|
| **control** (наприклад `C:\pf\control`) | конфігурація, AI-політика, задачі, приховані сценарії | ви; фабрика лише читає |
| **target** (наприклад `C:\pf\twin`) | репозиторій **двійника** вашого проєкту | фабрика лише додає гілку `factory/<run>` |
| **store** (наприклад `C:\pf\store`) | прогони, події, траси, затвердження, proof packs | фабрика |

### Що додала курсова редакція до upstream

- профіль `next-vitest` і адаптер тестів `templates/next-vitest/factory-tap.mjs` (Vitest → стабільний TAP, один рядок на AC);
- `tools/ac-to-task.mjs` — імпортер вимог PM у задачу фабрики (формати `lines`, `table`, `block`; адаптація — `adapt-importer.md`);
- приклад control `examples/next-supabase/control` (Sonnet, `runUsd 8`, усі класи змін `auto` для двійника);
- `node_modules` цільового репо підключається в робочий простір (junction), `.tsx` перевіряється воротами супроводжуваності;
- `doctor` не каже «готово», якщо тести не запустилися, немає `node_modules`, `claude.exe` чи входу в `gh`;
- `factory deliver` (push → PR з proof pack → автозлиття, якщо дозволяє рівень) і `factory uat` (UAT після розгортання).

## Що потрібно

- Node 22.17+ (перевірено на 24), git, [GitHub CLI](https://cli.github.com/) з виконаним `gh auth login`.
- **Claude Code як нативний файл** (`claude.exe` у Windows, зазвичай `%USERPROFILE%\.local\bin\claude.exe`) і вхід у нього.
  Встановлений через npm `claude` фабрика запустити не може (shell-обгортка). Інша IDE не заважає: див. `cursor.md`.
- **Двійник** проєкту з власним Supabase і Vercel — `twin.md`. Ніколи не спрямовуйте фабрику на основний проєкт.
- Сама фабрика: `git clone https://github.com/koldovsky/2026-quitcode-09-factory C:\pf\factory`, потім `cd C:\pf\factory`.
  Перевірка без ключа API: `npm test`, `npm run demo` (сценарні будівельники: чесний,
  «підганяє під тести», «псує тести», «підглядає»), `node bin/factory.mjs conformance`.

## Позначення (PowerShell)

Короткі шляхи (`C:\pf\…`) рятують від обмеження Windows у 260 символів. Задайте змінні один раз у сесії — тоді `--control`,
`--target`, `--store` писати не треба:

```powershell
$env:FACTORY_CONTROL = "C:\pf\control"
$env:FACTORY_TARGET  = "C:\pf\twin"
$env:FACTORY_STORE   = "C:\pf\store"
function F { node C:\pf\factory\bin\factory.mjs @args }
```

## Швидкий старт за 10 кроків

**1. Двійник проєкту.** Окремий репозиторій, Supabase і Vercel — за `twin.md`. Клонуйте його в `C:\pf\twin`, потім:

```powershell
cd C:\pf\twin; npm ci
git config core.longpaths true
git config user.email "<ваша пошта>"     # автор комітів фабрики береться з налаштувань репо
Copy-Item C:\pf\factory\templates\next-vitest\factory-tap.mjs scripts\factory-tap.mjs
node scripts/factory-tap.mjs --checks    # TAP: typecheck, lint, ac-coverage і по рядку на кожен AC — усе «ok»
```

Закомітьте `scripts/factory-tap.mjs` у `main` звичайним PR: він зелений і нічого не змінює в продукті (або разом із червоними
тестами кроку 4 — так зроблено в демо-двійнику). Якщо в проєкті є fallow (шаблон курсу), допишіть `"scripts/factory-tap.mjs"`
у `entry` файлу `.fallowrc.jsonc`: скрипт запускають руками, і без цього fallow позначить його «unused file».

**2. Копія control.** Поза репозиторієм двійника:

```powershell
Copy-Item -Recurse C:\pf\factory\examples\next-supabase\control C:\pf\control
```

Відредагуйте `knowledge/conventions.md` (ключове з вашого `AGENTS.md`), `rules.json` (правила залежностей) і в `factory.json`
допишіть `"uatUrl": "https://<двійник>.vercel.app"` у розділ `delivery`. Що означає кожен файл — `C:\pf\control\README.md`.

**3. Імпорт вимог.** Задача фабрики — з вимоги PM, з тими самими ID критеріїв:

```powershell
node C:\pf\factory\tools\ac-to-task.mjs --file C:\pf\twin\requirements\03-x.md `
  --ac AC-X-01,AC-X-02 --id x-db --holdout x-db --target C:\pf\twin --size small --out C:\pf\control\tasks\x-db.json
```

Для issue — `--issue власник/репо#12`, для таблиць чи блоків — `--format table|block` (`adapt-importer.md`). 1–3 критерії на
задачу. Не пишіть `>` замість `--out`: PowerShell 5.1 збереже файл у UTF-16, і фабрика його не прочитає.

Потім у JSON задачі зробіть дві речі руками:

- **Заповніть п'ять `nonFunctionals`** (`security`, `accessRules`, `idempotency`, `tenancy`, `failureModes`). Імпортер пише
  `TBD` навмисно: «TBD = не готово». Увага, де саме фабрика відмовить: `F approve intent` задачу з `TBD` **приймає**, а
  відмовляє `F run` на допуску, ще до агента і за $0:
  ```text
  run-…  x-db  state=refused  (task not admissible)
    - non-functional "security" is still undecided
    …
    attempts 0/? · cost $0.0000
  ```
- **Допишіть в `intent` контракт**, який фіксують ваші червоні тести (крок 4): назви нових функцій бази чи модулів, шляхи
  файлів, дослівні повідомлення з вимоги, `data-testid`. Імпортер дає лише «навіщо» і джерело. У демо-двійнику контракт писала
  людина — зразок у `examples/leave-portal-twin/control/tasks/bulk-db.json`.

**4. Червоні тести на гілці.** Фабрика доводить зміну тестом, який падає ДО неї й проходить ПІСЛЯ:

```powershell
git switch -c slice3/tests
# нові файли тестів; назва кожного тесту починається з ID: it("AC-X-01: …")
#   - Vitest (домен) і PGlite (правила бази) — їх бачить фабрика;
#   - Playwright tests/e2e/*.spec.ts з тегом @uat — для UAT після розгортання (фабрика їх не запускає)
git add -A; git commit -m "Тести спершу: AC-X-01, AC-X-02"
node scripts/factory-tap.mjs             # рядки AC-X-01, AC-X-02 — «not ok», усе інше — «ok»
```

Гілку не зливайте в `main` окремо (CI червоний): вона дійде туди в одному PR разом із кодом фабрики. Запустіть імпорт (крок 3)
ще раз, але **без `--out`** (інакше він перезапише заповнені `nonFunctionals`): попередження «не мають Vitest-тесту» мають зникнути. Критерій лише з e2e фабрика не бачить: його доводить UAT.

**5. Приховані сценарії (holdouts) і печатка.** «Контрольна з невідомими задачами»: Vitest/PGlite-файли, які ви пишете з
тексту AC і які будівельник не бачить (лише кількість пройдених). Візьміть за зразок `holdouts/example.json`, збережіть як
`C:\pf\control\holdouts\x-db.json`, по сценарію на критерій, і запечатайте:

```powershell
$env:FACTORY_HOLDOUT_KEY = "<щонайменше 16 символів; збережіть у менеджері паролів>"
F holdouts seal x-db                     # з'являється x-db.json.enc, відкритий файл видалено
```

Ключ потрібен у тій самій сесії PowerShell для кроку 8. Без нього прогін зупиниться.

**6. Перевірка готовності.**

```powershell
F doctor
```

Чекайте `ready`. Найважливіші рядки: `tests-ran` (тести справді запустилися і частина проходить), `deterministic-tests`
(два прогони однакові), `agent` (`claude.exe`), `delivery:gh` і `delivery:remote`. Дерево має бути чистим: закомітьте все.
Без свіжого успішного `doctor` (`readiness.maxAgeDays`) `F run` відмовить: `the target has no recent passing readiness check`.

**7. Затвердження людиною.** Фабрика працює лише з тим, що затвердила людина, і прив'язує затвердження до точного вмісту файлу:

```powershell
F approve config --as <ваше ім'я>
F approve intent x-db --as <ім'я PM або ваше>
```

Змінили `factory.json`, правила чи задачу (зокрема заповнили `nonFunctionals` чи `intent`) — затвердьте знову: затвердження
прив'язане до дайджесту файлу.

**8. Прогін.**

```powershell
F run x-db --as <ваше ім'я>
F status
F proof <run-id>
```

Будівельник → ворота → рев'ю → рівень `auto` → випуск у локальну гілку `factory/<run-id>`. Якщо спроби вичерпано, прогін чекає
людину (`needs-human`): `F answer <run-id> --as <ім'я> --text "<підказка>"` дає ще одну спробу. Бюджет прогону — `runUsd 8`.

**9. Поставка.**

```powershell
F deliver <run-id>
```

Push гілки → PR з proof pack в описі → автозлиття (`gh pr merge --auto --squash`), бо рівень `auto`. GitHub зіллє PR, коли пройдуть
обов'язкові перевірки ruleset; після злиття CI `db-deploy` застосує нові міграції до Supabase **двійника**, Vercel розгорне прод.

Дві умови в репозиторії двійника обов'язкові (`twin.md`, розділи 1 і 5):

- **Allow auto-merge** увімкнено, інакше GitHub відмовить у `--auto`;
- **ruleset з обов'язковими перевірками** на `main`. Без нього GitHub не має чого чекати, і `deliver` зливає PR **одразу**, ще до
  CI. Чекають лише *обов'язкові* перевірки: дорадча (наприклад fallow) може бути червоною, а PR однаково зіллється.

Чесно про демо 02.11: прогін на двійнику зроблено версією спайку, у якій ще не було `deliver`, тож поставку виконали тими самими
командами вручну — `git push -u origin factory/<run-id>`, `gh pr create --base main --head factory/<run-id> --body-file C:\pf\store\runs\<run-id>\proof-pack.md`,
автозлиття ввімкнула людина. `F deliver` і `F uat` перевірено автотестами з фейковим `gh`, на живому репозиторії — ще ні.

**10. UAT після розгортання.**

```powershell
F uat <run-id> --url https://<двійник>.vercel.app --as <ваше ім'я>
```

Фабрика чекає злиття PR, потім — поки `/api/health` двійника покаже коміт злиття, і запускає ваш UAT з WS8:
`node scripts/uat/run.mjs --url … --grep "AC-X-01|AC-X-02"` — з тими самими налаштуваннями, що й `npm run uat` у WS8. Підсумок і шлях до звіту лягають
поруч із proof pack (`F proof <run-id>`) і коментарем у PR. FAIL → інцидент → клас змін понижено: наступна така зміна чекатиме людину.

Звіт UAT (`docs/qa/uat/<дата>/`) з'являється у вашій робочій копії: закомітьте його (як у WS8, для PM), інакше наступний
`F doctor` скаже «дерево не чисте». Наступна задача: `git switch main; git pull`, нова гілка тестів — і знову з кроку 3.

На демо-двійнику 02.11 UAT після злиття зробив CI двійника: e2e 11/11, зокрема всі чотири AC-BULK (AC-BULK-04 — лише e2e).

## Як це пройшло на демо-двійнику (02.11.2026)

Вимога PM «масове рішення менеджера» (AC-BULK-01…04), задача `bulk-db` на AC-BULK-01…03, будівельник і рев'юер — Sonnet.
Control цього прогону — `examples/leave-portal-twin/control`.

| Крок | Що сталося |
|---|---|
| імпорт | 3 критерії, 27 pass-to-pass; попередження про критерій лише з e2e (AC-USERS-11) |
| `approve intent` з `TBD` | прийнято; `F run` відмовив на допуску: 5 × `is still undecided`, $0 |
| `doctor` | `ready`, 102 тести однакові у двох прогонах, 33 с |
| `F run` | `released` з першої спроби з трьох, **160 с, $0.35** (будівельник $0.26, рев'юер $0.09) |
| ворота | boundary (29 викликів, 2 відмови хука), integrity (287 файлів), diff (7 файлів, 115 рядків), maintainability, visible-tests (102), repeat, holdouts 3/3, review (0 зауважень) — усі PASS; mutation — n/a: на змінених рядках `sourceGlobs` немає операторів, які можна змінити |
| поставка | вручну (див. крок 9); PR злито автоматично після обов'язкових перевірок |

Що ворота **не** спіймали (видно лише в PR): дорадчий fallow був червоним — невикористаний `scripts/factory-tap.mjs` і
складність `ManagePage` 22; будівельник сам позначив рядки `docs/conformance.md` як «реалізовано» (так просив `intent`, але
це «автор перевіряє себе» — рядки має перевірити людина). Подробиці — `limits.md`.

## Пастки Windows

| Симптом | Причина | Що робити |
|---|---|---|
| `Filename too long` під час прогону | шлях store + `openspec/changes/archive/…` > 260 символів | `git config core.longpaths true` у двійнику і короткий store `C:\pf\store` |
| `spawn … ENOENT`, `doctor`: `agent … shell shim` | `claude` встановлено через npm | нативний `claude.exe`; або в `factory.json`: `"agent": { …, "executable": "C:\\Users\\<ви>\\.local\\bin\\claude.exe" }` |
| усі рядки TAP `not ok`, `tests-ran` FAIL | немає `node_modules` | `npm ci` у двійнику |
| `clean` FAIL | незакомічені або невідстежувані файли | закомітьте або додайте в `.gitignore` |
| `delivery:remote` FAIL | у двійнику немає remote `origin` | `git remote add origin <url двійника>` |
| хук відхилив `npm test`, `… \| tail` | політика: лише точні команди, без конвеєрів | будівельник сам переходить на `node scripts/factory-tap.mjs`; нічого робити не треба |
| прогін перервано (Ctrl+C, сон ноутбука) | процес фабрики зупинився посеред стадії | `F resume <run-id> --recover` продовжує його; або почніть новий `F run`. Аварійна зупинка всіх агентів — `F stop --as <ім'я>`, зняти — `F start --as <ім'я>` |

## Далі

- `twin.md` — як розгорнути двійника; `adapt-importer.md` — як навчити імпортер формату вашого PM;
- `limits.md` — межі довіри й виміряна вартість; `cursor.md` — якщо ви працюєте в Cursor;
- upstream: `docs/design.md` (будова), `docs/principles.md` (35 принципів), `docs/trust.md` (модель загроз).
