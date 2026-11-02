# Arrowsterr

## Rule: blog posts never go out at once
- New blog posts are scheduled, never published in a batch. Spread them at random over 14 days: at most 2 a day, at least 3 hours apart, between 8am and 6pm US Eastern. Posts already scheduled on WordPress count toward each day's limit.
- `docs/marketing/tools/publish.py` does this by default (`schedule.py` picks the times). Publish right away with `--now` only when the user asks for that post to go live now.
- How posts are built and pushed: `docs/marketing/wp-push.md`.
