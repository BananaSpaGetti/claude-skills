---
name: thai-deliverable
description: Produce a Thai business or competition deliverable that goes to judges, a committee, or a client — business plans, marketing plans, pitch decks, budget breakdowns, appendices. Use when the output is a document a human will grade or decide on, not internal notes.
---

# Thai deliverable

The audience is a judge, a committee, or a client. They read fast, compare against other
submissions, and stop at the first thing that looks unfinished.

## Language

Body text in Thai, plain and direct — no padding, no self-praise. Technical and financial terms
stay in English inside the Thai sentence: `ROMI`, `ROAS`, `CAC`, `LTV`, `Conservative Scenario`,
`Revenue Projection`, `Break-even`. Do not invent Thai translations for standard business terms;
transliterate or keep the English.

File names, folder names, and commit messages stay in English even though the content is Thai.

## Structure

Every deliverable of this kind carries the same skeleton. Do not skip a section because it is
tedious — a missing section is the first thing a judge notices:

1. Problem — stated in one paragraph, with a number in it
2. Solution / concept
3. Market sizing, with the method shown (top-down and bottom-up, not one)
4. Business or campaign model
5. Financials — assumptions listed separately from results, so a judge can attack the assumption
   without discarding the model
6. Scenarios — at minimum Conservative / Base / Aggressive, with what changes between them
7. Timeline and responsibilities
8. Appendix — sources, raw calculations, survey instruments, anything cited in the body

## Numbers

- Every number in the body traces to an assumption in the appendix. If it cannot be traced,
  either derive it or delete it.
- State the unit and the period: `฿5,000,000 / 12 เดือน`, not `5 ล้าน`.
- Where a competitor benchmark is used, name the source and the year.
- Do not present a projection without the assumption that drives it on the same page.

## Before handing it over

Run these checks and report what failed rather than fixing silently:

- Does every section above exist?
- Does every figure in the body appear in the appendix?
- Any leftover placeholder, TODO, or lorem text?
- Consistent terminology throughout — one term per concept, not three synonyms
- Consistent number formatting and currency symbols
- If it is a slide deck: no overlapping text, no font smaller than the body baseline,
  brand colors and fonts as specified for that project (see the project's own CLAUDE.md)

## Working style for these projects

Split files by owner when more than one tool or person is producing content, so the work does not
get mixed up. Write down what the user actually asked for in a project note — these deliverables
run over many sessions and the original brief drifts.
