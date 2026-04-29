---
name: Industrial Minimalist
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#7c5800'
  on-secondary: '#ffffff'
  secondary-container: '#feb700'
  on-secondary-container: '#6b4b00'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1a1c1c'
  on-tertiary-container: '#838484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474646'
  secondary-fixed: '#ffdea8'
  secondary-fixed-dim: '#ffba20'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5e4200'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c6'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  display:
    fontFamily: Space Grotesk
    fontSize: 72px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.1em
spacing:
  base: 8px
  section-gap: 120px
  gutter: 24px
  container-max: 1120px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style
The brand personality of this design system is authoritative, precise, and transparent. It aims to evoke a sense of "work in progress" without the clutter often associated with construction. The target audience includes stakeholders and early adopters who value high-end engineering and meticulous planning.

The design style is a hybrid of **Minimalism** and **Swiss International Style**. It utilizes expansive white space and a rigid grid to maintain a sleek, professional appearance. Industrial accents are used sparingly as "warning" or "action" signals, ensuring the overall aesthetic remains premium rather than rugged. The emotional response is one of anticipation and confidence in the quality of the upcoming product.

## Colors
This design system uses a high-contrast, limited palette to ensure clarity. 
- **Primary:** A deep, near-black "Ink" used for typography and structural elements.
- **Secondary:** A vibrant "Caution Yellow" used exclusively for focal points, progress indicators, and primary calls to action.
- **Tertiary:** A mid-tone "Concrete Grey" for borders and secondary information.
- **Neutral:** A "Paper White" background that ensures the interface feels airy and modern.

Backgrounds should remain predominantly white or very light grey to allow the bold typography and industrial accents to command attention.

## Typography
The typography strategy relies on the technical, geometric nature of **Space Grotesk** for headlines to lean into the industrial theme. Its idiosyncratic letterforms provide a futuristic "under construction" feel without being literal. **Inter** is used for body copy to maintain professional legibility and a systematic look. 

Key information like countdowns or "percent complete" metrics should use the **Display** style. **Label-caps** should be used for metadata and small status indicators to provide a blueprint-like aesthetic.

## Layout & Spacing
The design system utilizes a **Fixed Grid** model. The content is centered within a 12-column grid with a maximum width of 1120px. Vertical rhythm is strictly enforced using an 8px baseline. 

Layouts should favor extreme vertical padding ("Section-gap") to emphasize the minimalist nature of the landing page. Elements like "Launch Date" and "Email Signup" should have significant breathing room to prevent the page from feeling "busy," reinforcing the idea that the project is being built with precision.

## Elevation & Depth
Depth is conveyed through **Tonal Layers** and **Low-contrast Outlines** rather than traditional shadows. This maintains a "flat" architectural drawing feel. 
- **Surface tiering:** Use subtle shifts between White (#FFFFFF) and Neutral (#F9F9F9) to define different content zones.
- **Borders:** Use 1px solid lines in Tertiary (#E5E5E5) to frame input fields and cards. 
- **Industrial Accents:** Depth can be suggested using "Striped" patterns (diagonal yellow/black lines) at a low opacity for progress bars or background decorative elements to reinforce the construction theme.

## Shapes
The shape language is **Sharp (0)**. Everything from buttons to input fields uses 90-degree corners. This evokes a sense of structural integrity, engineering, and raw materials. Roundness is avoided to ensure the "industrial" and "minimalist" aesthetic is not softened into a standard consumer SaaS look. Icons should follow this geometric rigor, utilizing straight lines and sharp terminals.

## Components
- **Buttons:** Large, rectangular blocks with no radius. Primary buttons are solid Primary (#0F0F0F) with White text. Secondary buttons are outlined with 2px borders. Hover states should trigger a fill of Secondary (#FFB800).
- **Input Fields:** Minimalist underlines or 1px borders. Use the Label-caps typography for field descriptors placed above the input.
- **Progress Bars:** A custom "Construction Bar" component. It should be a thin, sharp rectangle. The filled portion uses the Secondary color, potentially with a subtle CSS-animated diagonal stripe pattern to indicate active progress.
- **Status Chips:** Small rectangular tags with Primary background and White Label-caps text (e.g., "PHASE 1", "SCAFFOLDING").
- **Cards:** Simple containers defined by a 1px border (#E5E5E5) with no shadow. Used for "Project Milestones" or "Feature Teasers."
- **Countdown Timer:** Large, high-contrast Display typography separated by thin vertical lines to look like a digital ledger.