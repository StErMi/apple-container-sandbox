---
"@lgrammel/apple-container-sandbox": major
---

Add Harness session resume support and align container lifecycle behavior with
`HarnessV1SandboxProvider`: `stop()` now retains the stopped container for
resume, while `destroy()` permanently deletes it. Remove the `keepContainer`
option and give Harness `sessionId` precedence over the direct-use `name`
fallback.
