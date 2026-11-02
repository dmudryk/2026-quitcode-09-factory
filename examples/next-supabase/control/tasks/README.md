# Задачі фабрики

Сюди кладіть задачі (`<id>.json`). Не пишіть їх вручну — згенеруйте імпортером з вимоги PM:

```
node <фабрика>/tools/ac-to-task.mjs --file <репо>/requirements/03-x.md --ac AC-X-01,AC-X-02 --id x-db \
  --holdout x-db --target <репо> --size small --out <control>/tasks/x-db.json
```

Потім заповніть п'ять `nonFunctionals` (імпортер пише `TBD`, і фабрика таку задачу не прийме), перевірте `protected`
і затвердьте намір: `node <фабрика>/bin/factory.mjs approve intent x-db --control <control> --store <store> --as <ім'я>`.
Розмір: без `--size` задача з 1–2 критеріями — `small`, з 3–5 — `medium`, і для `medium` фабрика спершу попросить
затвердити план. Тримайте задачі малими (1–3 критерії) — так простіше і будівельнику, і тому, хто читає proof pack.
