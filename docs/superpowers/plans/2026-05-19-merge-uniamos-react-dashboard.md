# Merge uniamos React Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vanilla JS monolith dashboard in `uniamos-crm/` (the GitHub repo) with the React-based one from `uniamos/`, keeping the existing landing page, then push to main.

**Architecture:** The repo (`uniamos-crm/`) keeps its `index.html` landing page untouched. The `app.html`, `login.html`, and `reset-password.html` are replaced with redesigned versions from `uniamos/`. A new `src/` directory with all React/JSX components is added. Both projects already share the same Supabase instance — no credential changes needed.

**Tech Stack:** Vanilla HTML for shell pages, React 18 + Babel standalone (loaded via CDN), JSX components in `src/`, Supabase JS v2

---

## File Map

| Action | Path in `uniamos-crm/` | Source |
|---|---|---|
| Replace | `app.html` | `../uniamos/app.html` |
| Replace | `login.html` | `../uniamos/login.html` |
| Replace | `reset-password.html` | `../uniamos/reset-password.html` |
| Create | `src/` (whole dir) | `../uniamos/src/` |
| Keep | `index.html` | already in repo (+ pending edit) |
| Keep | `cargar_contactos.html` | already in repo |
| Keep | `schema.sql` | already in repo |
| Keep | `supabase/` | already in repo (identical in both) |
| Keep | `CLAUDE.md` | already in repo |

---

### Task 1: Stage the pending index.html change

There is an unstaged modification to `index.html` in the repo. Stage it so it's included in the upcoming commit.

**Files:**
- Modify (stage): `index.html`

- [ ] **Step 1: Verify the pending diff**

Run from `uniamos-crm/`:
```bash
git diff index.html
```
Read the output and confirm it looks intentional (landing page content change, not a corrupted file).

- [ ] **Step 2: Stage it**

```bash
git add index.html
```

- [ ] **Step 3: Verify staged**

```bash
git status
```
Expected: `index.html` appears under "Changes to be committed".

---

### Task 2: Replace app.html with React version

**Files:**
- Replace: `app.html` (was 4468-line vanilla JS monolith → now 36-line React shell)

- [ ] **Step 1: Copy app.html from uniamos**

Run from the working directory root (`/mnt/c/Users/lucas/Desktop/uniamos-crm/`):
```bash
cp uniamos/app.html uniamos-crm/app.html
```

- [ ] **Step 2: Verify the copy**

```bash
wc -l uniamos-crm/app.html
```
Expected: ~36 lines (React shell). If still 4468+ lines, something went wrong — re-run the copy.

- [ ] **Step 3: Stage**

```bash
git -C uniamos-crm add app.html
```

---

### Task 3: Replace login.html with redesigned version

**Files:**
- Replace: `login.html` (redesigned UI, same tabs: login / register / forgot-password)

- [ ] **Step 1: Copy login.html from uniamos**

```bash
cp uniamos/login.html uniamos-crm/login.html
```

- [ ] **Step 2: Verify tabs are present**

```bash
grep -c "switchTab\|panel-login\|panel-register\|forgot" uniamos-crm/login.html
```
Expected: 4 or more matches (confirms login, register, and forgot-password flows are all present).

- [ ] **Step 3: Stage**

```bash
git -C uniamos-crm add login.html
```

---

### Task 4: Replace reset-password.html with redesigned version

**Files:**
- Replace: `reset-password.html` (same logic, updated visual style with Inter Tight + oklch tokens)

- [ ] **Step 1: Copy reset-password.html from uniamos**

```bash
cp uniamos/reset-password.html uniamos-crm/reset-password.html
```

- [ ] **Step 2: Verify Supabase client reference is present**

```bash
grep "supabase\|sb\." uniamos-crm/reset-password.html | head -5
```
Expected: lines referencing Supabase auth (updateUser or similar). Confirms the auth logic wasn't stripped.

- [ ] **Step 3: Stage**

```bash
git -C uniamos-crm add reset-password.html
```

---

### Task 5: Copy the src/ directory (React components)

This is the most critical task — `app.html` is a shell that loads all JSX from `src/`.

**Files:**
- Create: `src/app.jsx`, `src/auth.jsx`, `src/data-layer.jsx`, `src/data.jsx`, `src/gmail-layer.jsx`, `src/inbox.jsx`, `src/inicio.jsx`, `src/inicio-v2.jsx`, `src/lead-detail.jsx`, `src/pipeline.jsx`, `src/sidebar.jsx`, `src/styles.css`, `src/supabase-client.jsx`, `src/tweaks-panel.jsx`

- [ ] **Step 1: Copy entire src/ directory**

```bash
cp -r uniamos/src uniamos-crm/src
```

- [ ] **Step 2: Verify all JSX files are present**

```bash
ls uniamos-crm/src/
```
Expected output (14 files):
```
app.jsx  auth.jsx  data-layer.jsx  data.jsx  gmail-layer.jsx
inbox.jsx  inicio-v2.jsx  inicio.jsx  lead-detail.jsx  pipeline.jsx
sidebar.jsx  styles.css  supabase-client.jsx  tweaks-panel.jsx
```

- [ ] **Step 3: Confirm Supabase URL in supabase-client.jsx matches the repo's existing URL**

```bash
grep "SUPABASE_URL\|supabase.co" uniamos-crm/src/supabase-client.jsx
```
Expected: `https://llleoqfeluptmmbqluab.supabase.co` — same as the existing repo. If different, stop and alert the user.

- [ ] **Step 4: Stage**

```bash
git -C uniamos-crm add src/
```

---

### Task 6: Verify locally before pushing

Serve the app locally and confirm the three pages load without JS errors.

- [ ] **Step 1: Start local server**

```bash
cd uniamos-crm && python3 -m http.server 3000
```
Leave running in background or a separate terminal.

- [ ] **Step 2: Open each page and check for errors**

Open in browser:
- `http://localhost:3000/` → landing page should render (marketing page, NOT a redirect)
- `http://localhost:3000/login.html` → redesigned login card with tabs (Login / Crear cuenta)
- `http://localhost:3000/app.html` → should redirect to `login.html` (because no auth session)

- [ ] **Step 3: Check browser console for errors**

Open DevTools (F12) → Console. Expected: no red errors. Warnings about React dev build are fine.

- [ ] **Step 4: Stop the server** (Ctrl+C in the terminal where it's running)

---

### Task 7: Commit and push to main

- [ ] **Step 1: Verify everything staged**

```bash
git -C uniamos-crm status
```
Expected staged files: `index.html`, `app.html`, `login.html`, `reset-password.html`, `src/` (14 files).

- [ ] **Step 2: Confirm nothing unwanted is staged**

Check the output of `git status` above. The following should NOT be staged:
- `node_modules/`
- `.superpowers/brainstorm/`
- `cons.md`, `objetivo.md`, `resumen.md`
- Image files like `Inicio.png`, `console.png`, `crmpipeline.png`, etc.

If any of those appear staged, unstage them:
```bash
git -C uniamos-crm restore --staged <file>
```

- [ ] **Step 3: Commit**

```bash
git -C uniamos-crm commit -m "$(cat <<'EOF'
feat: replace monolith dashboard with React architecture from uniamos redesign

Replaces the 4468-line vanilla JS app.html with a modular React setup.
Landing page (index.html) and Supabase backend unchanged.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify commit was created**

```bash
git -C uniamos-crm log --oneline -3
```
Expected: the new commit appears at the top.

- [ ] **Step 5: Push to main**

```bash
git -C uniamos-crm push origin main
```
Expected: `Branch 'main' set up to track remote branch 'main' from 'origin'.` or similar success message. This also pushes the 62 commits that were already ahead of origin.

- [ ] **Step 6: Confirm push succeeded**

```bash
git -C uniamos-crm log --oneline origin/main -3
```
Expected: same top commit as local `main`.
