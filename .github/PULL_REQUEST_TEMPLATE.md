## 🦅 Pull Request Template

### 📋 Description
Provide a brief summary of the changes and the problem being solved.

### 🧪 How was this tested?
- [ ] `bun run lint` (No raw text violations)
- [ ] `bun test` (Core logic passes)
- [ ] Manual verification in the TUI

### 🛡️ Security Check
- [ ] Does this change affect `rclone.conf` isolation?
- [ ] Does this change affect the Malware Shield?
- [ ] Does this change modify the License or Attribution?

### 📐 Pattern Compliance
- [ ] Follows "No Raw Text" rule (Ink `<text>` components only).
- [ ] Uses [Env utility](file:///src/lib/env.ts) for paths.
