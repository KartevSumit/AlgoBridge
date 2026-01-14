# Changelog

## [1.1.0] – 2026-01-14

### Added

- **Interactive Test Cases**: Hovering over a test case input now highlights the corresponding output (and vice-versa) for better readability.
- **Alternating Row Colors**: Added support for Codeforces-style alternating background shades (even/odd lines) in test case blocks.

### Fixed

- **Infinite Loading Loop**: Fixed an issue where the problem view would get stuck on the skeleton loading screen when switching to a file with no associated problem statement.
- **View Update Logic**: The problem sidebar no longer improperly updates if the user clicks "Cancel" on the file creation prompt.

## [1.0.5] – 2026-01-11

### Fixed

- Corrected Codeforces problem filename generation for alphanumeric indices.
  - `D1. Mocha and Diana` → `D_1_Mocha_and_Diana.cpp`
- Preserved original problem title casing in generated filenames.
