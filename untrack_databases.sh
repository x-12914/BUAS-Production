#!/bin/bash
# Git commands to remove database files from version control
# Run these commands in Git Bash

echo "🔧 Removing database files from Git tracking..."
echo "=============================================="
echo ""

# Step 1: Remove database files from Git index (but keep local files)
echo "📋 Step 1: Removing files from Git index..."
git rm --cached uploads.db
git rm --cached uploads.db.backup
git rm --cached instance/uploads.db

echo ""
echo "✅ Files removed from Git tracking"
echo ""

# Step 2: Add .gitignore to staging
echo "📋 Step 2: Adding .gitignore to staging..."
git add .gitignore

echo ""
echo "✅ .gitignore added to staging"
echo ""

# Step 3: Show what will be committed
echo "📋 Step 3: Files staged for commit:"
git status --short

echo ""
echo "=============================================="
echo "🎯 Next step: Commit these changes"
echo ""
echo "Run this command:"
echo "  git commit -m \"Remove database files from version control and add to .gitignore\""
echo ""
echo "Then push to remote:"
echo "  git push origin penultimate"
echo ""
