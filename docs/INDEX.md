# MCP Surf Forecast — Documentation Index

## Overview

Project documentation split by domain responsibility following the Single Responsibility Principle.  
Each document owns one concern and can evolve independently.

---

## Documents

| # | Document | Responsibility | Description |
|---|----------|----------------|-------------|
| 1 | [Architecture](./01-architecture.md) | System design & boundaries | High-level architecture, tech stack, component diagram, design principles |
| 2 | [Data Models](./02-data-models.md) | Domain entities | Beach, Forecast, WQI interfaces and Zod schemas |
| 3 | [Resources](./03-resources.md) | Data exposure (read-only) | MCP resources, URI templates, provider registry |
| 4 | [Tools](./04-tools.md) | Computation & actions | Geo search, filtering, WQI engine, classification, alerts |
| 5 | [WQI Specification](./05-wqi-spec.md) | Scoring algorithm | Wave Quality Index 0–10 scale, formula, sub-score definitions |
| 6 | [Prompts](./06-prompts.md) | LLM interaction templates | Parameterized prompts for trip planning, reports, analysis |
| 7 | [Inspector & Testing](./07-inspector-testing.md) | Quality assurance | Inspector usage, test strategy, verification checklist |
| 8 | [Project Setup](./08-project-setup.md) | Dev environment & structure | Folder structure, dependencies, scripts, CI |

---

## Design Principles

This project follows SOLID principles applied to MCP server design:

- **S — Single Responsibility**: Each module (resource, tool, prompt) handles one concern. The WQI engine doesn't know about HTTP; the geo module doesn't know about scoring.
- **O — Open/Closed**: New beaches, providers, or tools are added without modifying existing code. Data is configuration, not hardcoded logic.
- **L — Liskov Substitution**: All data providers implement a common interface. Swapping Surfline for Windguru doesn't break consumers.
- **I — Interface Segregation**: Tools receive only the data they need via focused interfaces (e.g., `GeoPoint` not the full `Beach` object for distance calculations).
- **D — Dependency Inversion**: High-level tools depend on abstractions (e.g., `ForecastProvider` interface), not concrete API clients. The MVP uses static JSON; production swaps in real providers.

---

## Reading Order

For **implementers**: 1 → 2 → 8 → 3 → 4 → 5 → 6 → 7  
For **reviewers**: 1 → 5 → 4 → 6  
For **new contributors**: 8 → 1 → 2
