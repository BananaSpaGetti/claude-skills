---
name: game-save-re
description: Reverse-engineer and patch a game save file — identify the container format, find the field, re-sign checksums and length prefixes, and verify in-game. Use whenever the task involves reading, decoding, editing, or patching a game's save data, trainer, or in-game currency/stats, on any engine (Unity, Godot, Ren'Py, RPG Maker, Flash/AIR, custom binary).
---

# Game save reverse engineering

## Before anything else: look for prior art

Search for someone who already did this game before deriving anything. One query for
`<game name> save editor` / `save format` / `decrypt` has repeatedly beaten hours of manual
derivation. Check ChapterCheats, xmodhub, gameplay.tips, Reddit, GitHub, and the game's modding
Discord. Only build your own analysis after that comes up empty.

Formats you have already solved should be recorded in memory — check the memory index before
starting from scratch. Add each newly solved format there so the next session does not
re-derive it.

## Order of work

1. **Locate the save.** Common roots on Windows:
   `%APPDATA%`, `%LOCALAPPDATA%`, `%USERPROFILE%\Saved Games`, `Documents\My Games`,
   and the Steam install under `C:\Program Files (x86)\Steam\steamapps\common\<game>`.
   Steam Cloud copies live under `steamapps\userdata\<id>\<appid>\remote`.

2. **Identify the container before editing bytes.** Check magic bytes, then test in this order:
   plain JSON/XML, zlib/gzip, base64, XOR with a short repeating key, AES with a key embedded in
   the game assembly, engine-specific binary (Godot `ConfigFile`/`var2bytes`, Unity
   `PlayerPrefs`/`BinaryFormatter`, Ren'Py pickle, RPG Maker LZString).
   For Unity/Mono games, decompiling `Assembly-CSharp.dll` usually shows the serializer outright —
   that is faster than guessing.

3. **Diff, don't guess.** Save, note the in-game number, change exactly one thing in game, save
   again, diff the two files. A field found by diffing is worth ten fields found by pattern
   matching.

4. **Write the patcher as a script, not by hand.** A Python script that decodes → edits → re-encodes
   is reusable and reviewable; a hex edit is neither. Use `py`, never bare `python`, on this
   machine.

## Rules that are not optional

- **Back up to a timestamped `.bak` before the first write.** Never patch in place first.
- **Check the game is not running** (`tasklist` on Windows, `pgrep`/`ps` elsewhere) before writing. Most engines rewrite the save on
  exit and will silently clobber the patch.
- **Re-sign and re-length after editing.** Many of these formats carry a checksum (CRC32, MD5,
  or a custom sum) or a length prefix. Get it wrong and the game rejects the save with no error
  message, or silently resets progress.
- **Verify by loading the game**, not by re-reading your own output. A patcher that round-trips
  cleanly can still produce a save the game refuses.

## Scope

Single-player and local saves are the normal case here. For anything with a server-authoritative
value or multiplayer state, say plainly that the client-side edit will be rejected or reverted
server-side, and what that costs (account flags, bans), before writing anything.
