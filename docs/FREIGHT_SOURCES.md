# Freight discovery

Reviewed on 2026-10-22. Krypta currently provides external web search, manually recorded opportunities, a route comparison and a contact-message template. It does not ingest a live freight exchange or submit messages automatically.

## Access findings

| Source | Finding | Current use |
| --- | --- | --- |
| [Trans.eu van transport](https://www.trans.eu/en/freight-exchange/van-transport/) | Offers a van/light-commercial-vehicle segment. Public marketing describes registration separately from exchange access. | Reference only; no account or exchange integration configured. |
| [Trans.eu API FAQ](https://www.trans.eu/api/general-information/faq/) and [authorization](https://www.trans.eu/api/general-information/authorization-process/) | Integration itself is free, but requests require a valid user account and application credentials. Public documentation is not permission to retrieve the exchange anonymously. The FAQ says there is no separate test environment. | No anonymous connector or production API test calls. |
| [Teleroute](https://www.teleroute.com/en-en/) | Describes a paid community and business/insurance verification. Its [T-Interface](https://www.teleroute.com/en-en/freight-forwarders/t-interface/) describes freight publication, not an unrestricted free public load feed. | Reference only. |
| Clicktrans, Cargopedia, Cargo.lt | Official pages were inaccessible through the execution environment's network policy. Current API access, pricing and redistribution terms are unverified. | Optional domain restriction in a normal external Google search; no retrieval, copying or integration claims. |
| Skelbiu.lt | No API or automated-access terms verified. | Optional domain restriction in external web search only. |

No free, accountless live-load API has been established by this research. That is a bounded finding, not a claim that no such source exists. Future connectors require source-specific verification of account eligibility, search scope, pricing, quotas, terms and representative van loads on relevant routes. A company directory supplies contacts, not evidence of current transport demand.

## Product behavior

Selecting a trip pre-fills search cities and departure date; its stops are available as city suggestions. The generated Google query includes these terms and an optional source domain. They are search terms, not guaranteed structured filters on an exchange. Results open outside Krypta and may be stale, incomplete or require an account. Nothing is scraped or presented as a verified live offer.

Saved opportunities contain optional pickup/delivery coordinates, pickup day, total shipment weight, dimensions, offered EUR cents, contact, trip reference, notes and a negotiation state. Missing dates, prices and weights stay unknown. Legacy link-only rows acquire unknown defaults while their original title, URL and notes remain intact. SQL migration 3 adds details and per-record revisions; the demo reads old records without reseeding. Server updates check company, module, role and record revision. Disabling finance preserves stored quotes but prevents price changes; disabling freight preserves all opportunity history.

Road comparison preserves original trip endpoints, stop order and confirmed prefix. Pickup precedes delivery. Geographic proximity suggests an insertion; the existing OSRM adapter then compares both road routes. This is not global route optimization. Driving-time differences exclude handling/rest; the estimate therefore asks separately for handling/waiting minutes, vehicle EUR/km, labor EUR/hour and other costs. Missing inputs produce no cost or margin claim. The displayed remainder subtracts additional entered costs from the offered price, not full business profit or a market-rate forecast. Rates are user inputs and are not saved as a company tariff.

Contact drafts use fixed Lithuanian, German and English templates. They do not call an AI provider, invent rates or send messages. No external API key or new environment variable is required. Optional opportunity/reminder records are outside the operational JSON backup; preserve them with a full private SQLite backup in server mode. Demo data remains device-local.
