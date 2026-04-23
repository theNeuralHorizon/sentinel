## Summary

<!-- 1–3 bullet points. What changed and why. -->

## Test plan

<!-- How did you verify this? Keep it specific. -->

- [ ] `bun test` passes
- [ ] `cd apps/scanner && go test ./...` passes
- [ ] `bun --cwd apps/web check` passes
- [ ] I ran the change locally against `docker compose up -d` + `scripts/seed.ts`
- [ ] I updated `docs/` if behaviour changed

## Impact

- Breaking: <!-- yes/no; if yes, what migration is needed? -->
- Security: <!-- yes/no; if yes, was security-reviewer consulted? -->
- Performance: <!-- expected impact on hot paths -->

## References

<!-- Issue #, PR links, design doc links, external standards (CycloneDX, SPDX, OSV, …) -->
