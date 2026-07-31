# DLT (Deutsche Learn Tool) API

## AI configuration

Autofill, translation, grammar checking, and note formatting use Groq.
Configure at least one API key:

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b
```

`GROQ_MODEL` is optional and defaults to `openai/gpt-oss-120b`.
Multiple keys can be provided with `GROQ_API_KEYS` (comma-separated) or
`GROQ_API_KEY_2` and `GROQ_API_KEY_3`.

Restart the API after changing environment variables.
