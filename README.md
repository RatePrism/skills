# rateprism-skill

This repository is a skills source repo that works with the `skills` CLI from [`vercel-labs/skills`](https://github.com/vercel-labs/skills).
Source repository: [`RatePrism/skills`](https://github.com/RatePrism/skills.git).

## 1) Install a skill from this repo

Run from any directory:

```bash
npx skills add https://github.com/RatePrism/skills.git --list
```

Install one skill to specific agents:

```bash
npx skills add https://github.com/RatePrism/skills.git \
  --skill hotel-inquiry \
  -a cursor \
  -a codex
```

Install all skills to all detected agents:

```bash
npx skills add https://github.com/RatePrism/skills.git --all
```

## 2) Repo layout

`skills` CLI can discover skills in `skills/`, so this repository uses:

```text
skills/
  hotel-inquiry/
    SKILL.md
```

## 3) Daily commands

List installed skills:

```bash
npx skills list
```

Update installed skills:

```bash
npx skills update -y
```

Remove one installed skill:

```bash
npx skills remove hotel-inquiry -y
```

## 4) Add a new skill

Create a new skill scaffold in this repository:

```bash
npx skills init skills/my-new-skill
```

Then edit:

- `skills/my-new-skill/SKILL.md`

Minimum required frontmatter fields:

- `name`
- `description`
