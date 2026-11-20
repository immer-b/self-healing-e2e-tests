# Pet hotel screens

The Willow Pet Hotel staff app (`/hotel/`) on the seeded data, captured at 1440 px wide in Chromium with the server clock pinned to 2026-11-20. Click an image to open it at full size.

Regenerate with `npm run screenshots:hotel --workspace e2e-framework` while the sample server is running.

## Sign in

One sign-in for every role. Sessions are HttpOnly cookies.

<a href="screenshots/hotel-login.png"><img src="screenshots/hotel-login.png" alt="Sign in" width="100%"></a>

## Front desk: Today

Arrivals and departures for the day with one-click check-in and check-out, plus the day's numbers.

<a href="screenshots/hotel-today.png"><img src="screenshots/hotel-today.png" alt="Front desk: Today" width="100%"></a>

## Front desk: Care schedule

Morning and evening rounds shared evenly across the staff on shift. Reassign any round or rebalance the open ones.

<a href="screenshots/hotel-schedule.png"><img src="screenshots/hotel-schedule.png" alt="Front desk: Care schedule" width="100%"></a>

## Front desk: Pets

Search by pet, breed or owner. Archived pets stay on file.

<a href="screenshots/hotel-pets.png"><img src="screenshots/hotel-pets.png" alt="Front desk: Pets" width="100%"></a>

## Front desk: Pet record

Special instructions, stays, the permanent notes log, owner details and every contact with their phone numbers.

<a href="screenshots/hotel-pet-record.png"><img src="screenshots/hotel-pet-record.png" alt="Front desk: Pet record" width="100%"></a>

## Front desk: New owner

Any number of contacts, each with a relationship to the pet and any number of phone numbers.

<a href="screenshots/hotel-owner-form.png"><img src="screenshots/hotel-owner-form.png" alt="Front desk: New owner" width="100%"></a>

## Rooms

Occupancy by room type for any night. Admins add, edit and archive rooms.

<a href="screenshots/hotel-rooms.png"><img src="screenshots/hotel-rooms.png" alt="Rooms" width="100%"></a>

## Admin: Employees

Accounts with a role (admin, front desk, general staff) and a job type. Archive instead of delete.

<a href="screenshots/hotel-employees.png"><img src="screenshots/hotel-employees.png" alt="Admin: Employees" width="100%"></a>

## Admin: Change log

Who changed what and when, field by field, for every entity.

<a href="screenshots/hotel-change-log.png"><img src="screenshots/hotel-change-log.png" alt="Admin: Change log" width="100%"></a>

## General staff: My rounds

Today's rounds, pending first, with instructions flagged.

<a href="screenshots/hotel-queue.png"><img src="screenshots/hotel-queue.png" alt="General staff: My rounds" width="100%"></a>

## General staff: Care round

Checklist, special instructions, a room photo, notes and emergency contacts. Complete unlocks when everything is done.

<a href="screenshots/hotel-round.png"><img src="screenshots/hotel-round.png" alt="General staff: Care round" width="100%"></a>

## General staff: Care round on a phone

The same page on a 390 px wide phone screen.

<a href="screenshots/hotel-round-mobile.png"><img src="screenshots/hotel-round-mobile.png" alt="General staff: Care round on a phone" width="320"></a>

## Staff rounds, UI v2: queue

A table layout. The self-healing tests reach it with page objects written for v1.

<a href="screenshots/hotel-queue-v2.png"><img src="screenshots/hotel-queue-v2.png" alt="Staff rounds, UI v2: queue" width="100%"></a>

## Staff rounds, UI v2: round

One column with switches, the photo first and an inline finish button.

<a href="screenshots/hotel-round-v2.png"><img src="screenshots/hotel-round-v2.png" alt="Staff rounds, UI v2: round" width="100%"></a>

## Staff rounds, UI v3: queue

Cards with a counter.

<a href="screenshots/hotel-queue-v3.png"><img src="screenshots/hotel-queue-v3.png" alt="Staff rounds, UI v3: queue" width="100%"></a>

## Staff rounds, UI v3: round

Numbered steps in working order, with a "Finish round" button.

<a href="screenshots/hotel-round-v3.png"><img src="screenshots/hotel-round-v3.png" alt="Staff rounds, UI v3: round" width="100%"></a>

## Front desk: Today in dark mode

The app follows the system theme, or the Light/Dark choice in the sidebar.

<a href="screenshots/hotel-today-dark.png"><img src="screenshots/hotel-today-dark.png" alt="Front desk: Today in dark mode" width="100%"></a>

## General staff: Care round in dark mode

Dark mode on the page staff use most. Contrast is checked by the axe tests in both themes.

<a href="screenshots/hotel-round-dark.png"><img src="screenshots/hotel-round-dark.png" alt="General staff: Care round in dark mode" width="100%"></a>
