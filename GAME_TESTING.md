# Game Completion Safeguards - Testing & Monitoring

This directory contains scripts to test and monitor the game completion safeguards implemented to prevent games from being stuck in ACTIVE status.

## 🧪 Test Scripts

### 1. Comprehensive Test Suite
**File:** `test-game-safeguards.ts`

Tests all safeguards including:
- ✅ Aviator 60-second timeout
- ✅ Database persistence of crash points
- ✅ Error handling with automatic refunds
- ✅ Cron job cleanup verification
- ✅ Database status checks

**Run:**
```bash
# Using the shell wrapper (recommended)
./test-game-safeguards.sh

# Or directly
npx tsx test-game-safeguards.ts
```

**Duration:** ~70-80 seconds (includes 70s wait for timeout)

**What it tests:**
1. **Dice Game** - Error handling with invalid stakes
2. **Coin Game** - Quick game completion
3. **Aviator Timeout** - Places bet, waits 70s, verifies cleanup
4. **Database Status** - Checks for stuck games, recent timeouts, errors

**Expected Output:**
- ✅ All games complete successfully
- ✅ Aviator game times out and is marked `CANCELLED_BY_TIMEOUT`
- ✅ Locked funds are refunded
- ✅ No games stuck in database

---

### 2. Real-Time Monitoring Dashboard
**File:** `monitor-games.ts`

Live dashboard that refreshes every 5 seconds showing:
- 📊 Game status breakdown
- 🟢 Active games with age and expiry time
- ⏱️ Recent timeouts (last 5 minutes)
- ❌ Recent errors (last 5 minutes)
- 🚨 Stuck game detection (>10 minutes)

**Run:**
```bash
npx tsx monitor-games.ts
```

**Usage:**
- Leave running in a separate terminal while testing
- Watch for cron cleanup in real-time
- Monitor game statuses during development
- Press `Ctrl+C` to stop

---

## 📊 Manual Database Queries

### Check game status distribution:
```bash
psql -d potta -c "SELECT status, COUNT(*) FROM \"Game\" GROUP BY status ORDER BY COUNT(*) DESC;"
```

### Find stuck games (>10 min):
```bash
psql -d potta -c "SELECT id, mode, stake, status, \"createdAt\", \"expiresAt\" FROM \"Game\" WHERE status = 'ACTIVE' AND \"createdAt\" < NOW() - INTERVAL '10 minutes';"
```

### Recent timeout games:
```bash
psql -d potta -c "SELECT id, mode, stake, \"updatedAt\" FROM \"Game\" WHERE status = 'CANCELLED_BY_TIMEOUT' ORDER BY \"updatedAt\" DESC LIMIT 10;"
```

### Check expired games awaiting cleanup:
```bash
psql -d potta -c "SELECT id, mode, stake, \"expiresAt\" FROM \"Game\" WHERE status = 'ACTIVE' AND \"expiresAt\" < NOW();"
```

---

## 🔍 Monitoring Cron Jobs

The cleanup service runs automatically. To verify it's working:

### 1. Check Server Logs
Look for these log messages in your `npm start` terminal:

```
[GameCleanupService] Found X expired games to clean up
[GameCleanupService] Cleaning up expired game aviator_xxx...
[GameCleanupService] Refunded 10 GHS to player xxx
[GameCleanupService] Game xxx marked as CANCELLED_BY_TIMEOUT
```

### 2. Watch for Cron Execution
The cleanup service logs activity every minute (when there are expired games):
- **Every Minute:** Expired game cleanup
- **Every 5 Minutes:** Orphaned game cleanup

### 3. Test Cron Manually
Place an Aviator bet and watch the logs:
```bash
# Terminal 1: Monitor dashboard
npx tsx monitor-games.ts

# Terminal 2: Server logs
# Already running with 'npm start'

# Terminal 3: Place bet and watch
npx tsx test-game-safeguards.ts
```

---

## 🎯 Success Criteria

After running the tests, you should see:

✅ **No stuck games** in ACTIVE status >10 minutes
✅ **Timeouts working** - Games expire after 60 seconds
✅ **Cleanup running** - Cron logs show game cleanup
✅ **Refunds issued** - Locked funds returned on timeout
✅ **Error handling** - Failed games get refunded and cancelled
✅ **Database clean** - No expired ACTIVE games lingering

---

## 🚨 Troubleshooting

### Cron jobs not running?
- Check `ScheduleModule.forRoot()` is in `app.module.ts`
- Verify `GameCleanupService` is in `game.module.ts` providers
- Restart the server

### Games not timing out?
- Check `expiresAt` field is set when game is created
- Verify `crashPoint` is persisted in database
- Check server time vs database time

### Locked funds not refunded?
- Check `WalletService.rollbackLock()` is working
- Verify ledger entries are created
- Check for transaction rollback errors in logs

### Tests failing?
- Ensure you have valid login credentials
- Check server is running on `http://localhost:3000`
- Verify you have sufficient balance for tests

---

## 📝 Notes

- **Test Duration:** The full test suite takes ~70 seconds because it waits for the Aviator timeout
- **Database Impact:** Tests create real games and transactions
- **Cleanup Frequency:** Cron runs every minute for expired games, every 5 minutes for orphaned games
- **Timeout Duration:** Currently set to 60 seconds for Aviator games
- **Monitor While Testing:** Run `monitor-games.ts` in a separate terminal to see real-time status updates

---

## 🔄 Continuous Monitoring

For production, consider:
1. Setting up alerting for stuck games (>10 min)
2. Tracking `CANCELLED_BY_TIMEOUT` rate 
3. Monitoring `CANCELLED_BY_ERROR` for recurring issues
4. Periodic database cleanup of old cancelled games
5. Dashboard for game completion rates
