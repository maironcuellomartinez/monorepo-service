# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**auth-configuration-app** is a React + TypeScript + Vite frontend application that serves as the administrative UI for the ABAC (Attribute-Based Access Control) microservice. It provides management interfaces for users, roles, permissions, applications, and policies.

## Development Commands

```bash
npm install
npm run dev              # Start dev server (Vite, port 5173)
npm run build            # TypeScript compile + Vite build
npm run build:staging    # Build with staging environment
npm run build:prod       # Build with production environment
npm run preview          # Preview production build
npm run preview:staging  # Preview staging build
npm run lint             # ESLint
```

## Architecture

### Tech Stack
- **React 19** with functional components and hooks
- **TypeScript** (~5.7.2)
- **Vite 6.1** with SWC plugin for fast refresh
- **React Router 6** for client-side routing
- **Tailwind CSS 4** for styling
- **Radix UI** for accessible headless components
- **React Hook Form** for form handling
- **Axios** for HTTP requests

### Component Structure

```
src/
├── components/
│   ├── login-form.tsx          # Authentication entry point
│   ├── sidebar.tsx             # Collapsible navigation sidebar
│   ├── header.tsx              # Top header with user info
│   ├── dashboard-overview.tsx  # Dashboard home page
│   ├── users-page.tsx          # User management
│   ├── roles-page.tsx          # Role management
│   ├── permissions-page.tsx    # Permission management
│   ├── applications-page.tsx   # Application/M2M management
│   ├── policies-page.tsx       # Policy management
│   ├── condition-builder.tsx   # Policy condition builder UI
│   └── ui/                     # Shared UI components (Radix wrappers)
├── contexts/
│   └── auth-context.tsx        # Authentication context + hooks
├── lib/
│   └── api.ts                  # API client utilities
├── App.tsx                     # Main app with routing
├── main.tsx                    # Entry point
└── index.css                   # Tailwind styles
```

### Authentication Flow

1. User credentials submitted via `LoginForm`
2. Auth context stores JWT token and user state
3. Token persisted in localStorage
4. All API calls include Bearer token
5. Protected routes redirect to login if not authenticated

### Routes

| Path | Component |
|---|---|
| `/` | Redirects to `/dashboard` |
| `/dashboard` | DashboardOverview |
| `/users` | UsersPage |
| `/roles` | RolesPage |
| `/permissions` | PermissionsPage |
| `/applications` | ApplicationsPage |
| `/policies` | PoliciesPage |

## Environment Configuration

Environment files at project root:
- `.env.development` - Local development
- `.env.staging` - Staging environment
- `.env.production` - Production build

Vite exposes these via `import.meta.env.VITE_*`

## Key Patterns

- **Context + Hooks**: `useAuth()` from `auth-context` for authentication state
- **Controlled components**: React Hook Form for all forms
- **LocalStorage persistence**: Theme preference, sidebar collapse state, auth token
- **Radix primitives**: All UI components built on Radix primitives with Tailwind

## Backend Integration

This frontend connects to the **abac-microservice** (port 3005) for:
- Authentication (M2M token, user login)
- User CRUD operations
- Role management
- Permission catalog
- Application/M2M service accounts
- Policy definitions and rules

See `../abac-microservice/` for API endpoints and `../CLAUDE.md` for full ecosystem documentation.
