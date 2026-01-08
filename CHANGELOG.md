# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Configurable visual indicators (`indicators`) allowing multiple threshold-based symbols.
- Nicer default indicators: `⚠️` for warning (20%) and `🛑` for critical (5%).

### Changed
- Low quota alerts refactored to use standard category-based formatting for consistency with other toasts.
- Low quota warning now lists each category on a separate line.

## [0.0.2] - 2026-01-08

### Changed
- Initial toast header changed from "Quota Connected" to "AG Quota"
- Removed pre-built CLI binary from git (now generated at publish time)

## [0.0.1] - 2026-01-06

### Added
- Initial release
- `ag-quota` - Core library and CLI for fetching Antigravity quota
- `opencode-ag-quota` - Opencode plugin for quota display (appends footer to assistant messages)
- Cloud API and Language Server quota sources
- Low quota alerts with configurable thresholds
- CLI with human-readable and JSON output formats
