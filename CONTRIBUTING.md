# Contributing to Discord Surveillance Bot

Thank you for your interest in contributing to the Discord Surveillance Bot! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Git
- PostgreSQL (or SQLite for development)

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/bot.git
   cd bot
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy environment template:
   ```bash
   cp .env.example .env
   ```
5. Configure your `.env` file with your Discord bot token and other required variables
6. Initialize the database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

## Development Workflow

### Branch Strategy

- `main` - Production branch
- `develop` - Integration branch for features
- `feature/*` - Feature branches
- `bugfix/*` - Bug fix branches
- `hotfix/*` - Critical hotfixes for production

### Creating a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### Making Changes

1. Write your code following the [Coding Standards](#coding-standards)
2. Add tests for your changes
3. Run tests to ensure they pass:
   ```bash
   npm test
   ```
4. Run linter:
   ```bash
   npm run lint
   ```

### Committing Changes

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Maintenance tasks

Example:
```bash
git commit -m "feat: add multi-platform routing for game deals"
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode in `tsconfig.json`
- Add type annotations for function parameters and return types
- Avoid `any` types when possible
- Use interfaces for object shapes
- Use enums for fixed sets of values

### Code Style

- Use ESLint and Prettier for consistent formatting
- Follow the existing code style in the project
- Use meaningful variable and function names
- Add JSDoc comments for complex functions
- Keep functions small and focused
- Use async/await instead of callbacks

### File Organization

```
src/
├── commands/       # Discord slash commands
├── services/       # Business logic services
├── events/         # Discord event handlers
├── utils/          # Utility functions
├── middleware/     # Middleware functions
├── cron/           # Scheduled tasks
├── managers/       # Manager classes
└── config.ts       # Configuration
```

### Error Handling

- Use try-catch blocks for async operations
- Log errors with appropriate context
- Provide meaningful error messages
- Use custom error types when appropriate

## Testing

### Test Structure

- Unit tests for individual functions
- Integration tests for services
- E2E tests for critical workflows

### Writing Tests

```typescript
import { describe, it, expect } from "vitest";

describe("YourModule", () => {
  it("should do something", () => {
    // Arrange
    const input = "test";
    
    // Act
    const result = yourFunction(input);
    
    // Assert
    expect(result).toBe("expected");
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Test Coverage

Aim for at least 70% code coverage for new features.

## Submitting Changes

### Pull Request Process

1. Update documentation if needed
2. Ensure all tests pass
3. Update the README if you've added new features
4. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
5. Create a Pull Request on GitHub
6. Fill in the PR template with details about your changes
7. Wait for code review

### PR Review Process

- Maintainers will review your PR
- Address any feedback or requested changes
- Once approved, your PR will be merged

## Reporting Issues

### Bug Reports

When reporting a bug, include:

- Description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (Node.js version, OS, etc.)
- Screenshots or logs if applicable

### Feature Requests

When requesting a feature, include:

- Description of the feature
- Use case or problem it solves
- Possible implementation approach
- Examples or mockups if applicable

## Questions?

Feel free to open a discussion or reach out to the maintainers for any questions about contributing.
