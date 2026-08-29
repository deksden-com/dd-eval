# Проверка канонического входа PROTOCOLIZE — ZCode / GLM-5.3-Flash

Проверено 29 августа 2026 года для альтернативного Subject harness `zcode-acp`.

- `SPECIFY` завершён штатно после одной паузы HITL и продолжения того же Work.
- Итог `specify-result.json` валиден: 11 требований и 8 критериев приёмки; следующий переход — `start_protocolize`.
- Снимок создан детерминированной командой `dd-flow run snapshot create` до старта `PROTOCOLIZE`.
- Каноническая сессия `sess_322fa57f-d744-4d1c-bccd-26475e7a44e1` имеет подтверждённый профиль `builtin:zai-coding-plan / GLM-5.3-Flash / high / yolo`; защищённая checkpoint-сессия `sess_02758b72-175b-45e7-a688-60aa2a0619a3` не использовала инструментов.

Решение: принять checkpoint как корректную исходную точку PROTOCOLIZE для ZCode. Его последующие фокусные запуски используют deterministic replay: восстанавливают этот RUN-снимок и создают чистую ZCode-сессию с сгенерированным packet стадии, без фиктивного нативного fork.
