# Официальные источники

Проверено 30 октября 2026 года.

- [Карточка VoiceDesign на использованной ревизии](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/blob/5ecdb67327fd37bb2e042aab12ff7391903235d3/README.md): модель Qwen3-TTS-12Hz-1.7B-VoiceDesign; `license: apache-2.0`.
- [Лицензия официального репозитория](https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE): Apache License Version 2.0. Её неизменённая копия приложена в `LICENSE-QWEN.txt`. При распространении модели или кода следует соблюдать условия этой лицензии.
- [Voice Design then Clone](https://github.com/QwenLM/Qwen3-TTS#voice-design-then-clone): документированный способ сохранить синтетический WAV, создать `voice_clone_prompt` через Base и использовать его для следующих реплик персонажа.
- [Карточка Qwen3-TTS Base](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/blob/main/README.md): `license: apache-2.0`; описание работы с эталонной записью.

Использован пакет `qwen-tts` 0.1.1; его метаданные также указывают Apache-2.0. Проверка источников не включала загрузку весов Base или испытание сохранения тембра между главами. Локальная генерация использует собственные вычислительные ресурсы вместо платного сервиса; лицензии модели и кода сами по себе не устанавливают исключительное право на каждый получившийся WAV.
