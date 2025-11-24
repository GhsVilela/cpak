# Quick Start Guide

Get Achievement Keeper running in 5 minutes!

## Choose Your Method

### 🐳 Docker (Recommended - Works Everywhere)

**Best for**: Production, NAS servers, anyone who wants it to "just work"

```bash
# 1. Clone
git clone https://github.com/GhsVilela/cpak.git
cd cpak

# 2. Start
docker compose up -d

# 3. Open browser
# Go to: http://localhost:8081
```

✅ **Done!** Data persists across restarts.

**What you get:**
- Frontend UI on port 8081 ← Open this
- Backend API on port 8080
- MongoDB database (internal)
- Automatic external API seeding
- Data persistence

---

### 🛠️ Dev Container (Best for Development)

**Best for**: Developers who want everything pre-configured

**No Go installation needed!**

```bash
# 1. Prerequisites
# - Install VS Code
# - Install Docker
# - Install "Dev Containers" extension in VS Code

# 2. Open in VS Code
code cpak

# 3. Reopen in Container
# Press F1 → "Dev Containers: Reopen in Container"

# 4. Start coding!
# Everything is ready: Go, MongoDB, all tools installed
```

✅ **Benefits:**
- No local Go installation required
- MongoDB included
- All development tools pre-installed
- Consistent environment across team

See [.devcontainer/README.md](.devcontainer/README.md) for full details.

---

### 💻 Local Development (Manual Setup)

**Best for**: Quick local runs without containers

**MongoDB is required:**
```bash
# 1. Start MongoDB
docker run -d -p 27017:27017 --name mongo mongo:7

# 2. Build and run
./scripts/build.sh
./cpak

# 3. Open: http://localhost:8081
```

---

## For NAS Users (TrueNAS Scale, Synology, etc.)

### Method 1: SSH (Easiest)

```bash
# 1. SSH into your NAS
ssh admin@nas-ip

# 2. Navigate to apps directory
cd /mnt/your-pool/apps

# 3. Clone repository
git clone https://github.com/GhsVilela/cpak.git
cd cpak

# 4. Start application
docker compose up -d

# 5. Access
# Open: http://nas-ip:8081
```

### Method 2: TrueNAS Scale UI

See detailed guide: [TRUENAS-INSTALL.md](TRUENAS-INSTALL.md)

---

## Verify Installation

```bash
# Check if containers are running
docker compose ps

# View logs
docker compose logs -f cpak

# Check health
curl http://localhost:8080/api/health

# Should return: {"status":"healthy","database":"mongodb"}
```

---

## First Use

1. **Open Frontend**: http://localhost:8081 (or your-server-ip:8081)

2. **Automatic Setup**: On first run:
   - Application fetches sample data from JSONPlaceholder API
   - Converts ~10 items to achievement format
   - Saves to MongoDB
   - You see achievements immediately!

3. **Try the API**:
   ```bash
   # Get all achievements
   curl http://localhost:8080/api/achievements
   
   # Create new achievement
   curl -X POST http://localhost:8080/api/achievements \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","description":"My achievement","points":50,"completed":false}'
   ```

---

## Common Operations

### Stop
```bash
docker compose stop
```

### Restart
```bash
docker compose restart
```

### View Logs
```bash
docker compose logs -f
```

### Update
```bash
git pull
docker compose down
docker compose up -d --build
```

### Backup Data
```bash
docker compose exec mongodb mongodump --out /data/backup
docker cp cpak-mongodb:/data/backup ./backup-$(date +%Y%m%d)
```

### Reset Database
```bash
# ⚠️ This deletes all data!
docker compose down -v
docker compose up -d
```

---

## Troubleshooting

### Can't connect to frontend
```bash
# Check if containers are running
docker compose ps

# Check logs
docker compose logs cpak
```

### Port already in use
Edit `docker-compose.yml` and change ports:
```yaml
ports:
  - "9090:8080"  # Change from 8080
  - "9091:8081"  # Change from 8081
```

### MongoDB connection failed
```bash
# Restart MongoDB
docker compose restart mongodb

# Check MongoDB logs
docker compose logs mongodb
```

### Fresh start
```bash
docker compose down -v
docker compose up -d
```

---

## Next Steps

- 📖 Read [README.md](README.md) for full documentation
- 🐳 See [DOCKER.md](DOCKER.md) for advanced Docker configuration
- 🖥️ Check [TRUENAS-INSTALL.md](TRUENAS-INSTALL.md) for NAS-specific guide
- 🐛 Report issues on [GitHub](https://github.com/GhsVilela/cpak/issues)

---

## Architecture

```
┌─────────────┐
│   Browser   │ ← You access this (port 8081)
└──────┬──────┘
       │
┌──────▼──────────────────────┐
│  CPAK Application Container │
│                             │
│  ┌────────────┐            │
│  │  Frontend  │ :8081      │
│  └────────────┘            │
│                             │
│  ┌────────────┐            │
│  │  Backend   │ :8080      │
│  └──────┬─────┘            │
└─────────┼──────────────────┘
          │
┌─────────▼──────────┐
│ MongoDB Container  │
│  (Internal only)   │
└────────────────────┘
```

---

## Key Features

✅ Full-stack Go application  
✅ RESTful API with CRUD operations  
✅ Progressive Web App (PWA) frontend  
✅ MongoDB persistence  
✅ External API integration  
✅ Docker containerized  
✅ Auto-start on boot (NAS)  
✅ Data backup/restore  
✅ Health monitoring  

---

## URLs

- **Frontend UI**: http://localhost:8081 ← **Main access**
- **Backend API**: http://localhost:8080
- **Health Check**: http://localhost:8080/api/health
- **API Docs**: See [README.md](README.md#api-endpoints)

---

## Support

- 📚 Documentation: [README.md](README.md)
- 🐛 Issues: [GitHub Issues](https://github.com/GhsVilela/cpak/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/GhsVilela/cpak/discussions)

---

**Happy Achievement Tracking! 🏆**
