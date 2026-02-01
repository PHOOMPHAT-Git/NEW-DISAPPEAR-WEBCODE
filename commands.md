# Disappear v1.2 - Commands Reference

## Development

### Install Dependencies
```bash
npm install
```

### Start Server (Production)
```bash
npm start
```

### Start Server (Development with auto-reload)
```bash
npx nodemon app.js
```

---

## Git Commands

### Initial Setup (First Time)
```bash
git init
git remote add origin https://github.com/PHOOMPHAT-Git/NEW-DISAPPEAR-WEBCODE.git
```

### Check Status
```bash
git status
```

### Add Files to Staging
```bash
# Add all files
git add .

# Add specific file
git add filename.js
```

### Commit Changes
```bash
git commit -m "your commit message"
```

### Push to GitHub
```bash
# First push (set upstream)
git push -u origin main

# Normal push
git push
```

### Pull from GitHub
```bash
git pull
```

### Create New Branch
```bash
git checkout -b branch-name
```

### Switch Branch
```bash
git checkout branch-name
```

### Merge Branch
```bash
git checkout main
git merge branch-name
```

---

## Quick Deploy Workflow

### Full upload to GitHub (New changes)
```bash
git add .
git commit -m "update: description of changes"
git push
```

### Clone project to new machine
```bash
git clone https://github.com/USERNAME/REPO_NAME.git
cd REPO_NAME
npm install
```

---

## Environment Setup

### Create .env file
```bash
# Copy from example or create new
cp .env.example .env
```

---

## Database (MongoDB)

### Start MongoDB (Local)
```bash
mongod
```

### Connect to MongoDB Shell
```bash
mongosh
```

---

## Useful Commands

### Check Node.js version
```bash
node -v
```

### Check npm version
```bash
npm -v
```

### Clear npm cache
```bash
npm cache clean --force
```

### Remove node_modules and reinstall
```bash
rm -rf node_modules
npm install
```