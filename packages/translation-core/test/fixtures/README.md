# Source correction fixtures

`source-corrections.json` contains gzip/base64-encoded, unchanged Japanese
statement snapshots from `https://yukicoder.me/problems/no/{number}` for
2911, 3009, 3096, 3272, 3553, 3582, 5021, 8018, and 8069.
These are the existing locally collected snapshots used by the pinned correction
and image records, not fresh downloads. Original content rights remain with its authors.

The tests decompress these snapshots and exercise the production source-hash
guards, including rejection of changed sources. Encoding preserves original
bytes (including embedded images) through formatting and line-ending changes.
CI needs neither ignored `data/` files nor network access for these tests.
Do not update fixtures independently of the corresponding source correction records.
