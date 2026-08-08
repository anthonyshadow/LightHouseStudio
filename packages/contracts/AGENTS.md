# Contracts package guide

- Implement app-controlled HTTP schemas in Zod and derive request/response types
  from those schemas.
- Do not add provider- or database-specific fields merely to avoid explicit
  adapter mapping.
- Preserve compatibility unless the task explicitly authorizes a breaking
  change.
- Use runtime schema tests and compile-time type assertions where they add
  meaningful coverage.
