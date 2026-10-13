# v0.3.8 publication checklist

This checklist distinguishes verified local tests from checks that require the owner's browser or a public GitHub workflow.

| Check | Status | Evidence or action |
| --- | --- | --- |
| Manifest V3, extension version 0.3.8 | PASS | Parsed manifest and local validation. |
| JavaScript syntax | PASS | All runtime JS files passed `node --check`. |
| Synthetic Markdown and ZIP smoke tests | PASS | `node tests/smoke.js` in the preparation environment. |
| Extension ZIP structure and CRC | PASS | `python3 scripts/package_extension.py --verify`. |
| Sanitized public source and documentation | PASS | Local scan for private test identifiers and known credentials. |
| Real Chrome export and rendering | NOT TESTED HERE | Requires a signed-in Chrome session and Obsidian. |
| GitHub Actions validation of this commit | NOT TESTED | Check the Actions tab after publication. |
| Full security audit | NOT TESTED | No formal penetration or security certification performed. |
| Redistribution license | BLOCKED | Owner decision; no license assigned automatically. |
| Public GitHub Release / tag | NOT APPLICABLE | Not created as part of the initial repository upload. |

See the README for limitations and supported behavior.
