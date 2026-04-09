# Unit of Work Plan — Smart Agentic Calendar MCP Server

## Overview
Decompose the system into implementation units. This is a monolith (single Node.js process), so units are logical modules developed sequentially — not independently deployable services.

---

## Planning Questions

### Question 1
What order should units be implemented?

A) Bottom-up — models → storage → engine → analytics → MCP (build foundations first, each layer tested before the next)
B) Vertical slice — implement one full feature end-to-end (e.g., task creation from MCP tool to storage to scheduler), then add features
C) Core-out — start with the scheduling engine (the core value), then add storage underneath and MCP on top
X) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 2
How should the scheduling engine unit be scoped?

A) Single large unit — scheduler, conflict detector, dependency resolver, and replan coordinator together (they're tightly coupled)
B) Split into two units — core scheduler (constraint solver + dependency resolver) and replan/conflict layer (replan coordinator + conflict detector)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 3
Should analytics be part of the initial implementation or deferred to a later pass?

A) Include in the initial implementation — build analytics alongside the core (stories are "Should Have" but having them from day one makes the product more complete)
B) Defer to a follow-up pass — implement core scheduling first, add analytics as a separate unit after the core is working
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Generation Steps

After questions are answered, execute in this order:

- [ ] Step 1: Define unit inventory with scope, responsibilities, and implementation order
- [ ] Step 2: Create dependency matrix between units
- [ ] Step 3: Map user stories to units
- [ ] Step 4: Validate all stories are covered and unit boundaries are clean
