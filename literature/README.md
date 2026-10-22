# Литература и порядок чтения

[README](../README.md)

Ссылки сверены при подготовке **22 октября 2026 года**. API и документация меняются; перед занятием перепроверьте поддержку выбранной модели. Тексты курса — самостоятельное учебное изложение; внешние материалы не скопированы в репозиторий.

| Порядок | Материал | Уровень / время | Что искать | Где применить |
|---|---|---|---|---|
| 1 | [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents) | Начальный, 15–20 мин | Различие фиксированных процессов и выбора действий моделью; когда усложнение оправданно | Лекция 1, паспорт решения |
| 2 | [OpenAI: Function calling](https://developers.openai.com/api/docs/guides/function-calling) | Средний, 20 мин | Схемы функций, function_call, function_call_output, call_id, strict и tool_choice | Разбор API-адаптера |
| 3 | [Python: unittest](https://docs.python.org/3/library/unittest.html) | Начальный/средний, 20 мин | TestCase, assertEqual, assertRaises, subTest, discovery | Практики 2–3 |
| 4 | [OWASP: AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html) | Средний, 20 мин | Минимальные полномочия, проверка действий, тестирование агентных систем | Лекция 2, ограничения проекта |
| 5 | [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Средний, 25 мин | Разница между траекторией и конечным результатом, проверяемые испытания | План повторных LLM-прогонов |
| 6 | [OpenAI: Reasoning models](https://developers.openai.com/api/docs/guides/reasoning) | Продвинутый, 15 мин | Перенос reasoning-элементов и stateless-контекст | Расширение API-адаптера |

Первые три материала достаточны для основной практики; остальные — после занятия. Это источники по архитектуре и инструментам, а не доказательство качества конкретной учебной реализации.

Статья Anthropic 2024 года полезна для архитектурного разграничения, но сама отмечает изменения инструментария. Не переносите старые примеры API без сверки с текущей официальной документацией.

После чтения ответьте: какой факт из источника повлиял на ваше решение? Где именно в коде или тесте это отражено? Одного списка ссылок без связи с проектом недостаточно.
