# Frontend Style Guide

## Purpose
This guide describes the visual and interaction style of the current frontend so another AI agent or engineer can build a different product in the same design language.

The target aesthetic is a polished desktop-first operational interface: clean, structured, practical, slightly premium, and optimized for repeated daily use. It should feel like a work tool, not a marketing site and not a generic admin template.

## Design Intent
The interface should communicate these qualities:
- operational clarity
- visual calm
- fast access to primary actions
- strong system-state visibility
- restrained polish

The design should avoid two extremes:
- sterile enterprise flatness
- decorative startup-style overdesign

## Core Personality
Use a visual language that feels:
- modern
- professional
- quiet
- reliable
- mildly technical
- desktop-oriented

The interface should look like a tool used by operators, coordinators, or back-office staff who need confidence and speed.

## Visual Foundation
The UI is based on layered soft surfaces rather than hard flat blocks.

Key characteristics:
- bright background with depth
- white or near-white panels on top of a subtle gradient page
- rounded corners throughout the system
- thin borders instead of heavy separators
- soft shadows, never harsh shadows
- strong use of spacing and typography for hierarchy
- limited but intentional use of accent color

## Background System
Do not use a plain single-color background.

Use a soft atmospheric page background, preferably a radial or blended gradient:
- top area lighter
- mid area neutral
- lower area slightly cooler or softer

Reference feeling:
- airy desktop workspace
- subtle light on a control surface

Recommended structure:
- `bg-top` for the brightest area
- `bg` for the main field
- `bg-soft` for the lowest or deepest tone

## Color System
### Light Theme
- `--bg-top: #ffffff`
- `--bg: #f5f6f8`
- `--bg-soft: #eef1f6`
- `--panel: #ffffff`
- `--panel-2: #f3f5f9`
- `--text: #1f2933`
- `--muted: #6b7280`
- `--accent: #ff6c37`
- `--accent-2: #1b5cff`
- `--success: #10b981`
- `--danger: #e5534b`
- `--border: #e3e7ee`

### Dark Theme
The dark theme should preserve the same product identity, not become a separate visual language.

Use deep navy surfaces instead of pure black:
- `--bg-top: #141b2d`
- `--bg: #0f1729`
- `--bg-soft: #0a1220`
- `--panel: #141c2e`
- `--panel-2: #1b253a`
- `--text: #e5e7eb`
- `--muted: #9ca3af`
- `--border: #2d3a52`

### Accent Logic
- Orange is the primary action and emphasis color.
- Blue is a secondary system accent for selection, informational highlight, or focus states.
- Green is reserved for success and connected state.
- Red is reserved for danger, destructive actions, and error states.

Do not overuse accent colors. Most of the interface should rely on neutral tones.

## Typography
### Font Families
- Primary UI font: `Manrope`
- Secondary technical/utility font: `IBM Plex Mono`

### Typography Rules
Use `Manrope` for:
- page titles
- panel headings
- body text
- buttons
- values

Use `IBM Plex Mono` sparingly for:
- eyebrow labels
- timestamps
- compact metadata
- machine-like tags or technical labels

### Hierarchy
#### Display / Hero Title
- large, dense, confident
- slight negative letter spacing
- used for main screen title only

#### Panel Titles
- medium-large
- semibold or bold
- compact line height

#### Section Labels
- small
- uppercase
- slightly increased letter spacing
- muted tone

#### Value Text
- stronger than body text
- used for KPIs, counters, timestamps, key outputs

#### Body Text
- clean and neutral
- no excessive size
- optimized for readability, not editorial feel

## Layout Principles
The layout is desktop-first.

### Page Width
Use a centered content shell with a max width in the range of:
- `1100px` for regular views
- up to `1360px` for active workspace layouts with side panels

### Spacing Rhythm
Preferred spacing rhythm:
- `8px` micro spacing
- `12px` compact spacing
- `16px` standard internal spacing
- `20px` to `24px` section spacing
- `32px+` page spacing

### Composition
Common page structure:
- global controls pinned to a corner
- large hero or primary action block near the top
- one or two main working zones below
- optional side panel for live data, settings, or queue content
- fixed bottom-right action for a critical destructive or completion action

### Responsive Behavior
On smaller widths:
- multi-column layouts collapse to one column
- fixed controls may move inward but remain recognizable
- panels stack vertically
- modal padding tightens slightly
- primary action hierarchy must remain obvious

Do not redesign the product into a mobile app style. Keep the same desktop design language, only reflow it.

## Panels and Surfaces
Panels are the main structural unit.

### Panel Characteristics
- background: `panel`
- border: `1px solid border`
- radius: `16px` to `18px`
- padding: `18px` to `24px`
- shadow: soft and diffused

Panels should feel like elevated working surfaces, not cards in a marketing grid.

### Secondary Surface
Use `panel-2` for:
- inset rows
- grouped list items
- passive controls
- nested content blocks
- expanded sections inside a panel

### Section Separation
Within a panel, separate sections using:
- vertical spacing first
- thin top border only when needed

Avoid heavy dividers.

## Buttons
Buttons should feel practical and comfortable, with enough size for frequent use.

### Primary Button
- orange background
- white text
- soft glow or shadow based on orange
- medium-large radius
- semibold text
- slight hover lift only on large action buttons

Use for:
- start
- confirm
- save
- primary workflow transitions

### Ghost Button
- panel-colored background or transparent on panel
- thin border
- text in regular foreground color
- hover uses `panel-2`

Use for:
- secondary actions
- close buttons
- refresh actions
- auxiliary panel controls

### Danger Ghost Button
- transparent or panel background
- red text
- red border
- subtle red hover tint

Use for:
- cancel session
- delete
- destructive actions that should remain visible but not dominant

### Icon Buttons
- compact square form
- approximately `34px` to `36px`
- rounded corners around `10px` to `12px`
- thin border
- neutral background
- line icon only

Use for:
- theme toggle
- refresh
- open file location
- quick utility actions

## Inputs and Form Controls
Inputs should visually match the panel system.

### Text Inputs and Textareas
- background: `panel-2`
- border: thin neutral border
- radius: `12px`
- padding: comfortable, around `12px 14px`
- text color: standard foreground
- focus: orange border/focus ring

### Checkboxes
- small and simple
- use accent color when checked
- avoid custom exaggerated checkbox styles

### Form Density
Forms should feel compact but not cramped.
The overall impression should be “efficient admin workflow with polish”.

## Status and Feedback Patterns
The interface strongly communicates system state.

### Status Indicator
Use a dot + text pattern for connection or process state.

Color mapping:
- connected: green
- connecting: orange
- error: red
- idle/disconnected: muted neutral

Use a subtle glow around the dot to reinforce state.

### Toasts
Toasts should be anchored, compact, and utilitarian.

Guidelines:
- fixed positioning near bottom edge
- panel-style surface
- thin semantic border
- no aggressive full-color backgrounds
- concise text

Success toast:
- neutral panel background
- green-tinted border
- success-colored text

Error toast:
- neutral panel background
- red-tinted border
- error-colored text

### Empty States
Empty states should be understated.

Use:
- muted text
- optional italic treatment
- no large illustrations
- no playful filler copy

## Lists, Rows, and Data Blocks
Lists should use stacked rows on soft surfaces.

### Standard Row Pattern
- background: `panel-2`
- rounded corners `10px` to `12px`
- horizontal padding around `10px 14px`
- display values aligned in a practical way
- use muted labels and stronger main value

### Expandable Rows
When a row expands:
- keep the primary row compact
- reveal details in a nested lighter area
- use a thin top border if needed
- preserve overall card continuity

### Data Tables
Use lightweight tables only when necessary.

Table rules:
- full width
- thin dividers
- muted uppercase labels for keys
- normal or semibold values
- modest font size
- avoid enterprise-heavy grid styling

## Modal Windows
Modals should look deliberate and well-structured.

### Overlay
- dark semi-transparent overlay
- optional soft blur for confirm modals
- centered layout

### Modal Surface
- panel-style background
- border
- generous radius around `16px` to `18px`
- soft shadow
- balanced internal padding

### Confirm Dialog
Confirm dialogs should have:
- compact width, not edge-to-edge
- strong title
- readable body text with balanced line length
- actions aligned to the right on desktop
- subtle divider above the actions row

Text should never feel jammed into the modal. Vertical rhythm matters.

## Fixed UI Controls
This style uses fixed utility controls as part of the desktop language.

Examples:
- language switch in top-left
- theme toggle near language switch
- refresh button near language switch
- settings or utility controls in top-right or lower corner
- session completion or destructive action anchored bottom-right

These controls should feel stable and always available.

## Iconography
Icons should be:
- stroke-based
- simple
- geometric
- compact
- visually consistent in stroke width

Do not use:
- filled icon packs with heavy visual mass
- over-detailed illustrations
- decorative 3D icons

Recommended icon family character:
- clean line icons
- rounded joins
- slightly technical

## Motion and Interaction
Animation should be restrained.

### Allowed Motion
- page fade-in with slight upward movement
- subtle hover background changes
- minimal transform on prominent CTA buttons
- smooth open/close transitions for modal-like elements

### Avoid
- bounce
- overscaled hover motion
- spring-heavy interactions
- dramatic animated gradients
- excessive microinteraction noise

## Tone of Components
Every component should answer this question correctly:
“Does this look like a serious tool used all day?”

That means:
- clear hierarchy
- no visual clutter
- no novelty styling
- no candy-like surfaces
- no hyper-minimal sterile emptiness

## Theming Rules
The dark theme is not a gimmick. It should feel first-class.

Rules:
- preserve spacing, component shapes, and hierarchy exactly
- swap surface and text tokens only
- avoid pure black
- preserve orange as primary accent
- reduce contrast just enough to remain comfortable for long sessions

## Things to Avoid
Do not do any of the following:
- generic Bootstrap/admin-template look
- purple-first palette
- flat plain white canvas with no atmospheric depth
- harsh drop shadows
- tiny click targets
- thin, low-contrast typography
- oversized glassmorphism
- playful startup illustration style
- excessive animation
- overdecorated cards
- pure-black dark mode

## Implementation Notes for Another Agent
If you are building a new frontend in this style:
- start by defining design tokens for background, surface, text, accent, border, success, and danger
- build one strong panel component and reuse it everywhere
- build one ghost button, one primary button, and one icon button system before designing pages
- define typography scale first, especially labels, panel titles, and hero heading
- use fixed corner controls only when they support workflow speed
- prioritize clarity of state and action over novelty

## Short Prompt Version
Design a desktop-first operational dashboard UI with a bright layered gradient background, white elevated panels, thin borders, soft shadows, large rounded corners, Manrope typography, IBM Plex Mono for labels and metadata, orange primary actions, restrained blue secondary highlights, line icons, compact fixed corner controls, polished confirmation modals, and a fully matching dark theme based on deep navy surfaces rather than black. The result should feel like a serious internal tool with premium polish, not a generic admin template and not a marketing landing page.
