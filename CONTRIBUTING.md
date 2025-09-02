# Contributing to Builder Burst

Thank you for your interest in contributing to Builder Burst! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites
- Node.js 18 or higher
- Git
- A Builder.io account with project access

### Development Setup
1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/yourusername/builder-burst.git
   cd builder-burst
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Install Playwright browsers:
   ```bash
   npm run install-browsers
   ```

## 🐛 Reporting Issues

When reporting issues, please include:
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Any error messages or console output

## 🔧 Development Guidelines

### Code Style
- Use consistent indentation (2 spaces)
- Add comments for complex logic
- Follow existing naming conventions
- Test your changes thoroughly

### Testing
- Test with different tab counts (1, 5, 10+)
- Test with both ILC and TLF spaces
- Test with and without branch creation
- Verify prompt injection works correctly

### Pull Request Process
1. Create a feature branch from `main`
2. Make your changes
3. Test thoroughly
4. Update documentation if needed
5. Submit a pull request with a clear description

## 🎯 Areas for Contribution

### Features
- Additional Builder.io space support
- Enhanced error handling
- Performance optimizations
- Additional prompt injection methods
- Custom selector support

### Documentation
- Usage examples
- Troubleshooting guides
- Performance tuning tips
- Integration examples

### Testing
- Automated test suite
- Load testing scenarios
- Cross-platform compatibility
- Browser compatibility

## 📝 Commit Messages

Use clear, descriptive commit messages:
- `feat: add support for custom selectors`
- `fix: resolve Chrome profile lock conflicts`
- `docs: update README with new examples`
- `perf: optimize memory usage for large tab counts`

## 🤝 Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Follow the golden rule

## 📞 Getting Help

- Check existing issues and discussions
- Create a new issue for bugs or feature requests
- Join discussions in the GitHub community

Thank you for contributing to Builder Burst! 🎉
