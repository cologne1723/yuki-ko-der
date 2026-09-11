# Offline publication

GitHub Actions must never query yukicoder to collect or verify problem files.
Publication reads the committed `problem-translations/publication-data.json`.
There is no Actions download step or downloaded-page cache.

After collecting originals and renderer profiles **locally**, run:

```sh
node --import tsx tools/audit/src/export-offline-publication-data.ts
```

The exporter does not use the network. It verifies saved full-page evidence and
the exact original revision named by each translation before exporting renderer
settings, evidence hashes, and raw sample fingerprints. Include the generated
JSON in the same commit as the translations. Raw downloaded pages remain in
ignored local `data/`; they are not uploaded.

CI runs `pnpm build:problems --require-render-profiles`. Missing or stale offline
data must be repaired locally and committed, never downloaded by an action.
The collector and live verifier also reject real upstream requests when
`GITHUB_ACTIONS=true`; injected request fixtures remain available for tests.
