# Privacy

The yukicoder Korean Translator extension has no analytics, advertisements,
or tracking service. It does not upload account details, submissions, cookies,
or stored translations.

When you open a yukicoder problem page, the extension requests the corresponding
translated problem HTML from `https://cologne1723.github.io/yuki-ko-der/` and
the canonical problem metadata and HTML from `https://yukicoder.me/`. These
requests include the public problem number or ID and omit credentials.
As with ordinary HTTPS requests, the hosting services receive network
information such as your IP address and the requested URL.

Successfully downloaded translations are cached in the extension's local
browser storage for fallback use. They are not synchronized or uploaded by
the extension. Removing the extension clears its local storage.

UI translation dictionaries and all executable extension code are included in
the installed package. GitHub Pages supplies problem HTML, not executable code.
