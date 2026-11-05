# Coverage UI: asynchronous requests and browser cache

The `/data` coverage view exposed two verified failure paths during PR #23 review. A slower request could return `403` after a newer request succeeded, clearing the newer result because status handling ran before the request-sequence check. A filter change during an API outage could leave an old result under the newly selected filter without labeling its saved scope.

Check the request sequence immediately after each awaited boundary, before handling status codes or mutating UI/storage. On a current-request outage, restore only a validated, dated first-page cache and explain when its saved filters differ from the selected filters. Treat browser storage as untrusted: reject malformed report shape and invalid timestamps before template rendering. A current `403` must still clear the cache and hide data.

Evidence: Angular tests cover the late `403`, offline filter change and corrupt cache; the isolated Compose browser check showed the dated cache notice after a filter change with network access disabled.
