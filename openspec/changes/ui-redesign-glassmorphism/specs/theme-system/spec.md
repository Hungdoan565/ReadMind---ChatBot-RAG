## ADDED Requirements

### Requirement: Theme toggle component
The system SHALL provide a theme toggle button in the main header that switches between light and dark modes.

#### Scenario: User toggles from light to dark mode
- **WHEN** user clicks the theme toggle button while in light mode
- **THEN** the entire application transitions to dark theme within 200ms
- **THEN** the toggle icon changes from sun to moon

#### Scenario: User toggles from dark to light mode
- **WHEN** user clicks the theme toggle button while in dark mode
- **THEN** the entire application transitions to light theme within 200ms
- **THEN** the toggle icon changes from moon to sun

### Requirement: Theme preference persistence
The system SHALL persist the user's theme preference in localStorage and restore it on subsequent visits.

#### Scenario: User returns to application after selecting dark mode
- **WHEN** user previously selected dark mode and closes the browser
- **THEN** on next visit, the application loads directly in dark mode without flash

#### Scenario: First-time visitor with system dark mode preference
- **WHEN** user visits for the first time with `prefers-color-scheme: dark` system setting
- **THEN** the application defaults to dark mode

### Requirement: CSS variable theming
The system SHALL use CSS custom properties for all theme-dependent colors, enabling smooth transitions and consistent theming.

#### Scenario: Theme variables applied to components
- **WHEN** theme is set to dark
- **THEN** all components use the dark variant of CSS variables (--bg-primary, --text-primary, --border-primary, etc.)

#### Scenario: Theme transition smoothness
- **WHEN** user toggles theme
- **THEN** all colored elements transition smoothly using CSS `transition: background-color, color, border-color`

### Requirement: Theme context API
The system SHALL provide a React context (`useTheme`) that exposes the current theme and a toggle function for any component to consume.

#### Scenario: Component accesses current theme
- **WHEN** a component calls `useTheme()`
- **THEN** it receives `{ theme: 'light' | 'dark', toggleTheme: () => void, isDark: boolean }`

#### Scenario: Theme toggle from any component
- **WHEN** any component calls `toggleTheme()` from useTheme
- **THEN** the global theme changes immediately and persists to localStorage
