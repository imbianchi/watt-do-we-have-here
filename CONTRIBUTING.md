# Contributing

Thanks for considering a contribution. This project is small on purpose — keep changes focused, surgical, and pragmatic.

## Running locally

### Backend
```bash
cd backend
cp .env.example .env
# Generate secrets:
python -c "import secrets;print('SECRET_KEY=' + secrets.token_hex(32))" >> .env
python -c "from cryptography.fernet import Fernet;print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())" >> .env
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Tests
```bash
cd backend
pip install pytest pytest-asyncio
python -m pytest tests/ -v
```

## Branches

- `main` — production-ready, protected
- `develop` — integration branch for upcoming releases
- Feature work: `feature/<short-description>`
- Bug fixes: `fix/<short-description>`
- Docs only: `docs/<short-description>`

## Pull requests

Before opening a PR:

- [ ] Tests pass locally (`pytest` for backend, `npm run build` for frontend)
- [ ] No secrets committed — `.env`, keys, tokens, database dumps stay out of git
- [ ] If you touched the API, update `README.md` or in-code docs
- [ ] One concern per PR — separate refactors from features

PRs are reviewed for: correctness, security (input validation, ownership checks), and consistency with existing patterns. Big architectural changes should start with an issue first.

## Code style

- **Python**: standard library types preferred over heavy ORM abstractions. Type hints on public functions. Async everywhere — no sync DB calls. If you want a formatter, use [Black](https://black.readthedocs.io/) (line length 100).
- **JavaScript / JSX**: 2-space indent, no semicolons in `*.jsx` files, components in PascalCase. If you want a formatter, use [Prettier](https://prettier.io/).
- **No comments explaining *what* the code does** — let the code speak. Only comment on *why* when the reason isn't obvious from context (a workaround, a non-obvious constraint, a future-self trap).
- **Don't add files with `// TODO` or `pass` stubs** — finish what you start or open an issue instead.

## What we welcome

- Bug fixes with reproduction steps
- More device drivers (the Shelly-specific glue lives in `collector.py` — abstracting it is welcome)
- Better tests, especially for the polling loop and concurrent multi-device behaviour
- Accessibility improvements
- Translations / i18n scaffolding
- A scheduler that uses our backend (not the Shelly's) for cross-device coordination

## What we won't merge

- Major rewrites without prior discussion
- "Cleanup" PRs that touch hundreds of unrelated lines
- Anything that requires breaking the local-first / self-host story
- Cloud-provider lock-in (the app must run on a laptop with `npm` and `python` and nothing else)

## Security

If you find a security issue, please **don't open a public issue**. Email the maintainer or open a private security advisory on GitHub instead.
