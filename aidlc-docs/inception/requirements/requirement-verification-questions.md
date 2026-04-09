# Requirements Verification Questions

Please answer the following questions to help clarify the requirements for the Smart Agentic Calendar MCP Server. Fill in the letter choice after each [Answer]: tag.

---

## Question 1
What programming language should be used for this MCP server?

A) TypeScript (Node.js) — most common for MCP servers, rich ecosystem
B) Python — strong scheduling/AI libraries, popular MCP SDK
C) Kotlin/JVM — strong typing, coroutine support
D) Go — lightweight, efficient concurrency
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2
What local storage approach should be used for the "local-first" design?

A) SQLite — embedded relational DB, great for structured scheduling data
B) JSON files — simple flat-file storage, easy to inspect
C) LevelDB/RocksDB — embedded key-value store, good performance
D) SQLite with CRDT sync layer — local-first with future sync capability
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3
What calendar data sources should the MCP server integrate with for reading existing events?

A) Google Calendar only
B) Google Calendar + Outlook/Microsoft 365
C) CalDAV protocol (supports most calendar providers including iCloud, Nextcloud, etc.)
D) No external calendar integration — standalone task scheduling only
X) Other (please describe after [Answer]: tag below)

[Answer]: D

## Question 4
What is the primary scheduling model for task planning?

A) Time-blocking — assign specific time slots to tasks on a timeline (like Reclaim.ai)
B) Priority queue — ordered list of tasks by priority/deadline without specific time assignment
C) Hybrid — time-blocking for tasks with deadlines, priority queue for flexible tasks
D) Constraint-based — define constraints (availability windows, dependencies) and auto-solve
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5
How should the MCP server handle recurring tasks and habits?

A) Full recurrence support (daily, weekly, monthly, custom RRULE patterns)
B) Simple recurrence only (daily, weekly, monthly)
C) No recurrence support — one-time tasks only for MVP
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6
What should trigger an automatic re-plan/reschedule?

A) Any change — task added, completed, modified, or missed
B) Only explicit triggers — when the AI agent requests a replan
C) Smart triggers — automatic on significant changes (missed deadline, new high-priority task), explicit for minor changes
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 7
Should the server support multiple users/calendars or single-user only?

A) Single user only — personal assistant for one person
B) Single user with multiple calendars (work, personal, etc.)
C) Multi-user with shared calendars and collaboration
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 8
What MCP transport protocol should be supported?

A) stdio only — simplest, works with Claude Desktop and most MCP clients
B) stdio + HTTP/SSE — supports both local and remote connections
C) HTTP/SSE only — remote-first design
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 9
How should task dependencies be modeled?

A) No dependencies — each task is independent
B) Simple blocking dependencies — task B can't start until task A completes
C) Rich dependencies — blocking, soft dependencies, parallel grouping, milestone tracking
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 10
What level of "intelligence" should the scheduling algorithm have for the initial version?

A) Simple greedy — fill available slots by priority then deadline
B) Constraint satisfaction — optimize schedule considering energy levels, time preferences, buffer time
C) Full optimization — like Reclaim/Motion with learning patterns, focus time protection, meeting scheduling
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 11
Should the server support "focus time" / "deep work" protection (blocking off uninterrupted work periods)?

A) Yes — protect configurable focus time blocks, schedule deep work tasks there
B) No — all available time is equally schedulable
C) Simple version — user marks certain hours as preferred for focus work, but no enforcement
X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 12
What should happen when a task's deadline becomes impossible to meet?

A) Alert the agent immediately and suggest which tasks to deprioritize
B) Silently reschedule at best effort, flag as at-risk
C) Provide detailed conflict analysis with multiple resolution options (extend deadline, reduce scope, deprioritize others)
X) Other (please describe after [Answer]: tag below)

[Answer]: X, implement A first, design the data model to support C. We have a first version quicker, later we can improve to option C.

## Question 13
What MCP tools (capabilities) should the server expose to AI agents?

A) Core CRUD — create/read/update/delete tasks and events, get schedule, trigger replan
B) Core + Analytics — above plus productivity stats, schedule health metrics, pattern insights
C) Core + Analytics + Suggestions — above plus proactive scheduling recommendations
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 14
Should there be a human-readable UI, or is this purely an MCP server for AI agent consumption?

A) Pure MCP server — no UI, AI agents are the only interface
B) MCP server + simple CLI for manual inspection/debugging
C) MCP server + web dashboard for visualization and manual overrides
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 15: Security Extensions
Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)
B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)
X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 16: Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints (recommended for projects with business logic, data transformations, serialization, or stateful components)
B) Partial — enforce PBT rules only for pure functions and serialization round-trips (suitable for projects with limited algorithmic complexity)
C) No — skip all PBT rules (suitable for simple CRUD applications, UI-only projects, or thin integration layers with no significant business logic)
X) Other (please describe after [Answer]: tag below)

[Answer]: B
