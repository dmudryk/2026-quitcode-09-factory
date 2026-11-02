# Близнюк проєкту: окреме розгортання для фабрики

**Близнюк** — копія вашого проєкту з **власним** репозиторієм GitHub, **власним** проєктом Supabase і **власним** проєктом Vercel.
Фабрика працює тільки в ньому. Навіщо: у близнюку фабрика повністю автономна — сама зливає PR, зокрема з міграціями, а злиття
в `main` запускає `db-deploy` у базу. Окреме розгортання гарантує, що автономне злиття не зачепить прод основного проєкту, а ви
зможете порівняти дві реалізації одного зрізу: звичайну (основний репо) і фабричну (близнюк).

Ніколи не додавайте основний репозиторій як `target` фабрики і не копіюйте в близнюка секрети основного проєкту.

## 1. Репозиторій

1. Створіть новий репозиторій, наприклад `<ви>/<проєкт>-factory` (публічний або приватний).
2. Перенесіть у нього `main` основного репо: `git clone <основний> C:\pf\twin`, `git -C C:\pf\twin remote set-url origin <url близнюка>`,
   `git -C C:\pf\twin push -u origin main`. Історія збережеться — так зручніше порівнювати.
3. У README близнюка — один рядок: «Близнюк для фабрики (бонус WS9); прод — окремий».
4. Settings → General → Pull Requests: увімкніть **Allow auto-merge** і **Automatically delete head branches**.

## 2. Supabase

1. Новий проєкт у Supabase (той самий регіон, що й основний). Пароль бази — одразу в менеджер паролів.
2. Налаштування Auth — як в основному: `supabase link --project-ref <ref близнюка>`, потім `supabase config push`
   (реєстрація вимкнена, підтвердження пошти вимкнене — як у шаблоні курсу).
3. **Міграції вручну не застосовуйте.** Вони потрапляють у базу лише через CI `db-deploy` після злиття в `main`. Перший
   запуск — вручну з Actions (`workflow_dispatch` з `include_seed`), щоб застосувати всі міграції й seed.
4. Демо-користувачі — як в основному проєкті (`npm run users:demo` з `.env.local` близнюка).

## 3. Vercel

1. Новий проєкт Vercel, підключений до репозиторію близнюка. **Framework Preset: Next.js** (якщо створювати з CLI, Vercel може
   поставити «Other», і перша збірка впаде з «No Output Directory named public»).
2. Змінні середовища — значення **близнюка**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production і
   Preview), `SUPABASE_SECRET_KEY` (лише Production).
3. Захист деплоїв (Vercel Authentication) для проду вимкніть, щоб UAT і `/api/health` були доступні.
4. Перевірка: `https://<близнюк>.vercel.app/api/health` → `{"ok":true,"sha":"<коміт>",…}`. Саме `sha` фабрика порівнює з
   комітом злиття перед UAT.

## 4. Секрети

- Локально: лише `.env.local` близнюка (у `.gitignore`). Фабрика не дає будівельнику читати `**/.env*`.
- GitHub: environment `production` (лише гілка `main`) із секретом `SUPABASE_DB_URL` (рядок підключення session pooler) — його
  читає `db-deploy`.
- Vercel: змінні з п. 3.
- Секрети ніколи не потрапляють у задачі, holdouts, proof pack чи текст PR.

## 5. Ruleset з обов'язковими перевірками

Settings → Rules → Rulesets → New branch ruleset для `main`:

- **Require a pull request before merging**, 0 обов'язкових затверджень (затверджує фабрика своїми воротами і рівнем автономії);
- **Require status checks to pass**: ті самі перевірки, що в основному проєкті (у шаблоні курсу — `spec`, `app`, `conformance`,
  `db-check`);
- **Block force pushes**, **Restrict deletions**.

Це головна сітка безпеки після автономного злиття: CI заново проганяє тести, лінтер, збірку і порядок міграцій з чистого
checkout, і GitHub не зіллє PR, доки вони не зелені.

## 6. Автозлиття у фабриці

У `C:\pf\control\factory.json`:

```json
"delivery": { "remote": "origin", "base": "main", "mergeMethod": "squash", "autoMerge": "auto-tier",
              "healthPath": "/api/health", "uatUrl": "https://<близнюк>.vercel.app" }
```

- `auto-tier` — автозлиття лише для прогонів з рівнем `auto` (у прикладі control — усі класи змін, міграції теж);
- `after-approval` — також після затвердження людиною, якщо рівень його вимагав;
- `never` — фабрика відкриває PR, зливає людина.

`F doctor` перевіряє вхід у `gh` і наявність remote; `F deliver <run-id>` відкриває PR і вмикає автозлиття;
`F uat <run-id> --url …` перевіряє результат на проді близнюка (`README.md`, кроки 9–10).

## Перевірка близнюка перед першим прогоном

- [ ] `main` близнюка зелений у CI; прод відповідає на `/login` і `/api/health` (`db: ok`);
- [ ] Allow auto-merge увімкнено, ruleset з обов'язковими перевірками активний;
- [ ] `scripts/factory-tap.mjs` закомічено в `main`, `node scripts/factory-tap.mjs --checks` — усе `ok`;
- [ ] `npm run uat -- --url https://<близнюк>.vercel.app` проходить на наявних критеріях (UAT з WS8 працює на близнюку).
