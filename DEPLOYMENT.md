# Deployment and Wix embedding runbook

This runbook is intentionally provider-neutral. It defines what the application
needs from a host, how to verify a release, and how to embed the deployed
widget in the Whytecliff freediving website.

## Runtime contract

The host must provide:

- Python 3.13 or a compatible supported Python version;
- outbound HTTPS access;
- a public HTTPS URL;
- a long-running web process;
- a platform-provided `PORT` environment variable;
- access and error logs;
- a way to retain and redeploy a previous release.

Install and start the application with:

```bash
python -m pip install -r requirements.txt
gunicorn -c gunicorn.conf.py app:app
```

The repository contains a `Procfile` with the same start command.

### Optional environment variables

| Variable | Default | Purpose |
| --- | ---: | --- |
| `PORT` | `8000` | HTTP port assigned by the hosting platform |
| `WEB_CONCURRENCY` | `2` | Gunicorn worker processes |
| `WEB_THREADS` | `4` | Threads per worker |
| `WEB_TIMEOUT` | `45` | Request timeout in seconds |
| `SERVER_CACHE_TTL_SECONDS` | `900` | Successful API response lifetime |
| `SERVER_CACHE_MAX_ENTRIES` | `64` | Maximum cached responses per worker |
| `WIDGET_FRAME_ANCESTORS` | `*` | Origins allowed to embed the widget |

Do not enable `FLASK_DEBUG` in production.

## External dependencies

The deployed service makes server-side HTTPS requests to:

| Provider | Host | Data |
| --- | --- | --- |
| Open-Meteo | `api.open-meteo.com` | Weather, wind, precipitation, daylight, air temperature |
| Open-Meteo Marine | `marine-api.open-meteo.com` | Sea-surface temperature |
| Canadian Hydrographic Service | `api-iwls.dfo-mpo.gc.ca` | Tide predictions and current phase events |
| UBC SalishSeaCast ERDDAP | `salishsea.eos.ubc.ca` | Near-surface current forecast |

No API keys or runtime AI credentials are currently required.

The host must allow outbound connections to these services. Provider latency,
rate limits, maintenance, or schema changes can affect the widget even when the
application itself is healthy.

### Current caching behavior

- Conditions and current data are cached in each browser for 15 minutes.
- Temperature data is cached in the browser for the current page session.
- Simultaneous browser requests for the same date share one in-flight request.
- Successful normalized API responses are cached for 15 minutes in each server
  process.
- Simultaneous requests handled by one process share one provider request.
- Failed provider requests are not cached.

The server cache is process-local. Multiple Gunicorn workers do not share
entries, and a restart clears the cache. Monitor upstream request volume after
launch; use a shared cache service if traffic outgrows this design.

## Operational logs

Every response includes an `X-Request-ID` header. The server writes one
structured JSON completion record containing the request ID, route, status,
duration, and cache outcome. Provider failures write a separate record with the
provider name and exception type; response bodies, forecast payloads, and query
parameters are not logged.

Use the request ID to correlate a browser or API error with its server log
record.

## Browser security policy

The application serves its pinned Bootstrap and Chart.js dependencies locally.
Its Content Security Policy limits scripts and styles to the application
itself, blocks browser features the widget does not use, and disables MIME
sniffing. It intentionally does not send `X-Frame-Options`, because that legacy
header would prevent the Wix embed.

Before public launch, set `WIDGET_FRAME_ANCESTORS` to the exact production and
preview origins that may embed the widget. The value follows CSP
`frame-ancestors` syntax, for example:

```text
'self' https://www.example.com https://*.wixsite.com
```

The default `*` keeps local testing and initial Wix integration unblocked, but
allows any HTTPS site to embed the widget.

## Health checks

Configure the hosting platform to call:

- `GET /health` for liveness;
- `GET /ready` for readiness.

Both endpoints currently confirm that the Flask process can respond. They do
not call Open-Meteo or CHS. Upstream health must therefore be checked through
the application smoke tests and operational monitoring described below.

## Pre-deployment checklist

- [ ] The intended commit is on `main`.
- [ ] GitHub Actions CI is green for that commit.
- [ ] `node --test tests/*.test.mjs` passes.
- [ ] `python -m unittest discover -s tests -p "test_*.py"` passes.
- [ ] `python -m pip check` reports no broken requirements.
- [ ] Python modules compile successfully.
- [ ] No `.env`, credentials, access tokens, or personal data are tracked.
- [ ] Debug mode is disabled.
- [ ] The host has outbound HTTPS access to all three provider hosts.
- [ ] The service start command uses Gunicorn, not Flask's development server.
- [ ] Health checks use `/health`.
- [ ] The previous working release remains available for rollback.

## Post-deployment smoke test

Test the public HTTPS URL before embedding it:

1. Open `/health` and confirm a `200` response with `{"status":"ok"}`.
2. Open `/ready` and confirm a `200` response with
   `{"status":"ready"}`.
3. Open `/` in a private browser window.
4. Confirm the fixed-size loading placeholders appear immediately.
5. Confirm water temperature can render independently.
6. Confirm the tide chart, assessment windows, slack labels, sunrise, and
   sunset render.
7. Select at least two colored windows and confirm the title uses each full
   time range.
8. Confirm current and wind ranges plus precipitation totals update without
   layout shifts.
9. Switch to another forecast date, return to the first date, and confirm the
   cached view loads correctly.
10. Open Daily forecast and test the Wind, Precipitation, and Air tabs.
11. Repeat the core interaction checks at desktop and mobile widths.
12. Check server logs for timeouts, provider errors, or unexpected `5xx`
    responses.

Also test one API request directly:

```text
/api/conditions?location=whytecliff&date=YYYY-MM-DD
```

Use a date within the displayed three-day range.

## Wix iframe requirements

Wix loads an embedded site or HTML widget inside an iframe.

Before embedding:

- the widget URL must use HTTPS;
- the host must not send `X-Frame-Options: DENY` or `SAMEORIGIN`;
- any `Content-Security-Policy` `frame-ancestors` directive must allow the
  exact published Wix/custom-domain origin;
- the iframe must be tall enough for the complete widget;
- desktop and mobile iframe dimensions must be tested separately.

The widget's API calls are same-origin requests to its own Flask host, so the
Wix site does not need CORS access to the API.

### Preferred Wix setup

1. In the Wix editor, add **Embed Code → Embed a Site**.
2. Enter the public HTTPS widget URL.
3. Set descriptive alt text, such as “Whytecliff dive conditions assessment.”
4. Make the element use the available page width.
5. Increase its height until the complete Selected time and Daily forecast
   panels fit without internal scrolling or cropping.
6. Configure and test the mobile layout separately.
7. Test both Wix Preview and the published site.

If an HTML snippet is preferable, use the same public URL:

```html
<iframe
  src="https://YOUR-WIDGET-HOST.example/"
  title="Whytecliff dive conditions assessment"
  width="100%"
  height="100%"
  style="border: 0"
  loading="lazy"
></iframe>
```

The Wix embed container still needs an explicit usable height. Percentage
height alone does not determine the container's page height.

## Security and privacy review

- Keep provider calls and any future credentials on the server.
- Never place secrets in browser JavaScript or the repository.
- Allow iframe embedding only from the intended production and preview origins
  once those origins are known.
- Serve all application and asset requests over HTTPS.
- Review response headers after deployment.
- Do not add analytics or user tracking without updating the privacy
  disclosure on the partner website.
- Treat forecast query parameters as untrusted input; keep the existing date
  and location validation.

## Monitoring

At minimum, monitor:

- service availability and restart count;
- `/health` response time and status;
- `5xx` response rate for the three `/api/*` routes;
- outbound request timeouts and provider failures;
- response time for the first uncached date request.

Alerting should distinguish an unavailable application from an unavailable
forecast provider.

## Rollback

If a release fails:

1. Stop routing traffic to the failed release.
2. Redeploy the previously verified commit or platform release.
3. Confirm `/health`, `/ready`, `/`, and one dated conditions request.
4. Check that the Wix iframe loads the restored version.
5. Record the failed commit, symptoms, relevant logs, and corrective action.

Do not roll forward repeatedly without understanding whether the failure is in
the application, hosting configuration, or an external data provider.

## Launch acceptance

The first public release is ready when:

- [ ] the public URL passes the post-deployment smoke test;
- [ ] the Wix desktop and mobile embeds show the full widget;
- [ ] no browser console errors occur during normal interaction;
- [ ] API and provider failures produce understandable UI behavior;
- [ ] health monitoring and logs are accessible;
- [ ] rollback has been tested once;
- [ ] the safety disclaimer remains visible in the selected-window panel.
