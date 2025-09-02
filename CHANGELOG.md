# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-09-02

### Added
- Initial release of Builder Burst
- Multi-tab Builder.io load testing capability
- Support for up to 55 concurrent tabs
- Intelligent batching system for large-scale operations
- Branch creation support for isolated testing
- Space selection (ILC/TLF) with automatic detection
- ProseMirror editor support for Builder.io's AI interface
- Comprehensive error handling and debugging
- SSO authentication support
- Progress tracking and success rate reporting
- Memory optimization for large-scale testing
- Chrome profile conflict resolution

### Features
- **Tab Management**: Process tabs in batches of 10 to prevent system overload
- **Prompt Injection**: Intelligent detection and injection into Builder's AI interface
- **Branch Creation**: Automatic branch creation for isolated content generation
- **Space Selection**: Support for multiple Builder.io organizations/spaces
- **Performance Optimization**: Browser flags and memory management for 55+ tabs
- **Error Handling**: Graceful fallbacks and detailed error reporting
- **Session Management**: Persistent browser sessions with SSO support

### Technical Details
- Built with Playwright for reliable browser automation
- Node.js 18+ requirement for Playwright compatibility
- Support for both headless and visible browser modes
- Configurable delays and timeouts for different environments
- Comprehensive logging and debugging output

### Documentation
- Complete README with usage examples
- Troubleshooting guide for common issues
- Contributing guidelines
- MIT license
