# Heloword

A multilingual vocabulary learning app that uses spaced repetition to help you build lasting memory. Study English, Japanese, German, and Chinese words — then let the review system remind you exactly when to revisit them before you forget.

🌐 **Live:** https://www.heloword.com

---

## Features

### Vocabulary Study
- **System word lists** — curated vocabulary sets for English (9,000+ words), Japanese (N5–N1 JLPT), Japanese verbs, German, and Chinese
- **Custom vocabulary groups** — create your own word lists from scratch, add words manually, or save words from system lists with a heart button
- **AI-powered word fill** — enter a word and let AI suggest the meaning, Chinese translation, and a sample sentence
- **Word preview** — browse a group's word list before quizzing, with the option to hide meanings and reveal them one by one to test yourself
- **Hide/show meanings** — toggle visibility of translations on any word list to self-test before starting a quiz

### Quiz
- **Typing quiz** — type the correct answer to advance; wrong answers go back into the queue until correct
- **Auto-pronounce** — words and translations are read aloud automatically as you study
- **Speed & volume controls** — adjust playback to your preference
- **Resume support** — partially completed sessions can be picked up where you left off

### Pronunciation
- Native browser text-to-speech for all supported languages
- Correct language detection per word (Japanese, German, English, Chinese)
- Tap any speaker icon on word lists or quiz cards to hear pronunciation on demand

### Spaced Repetition (Forgetting Curve)
See the [How the Review System Works](#how-the-review-system-works) section below.

### Social
- **Online presence** — see who else is studying; toggle your own online visibility at any time
- **Friends** — add friends by username, set custom nicknames for each friend
- **Chat** — send messages to friends; messages are delivered even when the recipient is offline
- **Vocab sharing** — share a custom vocabulary group with a friend; they receive it in their inbox and can accept it into their own library

### Accounts & Sync
- **Guest mode** — start studying immediately without signing in; all progress is saved locally in the browser
- **Google sign-in** — sync progress across devices; history is stored in the backend
- **Dark mode** — automatic or manual toggle

---

## How the Review System Works

Heloword's review feature is built on the **Ebbinghaus Forgetting Curve**: memory retention naturally fades over time, but each successful review at the right moment strengthens retention and extends how long you'll remember the material.

### The Core Idea

Every time you complete a quiz on a word group, a review timer starts. The system tracks *when* you reviewed and *whether you reviewed on schedule*. If you review on time, the next interval grows longer. If you miss the window, the clock resets.

### 7 Review Levels

There are 7 levels. Each level determines how long you wait before the next review:

| Level | Wait before next review |
|-------|------------------------|
| L1    | 20 minutes             |
| L2    | 1 hour                 |
| L3    | 8 hours                |
| L4    | 1 day                  |
| L5    | 2 days                 |
| L6    | 6 days                 |
| L7    | 31 days                |

When you reach L7 and keep reviewing on schedule, you stay at L7 — one review per month to maintain long-term retention.

### Grace Window

You don't have to review at the exact moment the timer expires. After a review becomes due, you have an extra **50% of that level's interval** as a grace window:

| Level | Due after | Grace ends after |
|-------|-----------|-----------------|
| L1    | 20 min    | 30 min          |
| L2    | 1 hour    | 1.5 hours       |
| L3    | 8 hours   | 12 hours        |
| L4    | 1 day     | 1.5 days        |
| ...   | ...       | ...             |

### Review States

Each word group is always in one of four states:

| State       | Meaning |
|-------------|---------|
| **UNFINISHED** | You started this quiz but haven't finished it yet |
| **DUE**        | The review timer has elapsed — time to review |
| **FRESH**      | You missed the grace window; level resets on next completion |
| **SCHEDULED**  | All good — next review is not yet due; a countdown is shown |

### What a Typical Study Journey Looks Like

```
Day 1 — Study 100 words for the first time
  → Complete quiz → L1, review due in 20 minutes

Day 1 (+20 min) — Review on time
  → Advance to L2, review due in 1 hour

Day 1 (+1.5 hrs) — Review on time
  → Advance to L3, review due in 8 hours

Day 2 — Review on time
  → Advance to L4, review due in 1 day

Day 3 — Review on time
  → Advance to L5, review due in 2 days

Day 5 — Review on time
  → Advance to L6, review due in 6 days

Day 11 — Review on time
  → Advance to L7, review due in 31 days

Day 42 — Review on time
  → Stay at L7 (monthly maintenance)
```

If you miss the grace window at any level, the group is marked **FRESH** and resets to L1 on your next completion. The review badge in the navigation counts all groups that are UNFINISHED, DUE, or FRESH so you never lose track.

### Custom Intervals

The default intervals can be customised in the Review settings. Your custom schedule is saved locally.

---

## Getting Started

```bash
cd heloword-react
npm install
npm run dev
```

Visit `http://localhost:5173` — no account required to start studying.
