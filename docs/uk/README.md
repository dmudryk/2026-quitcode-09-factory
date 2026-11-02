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
- **Рівень автономії** вирішує, чи потрібна людина перед випуском. У близнюку курсу — ні (див. «Межі» нижче).
- **Proof pack** — звіт «вимога → доказ», ворота, що НЕ перевірено, вартість. Він стає описом PR.

Три місця — три власники:

| Місце | Що там | Хто пише |
|---|---|---|
| **control** (наприклад `C:\pf\control`) | конфігурація, AI-політика, задачі, приховані сценарії | ви; фабрика лише читає |
| **target** (наприклад `C:\pf\twin`) | репозиторій **близнюка** вашого проєкту | фабрика лише додає гілку `factory/<run>` |
| **store** (наприклад `C:\pf\store`) | прогони, події, траси, затвердження, proof packs | фабрика |

### Що додала курсова редакція до upstream

- профіль `next-vitest` і адаптер тестів `templates/next-vitest/factory-tap.mjs` (Vitest → стабільний TAP, один рядок на AC);
- `tools/ac-to-task.mjs` — імпортер вимог PM у задачу фабрики (формати `lines`, `table`, `block`; адаптація — `adapt-importer.md`);
- приклад control `examples/next-supabase/control` (Sonnet, `runUsd 8`, усі класи змін `auto` для близнюка);
- `node_modules` цільового репо підключається в робочий простір (junction), `.tsx` перевіряється воротами супроводжуваності;
- `doctor` не каже «готово», якщо тести не запустилися, немає `node_modules`, `claude.exe` чи входу в `gh`;
- `factory deliver` (push → PR з proof pack → автозлиття, якщо дозволяє рівень) і `factory uat` (UAT після розгортання).

## Що потрібно

- Node 22.17+ (перевірено на 24), git, [GitHub CLI](https://cli.github.com/) з виконаним `gh auth login`.
- **Claude Code як нативний файл** (`claude.exe` у Windows, зазвичай `%USERPROFILE%\.local\bin\claude.exe`) і вхід у нього.
  Встановлений через npm `claude` фабрика запустити не може (shell-обгортка). Інша IDE не заважає: див. `cursor.md`.
- **Близнюк** проєкту з власним Supabase і Vercel — `twin.md`. Ніколи не спрямовуйте фабрику на основний проєкт.
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

**1. Близнюк проєкту.** Окремий репозиторій, Supabase і Vercel — за `twin.md`. Клонуйте його в `C:\pf\twin`, потім:

```powershell
cd C:\pf\twin; npm ci
git config core.longpaths true
git config user.email "<ваша пошта>"     # автор комітів фабрики береться з налаштувань репо
Copy-Item C:\pf\factory\templates\next-vitest\factory-tap.mjs scripts\factory-tap.mjs
node scripts/factory-tap.mjs --checks    # TAP: typecheck, lint, ac-coverage і по рядку на кожен AC — усе «ok»
```

Закомітьте `scripts/factory-tap.mjs` у `main` звичайним PR: він зелений і нічого не змінює в продукті.

**2. Копія control.** Поза репозиторієм близнюка:

```powershell
Copy-Item -Recurse C:\pf\factory\examples\next-supabase\control C:\pf\control
```

Відредагуйте `knowledge/conventions.md` (ключове з вашого `AGENTS.md`), `rules.json` (правила залежностей) і в `factory.json`
допишіть `"uatUrl": "https://<близнюк>.vercel.app"` у розділ `delivery`. Що означає кожен файл — `C:\pf\control\README.md`.

**3. Імпорт вимог.** Задача фабрики — з вимоги PM, з тими самими ID критеріїв:

```powershell
node C:\pf\factory\tools\ac-to-task.mjs --file C:\pf\twin\requirements\03-x.md `
  --ac AC-X-01,AC-X-02 --id x-db --holdout x-db --target C:\pf\twin --size small --out C:\pf\control\tasks\x-db.json
```

Для issue — `--issue власник/репо#12`, для таблиць чи блоків — `--format table|block` (`adapt-importer.md`). Потім **заповніть
п'ять `nonFunctionals`** у JSON: імпортер пише `TBD`, і фабрика таку задачу не прийме («TBD = не готово»). 1–3 критерії на задачу.
Не пишіть `>` замість `--out`: PowerShell 5.1 збереже файл у UTF-16, і фабрика його не прочитає.

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
ще раз — попередження «не мають Vitest-тесту» мають зникнути. Критерій лише з e2e фабрика не бачить: його доводить UAT.

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

**7. Затвердження людиною.** Фабрика працює лише з тим, що затвердила людина, і прив'язує затвердження до точного вмісту файлу:

```powershell
F approve config --as <ваше ім'я>
F approve intent x-db --as <ім'я PM або ваше>
```

Змінили `factory.json`, правила чи задачу — затвердьте знову.

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
обов'язкові перевірки ruleset; після злиття CI `db-deploy` застосує нові міграції до Supabase **близнюка**, Vercel розгорне прод.

**10. UAT після розгортання.**

```powershell
F uat <run-id> --url https://<близнюк>.vercel.app --as <ваше ім'я>
```

Фабрика чекає злиття PR, потім — поки `/api/health` близнюка покаже коміт злиття, і запускає ваш UAT з WS8:
`node scripts/uat/run.mjs --url … --grep "AC-X-01|AC-X-02"` — з тими самими налаштуваннями, що й `npm run uat` у WS8. Підсумок і шлях до звіту лягають
поруч із proof pack (`F proof <run-id>`) і коментарем у PR. FAIL → інцидент → клас змін понижено: наступна така зміна чекатиме людину.

## Пастки Windows

| Симптом | Причина | Що робити |
|---|---|---|
| `Filename too long` під час прогону | шлях store + `openspec/changes/archive/…` > 260 символів | `git config core.longpaths true` у близнюку і короткий store `C:\pf\store` |
| `spawn … ENOENT`, `doctor`: `agent … shell shim` | `claude` встановлено через npm | нативний `claude.exe`; або в `factory.json`: `"agent": { …, "executable": "C:\\Users\\<ви>\\.local\\bin\\claude.exe" }` |
| усі рядки TAP `not ok`, `tests-ran` FAIL | немає `node_modules` | `npm ci` у близнюку |
| `clean` FAIL | незакомічені або невідстежувані файли | закомітьте або додайте в `.gitignore` |
| хук відхилив `npm test`, `… \| tail` | політика: лише точні команди, без конвеєрів | будівельник сам переходить на `node scripts/factory-tap.mjs`; нічого робити не треба |
| прогін перервано (Ctrl+C, сон ноутбука) | процес фабрики зупинився посеред стадії | `F resume <run-id> --recover` продовжує його; або почніть новий `F run`. Аварійна зупинка всіх агентів — `F stop --as <ім'я>`, зняти — `F start --as <ім'я>` |

## Далі

- `twin.md` — як розгорнути близнюка; `adapt-importer.md` — як навчити імпортер формату вашого PM;
- `limits.md` — межі довіри й виміряна вартість; `cursor.md` — якщо ви працюєте в Cursor;
- upstream: `docs/design.md` (будова), `docs/principles.md` (35 принципів), `docs/trust.md` (модель загроз).
