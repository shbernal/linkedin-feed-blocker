# Stabilize My Network Suggestions Blocking

The current `networkSuggestions` blocker is good enough for local use, but it
should be treated as incomplete. LinkedIn's My Network suggestions behave like
an infinite-scroll recommendation feed, and newly generated sections do not all
share the same heading or DOM shape.

The current implementation hides `auto-component` sections after the pending
invitations preview while excluding puzzle and Premium sections. This catches
many suggested-profile blocks, but future work should stabilize it with real DOM
fixtures or additional live probes before treating the behavior as reliable.

Next iterations should focus on:

- collecting several real suggested-profile section snapshots after scrolling;
- separating profile suggestions from other post-invitation modules with more
  stable signals than generated classes;
- ensuring puzzle, Premium, and invitations remain independently controlled;
- adding fixture-backed tests for newly observed My Network section shapes.
