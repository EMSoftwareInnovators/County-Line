# Richmond Central Coach Terminal

> Georgia Coach Lines, 540 Telfair Street, Augusta.
> Tuesday, 20 October 1998. Eight o'clock to one.

This is the Stage 3 document: what the terminal is, how a shift works,
and where every part of it lives in the source. The building itself is
[OLD-ACADEMY.md](OLD-ACADEMY.md) and the engine under both is
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## The premise, and the one rule that follows from it

The Old Academy stood empty from 1994, when the Augusta Museum moved
out, until the spring of 1998. Georgia Coach Lines took a fifteen-year
lease on it, opened a terminal in the August, and has been running
services out of it for two months.

**The bus company adapted to the Old Academy. The Old Academy did not
adapt to the bus company.**

That is a rule about code, not only about fiction. Nothing under
`src/world/levels/academy/terminal/` calls `wall`, `wallWith`, `door`,
`window`, `floor` or `ceiling`. Everything in it is furniture,
equipment, signage and paint. Delete the directory and the 1856
building comes back untouched, which is also how a lease ends.

There is one exception and it is outside: `platform.js` lays the
asphalt apron and the concrete walkway with `b.floor`, because a coach
yard is paving and paving is a slab. It is on the west ground, not on
the building.

### What went where, and why the building decided

| Room on the 1994 plan | Tonight | What forced it |
| --- | --- | --- |
| Revolutionary War (central) | Ticket hall | Six openings, four columns, two chimney breasts: no wall long enough for a counter, so the counter is an island in the west half between the two cross routes |
| Indians of the Southeast | Departure waiting room | Windows on three sides with sills at 2'9", so seating runs down the middle |
| Americana (outer) | Arrivals, and transfers and refunds at its north end | |
| Gift Shop (inner) | Newsstand | The only room with both a portico door and a door to the lobby |
| Docent Library | **Night clerk / dispatch / electrical** | Canonical: the panels are here, so the clerk is here |
| West Offices | Company offices, and the route to the platform | The 1856 "Entrance to Railroad" door opens off it |
| East Rear Hall | Dispatch floor | Five ways out of it; almost nothing can stand in it |
| Animal Room | Checked baggage and parcels | |
| Staff Room | Driver break room | |
| Second floor, all of it | Storage, records, a maintenance store, a training room used four times a year | |

---

## The shift

Five hours of terminal time in forty minutes of real time: **seven and
a half minutes a minute** (`RATE` in `src/game/terminal/shift.js`). The
ratio was chosen backwards from the brief's thirty-five to fifty
minutes. Five coaches at that rate leaves about six real minutes
between departures.

```
20:00  OPENING   count the float, put the zones on, put the board up,
                 unlock the doors, punch in
20:55  ATLANTA out, bay 1
21:40  SAVANNAH in, bay 2
22:30  MACON in, bay 3 -- turns round and goes back out as
23:05  CHARLESTON, bay 3, same coach, same driver, new roll
23:45  SAVANNAH out, bay 2
00:35  CHARLESTON in, bay 4
00:40  CLOSING   cash up, write the log, zones off, lock up, punch out
```

**One errand upstairs, once,** at about ten past ten: the timetable
forms have run out and the carton is in the old history room. It is
scheduled rather than rolled, because "about one" and "on average one"
are different promises.

**One breaker, once, and nothing scripts it.** The shift puts the
coffee maker in a driver's hands three minutes after the turnaround's
belt starts. Twelve and a half amps of conveyor and seven and a half of
coffee on a twenty-amp way; `electrical.js` opens it twelve seconds
later.

### The five moves at the window

The brief asks for neither "press E and a ticket appears" nor tedium.
What is in between is the shape of the real transaction, at four places
behind one counter:

1. **Serve** — somebody says where they are going (the window)
2. **Quote** — you look it up and tell them (the window)
3. **Take** — they hand over money, usually the wrong shape of it (the register)
4. **Count out** — change, out of the drawer you counted in (the register)
5. **Issue** — print it and hand it over (the printer, then the window)

A clerk may quote the wrong number. The sale records it rather than
correcting it, and the one o'clock reconciliation finds it. That is
what makes the fare card furniture instead of decoration.

---

## Where it all is

```
src/game/terminal/
  routes.js      four roads out of Augusta, the towns on them, the
                 mileages, the fare card, tonight's timetable
  money.js       cents, denominations, the drawer, change
  tickets.js     tickets and claim checks off two numbered rolls
  manifest.js    the departure's paperwork, and boarding as a lookup
  service.js     the five moves; baggage moved by the cart-load
  people.js      fifteen archetypes and the dice
  crowd.js       passengers, the line, and where they stand
  drivers.js     the turnaround, and the break room
  pa.js          the amplifier and the telephone
  incidents.js   twelve ordinary things that go wrong
  electrical.js  circuits, breakers, load, and the arithmetic
  power.js       the panel and the switch bank, as the game plays them
  fleet.js       coaches: one mesh, a matrix and a state each
  shift.js       the clock, the phases, the checklists
  stations.js    what happens when the player presses the key
  sound.js       the loops that come and go with their machines

src/world/levels/academy/terminal/
  props.js       the vocabulary: counters, benches, shelving, carts...
  public.js      lobby, both waiting rooms, newsstand, restroom
  staff.js       clerk/dispatch/electrical, offices, baggage,
                 dispatch floor, break room, stores, corridors
  upstairs.js    nine rooms, deliberately thin
  coach.js       one forty-foot highway coach in 240 triangles
  platform.js    four nose-in berths, a canopy, the yard
```

---

## The electrical retrofit

**Canonical building fact: every main breaker and every building light
control is in the former Docent Library, on the first floor.** Three
cabinets on the south wall between the two facade windows, and a bank
of twelve labelled toggles on the north wall.

Thirteen ways, in three panels:

| Panel | Ways |
| --- | --- |
| A, 15 A | lobby, west front, east front, clerk |
| B, 20 A | west rear, east rear, rear porch, front exterior |
| C, 20 A | 2nd floor west / center / east, garden, platform |

Two controls, deliberately different. **The switch bank** throws the
*lights* of a zone and leaves the ticket printer running — that is the
opening and closing procedure. **The breakers** cut *everything* on a
way, and on an ordinary night the only thing anybody does at a cabinet
is push a tripped one back up. A switch thrown on a dead way still
clicks and still gives you nothing, which is what sends the player to
look at the panel.

### How a breaker changes what you see

Vertex light is baked twice — once with the switchable fittings
burning and once without — and `Level.chunkLit` blends between the two
per chunk. A circuit going out is one number per chunk.

A room's own chunk is one circuit, which is easy. The problem is the
shell: `ext.west.north` is sixty feet of masonry carrying the inside
faces of two floors of rooms *and* the outside face of the building,
and `floor2.west.front` is the upper floor's boards on top and the
ticket hall's ceiling underneath. So a chunk names every circuit that
lights it and takes the **mean**: turn off the west wing and its
elevation drops to a third rather than to nothing. See `CHUNK_CIRCUITS`
in `fixtures.js`.

---

## The harnesses

| Command | What it asks |
| --- | --- |
| `node tools/unit.mjs` | routes, fares, money, tickets, boarding, the five moves — no browser |
| `node tools/terminal.mjs` | every opening has clearance both sides; every station has standing room AND answers the reticle; the panel, the load model, the trip, the yard |
| `node tools/shift.mjs` | the whole night in fifteen seconds, through the stations' own handlers; then save, title, CONTINUE, and carry on |
| `node tools/clerk.mjs` | the same job with the keyboard: real ray, real use key |
| `node tools/academy.mjs` | eleven routes and the coplanar invariant |
| `node tools/terminal-shots.mjs` | twenty views, for looking at |

`tools/shift.mjs` found, in this order: a passenger paying the exact
fare with a case to check was short by the baggage charge and the
window could never move past "take the money"; every passenger walking
into a closed front door; six of them stuck in a doorway the nav graph
had no node in; and six more standing beside an open coach door because
signing a manifest closed it. `tools/clerk.mjs` found that a station's
box hides the station, that the sight line ran into the wall behind a
switch, that the clerk's desk stood nineteen inches from the switch
bank, and that the ticket counter's box swallowed its own register.

All of those are fixed where they belonged rather than in the harness.

---

## What is deliberately not here

No Route 117. No anomalous tickets, no strange passengers, no
supernatural manifests, no impossible calls, no altered clocks, no
ghosts. The building settles every couple of minutes because a
hundred-and-ninety-six-year-old building with the heat off does, and it
is given no trigger, no cue and no reaction so that it stays nothing.

County Line should be fun before it becomes scary. This stage is the
fun.
