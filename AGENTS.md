# Repository Guidelines

## Project Structure & Module Organization
- `src/`: Frontend React app (pages, components, hooks, services, styles).
  - `src/pages/`: Screen-level panels (e.g., `ImuRealtimePanel`, `ImuComparisonPanel`).
  - `src/components/`: Reusable UI building blocks (e.g., `ImuThreeCard`, `ImuChartTabs`).
  - `src/hooks/`: Shared logic (Bluetooth, IMU data sources).
- `src-tauri/`: Tauri + Rust backend (commands, processing pipeline, recorder).
- `docs/`: Design and architecture notes.
- `processor.toml`: Runtime configuration for IMU processing pipeline.

## Build, Test, and Development Commands
- `npm install`: Install frontend dependencies.
- `npm run dev`: Start the frontend dev server.
- `npm run build`: Build the frontend for production.
- `npm run lint`: Run frontend lint checks (if configured).
- `cd src-tauri && cargo build`: Build the Tauri backend.
- `cd src-tauri && cargo test`: Run Rust tests.

## Coding Style & Naming Conventions
- TypeScript/React: 2-space indentation, functional components, PascalCase for components, camelCase for functions/variables.
- Rust: standard `rustfmt` style, modules split into `mod.rs` + `types.rs` + logic file.
- Components live under `src/components/<ComponentName>/` with `index.ts` re-exports.

## Testing Guidelines
- Rust tests run via `cargo test` in `src-tauri/`.
- Frontend tests are not currently defined; add tests with clear intent and co-locate if introduced.
- Name tests to describe behavior (e.g., `should_apply_calibration_bias`).

## Commit & Pull Request Guidelines
- Commit messages follow Commitizen-style types (e.g., `feat: ...`, `fix: ...`, `docs: ...`).
- Keep subjects under 50 characters; wrap body lines at 72 characters when used.
- PRs should include a summary, testing notes, and screenshots for UI changes.

## Configuration & Runtime Notes
- `processor.toml` controls IMU pipeline parameters (calibration, filters, fusion). Keep defaults sensible.
- UI layout changes should preserve non-scrolling behavior in the main panels.
