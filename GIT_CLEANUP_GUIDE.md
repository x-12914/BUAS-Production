# 🎯 Database Cleanup - Git Commands Guide

## ✅ Completed Steps:
1. ✅ Database backup created
2. ✅ Mock devices removed from database (database was already clean)
3. ✅ `.gitignore` created with database file exclusions

## 📋 Git Commands to Run (In Your Git Bash)

### Option A: Run the automated script
```bash
bash untrack_databases.sh
```

### Option B: Run commands manually

**Step 1: Remove database files from Git tracking**
```bash
git rm --cached uploads.db
git rm --cached uploads.db.backup
git rm --cached instance/uploads.db
```

**Step 2: Add .gitignore to staging**
```bash
git add .gitignore
```

**Step 3: Check what will be committed**
```bash
git status
```

**Step 4: Commit the changes**
```bash
git commit -m "Remove database files from version control and add to .gitignore"
```

**Step 5: Push to remote**
```bash
git push origin penultimate
```

---

## 🎉 What This Achieves:

### Before:
- ❌ Database files tracked in Git
- ❌ Mock devices (device123, device456, etc.) in committed database
- ❌ Every clone/pull brought back mock data
- ❌ Database bloating the repository

### After:
- ✅ Database files ignored by Git
- ✅ Clean database with no mock devices
- ✅ Fresh database on every fresh clone
- ✅ No more mock devices returning
- ✅ Repository size reduced

---

## 📖 Understanding the Commands:

### `git rm --cached <file>`
- **What it does:** Removes file from Git's tracking
- **What it doesn't do:** Delete your local file
- **Result:** File stays on your computer but Git stops versioning it

### `.gitignore` entries:
```
*.db              # Ignores all .db files
*.db.backup*      # Ignores all backup database files
instance/*.db     # Ignores database files in instance folder
```

---

## 🔄 Future Workflow:

### Setting up fresh database:
```bash
# 1. Clone the repository (no database included)
git clone <repo-url>

# 2. Create fresh database tables
python create_rbac_tables.py

# 3. Create initial admin user
python create_initial_admin.py

# 4. Done! Clean database with only your admin user
```

---

## ⚠️ Important Notes:

1. **Team Members:** After you push, team members should:
   - Pull the changes
   - Delete their local `uploads.db` (if they want fresh start)
   - Run `create_rbac_tables.py` and `create_initial_admin.py`

2. **Your VPS:** You may want to:
   - Backup the production database first
   - Pull these changes
   - The production database won't be deleted (it's already on the server)

3. **No Data Loss:** This doesn't delete any data, just stops tracking the database in Git

---

## 🐛 Troubleshooting:

**If you get "fatal: pathspec 'uploads.db' did not match any files":**
- This means the file is already untracked (good!)
- Skip that command and continue with the next one

**If you want to undo before committing:**
```bash
git reset HEAD .gitignore
git checkout -- .gitignore
```

**If you've already committed and want to undo:**
```bash
git reset --soft HEAD~1
```

---

## ✅ Verification:

After committing, verify with:
```bash
# Should NOT show database files
git ls-files | grep .db

# Should show .gitignore
git ls-files | grep .gitignore
```

If `grep .db` returns nothing, you're good! 🎉
