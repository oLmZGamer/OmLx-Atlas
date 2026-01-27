# OmLx Atlas - New Features & Usage Guide

## 1. Programs View

### What Changed?
Previously, the **Programs** section showed both `launcher: 'desktop'` and `launcher: 'manual'` items. Now it's cleaner:

**Programs view now filters by `itemType: 'app'`**

### What Does This Mean?
- All manually added desktop applications (Spotify, Discord, Discord, etc.) will appear in Programs
- Manual game additions are treated as games by default, not programs
- You can override any game to be treated as an app (future feature in modal)

### Benefits
- Clear separation between games and utilities
- Games stay in "All Games" view for easier browsing
- Programs section truly dedicated to applications

---

## 2. Your Taste Analytics

### Accessing Your Taste
1. Click **"Your Taste"** in the left sidebar
2. View your gaming profile with:
   - **Top 3 Most Played Games** - Shows your favorite games by total playtime
   - **Favorite Platforms** - Shows which launchers you use most

### What You'll See
```
#1 Game Name
   24.5 hours

#2 Another Game
   18.3 hours

#3 Third Game
   12.0 hours

---

Platform Stats
Steam       87 hours (25 games)
Epic Games  34 hours (12 games)
etc.
```

### Interactive Features
- Click any game to open its details modal
- Hover over launchers to see precise stats
- Playtime auto-formats: "0 minutes" → "2.5 hours"

### Limitations
- Only counts playtime tracked by Atlas (not loaded from launcher APIs)
- Steam API integration coming soon - will show real launcher playtime

---

## 3. Feedback Button

### Where Is It?
1. Click the **Settings** button (gear icon) at top right
2. Scroll to the bottom
3. Find **"Help & Feedback"** section
4. Click **"Send Feedback"** button

### What Happens?
Your default web browser opens the OmLx Studios contact page:
- **URL:** `https://omlxstudios.xyz/#contact`
- **Direct to:** Contact form where you can submit:
  - Bug reports
  - Feature requests
  - General feedback
  - Hello messages!

---

## 4. Stats Source Indicators

### What Are Source Labels?
Each game's stats now shows **where the data comes from:**

When you hover over these values in a game's detail modal:
- ⏱️ **Time Played** - Tooltip shows source
- 📅 **Last Played** - Tooltip shows source
- 🏆 **Achievements** - Tooltip shows source

### Source Types

| Source | Meaning | Data Reliability |
|--------|---------|------------------|
| **Launcher API** | Synced from official launcher (Steam, Epic, etc.) | Accurate, official |
| **Atlas Tracked** | Tracked by OmLx Atlas while playing | Accurate, app-based |
| **Unknown** | No data available (new game, or API unavailable) | N/A |

### Current Status by Launcher
- **Steam** - Ready for API integration (requires API key)
- **Epic Games** - No public API available
- **Xbox** - Requires Xbox Live authentication
- **EA/Ubisoft/GOG** - Requires developer access

### How to Trigger Stats Sync (Future)
When Steam API is configured:
1. Open any Steam game modal
2. Click **"Refresh Stats"** button
3. Atlas will query Steam servers for:
   - Actual playtime (from your Steam profile)
   - Achievement progress
   - Last played date

---

## 5. Game vs App Classification

### Automatic Classification
Games are automatically classified:

| Launcher | Default Type |
|----------|--------------|
| Steam | Game |
| Epic Games | Game |
| Xbox | Game |
| EA App | Game |
| Ubisoft | Game |
| GOG | Game |
| Desktop (manual) | App |
| Manual scan | App |

### Overriding Classification (Future)
In a game's modal (coming soon):
- Option to change `itemType` from "Game" to "App"
- Useful for: Visual novels, software tools, genre-ambiguous titles
- Your override is preserved on re-scans

---

## 6. False Positive Prevention

### What Got Better?

Previously, the scanner could pick up:
- ❌ Windows utilities (`vcredist`, `dotnet` installers)
- ❌ Crash reporter tools
- ❌ Uninstall programs
- ❌ Random helper EXEs
- ❌ Microsoft Store framework apps

**Now BLOCKED by:**
1. **System folder blocking** - Doesn't scan `C:\Windows`, `C:\ProgramData`
2. **GUID detection** - Rejects mystery hexadecimal names
3. **Blacklist patterns** - 50+ known non-game executables
4. **Numeric heuristics** - Rejects files that are >40% numbers
5. **Alphabetic scoring** - Requires 60% letters (vs random chars)
6. **Whitelist fast-pass** - Known good apps included immediately

### Safe Scan Paths
Deep scan now ONLY searches:
- `C:\Games\`
- `C:\Game\`
- `C:\My Games\`
- `D:\SteamLibrary\steamapps\common\`
- `D:\Program Files\Epic Games\`
- And similar dedicated game folders

**Dangerous paths BLOCKED:**
- `C:\Windows\`
- `C:\Program Files\` (raw, without epic/steam subfolder)
- `C:\ProgramData\`
- System folders

---

## 7. Data Preservation on Re-Scan

### What Gets Preserved?
When you re-scan your games, these user customizations are **NEVER overwritten:**

✓ Favorite status (heart/unfavorite)
✓ Custom cover images you uploaded
✓ Custom background images
✓ Your itemType overrides (game ↔ app)
✓ Manual playtime edits (if you corrected tracking)

### What Gets Updated?
These may be refreshed from the launcher or file system:
- Game name (if you renamed the folder)
- Executable path (if you moved the game)
- Cover art from metadata search

---

## 8. Smart Deduplication

### How It Works
If the same game appears in multiple launchers:
- **Example:** Elden Ring on both Steam AND Xbox Game Pass
- **Result:** Kept as one entry (Steam version prioritized)
- **Reason:** Launcher priority ranking prevents duplicate entries

### Launcher Priority
Games are ranked by launcher preference:
1. **Steam** (highest - most data)
2. **Epic Games**
3. **Xbox**
4. **EA App**
5. **Ubisoft**
6. **GOG**
7. **Desktop**
8. **Manual** (lowest)

If a game exists in both Steam and Epic, **Steam wins** and stays in the library.

---

## 9. Migration of Existing Data

### Automatic on First Launch
When you first launch the updated Atlas:
1. ✓ Reads existing `games.json`
2. ✓ Adds missing `itemType` field to each game
3. ✓ Adds missing `statsSource` field
4. ✓ Saves updated database
5. ✓ Logs migration status to console

**You won't notice anything - happens automatically!**

### What If Something Goes Wrong?
If you have issues, check:
1. **Backup:** Your games.json is backed up by Electron automatically
2. **Console logs:** Look for migration messages
3. **Feedback:** Report issues via the Feedback button

---

## 10. Future Roadmap

### Coming Soon (Priority)
- [ ] Steam Web API integration
  - Fetch actual playtime from Steam
  - Sync achievements
  - Update "Last Played"
  
- [ ] Settings page for Steam credentials
  - API Key input
  - SteamID64 input
  - Test connection button

- [ ] Per-game itemType toggle
  - Modal button to switch Game ↔ App
  - Persists through re-scans

### Medium Term
- [ ] Epic Games local data parsing
- [ ] Xbox Live authentication flow
- [ ] Custom user-managed genres/tags
- [ ] Playtime statistics export (CSV)
- [ ] Gaming trends charts

### Long Term
- [ ] Cloud sync (if server available)
- [ ] Browser history as alt playtime source
- [ ] AI genre tagging (trained, not magic)
- [ ] Social features (compare taste with friends)

---

## 11. Troubleshooting

### Q: Why is [Utility] appearing as a game?
**A:** Report it! The blacklist can be expanded. Click Feedback to report.

### Q: How do I remove something from Programs?
**A:** 
1. Open the game modal
2. Click the delete icon (currently: hard delete)
3. Or manually change `itemType` to `"game"` (future UI)

### Q: Stats show "Unknown" for my Steam game?
**A:** 
- Steam API integration not yet live
- Once configured, click "Refresh Stats" to sync
- Check Feedback button for status updates

### Q: Can I manually set playtime?
**A:** Not in current UI, but the data structure supports it. Toggle upcoming.

### Q: Does "Your Taste" include shared account playtime?
**A:** 
- No - only tracks individual Atlas sessions
- Steam API (when ready) will pull from official Steam profile
- More accurate than session tracking

---

## 12. Quick Start Checklist

- [ ] Update to this new version
- [ ] Run "Scan for Games" (look for false positives)
- [ ] Check "Your Taste" - see your gaming profile
- [ ] Try the Feedback button - test the link
- [ ] Hover stats in game modal - see source indicators
- [ ] Look in Programs view - should only show apps now

---

## Questions or Issues?

Use the **Feedback button** in Settings → Help & Feedback section to:
- Report bugs
- Request features
- Ask questions
- Share your "Your Taste" profile!

**URL:** https://omlxstudios.xyz/#contact
