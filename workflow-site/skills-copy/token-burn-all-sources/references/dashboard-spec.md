# Dashboard Spec

Build one local dashboard over normalized daily token rows.

## Required views

1. Daily burn heatmap
   - Calendar-like grid is ideal, but a dense daily grid is acceptable for v1.
   - Color by `total` with a logarithmic scale so quiet days still read.
   - Show date, total, and driver on hover or focus.

2. Weekly trend
   - Sum totals by ISO week.
   - Plot on a log y-axis or log-normalized scale.
   - Mark or call out the peak week if you add labels.

3. Burn drivers
   - Group by `driver`.
   - Sort descending by total tokens.
   - Show total and percent share.

4. Scale equivalents
   - Translate all selected tokens into approximate words, reading time, and novel equivalents.
   - Keep the math visible.

5. Moving-average table
   - Show the last 30 rows in the current range.
   - Include total, 7-day moving average, each source column, `driver`, and exact-vs-estimated labels.

## Controls

- Add one range control: 90 days, 180 days, 1 year, all-time.
- The range must affect every view.
- Keep the dashboard responsive on phone widths.

## Verification

- Add one day by hand and confirm totals update.
- Pick one day and reconcile `total` against each source column.
- Confirm exact and estimated labels are visible in the UI.
- Confirm the log heatmap shows both small days and spikes.
- Build locally before deploying.
