# Drafts

Not listed in `.claude-plugin/marketplace.json`, so no installer sees them. They live here
because this is where they get worked on, not because they are queued for release.

An earlier version of this file said these were "written for a Thai-language audience and assume
context that will not transfer." That was wrong, and it was repeated in the top-level README until
2026-08-28. A codepoint sweep of the whole repository found ten Thai characters total, all in one
currency example in `thai-deliverable/SKILL.md`; `viral-promo-clip/SKILL.md` contains none. Both
are written in English.

`thai-deliverable` does encode Thai competition and committee norms in its structure rather than
its characters, which a character count cannot detect. That is a reason to leave it here, not a
reason to translate it: `game-save-re` was genericised for release and the author kept a diverged
private copy because the generic version was worse for real work.
