# Planning calculator

## Access and persistence

The calculator is a finance-module workspace for company administrators and dispatchers. Administrators additionally manage shared rate defaults. Drivers receive no calculator data, including drivers permitted to register trip expenses or payments. Platform owners enter an explicit company workspace through the established preview flow; read-only preview permits local experiments but cannot save. Server authorization and the existing company revision remain authoritative.

`Database.planning` is an optional `CalculatorState` version 1. It contains company defaults, vehicle rate overrides and saved scenarios. Existing snapshots remain valid without the field. The first explicit calculator command creates it; opening an old store never writes, reseeds or uploads its data. No SQL schema migration is required because all three runtimes already persist validated company snapshots. Unknown future calculator versions are rejected without replacement.

Browser demo uses its existing IndexedDB generation checks; Node uses the existing transactional SQLite snapshot; Sites uses the existing D1 snapshot and generation checks. Scenario revisions additionally reject stale saves/deletions even when a client has refreshed the company revision. Calculations and scenario edits generate no operational notifications. They never create actual trips, bookings, payments or expenses.

The full optional field travels through JSON exports and restores. Existing snapshot backup behavior applies; explicit company clear removes previous backups under the established policy. Clear and sample reset explicitly remove calculator scenarios and rates. Disabling finance retains stored planning but omits it from client snapshots and backup downloads. Ordinary operational writes from such projections preserve the hidden planning data. An ordinary restore without finance access also preserves planning and refuses incoming calculator data.

## Assumptions and sources

Effective rates are company defaults, then present vehicle overrides, then the scenario's own edits. Missing vehicle overrides inherit; an explicit zero remains zero and an explicit null remains unknown. Vehicle consumption and passenger seats come from the existing vehicle fields rather than duplicate vehicle settings. No seat is subtracted for a driver because the field already means passenger seats. A stored vehicle value of zero is copied as zero; no seats are invented for cargo vehicles. Without a vehicle, company/default assumptions and manual seat input can be used.

Vehicle selection, source import and Apply Current Rates are explicit copies. The scenario stores effective values and their assumption date, not reactive references. The source dialog previews the route/trip and optional supplemental expenses before copying. Copying a route resets road distance and time to unknown, then starts a road request automatically when there are at least two stops. These estimates can also be entered or refreshed manually. Copying a trip additionally copies quoted order totals, quantities, pickup/delivery visit indices and paid-day assumptions derived from elapsed trip duration rounded up to whole days. Users may correct these assumptions. Paid balances are never used as planned revenue.

Optional additional-expense import copies only tolls, accommodation, parking and other recorded expenses into editable scenario amounts. Fuel and vehicle-maintenance records are excluded to avoid automatically adding them to modelled fuel/wear costs. The user chooses this import and can review every included cost.

Route geometry and duration use the established `roadRoute` adapter. For an explicitly requested return traversal, the copied open route is followed back through its stops. An already closed route is not duplicated. This request constructs the distance once; the calculation engine never doubles a distance because of a return flag. Extra kilometres mean kilometres absent from that supplied distance. Travel time remains a separately editable route estimate; extra distance does not invent extra driving time. Provider failure leaves entered values intact and unknown distance is never changed to zero.

## Formula version 1

Amounts are integer EUR cents. Fuel and wear unit rates are integer ten-thousandths of EUR, supporting four decimal places without losing fractional-cent rates. Quantities and time may be fractional. Each extended cost is rounded once to the nearest cent with JavaScript's nonnegative `Math.round`; integer component costs are then summed. Ratios retain precision until display. Zero denominators produce no ratio or per-kilometre value.

| Item | Formula |
| --- | --- |
| Distance | Entered route km + additional km, once |
| Fuel | Distance × l/100 km ÷ 100 × EUR/l |
| Wear/operation | Distance × EUR/km, excluding fuel |
| Driver | Selected trip amount, or paid days × daily amount |
| Extra waiting | Extra minutes ÷ 60 × hourly amount, only when selected |
| Trip total | Included variable costs + optional allocated fixed share |
| Preliminary remainder | Planned income − included costs |
| Monthly revenue | Trip income × selected trip count |
| Monthly cost | Trip variable costs × trip count + monthly fixed amount, once |

Detailed passenger/parcel revenue, a single total and imported booking quotes are alternative modes. Inactive modes retain their editable assumptions but contribute nothing. Detailed income is quantity × ticket/average parcel amount for each enabled direction, plus optional other transport income. Imported quote amounts are whole-booking totals, not per-person ticket prices. Counts and quote totals can be edited independently. Missing positive-quantity prices remain unknown; a deliberate zero quantity requires no price.

Excluded optional costs are not included. Enabled costs with missing important inputs remain unknown, with a missing-input list and no invented total. Explicit zero cost, price and quantity remain distinguishable from blank input. Scenarios may be saved with incomplete assumptions for later work.

Detailed occupancy is passenger count divided by the copied/manual seat capacity in each enabled direction. Imported trip occupancy sweeps the copied linked-stop segments and counts only passengers aboard concurrently. Selecting a turnaround stop splits the peak calculations by direction; otherwise the maximum over the whole trip is labelled as such. Unknown passenger quantities prevent an occupancy claim. Capacity excess is a visible planning warning, not a mutation of actual bookings or scheduling rules.

Break-even occupancy is available only for detailed passenger models with known costs, capacity and ticket rates. Non-passenger income and ticket prices stay unchanged while both directional passenger occupancy percentages change equally. Required occupancy is the uncovered cost divided by full-capacity ticket revenue over the enabled directions. More than 100% is reported as infeasible under those assumptions. Total-income and imported-quote modes do not invent this indicator.

Every save keeps the input snapshot, currency/units, assumption date, calculation timestamp, model version and server-computed result. Opening a saved scenario displays the stored result until an explicit edit/save or application of current rates. Version-1 formulas are frozen; a future formula revision must retain the old implementation/reader and introduce a new model version rather than silently rewriting history.

## Interface

Trip and month views share one scenario. Exact decimal inputs support dots and commas and display copied values with a Lithuanian decimal comma. Passenger, parcel and monthly trip counts also have keyboard-operable sliders. Decimal placeholders illustrate syntax without supplying rates. Passenger/parcel icons and separate sections distinguish quantities; imported booking headings identify the customer once, while accessible field names retain the full context.

Missing assumptions have a small badge and field highlight. The results list links to the actual missing inputs, opening collapsed cost groups and switching views when necessary. Dependent costs do not repeat a missing distance as a separate rate error. Missing values can still be saved for later; invalid numeric text must be corrected before saving. Results update locally without a loading indicator. Routing and persistence expose real pending/error/success states. Mobile has a jump to results, and no calculator bar overlays the existing bottom navigation. Reduced-motion preferences disable chart transitions. In-app navigation and browser Back/Forward consult the calculator's unsaved-change guard before unmounting it; reload/tab close use the browser's standard unsaved-change warning.

The scenario selector and save state stay above the form. Shared company/vehicle rates live in the administrator's Settings dialog. Less frequent copy, reset, delete and Apply Current Rates actions are grouped under Scenario Actions. Saving an unnamed scenario opens a compact name/link dialog; named scenarios save directly. Scenario deletion is explicit and does not delete the linked trip. Reset Form restores the opened form values and does not clear company records or saved scenarios. Multiple trip links retain all scenarios; the user explicitly chooses a primary estimate when there is more than one.

The calculator is an estimate based on entered assumptions. It is not an accounting ledger, tax model or claim of net profit. It has no automatic fuel-price feed, AI forecasting, GPS or fleet optimization.
