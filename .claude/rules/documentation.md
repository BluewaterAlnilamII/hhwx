# Documentation and Comment Rules

- Public project documentation, design notes, and code comments default to English.
- Existing Chinese documentation and comments do not need a one-time bulk translation. When a file is substantially edited, migrate the touched long-lived documentation or comments to English where practical.
- User-facing Chinese product copy, Chinese operational notes, and historical Chinese-only materials may remain Chinese when they serve the target audience better.
- Important public collaboration documents use English as the canonical file and keep a Chinese translation next to it with a `.zh-CN.md` suffix. This applies to README, contributing, security, notice, setup, CDN, and layout documentation.
- When changing one of those important documents, update or explicitly review the matching `.zh-CN.md` file in the same change. The Chinese version does not need to be word-for-word, but it must preserve license, security, deployment, and compatibility boundaries.
- Comments for critical logic, complex algorithms, and business rules should explain why the design exists, not restate what the code already says.
- Complex hooks, core service modules, and key API routes should keep short header comments that describe responsibility, constraints, and design reasons when that context is not obvious.
- Comments and documentation should stay dense and useful. Avoid low-value descriptions such as "assigns a variable" or "calls a function."
- When script commands, deployment flow, environment variables, data contracts, or external dependency constraints change, update the related documentation in the same change.
- When adding, deleting, or renaming top-level directories, major business directories, or shared module directories, update `documents/layout.md`. Ordinary component files, local style files, and test files do not require layout documentation updates.
