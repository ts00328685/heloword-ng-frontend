╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Feature & Optimization Proposals

 ▎ This is a brainstorming plan — not an implementation request yet. Items are grouped by impact and effort.

 ---
 What Already Exists (do not re-propose)

 Spaced repetition (7-level Ebbinghaus), custom vocab groups, Excel/CSV import, AI word insights, multiplayer challenges (typing / MC / scramble), friends + chat
 + vocab sharing, TTS pronunciation, statistics dashboard, dark mode, EN/DE/JP support.

 ---
 🔥 High-Impact Features (user acquisition & retention)

 1. Daily Streak System

 Why it works: Duolingo's #1 retention driver. Creates a daily habit loop.
 - Show a flame icon + streak count on the Home tab
 - Breaking a streak is a strong psychological push to come back
 - Give a "streak freeze" (one per week) so users aren't punished for missing one day
 - Show longest streak as a badge on the profile

 2. Word of the Day

 Why it works: A shareable daily hook that drives organic discovery.
 - Rotating featured word on the Home screen with pronunciation, meaning, and a usage example
 - "Share this word" button generates a pretty card (image) users can post to social media
 - Could be seeded from the built-in word lists, personalized to user's level

 3. Leaderboard (Friends + Global)

 Why it works: Social competition is a strong motivator to practice more.
 - Rank friends by words learned this week / quiz accuracy / streak days
 - Global top-100 board for casual bragging rights
 - Weekly reset so new players can compete
 - Already has friends + social infrastructure — this is a natural extension

 4. Community Vocabulary Library

 Why it works: User-generated content grows the app's value without you doing the work.
 - Users can "publish" their custom vocab groups to a public library
 - Others can browse, preview, and copy groups (one-click import into My Vocab)
 - Rate/upvote system to surface quality lists
 - Filter by language, topic tag, difficulty

 5. Daily Review Reminder / PWA Push Notifications

 Why it works: Users forget to open the app. A notification when words are "due" closes the loop.
 - PWA service worker to send browser push notifications
 - "You have 12 words due for review" at a configurable time
 - Deep-link straight into the review session

 6. Flashcard / Swipe Mode

 Why it works: Fast, gesture-driven review. Lower friction than the full quiz.
 - Swipe right = I know it, swipe left = need more practice
 - Stackable cards with word on front, meaning on back (tap to flip)
 - Great for quick mobile reviews on the go
 - Can count swipes toward review progress

 ---
 📈 Medium-Impact Features (engagement & depth)

 7. Advanced Analytics Dashboard

 Extend the existing Stats page:
 - Accuracy trend graph over the past 30 days
 - Heatmap calendar (GitHub-style) showing days practiced
 - Weakest words list — words most often answered wrong
 - Learning velocity — words/hour, words/day averages
 - Projected mastery — "At your current pace, you'll master Level 7 in 3 weeks"

 8. Sentence Mining / Clipboard Import

 - User pastes a paragraph of text
 - Unknown words are highlighted (cross-referenced against user's existing vocab)
 - Tap any word to add it to a custom group instantly
 - Great for reading foreign articles and building contextual vocabulary

 9. Pronunciation Recording & Comparison

 - After TTS plays, user can record their own voice
 - Show a waveform side-by-side with TTS waveform
 - Not graded, just for self-assessment
 - Low complexity, high perceived value

 10. Spaced Repetition for Custom Vocab

 Currently custom vocab groups go through the same quiz flow as built-in lists, but the forgetting-curve scheduling may not be as tightly integrated.
 - Verify and ensure custom words get proper Ebbinghaus scheduling (if not already)
 - Show per-word level badges inside UserVocabGroupPage (Level 1/7, Due, etc.)

 11. Topic Tags on Vocab Groups

 - Users tag custom groups: travel, food, business, JLPT N3, etc.
 - Filter / search by tag in UserVocabPage
 - Feeds into the community library (see #4)

 12. Offline Support (PWA / Service Worker)

 - Cache word lists and review state in IndexedDB
 - Users can review offline on the subway
 - Sync back to server when reconnected

 ---
 ⚡ Quick Wins / UX Optimizations

 13. Skeleton Loading Screens

 Replace spinners throughout the app with content skeleton placeholders (grey shimmer cards). Much more polished feel, perceived as faster.

 14. Virtual Scrolling for Large Word Lists

 VocabularyListPage loads 9,000+ words. React virtualization (react-window or @tanstack/virtual) would make it instant.

 15. Swipeable Cards in Review Page

 On mobile, let users swipe left/right on review group cards to expose quick actions (start review, edit, delete) instead of tap → modal.

 16. Batch Operations in Review Page

 Multi-select review groups → bulk reset, bulk delete, or bulk start.

 17. Keyboard Shortcuts (Desktop)

 - Space → reveal answer
 - → / ← → correct / wrong in quiz
 - P → pronounce
 - Power-user feature, very low effort, big desktop UX win

 18. Confetti / Micro-Celebrations

 Burst of confetti when a group reaches Level 7 (fully mastered). Small dopamine hit that makes mastery feel rewarding.

 19. "Continue Where You Left Off" Section

 On the Home page, show the last group that had an in-progress quiz so users can resume in one tap.

 20. Smart Difficulty Suggestion

 When user creates a custom quiz, suggest a word range based on their historical accuracy (e.g., "You're scoring 90%+ on Easy — try Medium words").

 ---
 💡 Monetization-Compatible Features (if ever needed)

 - AI monthly quota — free users get N AI insight calls/month, premium is unlimited (already gated by login, one more lever is easy)
 - Classroom / Teacher Mode — assign vocab groups to students, see class-wide analytics
 - Custom review interval presets — power users love configuring everything

 ---
 Priority Recommendation

 ┌─────┬─────────────────────────┬──────────┬────────┬───────────────┐
 │  #  │         Feature         │  Effort  │ Impact │   Do First?   │
 ├─────┼─────────────────────────┼──────────┼────────┼───────────────┤
 │ 1   │ Daily Streak            │ Medium   │ ★★★★★  │ ✅ Yes        │
 ├─────┼─────────────────────────┼──────────┼────────┼───────────────┤
 │ 2   │ Word of the Day         │ Low      │ ★★★★   │ ✅ Yes        │
 ├─────┼─────────────────────────┼──────────┼────────┼───────────────┤
 │ 13  │ Skeleton Loaders        │ Low      │ ★★★    │ ✅ Yes        │
 ├─────┼─────────────────────────┼──────────┼────────┼───────────────┤
 │ 18  │ Confetti / celebrations │ Low      │ ★★★    │ ✅ Yes        │
 ├─────┼─────────────────────────┼──────────┼────────┼───────────────┤
 │ 3   │ Leaderboard             │ Medium   │ ★★★★   │ Soon          │
 ├─────┼─────────────────────────┼──────────┼────────┼───────────────┤
 │ 6   │ Flashcard Swipe Mode    │ Medium   │ ★★★★   │ Soon          │
 ├─────┼─────────────────────────┼──────────┼────────┼───────────────┤
 │ 5   │ Push Notifications      │ Medium   │ ★★★★   │ Soon          │
 ├─────┼─────────────────────────┼──────────┼────────┼───────────────┤
 │ 4   │ Community Library       │ High     │ ★★★★★  │ Later         │
 ├─────┼─────────────────────────┼──────────┼────────┼───────────────┤
 │ 14  │ Virtual Scroll          │ Low      │ ★★★    │ Bug-fix level │
 ├─────┼─────────────────────────┼──────────┼────────┼───────────────┤
 │ 17  │ Keyboard shortcuts      │ Very Low │ ★★     │ Quick win     │
 └─────┴─────────────────────────┴──────────┴────────┴───────────────┘